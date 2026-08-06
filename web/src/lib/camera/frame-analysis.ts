export type CaptureMode = "raw" | "graded";

export type QualityColor = "red" | "yellow" | "green";

/** width / height */
export const OVERLAY_ASPECT: Record<CaptureMode, number> = {
  raw: 2.5 / 3.5,
  graded: 2.5 / 4.25,
};

export const OVERLAY_HEIGHT_PCT: Record<CaptureMode, number> = {
  raw: 0.78,
  graded: 0.88,
};

export const FILL_RATIO = {
  min: 0.55,
  idealMin: 0.75,
  idealMax: 0.92,
  max: 0.98,
};

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function overlayRectInFrame(
  frameW: number,
  frameH: number,
  mode: CaptureMode,
): OverlayRect {
  const aspect = OVERLAY_ASPECT[mode];
  const height = frameH * OVERLAY_HEIGHT_PCT[mode];
  const width = height * aspect;
  return {
    x: (frameW - width) / 2,
    y: (frameH - height) / 2,
    width,
    height,
  };
}

export interface AnalysisScores {
  sharpness: number;
  brightness: number;
  glareRatio: number;
  fillRatio: number;
  edgeScore: number;
  tiltDegrees: number;
  handCoverage: number;
  motion: number;
}

export interface FrameAnalysisResult {
  color: QualityColor;
  messages: string[];
  scores: AnalysisScores;
  qualityPass: boolean;
  alignmentPass: boolean;
}

function toGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    gray[i] =
      0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!;
  }
  return gray;
}

function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        -4 * gray[i]! +
        gray[i - 1]! +
        gray[i + 1]! +
        gray[i - w]! +
        gray[i + w]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function sobelEdges(gray: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1]! -
        2 * gray[i - 1]! -
        gray[i + w - 1]! +
        gray[i - w + 1]! +
        2 * gray[i + 1]! +
        gray[i + w + 1]!;
      const gy =
        -gray[i - w - 1]! -
        2 * gray[i - w]! -
        gray[i - w + 1]! +
        gray[i + w - 1]! +
        2 * gray[i + w]! +
        gray[i + w + 1]!;
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

function meanGray(gray: Float32Array): number {
  let s = 0;
  for (let i = 0; i < gray.length; i++) s += gray[i]!;
  return s / gray.length;
}

function glareRatio(data: Uint8ClampedArray): number {
  let hot = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r > 245 && g > 245 && b > 245) hot++;
  }
  return hot / n;
}

function isSkin(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 15) return false;
  return r > 95 && g > 40 && b > 20 && r > g && r > b;
}

function handCoverageRatio(data: Uint8ClampedArray, w: number, h: number): number {
  const cx0 = Math.floor(w * 0.2);
  const cx1 = Math.floor(w * 0.8);
  const cy0 = Math.floor(h * 0.15);
  const cy1 = Math.floor(h * 0.72);
  let skin = 0;
  let total = 0;
  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      const o = (y * w + x) * 4;
      total++;
      if (isSkin(data[o]!, data[o + 1]!, data[o + 2]!)) skin++;
    }
  }
  return total ? skin / total : 0;
}

function estimateFillAndTilt(
  edges: Float32Array,
  w: number,
  h: number,
): { fillRatio: number; edgeScore: number; tiltDegrees: number } {
  const threshold = 40;
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  let edgeCount = 0;
  const points: { x: number; y: number }[] = [];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const v = edges[y * w + x]!;
      if (v > threshold) {
        edgeCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > w * 0.1 && x < w * 0.9 && y > h * 0.1 && y < h * 0.9) {
          points.push({ x, y });
        }
      }
    }
  }

  const edgeScore = edgeCount / (w * h);
  if (edgeCount < w * h * 0.01 || maxX <= minX || maxY <= minY) {
    return { fillRatio: 0, edgeScore, tiltDegrees: 90 };
  }

  const bw = maxX - minX;
  const bh = maxY - minY;
  const fillRatio = (bw * bh) / (w * h);

  let tiltDegrees = 0;
  if (points.length > 20) {
    let meanX = 0;
    let meanY = 0;
    for (const p of points) {
      meanX += p.x;
      meanY += p.y;
    }
    meanX /= points.length;
    meanY /= points.length;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const p of points) {
      const dx = p.x - meanX;
      const dy = p.y - meanY;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }
    tiltDegrees = Math.abs((Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI / 2);
  }

  return { fillRatio, edgeScore, tiltDegrees };
}

export function analyzeFrameRegion(
  imageData: ImageData,
  mode: CaptureMode,
  options?: { mobile?: boolean },
): FrameAnalysisResult {
  const mobile = options?.mobile ?? false;
  const { width: w, height: h, data } = imageData;
  const gray = toGray(data, w, h);
  const sharpness = laplacianVariance(gray, w, h);
  const brightness = meanGray(gray);
  const glare = glareRatio(data);
  const hand = handCoverageRatio(data, w, h);
  const edges = sobelEdges(gray, w, h);
  const { fillRatio, edgeScore, tiltDegrees } = estimateFillAndTilt(edges, w, h);

  const scores: AnalysisScores = {
    sharpness,
    brightness,
    glareRatio: glare,
    fillRatio,
    edgeScore,
    tiltDegrees,
    handCoverage: hand,
    motion: 0,
  };

  const messages: string[] = [];
  let alignmentPass = true;
  let qualityPass = true;

  const fill = mobile
    ? { min: 0.45, idealMin: 0.6, idealMax: 0.96, max: 0.99 }
    : FILL_RATIO;

  if (fillRatio < fill.min) {
    messages.push("Move card closer");
    alignmentPass = false;
  } else if (fillRatio > fill.max) {
    messages.push("Move card farther away");
    alignmentPass = false;
  } else if (fillRatio < fill.idealMin) {
    messages.push("Move card closer");
    alignmentPass = false;
  } else if (fillRatio > fill.idealMax) {
    messages.push("Move card farther away");
    alignmentPass = false;
  }

  if (edgeScore < (mobile ? 0.01 : 0.018)) {
    messages.push("Card edges not visible");
    alignmentPass = false;
  }

  if (tiltDegrees > (mobile ? 18 : 12)) {
    messages.push("Straighten the card");
    alignmentPass = false;
  }

  if (
    alignmentPass &&
    (fillRatio < FILL_RATIO.idealMin + 0.05 ||
      fillRatio > FILL_RATIO.idealMax - 0.03)
  ) {
    messages.push("Center the card in the rectangle");
  }

  const sharpMin = mobile ? 22 : mode === "raw" ? 45 : 35;
  if (sharpness < sharpMin) {
    messages.push("Image is blurry");
    qualityPass = false;
  }

  if (brightness < 35) {
    messages.push("Too dark — add light");
    qualityPass = false;
  } else if (brightness > 220) {
    messages.push("Too bright — reduce glare");
    qualityPass = false;
  }

  if (glare > (mobile ? 0.1 : 0.06)) {
    messages.push("Too much glare");
    qualityPass = false;
  }

  if (hand > (mobile ? 0.3 : 0.12)) {
    messages.push("Hand is covering the card");
    qualityPass = false;
  }

  let color: QualityColor = "red";
  if (alignmentPass && qualityPass) {
    color = "green";
  } else if (alignmentPass && mobile && sharpness >= sharpMin * 0.7) {
    // Phone cameras often fail glare/sharp checks on holo cards while alignment is fine.
    color = "yellow";
  } else if (alignmentPass || qualityPass) {
    color = "yellow";
  }

  return {
    color,
    messages: messages.length ? messages : ["Align card in outline"],
    scores,
    qualityPass,
    alignmentPass,
  };
}

export function frameMotion(prev: Float32Array | null, gray: Float32Array): number {
  if (!prev || prev.length !== gray.length) return 999;
  let diff = 0;
  for (let i = 0; i < gray.length; i++) {
    diff += Math.abs(gray[i]! - prev[i]!);
  }
  return diff / gray.length;
}

export const STABILITY = {
  motionThreshold: 6,
  motionThresholdMobile: 18,
  stableMs: 1000,
  stableMsMobile: 500,
  warmupMs: 800,
  analysisFps: 8,
};

export function overlayBorderClass(color: QualityColor): string {
  switch (color) {
    case "green":
      return "border-green-400 shadow-[0_0_12px_rgba(74,222,128,0.5)]";
    case "yellow":
      return "border-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.4)]";
    default:
      return "border-red-500";
  }
}

export function overlayHintClass(color: QualityColor): string {
  switch (color) {
    case "green":
      return "bg-green-600/90 text-white";
    case "yellow":
      return "bg-yellow-500/90 text-black";
    default:
      return "bg-red-600/90 text-white";
  }
}

export const CAPTURE_INSTRUCTION =
  "Hold the card flat, fully visible, and close enough to fill the outline. Avoid glare.";

export const LOW_QUALITY_WARNING =
  "This image may be too blurry or glared for accurate pricing. Retake recommended.";

export function captureModeLabel(mode: CaptureMode): string {
  return mode === "graded" ? "Graded Slab" : "Raw Card";
}
