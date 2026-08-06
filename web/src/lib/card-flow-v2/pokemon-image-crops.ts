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

/** Attack / effect text box below artwork — primary pattern region. */
export async function cropPokemonTextBox(imageUrl: string): Promise<VariantCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) {
    return { dataUrl: null, region: "text_box", quality: "blocked" };
  }

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 80 || h < 80) {
      return { dataUrl: null, region: "text_box", quality: "poor" };
    }

    const left = Math.floor(w * 0.07);
    const top = Math.floor(h * 0.52);
    const width = Math.max(40, Math.floor(w * 0.86));
    const height = Math.max(28, Math.floor(h * 0.22));

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
      region: "text_box",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "text_box", quality: "blocked" };
  }
}

/** Left/right border strips — SV reverse patterns often strongest here. */
export async function cropPokemonBorderFrame(imageUrl: string): Promise<VariantCropResult> {
  const buffer = await loadImageBuffer(imageUrl);
  if (!buffer) {
    return { dataUrl: null, region: "border_frame", quality: "blocked" };
  }

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 80 || h < 80) {
      return { dataUrl: null, region: "border_frame", quality: "poor" };
    }

    const top = Math.floor(h * 0.48);
    const height = Math.max(36, Math.floor(h * 0.38));
    const stripW = Math.max(24, Math.floor(w * 0.12));

    const leftStrip = await sharp(buffer)
      .extract({
        left: 0,
        top: Math.min(top, h - height),
        width: Math.min(stripW, w),
        height: Math.min(height, h - Math.min(top, h - height)),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      dataUrl: toDataUrl(leftStrip),
      region: "border_frame",
      quality: w >= 400 ? "clear" : "usable",
    };
  } catch {
    return { dataUrl: null, region: "border_frame", quality: "blocked" };
  }
}

export async function cropPokemonReversePatternRegions(
  imageUrl: string,
): Promise<VariantCropResult[]> {
  const [textBox, border] = await Promise.all([
    cropPokemonTextBox(imageUrl),
    cropPokemonBorderFrame(imageUrl),
  ]);
  return [textBox, border];
}
