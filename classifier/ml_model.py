import os
import numpy as np
from PIL import Image
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ----------------------------
# Load models once (import-time)
# ----------------------------
DISEASE_MODEL_PATH = os.path.join(BASE_DIR, "ml", "yolo11_best.pt")
GATE_MODEL_PATH    = os.path.join(BASE_DIR, "ml", "gate_best.pt")

DISEASE_MODEL = YOLO(DISEASE_MODEL_PATH)
GATE_MODEL    = YOLO(GATE_MODEL_PATH)

UNKNOWN_LABEL = "UNKNOWN / Non-human or invalid input"

# ----------------------------
# Disease class names (stable)
# ----------------------------
CLASSES_TXT = os.path.join(BASE_DIR, "ml", "classes.txt")

def _disease_classes():
    """
    Load disease class names in correct index order.
    Priority:
      1) ml/classes.txt (deterministic)
      2) DISEASE_MODEL.names (from weights)
      3) fallback class_0..class_{nc-1}
    """
    # 1) classes.txt if present
    if os.path.exists(CLASSES_TXT):
        with open(CLASSES_TXT, "r", encoding="utf-8") as f:
            names = [ln.strip() for ln in f if ln.strip()]
        if names:
            return names

    # 2) from model weights
    names = getattr(DISEASE_MODEL, "names", None)
    if isinstance(names, dict) and names:
        ordered = [names[i] for i in sorted(names.keys())]

        # Optional: write classes.txt so next start is stable
        try:
            os.makedirs(os.path.dirname(CLASSES_TXT), exist_ok=True)
            with open(CLASSES_TXT, "w", encoding="utf-8") as f:
                f.write("\n".join(ordered) + "\n")
        except Exception:
            pass

        return ordered

    if isinstance(names, list) and names:
        return names

    # 3) fallback
    try:
        nc = int(getattr(DISEASE_MODEL.model, "nc", 0))
    except Exception:
        nc = 0

    return [f"class_{i}" for i in range(max(nc, 0))]


DISEASE_CLASSES = _disease_classes()

if not DISEASE_CLASSES:
    raise RuntimeError("Could not load disease classes from classes.txt or model.names.")


# ----------------------------
# Gate class names (dynamic)
# ----------------------------
def _gate_classes_from_model():
    """
    Returns gate classes in correct index order using GATE_MODEL.names.
    This avoids class-order mistakes.
    """
    names = getattr(GATE_MODEL, "names", None)
    if isinstance(names, dict):
        return [names[i] for i in sorted(names.keys())]
    if isinstance(names, list) and names:
        return names
    return []


GATE_CLASSES = _gate_classes_from_model()


def gate_check(pil_img: Image.Image, thresh: float = 0.70):
    """
    Returns (ok: bool, diagnostics: dict)
    ok=True means "valid_skin" confidently detected.
    ok=False means reject (nonhuman or uncertain).
    """
    r = GATE_MODEL.predict(pil_img, verbose=False)[0]
    if not hasattr(r, "probs") or r.probs is None:
        return False, {"reason": "gate_no_probs"}

    probs = r.probs.data.cpu().numpy()
    top1 = int(r.probs.top1)
    conf = float(probs[top1])

    # Safe class label resolution
    if GATE_CLASSES and top1 < len(GATE_CLASSES):
        label = GATE_CLASSES[top1]
    else:
        label = f"class_{top1}"

    diag = {"gate_label": label, "gate_conf": conf, "gate_thresh": float(thresh)}

    # Primary policy:
    # - accept only if confident "valid_skin"
    # - reject otherwise (includes confident nonhuman + uncertain)
    if label.lower() == "valid_skin" and conf >= thresh:
        return True, diag

    if label.lower() == "nonhuman" and conf >= thresh:
        diag["reason"] = "gate_nonhuman"
        return False, diag

    diag["reason"] = "gate_uncertain"
    return False, diag


def predict_pil_image(pil_img: Image.Image, topk: int = 5, gate_thresh: float = 0.70):
    """
    Main prediction used by views.py.
    Always returns JSON-serialisable dict:
    - rejected=True: do not show disease output
    - rejected=False: includes top1/top5 disease classes
    - error: for unexpected exceptions
    """
    try:
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        # 1) Gate
        ok, gate_diag = gate_check(pil_img, thresh=gate_thresh)
        if not ok:
            return {
                "rejected": True,
                "label": UNKNOWN_LABEL,
                "confidence": float(gate_diag.get("gate_conf", 0.0)),
                "diagnostics": gate_diag,
                "top5": []
            }

        # 2) Disease classifier
        res = DISEASE_MODEL.predict(pil_img, verbose=False)[0]
        if not hasattr(res, "probs") or res.probs is None:
            return {"error": "Disease model returned no classification probabilities."}

        probs = res.probs.data.cpu().numpy()
        num_classes = int(probs.shape[0])

        # Ensure disease class length matches model output size
        if len(DISEASE_CLASSES) != num_classes:
            # Fallback prevents crash; but you should fix classes.txt order/length.
            names = [f"class_{i}" for i in range(num_classes)]
        else:
            names = DISEASE_CLASSES

        top1_idx = int(res.probs.top1)
        top1_conf = float(getattr(res.probs, "top1conf", probs[top1_idx]))

        k = int(max(1, min(int(topk), num_classes)))
        topk_idx = np.argsort(-probs)[:k]

        top5 = [{"label": names[int(i)], "confidence": float(probs[int(i)])} for i in topk_idx]

        return {
            "rejected": False,
            "top1": {"label": names[top1_idx], "confidence": top1_conf},
            "top5": top5,
            "diagnostics": {"gate": gate_diag}
        }

    except Exception as e:
        return {"error": f"Prediction error: {type(e).__name__}: {e}"}