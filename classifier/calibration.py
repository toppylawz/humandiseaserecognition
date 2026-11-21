"""Confidence calibration for the disease classifier.

The temperature was fitted on held-out phone photos (retrain/retrain_v2.py calibrate),
so a shown confidence of 60% is right about 6 times in 10 on that kind of photo.
"""
import numpy as np

CONFIDENCE_TEMPERATURE = 2.28


def calibrated(probs: np.ndarray, temperature: float = CONFIDENCE_TEMPERATURE) -> np.ndarray:
    """Temperature-scale probabilities along the last axis."""
    scaled = np.exp(np.log(np.clip(np.asarray(probs, dtype=np.float64), 1e-12, 1.0)) / temperature)
    return scaled / scaled.sum(axis=-1, keepdims=True)
