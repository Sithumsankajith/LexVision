from __future__ import annotations

import importlib.util
import random
from copy import deepcopy
from typing import Any

import numpy as np


def _albumentations_available() -> bool:
    return importlib.util.find_spec("albumentations") is not None


def build_traffic_augmentation_metadata(target_key: str, profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "target": target_key,
        "backend": "albumentations",
        "active": _albumentations_available(),
        "profile": deepcopy(profile),
        "notes": (
            "Blur, motion blur, brightness/contrast, CLAHE, gamma, compression, "
            "plus Ultralytics geometric augmentations."
        ),
    }


def patch_ultralytics_albumentations(target_key: str, profile: dict[str, Any]) -> dict[str, Any]:
    """
    Monkeypatch Ultralytics' Albumentations wrapper with a traffic-specific profile.

    Ultralytics v8 detection always instantiates `Albumentations(p=1.0)` inside the
    transform builder. Replacing that class at runtime is the least invasive way to
    add motion blur and stronger traffic-image photometric augmentation without
    forking the full data pipeline.
    """
    metadata = build_traffic_augmentation_metadata(target_key, profile)

    try:
        import albumentations as A
        from ultralytics.data import augment as yolo_augment
        from ultralytics.utils import LOGGER, colorstr
        from ultralytics.utils.checks import check_version
    except ImportError:
        return metadata

    check_version(A.__version__, "1.0.3", hard=True)
    prefix = colorstr("albumentations: ")

    profile_copy = deepcopy(profile)

    class TrafficAlbumentations:
        def __init__(self, p: float = 1.0):
            self.p = p
            self.transform = None
            self.profile_name = target_key
            try:
                transforms = [
                    A.Blur(
                        blur_limit=(3, int(profile_copy["blur"]["blur_limit"])),
                        p=float(profile_copy["blur"]["p"]),
                    ),
                    A.MedianBlur(
                        blur_limit=int(profile_copy["median_blur"]["blur_limit"]),
                        p=float(profile_copy["median_blur"]["p"]),
                    ),
                    A.MotionBlur(
                        blur_limit=int(profile_copy["motion_blur"]["blur_limit"]),
                        p=float(profile_copy["motion_blur"]["p"]),
                    ),
                    A.CLAHE(p=float(profile_copy["clahe"]["p"])),
                    A.RandomBrightnessContrast(
                        brightness_limit=float(profile_copy["brightness_contrast"]["brightness_limit"]),
                        contrast_limit=float(profile_copy["brightness_contrast"]["contrast_limit"]),
                        p=float(profile_copy["brightness_contrast"]["p"]),
                    ),
                    A.RandomGamma(
                        gamma_limit=tuple(profile_copy["gamma"]["gamma_limit"]),
                        p=float(profile_copy["gamma"]["p"]),
                    ),
                    A.ImageCompression(
                        quality_lower=int(profile_copy["compression"]["quality_lower"]),
                        p=float(profile_copy["compression"]["p"]),
                    ),
                ]
                self.transform = A.Compose(
                    transforms,
                    bbox_params=A.BboxParams(format="yolo", label_fields=["class_labels"]),
                )
                LOGGER.info(
                    prefix
                    + f"{self.profile_name} -> "
                    + ", ".join(str(item).replace("always_apply=False, ", "") for item in transforms if item.p)
                )
            except Exception as exc:  # pragma: no cover - defensive runtime logging
                LOGGER.warning(f"{prefix}failed to initialize traffic profile '{self.profile_name}': {exc}")

        def __call__(self, labels: dict[str, Any]) -> dict[str, Any]:
            image = labels["img"]
            classes = labels["cls"]
            if len(classes):
                labels["instances"].convert_bbox("xywh")
                labels["instances"].normalize(*image.shape[:2][::-1])
                bboxes = labels["instances"].bboxes
                if self.transform and random.random() < self.p:
                    transformed = self.transform(image=image, bboxes=bboxes, class_labels=classes)
                    if len(transformed["class_labels"]) > 0:
                        labels["img"] = transformed["image"]
                        labels["cls"] = np.array(transformed["class_labels"])
                        bboxes = np.array(transformed["bboxes"], dtype=np.float32)
                labels["instances"].update(bboxes=bboxes)
            return labels

    yolo_augment.Albumentations = TrafficAlbumentations
    return metadata
