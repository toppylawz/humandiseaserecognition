import os
import numpy as np
from PIL import Image
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Model paths
DISEASE_MODEL_PATH = os.path.join(BASE_DIR, "ml", "yolo11_best.pt")
GATE_MODEL_PATH    = os.path.join(BASE_DIR, "ml", "gate_best.pt")

DISEASE_MODEL = YOLO(DISEASE_MODEL_PATH)
GATE_MODEL    = YOLO(GATE_MODEL_PATH)

UNKNOWN_LABEL = "UNKNOWN / Non-human or invalid input"

# this is optional deterministic label files
DISEASE_CLASSES_TXT = os.path.join(BASE_DIR, "ml", "classes.txt")
GATE_CLASSES_TXT    = os.path.join(BASE_DIR, "ml", "gate_classes.txt")


def _load_labels(txt_path: str, model: YOLO):
    """
    Returns labels in correct index order:
    1) from txt file (one per line) if present and non-empty
    2) from model.names (dict or list)
    3) empty list
    """
    # From txt
    if os.path.exists(txt_path):
        with open(txt_path, "r", encoding="utf-8") as f:
            labels = [ln.strip() for ln in f if ln.strip()]
        if labels:
            return labels

    # From model.names
    names = getattr(model, "names", None)
    if isinstance(names, dict) and names:
        return [names[i] for i in sorted(names.keys())]
    if isinstance(names, list) and names:
        return names

    return []


DISEASE_CLASSES = _load_labels(DISEASE_CLASSES_TXT, DISEASE_MODEL)
GATE_CLASSES    = _load_labels(GATE_CLASSES_TXT, GATE_MODEL)


def _softmax_entropy(probs: np.ndarray) -> float:
    p = np.clip(probs, 1e-12, 1.0)
    return float(-(p * np.log(p)).sum())


def gate_check(pil_img: Image.Image,
               accept_thresh: float = 0.70,
               reject_thresh: float = 0.80):
    """
    Returns (status, diag)
    status in {"accept", "reject", "uncertain"}.

    Policy:
    - accept if gate predicts valid_skin with conf >= accept_thresh
    - reject if gate predicts nonhuman with conf >= reject_thresh
    - otherwise uncertain
    """
    r = GATE_MODEL.predict(pil_img, verbose=False)[0]
    if not hasattr(r, "probs") or r.probs is None:
        return "uncertain", {"reason": "gate_no_probs"}

    probs = r.probs.data.cpu().numpy()
    top1 = int(r.probs.top1)
    conf = float(probs[top1])

    label = GATE_CLASSES[top1] if (GATE_CLASSES and top1 < len(GATE_CLASSES)) else f"class_{top1}"
    label_l = label.lower()

    diag = {
        "gate_label": label,
        "gate_conf": conf,
        "accept_thresh": float(accept_thresh),
        "reject_thresh": float(reject_thresh),
    }

    if label_l == "valid_skin" and conf >= accept_thresh:
        return "accept", diag

    if label_l == "nonhuman" and conf >= reject_thresh:
        diag["reason"] = "confident_nonhuman"
        return "reject", diag

    diag["reason"] = "uncertain_gate"
    return "uncertain", diag


def disease_predict(pil_img: Image.Image, topk: int = 5):
    r = DISEASE_MODEL.predict(pil_img, verbose=False)[0]
    if not hasattr(r, "probs") or r.probs is None:
        return {"error": "Disease model returned no classification probabilities."}

    probs = r.probs.data.cpu().numpy()
    num_classes = int(probs.shape[0])

    names = DISEASE_CLASSES if (DISEASE_CLASSES and len(DISEASE_CLASSES) == num_classes) else [f"class_{i}" for i in range(num_classes)]

    top1_idx = int(r.probs.top1)
    top1_conf = float(getattr(r.probs, "top1conf", probs[top1_idx]))
    ent = _softmax_entropy(probs)

    k = int(max(1, min(int(topk), num_classes)))
    topk_idx = np.argsort(-probs)[:k]
    top5 = [{"label": names[int(i)], "confidence": float(probs[int(i)])} for i in topk_idx]

    return {
        "top1": {"label": names[top1_idx], "confidence": top1_conf},
        "top5": top5,
        "entropy": float(ent),
    }


def predict_pil_image(pil_img: Image.Image,
                      topk: int = 5,
                      gate_accept_thresh: float = 0.70,
                      gate_reject_thresh: float = 0.80,
                      disease_min_conf_if_uncertain: float = 0.65,
                      disease_entropy_max_if_uncertain: float = 2.50):
    """
    Main function used by Django views.

    - If gate ACCEPT: run disease model normally.
    - If gate REJECT: return rejected=True (UNKNOWN).
    - If gate UNCERTAIN: run disease model, but only accept disease output if it is confident and low-entropy;
      otherwise reject as UNKNOWN. This reduces rubbish predictions without blocking real skin too aggressively.
    """
    try:
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        status, gate_diag = gate_check(
            pil_img,
            accept_thresh=gate_accept_thresh,
            reject_thresh=gate_reject_thresh
        )

        if status == "reject":
            return {
                "rejected": True,
                "label": UNKNOWN_LABEL,
                "confidence": float(gate_diag.get("gate_conf", 0.0)),
                "diagnostics": {"gate": gate_diag},
                "top5": []
            }

        d = disease_predict(pil_img, topk=topk)
        if "error" in d:
            return d

        # If gate uncertain, apply stricter acceptance
        if status == "uncertain":
            top1_conf = float(d["top1"]["confidence"])
            ent = float(d["entropy"])

            if (top1_conf < disease_min_conf_if_uncertain) or (ent > disease_entropy_max_if_uncertain):
                return {
                    "rejected": True,
                    "label": UNKNOWN_LABEL,
                    "confidence": top1_conf,
                    "diagnostics": {
                        "gate": gate_diag,
                        "disease_top1_conf": top1_conf,
                        "disease_entropy": ent,
                        "policy": "uncertain_gate_strict_filter"
                    },
                    "top5": []
                }

        return {
            "rejected": False,
            "top1": d["top1"],
            "top5": d["top5"],
            "diagnostics": {
                "gate": gate_diag,
                "disease_entropy": d["entropy"],
                "gate_status": status
            }
        }

    except Exception as e:
        return {"error": f"Prediction error: {type(e).__name__}: {e}"}
