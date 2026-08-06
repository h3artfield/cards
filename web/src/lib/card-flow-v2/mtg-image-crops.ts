import sharp from "sharp";

import type { VariantCropResult } from "./variant-inspection-utils";

export type MtgListCropResult = VariantCropResult;

async function loadImageBuffer(imageUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function toDataUrl(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

/** Bottom-left margin — fork / Planeswalker List symbol. */
export async function cropMtgBottomLeftMargin(
  imageUrl: string,
): Promise<MtgListCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) {
    return { dataUrl: null, region: "bottom_left_margin", quality: "blocked" };
  }

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 80 || h < 80) {
      return { dataUrl: null, region: "bottom_left_margin", quality: "poor" };
    }

    const left = 0;
    const top = Math.floor(h * 0.8);
    const width = Math.max(40, Math.floor(w * 0.42));
    const height = Math.max(24, Math.floor(h * 0.18));

    const cropped = await sharp(buffer)
      .extract({
        left,
        top: Math.min(top, h - height),
        width: Math.min(width, w),
        height: Math.min(height, h - Math.min(top, h - height)),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(cropped),
      region: "bottom_left_margin",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "bottom_left_margin", quality: "blocked" };
  }
}

/** Full bottom strip — collector number and set code line. */
export async function cropMtgBottomCollectorStrip(
  imageUrl: string,
): Promise<MtgListCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) {
    return { dataUrl: null, region: "bottom_collector_strip", quality: "blocked" };
  }

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 80 || h < 80) {
      return { dataUrl: null, region: "bottom_collector_strip", quality: "poor" };
    }

    const top = Math.floor(h * 0.84);
    const height = Math.max(20, Math.floor(h * 0.14));

    const cropped = await sharp(buffer)
      .extract({
        left: 0,
        top: Math.min(top, h - height),
        width: w,
        height: Math.min(height, h - Math.min(top, h - height)),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(cropped),
      region: "bottom_collector_strip",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "bottom_collector_strip", quality: "blocked" };
  }
}

export async function cropMtgListInspectionRegions(
  imageUrl: string,
): Promise<MtgListCropResult[]> {
  const [left, strip] = await Promise.all([
    cropMtgBottomLeftMargin(imageUrl),
    cropMtgBottomCollectorStrip(imageUrl),
  ]);
  return [left, strip];
}

/** Artwork window — prismatic foil wash usually visible here on foils. */
export async function cropMtgArtWindow(imageUrl: string): Promise<MtgListCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) {
    return { dataUrl: null, region: "art_window", quality: "blocked" };
  }

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 80 || h < 80) {
      return { dataUrl: null, region: "art_window", quality: "poor" };
    }

    const left = Math.floor(w * 0.08);
    const top = Math.floor(h * 0.12);
    const width = Math.max(40, Math.floor(w * 0.84));
    const height = Math.max(40, Math.floor(h * 0.42));

    const cropped = await sharp(buffer)
      .extract({
        left,
        top,
        width: Math.min(width, w - left),
        height: Math.min(height, h - top),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(cropped),
      region: "art_window",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "art_window", quality: "blocked" };
  }
}

/** Frame border strip below art — foil often shows spectrum here on full-card foils. */
export async function cropMtgFrameBorderStrip(
  imageUrl: string,
): Promise<MtgListCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) {
    return { dataUrl: null, region: "frame_border_strip", quality: "blocked" };
  }

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 80 || h < 80) {
      return { dataUrl: null, region: "frame_border_strip", quality: "poor" };
    }

    const top = Math.floor(h * 0.52);
    const height = Math.max(28, Math.floor(h * 0.14));
    const left = Math.floor(w * 0.05);
    const width = Math.max(40, Math.floor(w * 0.9));

    const cropped = await sharp(buffer)
      .extract({
        left,
        top: Math.min(top, h - height),
        width: Math.min(width, w - left),
        height: Math.min(height, h - Math.min(top, h - height)),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(cropped),
      region: "frame_border_strip",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "frame_border_strip", quality: "blocked" };
  }
}

/** Bottom-center security stamp — localized shine on nonfoil rares. */
export async function cropMtgSecurityStamp(imageUrl: string): Promise<MtgListCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) {
    return { dataUrl: null, region: "security_stamp", quality: "blocked" };
  }

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 80 || h < 80) {
      return { dataUrl: null, region: "security_stamp", quality: "poor" };
    }

    const stampW = Math.max(36, Math.floor(w * 0.22));
    const stampH = Math.max(20, Math.floor(h * 0.08));
    const left = Math.floor((w - stampW) / 2);
    const top = Math.floor(h * 0.86);

    const cropped = await sharp(buffer)
      .extract({
        left: Math.max(0, left),
        top: Math.min(top, h - stampH),
        width: Math.min(stampW, w),
        height: Math.min(stampH, h - Math.min(top, h - stampH)),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(cropped),
      region: "security_stamp",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "security_stamp", quality: "blocked" };
  }
}

export async function cropMtgFoilInspectionRegions(
  imageUrl: string,
): Promise<MtgListCropResult[]> {
  const [art, frame, stamp] = await Promise.all([
    cropMtgArtWindow(imageUrl),
    cropMtgFrameBorderStrip(imageUrl),
    cropMtgSecurityStamp(imageUrl),
  ]);
  return [art, frame, stamp];
}

/** Left edge — borderless art bleeds to card edge with no black border. */
export async function cropMtgLeftEdgeStrip(
  imageUrl: string,
): Promise<MtgListCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) {
    return { dataUrl: null, region: "left_edge", quality: "blocked" };
  }

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 80 || h < 80) {
      return { dataUrl: null, region: "left_edge", quality: "poor" };
    }

    const width = Math.max(16, Math.floor(w * 0.08));
    const top = Math.floor(h * 0.1);
    const height = Math.max(40, Math.floor(h * 0.75));

    const cropped = await sharp(buffer)
      .extract({
        left: 0,
        top,
        width: Math.min(width, w),
        height: Math.min(height, h - top),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(cropped),
      region: "left_edge",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "left_edge", quality: "blocked" };
  }
}

export async function cropMtgFrameInspectionRegions(
  imageUrl: string,
): Promise<MtgListCropResult[]> {
  const [art, leftEdge, frame] = await Promise.all([
    cropMtgArtWindow(imageUrl),
    cropMtgLeftEdgeStrip(imageUrl),
    cropMtgFrameBorderStrip(imageUrl),
  ]);
  return [art, leftEdge, frame];
}
