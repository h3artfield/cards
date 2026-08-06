import { LOGO_INLINE_MAX_BYTES } from "./logo-limits";

/** Resize a logo for storage — keeps PNG when the source has transparency. */
export async function compressLogoDataUrl(dataUrl: string): Promise<string> {
  if (dataUrl.length <= LOGO_INLINE_MAX_BYTES) return dataUrl;

  const img = await loadImage(dataUrl);
  const hasAlpha = dataUrl.startsWith("data:image/png");

  for (let dim = 512; dim >= 128; dim = Math.round(dim * 0.85)) {
    const scale = Math.min(1, dim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(img, 0, 0, width, height);

    if (hasAlpha) {
      const png = canvas.toDataURL("image/png");
      if (png.length <= LOGO_INLINE_MAX_BYTES) return png;
    }

    for (const quality of [0.92, 0.85, 0.78, 0.7, 0.62]) {
      const jpeg = canvas.toDataURL("image/jpeg", quality);
      if (jpeg.length <= LOGO_INLINE_MAX_BYTES) return jpeg;
    }
  }

  throw new Error("Logo file is too large. Use a smaller image (under 2 MB).");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load logo image"));
    img.src = src;
  });
}
