import os
from ultralytics import YOLO

# Adjust path relative to manage.py
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "ml", "yolo11_best.pt")

# Load once at import time
MODEL = YOLO(MODEL_PATH)

IMGSZ = 224  # must match training

def predict_pil_image(pil_img, topk=5):
    """
    Returns:
      top1: {label, confidence}
      top5: [{label, confidence}, ...]
    """
    results = MODEL.predict(source=pil_img, imgsz=IMGSZ, verbose=False)
    r = results[0]

    probs = r.probs
    names = r.names  # dict: idx -> label

    top1_idx = int(probs.top1)
    top1_conf = float(probs.top1conf)

    top5_idx = [int(i) for i in probs.top5[:topk]]
    top5_conf = [float(c) for c in probs.top5conf[:topk]]

    top5 = [{"label": names.get(i, str(i)), "confidence": c} for i, c in zip(top5_idx, top5_conf)]

    return {
        "top1": {"label": names.get(top1_idx, str(top1_idx)), "confidence": top1_conf},
        "top5": top5
    }
