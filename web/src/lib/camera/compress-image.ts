/** Max bytes per inline image so front+back fit in Firestore's 1 MiB document limit. */
export const INLINE_IMAGE_MAX_BYTES = 380_000;

/** Shrink a photo so it fits Firestore when Storage is unavailable. */
export async function compressDataUrlForStorage(
  dataUrl: string,
  options?: { maxBytes?: number; maxDimension?: number },
): Promise<string> {
  const maxBytes = options?.maxBytes ?? INLINE_IMAGE_MAX_BYTES;
  const maxDimension = options?.maxDimension ?? 2048;

  if (dataUrl.length <= maxBytes) return dataUrl;

  const img = await loadImage(dataUrl);

  for (let dim = maxDimension; dim >= 960; dim = Math.round(dim * 0.88)) {
    const scale = Math.min(1, dim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56, 0.48]) {
      const compressed = canvas.toDataURL("image/jpeg", quality);
      if (compressed.length <= maxBytes) return compressed;
    }
  }

  throw new Error(
    "Could not compress photo enough to save. Try again with less glare.",
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Could not load image for compression"));
    img.src = src;
  });
}
