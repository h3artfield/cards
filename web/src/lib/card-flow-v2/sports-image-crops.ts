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

/** Upper back corners where Panini prints PRIZM stamp (2013+). */
export async function cropSportsBackPrizmStamp(
  backImageUrl: string,
): Promise<VariantCropResult> {
  const buffer = await loadImageBuffer(backImageUrl);
  if (!buffer) return { dataUrl: null, region: "back_prizm_stamp", quality: "blocked" };

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const width = Math.max(60, Math.floor(w * 0.35));
    const height = Math.max(24, Math.floor(h * 0.12));

    const cropped = await sharp(buffer)
      .extract({
        left: w - width,
        top: 0,
        width: Math.min(width, w),
        height: Math.min(height, h),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(cropped),
      region: "back_prizm_stamp",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "back_prizm_stamp", quality: "blocked" };
  }
}

export async function cropSportsPrizmInspectionRegions(
  backImageUrl: string,
): Promise<VariantCropResult[]> {
  return [await cropSportsBackPrizmStamp(backImageUrl)];
}
