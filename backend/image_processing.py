from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

import numpy as np
from PIL import Image


@dataclass(frozen=True)
class GrayscaleImage:
    width: int
    height: int
    pixels: np.ndarray


def _resize_dimensions(
    width: int,
    height: int,
    max_width: int = 600,
    max_height: int = 400,
) -> tuple[int, int]:
    scale = min(max_width / width, max_height / height, 1.0)
    resized_width = math.floor(width * scale)
    resized_height = math.floor(height * scale)
    return resized_width, resized_height


def load_grayscale_image(
    source: str | Path | BinaryIO,
    *,
    max_width: int = 600,
    max_height: int = 400,
) -> GrayscaleImage:
    """Load an image, resize it like the frontend, and return grayscale pixels.

    The luminance weights match the existing browser implementation:
    gray = 0.299 * r + 0.587 * g + 0.114 * b
    """
    with Image.open(source) as image:
        rgb_image = image.convert("RGB")
        width, height = rgb_image.size
        resized_width, resized_height = _resize_dimensions(
            width,
            height,
            max_width=max_width,
            max_height=max_height,
        )
        resized = rgb_image.resize((resized_width, resized_height))

    rgb_pixels = np.asarray(resized, dtype=np.float32)
    grayscale_pixels = (
        0.299 * rgb_pixels[:, :, 0]
        + 0.587 * rgb_pixels[:, :, 1]
        + 0.114 * rgb_pixels[:, :, 2]
    ).astype(np.float32)

    return GrayscaleImage(
        width=resized_width,
        height=resized_height,
        pixels=grayscale_pixels,
    )
