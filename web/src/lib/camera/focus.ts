export interface NormalizedPoint {
  x: number;
  y: number;
}

type FocusCaps = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step?: number };
  zoom?: { min: number; max: number; step?: number };
};

export const CARD_TEXT_FOCUS_POINTS: NormalizedPoint[] = [
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.85 },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

export function getTrackZoomRange(
  track: MediaStreamTrack | undefined | null,
): { min: number; max: number; step: number; current?: number } | null {
  if (!track?.getCapabilities) return null;
  const caps = track.getCapabilities() as FocusCaps;
  if (!caps?.zoom || caps.zoom.max == null || caps.zoom.max <= 1) return null;
  const settings = (track.getSettings?.() ?? {}) as { zoom?: number };
  return {
    min: caps.zoom.min ?? 1,
    max: caps.zoom.max,
    step: caps.zoom.step ?? 0.1,
    current: settings.zoom,
  };
}

export async function applyTrackZoom(
  track: MediaStreamTrack,
  zoomFactor: number,
): Promise<boolean> {
  const range = getTrackZoomRange(track);
  if (!range) return false;
  const clamped = Math.min(range.max, Math.max(range.min, zoomFactor));
  return tryApply(track, {
    advanced: [{ zoom: clamped }],
  } as unknown as MediaTrackConstraints);
}

/**
 * Enable continuous hardware autofocus (NEVER lock into `manual` focusMode,
 * which breaks close-up focus on Android/Samsung cameras where focusDistance is in diopters).
 */
export async function focusAtPoints(
  track: MediaStreamTrack,
  points: NormalizedPoint[],
): Promise<boolean> {
  if (!track.getCapabilities?.()) return false;
  const caps = track.getCapabilities() as FocusCaps;
  let applied = false;

  if (points.length > 0 && caps.focusMode?.includes("continuous")) {
    applied =
      (await tryApply(track, {
        advanced: [{ pointsOfInterest: points, focusMode: "continuous" }],
      } as unknown as MediaTrackConstraints)) || applied;
  }

  if (!applied && caps.focusMode?.includes("continuous")) {
    applied = await tryApply(track, {
      focusMode: "continuous",
    } as unknown as MediaTrackConstraints);
  }

  if (!applied && caps.focusMode?.includes("single-shot")) {
    applied = await tryApply(track, {
      advanced: [{ pointsOfInterest: points, focusMode: "single-shot" }],
    } as unknown as MediaTrackConstraints);
  }

  return applied;
}

/**
 * Set up continuous autofocus and apply a slight 1.35x optical/sensor crop zoom
 * on mobile cameras so the user can hold the phone ~8-10 inches away (outside the
 * main sensor's minimum focus blind spot) while keeping the card large and razor-sharp.
 */
export async function applyCardTextFocus(
  track: MediaStreamTrack,
): Promise<boolean> {
  const range = getTrackZoomRange(track);
  if (range && (range.current ?? 1) <= 1.05 && range.max >= 1.35) {
    await applyTrackZoom(track, 1.35);
  }
  return focusAtPoints(track, CARD_TEXT_FOCUS_POINTS);
}

export async function refocusForCapture(track: MediaStreamTrack): Promise<void> {
  await focusAtPoints(track, CARD_TEXT_FOCUS_POINTS);
  await sleep(250);
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

  // Trigger a quick single-shot AF pulse at tap point, then return to continuous AF
  await tryApply(track, {
    advanced: [{ pointsOfInterest: [{ x, y }], focusMode: "single-shot" }],
  } as unknown as MediaTrackConstraints);
  await sleep(180);
  const ok = await focusAtPoints(track, [{ x, y }]);
  return ok;
}

export function waitForFocusSettle(ms = 400): Promise<void> {
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
