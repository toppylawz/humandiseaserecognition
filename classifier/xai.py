"""
Explainable AI (XAI) engine for the Ultralytics YOLO11 classification models.

The module does not depend on Django, so it can also be used for offline
evaluation scripts.

Methods
-------
Grad-CAM    (Selvaraju et al., 2017)  - class-discriminative localisation map.
Grad-CAM++  (Chattopadhay et al., 2018) - weighting variant of Grad-CAM.
Occlusion   (Zeiler & Fergus, 2014)      - perturbation-based, model-agnostic:
                                           blur a sliding patch and measure the
                                           drop in class probability. Independent
                                           of gradients, so agreement with
                                           Grad-CAM is a useful cross-check.
Faithfulness check (in the spirit of Petsiuk et al., 2018, RISE):
    the region the map highlights is hidden (blurred) and the change in the
    predicted-class probability is measured, and compared with hiding an
    equally sized random region. A map that really reflects what the model
    uses should cause a much larger drop than random.

The analyser page shows a combined map: Grad-CAM sharpened by the occlusion
map whenever covering a single patch clearly lowers the class probability.

Preprocessing uses the Ultralytics classification transform itself, so the
explanation is computed on exactly the pixels the model classifies.
"""

from __future__ import annotations

import base64
import io
import threading
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageFilter
from ultralytics.data.augment import classify_transforms

from .calibration import calibrated

try:  # matplotlib ships with ultralytics; fall back to a built-in ramp if absent
    from matplotlib import colormaps as _mpl_colormaps
except Exception:  # pragma: no cover
    _mpl_colormaps = None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _to_logits(out) -> torch.Tensor:
    """Ultralytics Classify head returns (softmax, logits) in eval mode,
    logits in train mode, or probabilities when exported. Normalise to logits."""
    if isinstance(out, (list, tuple)):
        return out[1] if len(out) > 1 else out[0]
    if torch.allclose(out.sum(1), torch.ones(out.shape[0], dtype=out.dtype), atol=1e-3) and (out >= 0).all():
        return torch.log(out.clamp_min(1e-12))
    return out


def _normalise_map(cam: np.ndarray) -> np.ndarray:
    cam = np.maximum(cam, 0)
    mx = float(cam.max())
    return cam / mx if mx > 1e-12 else np.zeros_like(cam)


def colorize(heatmap: np.ndarray, cmap: str = "jet") -> np.ndarray:
    """Map a [0, 1] heatmap to an RGB uint8 image."""
    h = np.clip(heatmap, 0, 1)
    if _mpl_colormaps is not None:
        rgb = _mpl_colormaps[cmap](h)[..., :3]
    else:  # simple blue -> red ramp
        rgb = np.stack([h, 1 - np.abs(2 * h - 1), 1 - h], axis=-1)
    return (rgb * 255).astype(np.uint8)


def overlay(rgb_uint8: np.ndarray, heatmap: np.ndarray, alpha: float = 0.45, cmap: str = "jet") -> np.ndarray:
    heat = colorize(heatmap, cmap).astype(np.float32)
    out = (1 - alpha) * rgb_uint8.astype(np.float32) + alpha * heat
    return np.clip(out, 0, 255).astype(np.uint8)


def to_data_uri(arr: np.ndarray, fmt: str = "JPEG", quality: int = 88) -> str:
    buf = io.BytesIO()
    img = Image.fromarray(arr)
    if fmt.upper() == "JPEG":
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        mime = "image/jpeg"
    elif fmt.upper() == "WEBP":
        img.save(buf, format="WEBP", quality=quality)
        mime = "image/webp"
    else:
        img.save(buf, format="PNG", optimize=True)
        mime = "image/png"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode("ascii")


# --------------------------------------------------------------------------- #
# Explainer
# --------------------------------------------------------------------------- #
class YoloClsExplainer:
    """Gradient-based explanations for an Ultralytics YOLO classification model.

    Parameters
    ----------
    yolo : ultralytics.YOLO
        A loaded classification model (task='classify').
    class_names : list[str] | None
        Labels in index order (falls back to model.names).
    target_layer : str
        "head"     -> 1x1 conv of the Classify head, directly before global
                      average pooling (Grad-CAM here is mathematically CAM,
                      i.e. the most faithful choice for this architecture).
        "backbone" -> last backbone block (C2PSA in YOLO11).
    """

    def __init__(self, yolo, class_names: Optional[List[str]] = None, target_layer: str = "head"):
        self.yolo = yolo
        self.net = yolo.model  # ultralytics ClassificationModel (nn.Module)
        self.net.eval()
        self.device = next(self.net.parameters()).device
        self.dtype = next(self.net.parameters()).dtype

        imgsz = (getattr(yolo, "overrides", {}) or {}).get("imgsz") or (getattr(self.net, "args", {}) or {}).get("imgsz") or 224
        self.imgsz = int(imgsz[0] if isinstance(imgsz, (list, tuple)) else imgsz)

        names = class_names
        if not names:
            n = getattr(yolo, "names", None) or {}
            names = [n[i] for i in sorted(n)] if isinstance(n, dict) else list(n)
        self.class_names = list(names)

        self.target_layer_name = target_layer
        self._lock = threading.Lock()
        self._transform = classify_transforms(self.imgsz)

    # ----------------------------------------------------------------- utils
    def _target_module(self, which: Optional[str] = None):
        which = which or self.target_layer_name
        layers = self.net.model
        if which == "backbone":
            return layers[-2]
        head = layers[-1]
        return getattr(head, "conv", head)

    def preprocess(self, pil_img: Image.Image):
        """Return (tensor[1,3,S,S] in [0,1], RGB uint8 array of the exact crop the model sees).

        Uses the Ultralytics classification transform itself, so explanations and
        confidences match model.predict() exactly.
        """
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")
        x = self._transform(pil_img).unsqueeze(0)
        arr = (x[0].permute(1, 2, 0).numpy() * 255.0).round().clip(0, 255).astype(np.uint8)
        return x.to(self.device, self.dtype), arr

    @torch.no_grad()
    def predict_tensor(self, x: torch.Tensor, batch_size: int = 64) -> np.ndarray:
        """Class probabilities for a batch tensor [N,3,S,S] -> np [N,C]."""
        outs = []
        for i in range(0, x.shape[0], batch_size):
            logits = _to_logits(self.net(x[i:i + batch_size].to(self.device, self.dtype)))
            outs.append(torch.softmax(logits.float(), 1).cpu())
        return torch.cat(outs).numpy()

    def predict_arrays(self, arrs: np.ndarray, batch_size: int = 64) -> np.ndarray:
        """Probabilities for uint8/float images [N,S,S,3] (0-255). Used by SHAP."""
        x = torch.from_numpy(np.asarray(arrs, dtype=np.float32) / 255.0).permute(0, 3, 1, 2)
        return self.predict_tensor(x, batch_size=batch_size)

    # ------------------------------------------------------------ CAM maps
    def cams(self, x: torch.Tensor, class_index: Optional[int] = None, layer: Optional[str] = None,
             net: Optional[torch.nn.Module] = None) -> Dict[str, object]:
        """Compute Grad-CAM and Grad-CAM++ for one image tensor [1,3,S,S]."""
        net = net if net is not None else self.net
        module = self._target_module(layer) if net is self.net else self._module_of(net, layer)
        store = {}

        def fwd_hook(_m, _inp, out):
            store["act"] = out
            out.register_hook(lambda g: store.__setitem__("grad", g))

        handle = module.register_forward_hook(fwd_hook)
        try:
            with self._lock, torch.enable_grad():
                xi = x.clone().detach().requires_grad_(True)
                logits = _to_logits(net(xi))
                probs = torch.softmax(logits.detach().float(), 1)[0].cpu().numpy()
                c = int(np.argmax(probs)) if class_index is None else int(class_index)
                net.zero_grad(set_to_none=True)
                logits[0, c].backward()
        finally:
            handle.remove()

        A = store["act"].detach().float()[0]      # [K,h,w]
        G = store["grad"].detach().float()[0]     # [K,h,w]

        # Grad-CAM
        w = G.mean(dim=(1, 2))
        gradcam = torch.relu((w[:, None, None] * A).sum(0))

        # Grad-CAM++
        g2, g3 = G.pow(2), G.pow(3)
        denom = 2 * g2 + A.sum(dim=(1, 2))[:, None, None] * g3
        alpha = g2 / torch.where(denom != 0, denom, torch.ones_like(denom))
        alpha = torch.where(G != 0, alpha, torch.zeros_like(alpha))
        wpp = (alpha * torch.relu(G)).sum(dim=(1, 2))
        gradcampp = torch.relu((wpp[:, None, None] * A).sum(0))

        S = x.shape[-1]

        def up(m):
            m = F.interpolate(m[None, None], size=(S, S), mode="bilinear", align_corners=False)[0, 0]
            return _normalise_map(m.cpu().numpy())

        return {"class_index": c, "probs": probs, "gradcam": up(gradcam), "gradcampp": up(gradcampp),
                "feature_map_size": tuple(A.shape[1:])}

    def _module_of(self, net, layer):
        layers = net.model
        if (layer or self.target_layer_name) == "backbone":
            return layers[-2]
        head = layers[-1]
        return getattr(head, "conv", head)

    # ---------------------------------------------------- perturbation tools
    @staticmethod
    def blurred_baseline(rgb_uint8: np.ndarray, radius: int = 12) -> np.ndarray:
        return np.asarray(Image.fromarray(rgb_uint8).filter(ImageFilter.GaussianBlur(radius)), dtype=np.uint8)

    @staticmethod
    def top_mask(heatmap: np.ndarray, fraction: float) -> np.ndarray:
        k = max(1, int(round(fraction * heatmap.size)))
        thr = np.partition(heatmap.ravel(), -k)[-k]
        return (heatmap >= thr) & (heatmap > 0)

    def faithfulness(self, rgb: np.ndarray, heatmap: np.ndarray, class_index: int,
                     fraction: float = 0.2, n_random: int = 3, seed: int = 0) -> Dict[str, float]:
        """Hide the top-`fraction` most highlighted pixels (blur) and compare the
        probability drop with hiding random regions of the same size."""
        base = self.blurred_baseline(rgb)
        m = self.top_mask(heatmap, fraction)
        rng = np.random.default_rng(seed)

        imgs = [rgb]
        removed = rgb.copy(); removed[m] = base[m]; imgs.append(removed)          # hide highlighted
        kept = base.copy(); kept[m] = rgb[m]; imgs.append(kept)                   # show only highlighted
        # random blocky masks of the same area (blocks of 16 px, like the CAM grid)
        S = rgb.shape[0]; cell = max(8, S // 14)
        g = int(np.ceil(S / cell)); n_cells = max(1, int(round(fraction * g * g)))
        for _ in range(n_random):
            cells = rng.choice(g * g, n_cells, replace=False)
            rm = np.zeros((g, g), bool); rm.flat[cells] = True
            rm = np.kron(rm, np.ones((cell, cell), bool))[:S, :S]
            r = rgb.copy(); r[rm] = base[rm]; imgs.append(r)

        full = self.predict_arrays(np.stack(imgs))
        p = full[:, class_index]
        shown = calibrated(full)[:, class_index]
        p0, p_removed, p_kept = float(p[0]), float(p[1]), float(p[2])
        p_random = float(np.mean(p[3:]))
        drop = p0 - p_removed
        rand_drop = p0 - p_random
        return {
            "fraction_hidden": float(fraction),
            "shown_original": float(shown[0]),
            "shown_highlight_hidden": float(shown[1]),
            "shown_random_hidden": float(np.mean(shown[3:])),
            "confidence_original": p0,
            "confidence_highlight_hidden": p_removed,
            "confidence_only_highlight": p_kept,
            "confidence_random_hidden": p_random,
            "drop_highlight": float(drop),
            "drop_random": float(rand_drop),
            # None when hiding random regions changes nothing (ratio undefined; keeps JSON valid)
            "faithfulness_ratio": float(drop / rand_drop) if rand_drop > 1e-3 else None,
        }

    def occlusion(self, rgb: np.ndarray, class_index: int, patch: int = 48, stride: int = 24) -> np.ndarray:
        """Occlusion sensitivity map (probability drop when each region is blurred), unnormalised."""
        S = rgb.shape[0]
        base = self.blurred_baseline(rgb)
        pos = sorted(set(list(range(0, S - patch + 1, stride)) + [S - patch]))
        coords = [(y, x) for y in pos for x in pos]
        batch = [rgb]
        for y, x in coords:
            im = rgb.copy(); im[y:y + patch, x:x + patch] = base[y:y + patch, x:x + patch]
            batch.append(im)
        probs = self.predict_arrays(np.stack(batch))[:, class_index]
        p0 = probs[0]
        heat = np.zeros((S, S), np.float32); cnt = np.zeros((S, S), np.float32)
        for (y, x), p in zip(coords, probs[1:]):
            heat[y:y + patch, x:x + patch] += (p0 - p); cnt[y:y + patch, x:x + patch] += 1
        return heat / np.maximum(cnt, 1)

    def influence_map(self, x: torch.Tensor, rgb: np.ndarray, class_index: int) -> np.ndarray:
        """Grad-CAM sharpened by occlusion, normalised to [0, 1].

        The occlusion map only counts as far as covering a single patch really
        lowers the class probability: `weight` rises from 0 (largest drop under
        10% of the original probability, Grad-CAM alone) to 1 (40% or more,
        geometric mean of the two maps).
        """
        cam = self.cams(x, class_index=class_index)["gradcam"]
        p0 = float(self.predict_tensor(x)[0, class_index])
        drop = np.maximum(self.occlusion(rgb, class_index), 0)
        weight = float(np.clip((drop.max() / max(p0, 1e-6) - 0.1) / 0.3, 0, 1))
        if weight == 0:
            return cam
        t = torch.from_numpy(drop)[None, None]
        drop = _normalise_map(F.avg_pool2d(F.pad(t, (12, 12, 12, 12), mode="replicate"), 25, stride=1)[0, 0].numpy())
        fused = _normalise_map(cam ** (1 - weight / 2) * drop ** (weight / 2))
        return fused if float(fused.max()) > 0 else cam

    @staticmethod
    def rank_agreement(a: np.ndarray, b: np.ndarray, size: int = 28) -> float:
        """Spearman rank correlation between two maps (pooled to size x size)."""
        def pool(m):
            t = torch.from_numpy(np.ascontiguousarray(m, dtype=np.float32))[None, None]
            return F.adaptive_avg_pool2d(t, size).ravel().numpy()
        ra, rb = pool(a), pool(b)
        ra = np.argsort(np.argsort(ra)).astype(np.float64); rb = np.argsort(np.argsort(rb)).astype(np.float64)
        if ra.std() == 0 or rb.std() == 0:
            return 0.0
        return float(np.corrcoef(ra, rb)[0, 1])

    @staticmethod
    def concentration(heatmap: np.ndarray, fraction: float = 0.2) -> float:
        """Share of total attention mass located in the top `fraction` of pixels."""
        flat = np.sort(heatmap.ravel())[::-1]
        total = flat.sum()
        if total <= 0:
            return 0.0
        k = max(1, int(round(fraction * flat.size)))
        return float(flat[:k].sum() / total)

    # --------------------------------------------------------- web summary
    @staticmethod
    def heat_layer(heatmap: np.ndarray, size: int = 448) -> np.ndarray:
        """Transparent magma layer: colour and opacity both follow the heatmap."""
        h = np.asarray(Image.fromarray((np.clip(heatmap, 0, 1) * 65535).astype(np.int32), "I")
                       .resize((size, size), Image.BICUBIC), dtype=np.float64) / 65535
        h = np.clip(h, 0, 1)
        if _mpl_colormaps is not None:
            rgb = _mpl_colormaps["magma"](0.35 + 0.65 * h)[..., :3]
        else:
            rgb = np.stack([h, h ** 2, 0.4 * (1 - h)], axis=-1)
        alpha = np.clip((h - 0.22) / 0.78, 0, 1) * 0.96
        return (np.dstack([rgb, alpha]) * 255).round().astype(np.uint8)

    @staticmethod
    def peaks(heatmap: np.ndarray, k: int = 2, min_gap: float = 0.25, second_min: float = 0.6) -> List[List[float]]:
        """Up to k separated hotspots as [x%, y%], strongest first.

        A further hotspot is kept only when it reaches `second_min` of the strongest.
        """
        S = heatmap.shape[0]
        t = torch.from_numpy(heatmap.astype(np.float32))[None, None]
        smooth = F.avg_pool2d(F.pad(t, (7, 7, 7, 7), mode="replicate"), 15, stride=1)
        local = F.max_pool2d(smooth, 61, stride=1, padding=30)
        hs = smooth[0, 0].numpy()
        top = float(hs.max())
        if top <= 0:
            return []
        ys, xs = np.nonzero((smooth == local)[0, 0].numpy() & (hs >= second_min * top))
        out: List[List[float]] = []
        for i in np.argsort(-hs[ys, xs]):
            x = float(np.clip((xs[i] + 0.5) / S, 0.04, 0.96))
            y = float(np.clip((ys[i] + 0.5) / S, 0.04, 0.96))
            if all(np.hypot(x - a / 100, y - b / 100) > min_gap for a, b in out):
                out.append([round(x * 100, 1), round(y * 100, 1)])
            if len(out) == k:
                break
        return out

    @staticmethod
    def photo_crop(pil_img: Image.Image, size: int = 640) -> Image.Image:
        """The centre square the model sees, kept at display resolution."""
        img = pil_img.convert("RGB")
        w, h = img.size
        s = min(w, h)
        img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
        return img.resize((min(size, s),) * 2, Image.LANCZOS) if s > size else img

    def explain_for_web(self, pil_img: Image.Image, class_index: Optional[int] = None,
                        with_faithfulness: bool = True) -> Dict[str, object]:
        """Compact JSON-serialisable explanation for the analyser page."""
        x, rgb = self.preprocess(pil_img)
        if class_index is None:
            class_index = int(np.argmax(self.predict_tensor(x)[0]))
        c = int(class_index)
        cam = self.influence_map(x, rgb, c)

        photo = np.asarray(self.photo_crop(pil_img))
        payload = {
            "explained_class": self.class_names[c] if c < len(self.class_names) else f"class_{c}",
            "images": {
                "photo": to_data_uri(photo, quality=90),
                "heat": to_data_uri(self.heat_layer(cam), fmt="WEBP"),
            },
            "pins": self.peaks(cam),
        }
        if with_faithfulness:
            f = self.faithfulness(rgb, cam, c, fraction=0.2)
            p0 = f["confidence_original"]
            covered = f["confidence_highlight_hidden"]
            others = f["confidence_random_hidden"]
            relative_drop = (p0 - covered) / p0 if p0 > 0 else 0.0
            if relative_drop >= 0.5 and others - covered >= 0.25 * p0:
                verdict = "strong"
            elif relative_drop >= 0.25 and others > covered:
                verdict = "moderate"
            else:
                verdict = "weak"
            f["verdict"] = verdict
            payload["faithfulness"] = f
        return payload
