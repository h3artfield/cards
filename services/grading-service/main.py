import base64
import re

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from grader import combine_sides, grade_image


def _run_grading(front_bytes: bytes, back_bytes: bytes) -> dict:
    try:
        front_result = grade_image(front_bytes, "front")
        back_result = grade_image(back_bytes, "back")
        return {"ok": True, "grading": combine_sides(front_result, back_result)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, f"Grading failed: {e}") from e

app = FastAPI(title="Card Grading Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_URL_RE = re.compile(r"^data:[^;]+;base64,(.+)$", re.DOTALL | re.IGNORECASE)


def load_image_bytes(source: str) -> bytes:
    """Load image from https URL or inline data: URL (Firestore inline photos)."""
    if source.startswith("data:"):
        match = DATA_URL_RE.match(source.strip())
        if not match:
            raise ValueError("Invalid data URL — expected data:image/...;base64,...")
        return base64.b64decode(match.group(1))

    if source.startswith("http://") or source.startswith("https://"):
        return source  # marker for async fetch

    raise ValueError("Image source must be an http(s) URL or data: URL")


async def fetch_image(source: str) -> bytes:
    loaded = load_image_bytes(source)
    if isinstance(loaded, bytes):
        return loaded

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.get(source)
        if res.status_code != 200:
            raise ValueError(f"Could not download image ({res.status_code})")
        return res.content


@app.get("/health")
def health():
    return {"ok": True, "service": "grading-service"}


@app.post("/grade")
async def grade(
    front: UploadFile = File(...),
    back: UploadFile = File(...),
):
    front_bytes = await front.read()
    back_bytes = await back.read()
    if len(front_bytes) > 15 * 1024 * 1024 or len(back_bytes) > 15 * 1024 * 1024:
        raise HTTPException(400, "Image exceeds 15MB limit")

    return _run_grading(front_bytes, back_bytes)


@app.post("/grade-urls")
async def grade_urls(body: dict):
    """Grade from remote URLs or inline data: URLs (used by Next.js admin)."""
    front_url = body.get("frontUrl")
    back_url = body.get("backUrl")
    front_b64 = body.get("frontBase64")
    back_b64 = body.get("backBase64")

    if front_b64 and back_b64:
        try:
            front_bytes = base64.b64decode(front_b64)
            back_bytes = base64.b64decode(back_b64)
        except Exception as e:
            raise HTTPException(400, f"Invalid base64 image data: {e}") from e
    elif front_url and back_url:
        try:
            front_bytes = await fetch_image(front_url)
            back_bytes = await fetch_image(back_url)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
    else:
        raise HTTPException(
            400,
            "Provide frontUrl+backUrl or frontBase64+backBase64",
        )

    if len(front_bytes) > 15 * 1024 * 1024 or len(back_bytes) > 15 * 1024 * 1024:
        raise HTTPException(400, "Image exceeds 15MB limit")

    return _run_grading(front_bytes, back_bytes)
