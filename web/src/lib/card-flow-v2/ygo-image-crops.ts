import sharp from "sharp";
import type { VariantCropResult } from "./variant-inspection-utils";

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

/** Under-artwork edition line (1st Edition text). */
export async function cropYgoEditionLine(imageUrl: string): Promise<VariantCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) return { dataUrl: null, region: "edition_line", quality: "blocked" };

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const top = Math.floor(h * 0.58);
    const height = Math.max(20, Math.floor(h * 0.1));
    const left = Math.floor(w * 0.55);
    const width = Math.max(40, Math.floor(w * 0.4));

    const cropped = await sharp(buffer)
      .extract({
        left: Math.min(left, w - 1),
        top: Math.min(top, h - height),
        width: Math.min(width, w - left),
        height: Math.min(height, h - top),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(cropped),
      region: "edition_line",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "edition_line", quality: "blocked" };
  }
}

/** Bottom-right Eye of Anubis holo stamp. */
export async function cropYgoHoloStamp(imageUrl: string): Promise<VariantCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) return { dataUrl: null, region: "holo_stamp", quality: "blocked" };

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const size = Math.max(28, Math.floor(Math.min(w, h) * 0.12));
    const left = w - size - Math.floor(w * 0.04);
    const top = h - size - Math.floor(h * 0.06);

    const cropped = await sharp(buffer)
      .extract({
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: Math.min(size, w),
        height: Math.min(size, h - top),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(cropped),
      region: "holo_stamp",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "holo_stamp", quality: "blocked" };
  }
}

export async function cropYgoEditionInspectionRegions(
  imageUrl: string,
): Promise<VariantCropResult[]> {
  return Promise.all([cropYgoEditionLine(imageUrl), cropYgoHoloStamp(imageUrl)]);
}
