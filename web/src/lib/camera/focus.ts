export interface NormalizedPoint {
  x: number;
  y: number;
}

type FocusCaps = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step?: number };
  zoom?: { min: number; max: number; step?: number };
};

/** Bottom of the card outline — set name and collector number. */
export const CARD_TEXT_FOCUS_POINTS: NormalizedPoint[] = [
  { x: 0.5, y: 0.85 },
  { x: 0.35, y: 0.88 },
  { x: 0.65, y: 0.88 },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Closest-focus distances to try — max for lens position (0–1), min for meters. */
function closeFocusDistances(caps: FocusCaps): number[] {
  const fd = caps.focusDistance;
  if (!fd || fd.min == null || fd.max == null) return [];

  const { min, max } = fd;
  const values = new Set<number>();

  if (max <= 1.5 && min >= 0) {
    values.add(max);
    if (fd.step) {
      for (let v = max; v >= min; v -= fd.step * 2) {
        values.add(Math.round(v * 1000) / 1000);
      }
    } else {
      values.add(min + (max - min) * 0.85);
      values.add(min + (max - min) * 0.7);
    }
  } else {
    values.add(min);
    values.add(min + (max - min) * 0.05);
    values.add(min + (max - min) * 0.15);
  }

  return [...values].filter((v) => Number.isFinite(v));
}

async function tryApply(
  track: MediaStreamTrack,
  constraints: MediaTrackConstraints,
): Promise<boolean> {
  try {
    await track.applyConstraints(constraints);
    return true;
  } catch {
    return false;
  }
}

function macroZoomConstraint(caps: FocusCaps): MediaTrackConstraints | null {
  const zoom = caps.zoom;
  if (!zoom || zoom.max == null) return null;
  const target = Math.min(zoom.max, Math.max(zoom.min ?? 1, 1.15));
  if (target <= 1) return null;
  return { advanced: [{ zoom: target }] } as unknown as MediaTrackConstraints;
}

export async function focusAtPoints(
  track: MediaStreamTrack,
  points: NormalizedPoint[],
): Promise<boolean> {
  if (!track.getCapabilities?.()) return false;
  const caps = track.getCapabilities() as FocusCaps;
  let applied = false;

  const zoom = macroZoomConstraint(caps);
  if (zoom) {
    applied = (await tryApply(track, zoom)) || applied;
  }

  if (points.length > 0) {
    applied =
      (await tryApply(track, {
        advanced: [{ pointsOfInterest: points, focusMode: "single-shot" }],
      } as MediaTrackConstraints)) || applied;
    await sleep(350);

    applied =
      (await tryApply(track, {
        advanced: [{ pointsOfInterest: [points[0]!], focusMode: "single-shot" }],
      } as MediaTrackConstraints)) || applied;
    await sleep(250);

    applied =
      (await tryApply(track, {
        advanced: [{ pointsOfInterest: points, focusMode: "continuous" }],
      } as MediaTrackConstraints)) || applied;
  }

  if (caps.focusMode?.includes("manual")) {
    for (const distance of closeFocusDistances(caps)) {
      if (
        await tryApply(track, {
          advanced: [{ focusMode: "manual", focusDistance: distance }],
        } as MediaTrackConstraints)
      ) {
        applied = true;
        await sleep(200);
        break;
      }
    }
  }

  if (!applied) {
    applied = await tryApply(track, { focusMode: "continuous" } as MediaTrackConstraints);
  }

  return applied;
}

export async function applyCardTextFocus(
  track: MediaStreamTrack,
): Promise<boolean> {
  return focusAtPoints(track, CARD_TEXT_FOCUS_POINTS);
}

/** Aggressive refocus sequence used right before still capture. */
export async function refocusForCapture(track: MediaStreamTrack): Promise<void> {
  await focusAtPoints(track, CARD_TEXT_FOCUS_POINTS);
  await sleep(500);

  if (typeof ImageCapture !== "undefined") {
    try {
      const ic = new ImageCapture(track);
      const blob = await ic.takePhoto({ imageWidth: 640 });
      if ("close" in blob && typeof blob.close === "function") {
        blob.close();
      }
    } catch {
      // Preflight photo triggers AF on some phones; ignore failures.
    }
    await sleep(400);
  }

  await focusAtPoints(track, [{ x: 0.5, y: 0.86 }]);
  await sleep(350);
}

export async function focusAtTap(
  track: MediaStreamTrack,
  clientX: number,
  clientY: number,
  element: HTMLElement,
): Promise<boolean> {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  const ok = await focusAtPoints(track, [{ x, y }]);
  await sleep(400);
  return ok;
}

export function waitForFocusSettle(ms = 800): Promise<void> {
  return sleep(ms);
}

export function supportsCameraFocus(track: MediaStreamTrack): boolean {
  const caps = track.getCapabilities?.() as FocusCaps | undefined;
  if (!caps) return false;
  return Boolean(
    caps.focusMode?.length ||
      caps.focusDistance ||
      caps.zoom ||
      (caps as { pointsOfInterest?: boolean }).pointsOfInterest,
  );
}
