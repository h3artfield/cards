import cv2
import numpy as np
from typing import Any


def load_image_bytes(data: bytes) -> np.ndarray | None:
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def _largest_quad_contour(gray: np.ndarray) -> np.ndarray | None:
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 40, 120)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape[:2]
    min_area = h * w * 0.08
    best = None
    best_area = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4 and area > best_area:
            best = approx
            best_area = area
    if best is not None:
        return best
    if contours:
        return max(contours, key=cv2.contourArea)
    return None


def _order_quad_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as top-left, top-right, bottom-right, bottom-left."""
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).reshape(-1)
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def _quad_from_contour(contour: np.ndarray) -> np.ndarray | None:
    """Return 4 corner points if contour can be reduced to a quadrilateral."""
    if contour is None or len(contour) < 4:
        return None
    if len(contour) == 4:
        return _order_quad_points(contour.reshape(4, 2).astype(np.float32))
    peri = cv2.arcLength(contour, True)
    for eps in (0.02, 0.03, 0.05, 0.08):
        approx = cv2.approxPolyDP(contour, eps * peri, True)
        if len(approx) == 4:
            return _order_quad_points(approx.reshape(4, 2).astype(np.float32))
    return None


def _warp_card(img: np.ndarray, ordered: np.ndarray) -> np.ndarray:
    tl, tr, br, bl = ordered
    w1 = np.linalg.norm(tr - tl)
    w2 = np.linalg.norm(br - bl)
    h1 = np.linalg.norm(bl - tl)
    h2 = np.linalg.norm(br - tr)
    max_w = max(int(max(w1, w2)), 200)
    max_h = max(int(max(h1, h2)), 280)
    dst = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(ordered, dst)
    return cv2.warpPerspective(img, matrix, (max_w, max_h))


def extract_card(img: np.ndarray) -> tuple[np.ndarray, bool]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    contour = _largest_quad_contour(gray)
    if contour is None:
        return img, False

    quad = _quad_from_contour(contour)
    if quad is not None:
        try:
            return _warp_card(img, quad), True
        except (cv2.error, ValueError):
            pass

    x, y, w, h = cv2.boundingRect(contour)
    if w > 20 and h > 20:
        return img[y : y + h, x : x + w], True
    return img, False


def _border_ratios(card: np.ndarray) -> dict[str, float]:
    """Estimate print centering from frame inset on each edge of the warped card."""
    h, w = card.shape[:2]
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    default = {
        "leftRight": "50/50",
        "topBottom": "50/50",
        "leftPercent": 50.0,
        "rightPercent": 50.0,
        "topPercent": 50.0,
        "bottomPercent": 50.0,
    }

    margin = max(4, int(min(h, w) * 0.04))
    if h <= margin * 2 + 20 or w <= margin * 2 + 20:
        return default

    scan = max(10, int(min(h, w) * 0.14))

    def inset_from_edge(vertical: bool, from_start: bool) -> float:
        if vertical:
            band = gray[:, :scan] if from_start else gray[:, -scan:]
            grad = cv2.Sobel(band, cv2.CV_64F, 1, 0, ksize=3)
            proj = np.abs(grad).sum(axis=0)
        else:
            band = gray[:scan, :] if from_start else gray[-scan:, :]
            grad = cv2.Sobel(band, cv2.CV_64F, 0, 1, ksize=3)
            proj = np.abs(grad).sum(axis=1)

        if proj.size < 3:
            return 0.5

        # Strongest frame lines — use median of top responses (not single peak)
        thresh = float(np.percentile(proj, 90))
        strong = np.flatnonzero(proj >= thresh)
        if strong.size == 0:
            idx = int(np.argmax(proj))
        else:
            idx = int(np.median(strong[: max(1, strong.size // 2)]))

        if from_start:
            return idx / max(scan - 1, 1)
        return (scan - 1 - idx) / max(scan - 1, 1)

    left_in = inset_from_edge(True, True)
    right_in = inset_from_edge(True, False)
    top_in = inset_from_edge(False, True)
    bottom_in = inset_from_edge(False, False)

    lr_total = left_in + right_in
    tb_total = top_in + bottom_in
    if lr_total < 0.05:
        lr_left, lr_right = 50.0, 50.0
    else:
        lr_left = round(left_in / lr_total * 100, 1)
        lr_right = round(right_in / lr_total * 100, 1)

    if tb_total < 0.05:
        tb_top, tb_bottom = 50.0, 50.0
    else:
        tb_top = round(top_in / tb_total * 100, 1)
        tb_bottom = round(bottom_in / tb_total * 100, 1)

    # Holo/gold cards often trigger false single-edge peaks — clamp extremes
    if max(lr_left, lr_right) > 82 or max(tb_top, tb_bottom) > 82:
        return default

    return {
        "leftRight": f"{lr_left}/{lr_right}",
        "topBottom": f"{tb_top}/{tb_bottom}",
        "leftPercent": lr_left,
        "rightPercent": lr_right,
        "topPercent": tb_top,
        "bottomPercent": tb_bottom,
    }


def _centering_score(ratios: dict[str, float]) -> float:
    """PSA-style: 50/50 is best; deviation reduces score."""
    deviations = [
        abs(ratios["leftPercent"] - 50),
        abs(ratios["topPercent"] - 50),
    ]
    worst = max(deviations)
    if worst <= 5:
        return 10.0
    if worst <= 10:
        return 9.0
    if worst <= 15:
        return 8.0
    if worst <= 20:
        return 7.0
    if worst <= 25:
        return 6.0
    if worst <= 30:
        return 5.0
    if worst <= 35:
        return 4.0
    return max(1.0, 10 - worst / 5)


def _whitening_ratio(region: np.ndarray) -> float:
    if region.size == 0:
        return 0.0
    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    # Low saturation + high value ≈ white/chipped edge
    mask = (hsv[:, :, 1] < 40) & (hsv[:, :, 2] > 200)
    return float(mask.mean())


def _edge_score(card: np.ndarray) -> tuple[float, float]:
    h, w = card.shape[:2]
    t = max(3, int(h * 0.03))
    strip_w = max(3, int(w * 0.03))
    strips = [
        card[0:t, :],
        card[h - t : h, :],
        card[:, 0:strip_w],
        card[:, w - strip_w : w],
    ]
    ratios = [_whitening_ratio(s) for s in strips]
    avg = float(np.mean(ratios))
    score = max(1.0, 10.0 - avg * 35)
    return round(score, 1), avg


def _corner_score(card: np.ndarray) -> tuple[float, float]:
    h, w = card.shape[:2]
    cs = max(8, int(min(h, w) * 0.08))
    corners = [
        card[0:cs, 0:cs],
        card[0:cs, w - cs : w],
        card[h - cs : h, 0:cs],
        card[h - cs : h, w - cs : w],
    ]
    ratios = [_whitening_ratio(c) for c in corners]
    avg = float(np.mean(ratios))
    score = max(1.0, 10.0 - avg * 45)
    return round(score, 1), avg


def _surface_score(card: np.ndarray) -> tuple[float, float]:
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    m = int(min(h, w) * 0.12)
    center = gray[m : h - m, m : w - m]
    lap = cv2.Laplacian(center, cv2.CV_64F)
    var = float(lap.var())
    # High variance can mean scratches/texture damage on holos
    if var > 800:
        score = max(4.0, 10 - (var - 800) / 400)
    elif var < 80:
        score = 7.5
    else:
        score = 9.0
    return round(score, 1), var


def grade_image(data: bytes, side: str) -> dict[str, Any]:
    img = load_image_bytes(data)
    if img is None:
        raise ValueError(f"Could not decode {side} image")

    card, detected = extract_card(img)
    ratios = _border_ratios(card)
    centering = _centering_score(ratios)
    corners, corner_wear = _corner_score(card)
    edges, edge_wear = _edge_score(card)
    surface, surface_var = _surface_score(card)

    return {
        "side": side,
        "cardDetected": detected,
        "centering": {
            "score": round(centering, 1),
            "ratios": ratios,
        },
        "corners": {"score": corners, "whiteningRatio": round(corner_wear, 3)},
        "edges": {"score": edges, "whiteningRatio": round(edge_wear, 3)},
        "surface": {"score": surface, "laplacianVariance": round(surface_var, 1)},
    }


def combine_sides(front: dict[str, Any], back: dict[str, Any]) -> dict[str, Any]:
    fc = front["centering"]["score"]
    bc = back["centering"]["score"]
    centering = round((fc + bc) / 2, 1)

    corners = round((front["corners"]["score"] + back["corners"]["score"]) / 2, 1)
    edges = round((front["edges"]["score"] + back["edges"]["score"]) / 2, 1)
    surface = round((front["surface"]["score"] + back["surface"]["score"]) / 2, 1)

    # PSA-style weighting: centering caps grade
    composite = corners * 0.3 + edges * 0.3 + surface * 0.4
    centering_cap = 10.0
    if centering < 7:
        centering_cap = 8.0
    elif centering < 8:
        centering_cap = 9.0
    elif centering < 9:
        centering_cap = 9.5

    final = round(min(composite, centering_cap), 1)
    psa_estimate = str(int(final)) if final >= 9.5 else str(final)

    return {
        "centering": centering,
        "corners": corners,
        "edges": edges,
        "surface": surface,
        "compositeScore": round(composite, 1),
        "centeringCap": centering_cap,
        "estimatedGrade": psa_estimate,
        "gradeRange": f"{max(1, int(final - 1))}-{min(10, int(final + 1))}",
        "front": front,
        "back": back,
        "disclaimer": "OpenCV pre-grade estimate — not a professional certification.",
    }
