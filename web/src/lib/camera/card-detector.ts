import { OVERLAY_ASPECT, OVERLAY_HEIGHT_PCT, type CaptureMode, type OverlayRect } from "./frame-analysis";

/**
 * Compute the exact rectangle in source video coordinates (`video.videoWidth` x `video.videoHeight`)
 * that corresponds to the centered guide box inside a CSS `object-cover` container
 * of dimensions (`containerWidth` x `containerHeight`).
 *
 * Without this, a 16:9 or 4:3 camera stream displayed in a portrait mobile container
 * with `object-cover` has its sides cropped by CSS, causing naive `videoWidth`-based
 * overlay math to sample the wrong aspect ratio and wrong region of the card!
 */
export function visibleGuideRectInVideo(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  mode: CaptureMode = "raw",
): OverlayRect {
  const cw = containerWidth > 0 ? containerWidth : videoWidth;
  const ch = containerHeight > 0 ? containerHeight : videoHeight;

  const scale = Math.max(cw / videoWidth, ch / videoHeight);
  const dispW = videoWidth * scale;
  const dispH = videoHeight * scale;
  const offsetX = (dispW - cw) / 2;
  const offsetY = (dispH - ch) / 2;

  const aspect = OVERLAY_ASPECT[mode];
  let guideH = ch * OVERLAY_HEIGHT_PCT[mode];
  let guideW = guideH * aspect;
  if (guideW > cw * 0.85) {
    guideW = cw * 0.85;
    guideH = guideW / aspect;
  }

  const guideXInContainer = (cw - guideW) / 2;
  const guideYInContainer = (ch - guideH) / 2;

  const x = Math.max(0, (guideXInContainer + offsetX) / scale);
  const y = Math.max(0, (guideYInContainer + offsetY) / scale);
  const width = Math.min(videoWidth - x, guideW / scale);
  const height = Math.min(videoHeight - y, guideH / scale);

  return { x, y, width, height };
}

export interface CardPresenceMetrics {
  sharpness: number;
  edgeDensity: number;
  motion: number;
  hasCard: boolean;
  isStableAndSharp: boolean;
  /** Tight bounding box of strong card edges inside the normalized scan buffer [0..1] */
  detectedBounds: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    confidence: number;
  };
}

/**
 * Fast analysis on a small (`120x168`) grayscale buffer of the guide area:
 * 1. Measures Laplacian sharpness (rejects blurry / out-of-focus frames)
 * 2. Measures frame-to-frame motion (rejects frames while the hand is moving the card)
 * 3. Locates the outer card border transitions (top/bottom/left/right) so if the card
 *    is held slightly smaller or offset inside the guide box, we can align to the card's
 *    true edges before cropping the artwork box.
 */
export function analyzeCardFrame(
  gray: Uint8Array,
  width: number,
  height: number,
  prevGray: Uint8Array | null,
): CardPresenceMetrics {
  let motionSum = 0;
  if (prevGray && prevGray.length === gray.length) {
    for (let i = 0; i < gray.length; i++) {
      motionSum += Math.abs((gray[i] ?? 0) - (prevGray[i] ?? 0));
    }
  }
  const motion = prevGray && prevGray.length === gray.length ? motionSum / gray.length : 999;

  // Compute Laplacian variance (sharpness) and directional gradients in the interior
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  let strongEdges = 0;

  const colEdgeProfile = new Float32Array(width);
  const rowEdgeProfile = new Float32Array(height);

  for (let y = 2; y < height - 2; y++) {
    const row = y * width;
    for (let x = 2; x < width - 2; x++) {
      const idx = row + x;
      const c = gray[idx] ?? 0;
      const l = gray[idx - 1] ?? 0;
      const r = gray[idx + 1] ?? 0;
      const u = gray[idx - width] ?? 0;
      const d = gray[idx + width] ?? 0;

      const gx = Math.abs(r - l);
      const gy = Math.abs(d - u);
      const grad = gx + gy;

      if (grad > 28) {
        strongEdges += 1;
      }

      colEdgeProfile[x] += gx;
      rowEdgeProfile[y] += gy;

      // Focus sharpness on the upper-middle region (title + art + type line)
      if (x > width * 0.12 && x < width * 0.88 && y > height * 0.08 && y < height * 0.88) {
        const lap = -4 * c + l + r + u + d;
        lapSum += lap;
        lapSqSum += lap * lap;
        lapCount += 1;
      }
    }
  }

  const meanLap = lapCount > 0 ? lapSum / lapCount : 0;
  const sharpness = lapCount > 0 ? lapSqSum / lapCount - meanLap * meanLap : 0;
  const edgeDensity = strongEdges / (width * height);

  // Detect outer card borders in the outer 22% bands of each side
  let bestLeftX = 0;
  let maxLeftVal = 0;
  const leftSearchMax = Math.floor(width * 0.22);
  for (let x = 2; x <= leftSearchMax; x++) {
    if ((colEdgeProfile[x] ?? 0) > maxLeftVal) {
      maxLeftVal = colEdgeProfile[x] ?? 0;
      bestLeftX = x;
    }
  }

  let bestRightX = width - 1;
  let maxRightVal = 0;
  const rightSearchMin = Math.ceil(width * 0.78);
  for (let x = rightSearchMin; x < width - 2; x++) {
    if ((colEdgeProfile[x] ?? 0) > maxRightVal) {
      maxRightVal = colEdgeProfile[x] ?? 0;
      bestRightX = x;
    }
  }

  let bestTopY = 0;
  let maxTopVal = 0;
  const topSearchMax = Math.floor(height * 0.22);
  for (let y = 2; y <= topSearchMax; y++) {
    if ((rowEdgeProfile[y] ?? 0) > maxTopVal) {
      maxTopVal = rowEdgeProfile[y] ?? 0;
      bestTopY = y;
    }
  }

  let bestBottomY = height - 1;
  let maxBottomVal = 0;
  const bottomSearchMin = Math.ceil(height * 0.78);
  for (let y = bottomSearchMin; y < height - 2; y++) {
    if ((rowEdgeProfile[y] ?? 0) > maxBottomVal) {
      maxBottomVal = rowEdgeProfile[y] ?? 0;
      bestBottomY = y;
    }
  }

  const avgColEdge = colEdgeProfile.reduce((a, b) => a + b, 0) / width;
  const avgRowEdge = rowEdgeProfile.reduce((a, b) => a + b, 0) / height;

  const hasStrongBorders =
    maxLeftVal > avgColEdge * 1.35 &&
    maxRightVal > avgColEdge * 1.35 &&
    maxTopVal > avgRowEdge * 1.35 &&
    maxBottomVal > avgRowEdge * 1.35;

  const x0 = hasStrongBorders ? bestLeftX / width : 0;
  const x1 = hasStrongBorders ? bestRightX / width : 1;
  const y0 = hasStrongBorders ? bestTopY / height : 0;
  const y1 = hasStrongBorders ? bestBottomY / height : 1;

  const hasCard = edgeDensity >= 0.045 && sharpness >= 28;
  const isStableAndSharp = hasCard && motion <= 8.5 && sharpness >= 40;

  return {
    sharpness,
    edgeDensity,
    motion,
    hasCard,
    isStableAndSharp,
    detectedBounds: {
      x0,
      y0,
      x1,
      y1,
      confidence: hasStrongBorders ? 0.9 : 0.4,
    },
  };
}
