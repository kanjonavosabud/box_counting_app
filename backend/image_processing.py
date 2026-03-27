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


@dataclass(frozen=True)
class BoxResult:
    s: int
    count: int
    total_boxes: int
    logInvS: float
    logN: float


@dataclass(frozen=True)
class RegressionResult:
    slope: float
    intercept: float


@dataclass(frozen=True)
class HighlightBox:
    x: int
    y: int
    size: int
    box_index: int


@dataclass(frozen=True)
class AnalysisResult:
    width: int
    height: int
    threshold: int
    box_sizes: list[int]
    binary: np.ndarray
    results: list[BoxResult]
    regression: RegressionResult | None
    progressive_regressions: list[RegressionResult | None]
    highlights_by_scale: dict[int, list[HighlightBox]]


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


def grayscale_to_binary(
    grayscale: GrayscaleImage,
    threshold: int,
) -> np.ndarray:
    """Match the frontend threshold rule: gray < threshold => foreground."""
    return (grayscale.pixels < threshold).astype(np.uint8)


def generate_box_sizes(width: int, height: int) -> list[int]:
    sizes: list[int] = []
    s = min(width, height)

    while s >= 4:
        sizes.append(s)
        s = math.floor(s / 1.6)

    if sizes and sizes[-1] != 2 and sizes[-1] > 2:
        sizes.append(2)

    return sizes


def count_non_empty_boxes(
    binary: np.ndarray,
    box_size: int,
) -> tuple[int, list[HighlightBox]]:
    height, width = binary.shape
    boxes_x = math.ceil(width / box_size)
    boxes_y = math.ceil(height / box_size)

    non_empty_count = 0
    highlights: list[HighlightBox] = []

    for by in range(boxes_y):
        for bx in range(boxes_x):
            start_x = bx * box_size
            start_y = by * box_size
            end_x = min(start_x + box_size, width)
            end_y = min(start_y + box_size, height)

            cell = binary[start_y:end_y, start_x:end_x]
            if np.any(cell == 1):
                non_empty_count += 1
                highlights.append(
                    HighlightBox(
                        x=start_x,
                        y=start_y,
                        size=box_size,
                        box_index=by * boxes_x + bx,
                    )
                )

    return non_empty_count, highlights


def compute_regression(points: list[BoxResult]) -> RegressionResult | None:
    if len(points) < 2:
        return None

    n = len(points)
    sum_x = sum(point.logInvS for point in points)
    sum_y = sum(point.logN for point in points)
    sum_xy = sum(point.logInvS * point.logN for point in points)
    sum_x2 = sum(point.logInvS * point.logInvS for point in points)

    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return None

    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n
    return RegressionResult(slope=slope, intercept=intercept)


def analyze_grayscale(
    grayscale: GrayscaleImage,
    threshold: int,
) -> AnalysisResult:
    binary = grayscale_to_binary(grayscale, threshold)
    box_sizes = generate_box_sizes(grayscale.width, grayscale.height)
    min_dim = min(grayscale.width, grayscale.height)

    results: list[BoxResult] = []
    progressive_regressions: list[RegressionResult | None] = []
    highlights_by_scale: dict[int, list[HighlightBox]] = {}

    for box_size in box_sizes:
        count, highlights = count_non_empty_boxes(binary, box_size)
        highlights_by_scale[box_size] = highlights
        total_boxes = math.ceil(grayscale.width / box_size) * math.ceil(
            grayscale.height / box_size
        )

        inv_scale = min_dim / box_size
        result = BoxResult(
            s=box_size,
            count=count,
            total_boxes=total_boxes,
            logInvS=math.log(inv_scale),
            logN=math.log(count or 1),
        )
        results.append(result)
        progressive_regressions.append(compute_regression(results))

    regression = compute_regression(results)

    return AnalysisResult(
        width=grayscale.width,
        height=grayscale.height,
        threshold=threshold,
        box_sizes=box_sizes,
        binary=binary,
        results=results,
        regression=regression,
        progressive_regressions=progressive_regressions,
        highlights_by_scale=highlights_by_scale,
    )


def analyze_image(
    source: str | Path | BinaryIO,
    *,
    threshold: int,
    max_width: int = 600,
    max_height: int = 400,
) -> AnalysisResult:
    grayscale = load_grayscale_image(
        source,
        max_width=max_width,
        max_height=max_height,
    )
    return analyze_grayscale(grayscale, threshold)
