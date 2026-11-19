"""
Glue between the Django views and the XAI engine.

Re-uses the already-loaded disease model from ml_model.py (no second copy in
memory) and never lets an explanation failure break a prediction.
"""

import logging

from .ml_model import DISEASE_MODEL, DISEASE_CLASSES
from .xai import YoloClsExplainer

logger = logging.getLogger(__name__)

_EXPLAINER = None


def get_explainer() -> YoloClsExplainer:
    global _EXPLAINER
    if _EXPLAINER is None:
        _EXPLAINER = YoloClsExplainer(DISEASE_MODEL, class_names=DISEASE_CLASSES, target_layer="head")
    return _EXPLAINER


def attach_explanation(pred: dict, pil_img) -> dict:
    """Add pred['xai'] for accepted predictions. Rejected/error results are left untouched."""
    if not isinstance(pred, dict) or pred.get("rejected") or "error" in pred or "top1" not in pred:
        return pred
    try:
        explainer = get_explainer()
        label = pred["top1"]["label"]
        idx = explainer.class_names.index(label) if label in explainer.class_names else None
        pred["xai"] = explainer.explain_for_web(pil_img, class_index=idx)
    except Exception as e:  # explanation is additive: never fail the request
        logger.exception("XAI explanation failed")
        pred["xai_error"] = f"{type(e).__name__}: {e}"
    return pred
