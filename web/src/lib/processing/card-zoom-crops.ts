import sharp from "sharp";

function parseDataUrlBuffer(imageUrl: string): Buffer | null {
  const match = imageUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match?.[1]) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

async function resolveImageBuffer(imageUrl: string): Promise<Buffer | null> {
  const inline = parseDataUrlBuffer(imageUrl);
  if (inline) return inline;
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Generates a high-resolution composite strip containing:
 * 1. Top Title Bar (top 16% of card, upscaled 2x)
 * 2. Bottom Collector / Set Symbol / Set Code Strip (bottom 16% of card, upscaled 2x)
 *
 * Feeding this alongside the full card image makes 4pt collector numbers and 3-letter
 * set codes 2x–3x larger and crystal-clear to frontier vision models.
 */
export async function buildCardHeaderFooterZoomDataUrl(
  imageUrl: string,
): Promise<string | null> {
  const buffer = await resolveImageBuffer(imageUrl);
  if (!buffer) return null;

  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 100 || h < 140) return null;

    const targetW = Math.min(960, Math.max(560, w * 2));
    const stripSourceH = Math.max(24, Math.floor(h * 0.16));
    const stripTargetH = Math.round((stripSourceH / w) * targetW);

    const [topStrip, bottomStrip] = await Promise.all([
      sharp(buffer)
        .extract({ left: 0, top: 0, width: w, height: stripSourceH })
        .resize(targetW, stripTargetH, { kernel: "lanczos3", fit: "fill" })
        .sharpen()
        .toBuffer(),
      sharp(buffer)
        .extract({
          left: 0,
          top: Math.max(0, h - stripSourceH),
          width: w,
          height: stripSourceH,
        })
        .resize(targetW, stripTargetH, { kernel: "lanczos3", fit: "fill" })
        .sharpen()
        .toBuffer(),
    ]);

    const dividerH = 6;
    const composite = await sharp({
      create: {
        width: targetW,
        height: stripTargetH * 2 + dividerH,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .composite([
        { input: topStrip, top: 0, left: 0 },
        { input: bottomStrip, top: stripTargetH + dividerH, left: 0 },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    return `data:image/jpeg;base64,${composite.toString("base64")}`;
  } catch {
    return null;
  }
}
