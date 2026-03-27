from __future__ import annotations

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .image_processing import AnalysisResult, HighlightBox, RegressionResult, analyze_image


app = FastAPI(title="Box Counting Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def serialize_highlight(box: HighlightBox) -> dict[str, int]:
    return {
        "x": box.x,
        "y": box.y,
        "size": box.size,
        "boxIndex": box.box_index,
    }


def serialize_regression(
    regression: RegressionResult | None,
) -> dict[str, float] | None:
    if regression is None:
        return None
    return {
        "slope": regression.slope,
        "intercept": regression.intercept,
    }


def serialize_analysis(result: AnalysisResult) -> dict[str, object]:
    return {
        "width": result.width,
        "height": result.height,
        "threshold": result.threshold,
        "boxSizes": result.box_sizes,
        "results": [
            {
                "s": item.s,
                "count": item.count,
                "totalBoxes": item.total_boxes,
                "logInvS": item.logInvS,
                "logN": item.logN,
            }
            for item in result.results
        ],
        "regression": serialize_regression(result.regression),
        "progressiveRegressions": [
            serialize_regression(item) for item in result.progressive_regressions
        ],
        "highlightsByScale": {
            str(scale): [serialize_highlight(box) for box in boxes]
            for scale, boxes in result.highlights_by_scale.items()
        },
    }


@app.post("/api/analyze")
async def analyze(
    image: UploadFile = File(...),
    threshold: int = Form(...),
) -> dict[str, object]:
    analysis = analyze_image(image.file, threshold=threshold)
    return serialize_analysis(analysis)
