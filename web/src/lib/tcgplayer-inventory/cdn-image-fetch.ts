/** URLs to try when pulling product art from TCGplayer CDN (server-side only). */
export function tcgplayerCdnImageCandidates(
  productId: string,
  existingUrl?: string,
): string[] {
  const id = productId.trim();
  const candidates = new Set<string>();

  if (existingUrl?.includes("tcgplayer-cdn.tcgplayer.com")) {
    candidates.add(existingUrl.trim());
    candidates.add(
      existingUrl.replace("_in_1000x1000.jpg", "_200w.jpg"),
    );
    candidates.add(
      existingUrl.replace("_200w.jpg", "_in_1000x1000.jpg"),
    );
  }

  candidates.add(`https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`);
  candidates.add(
    `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_1000x1000.jpg`,
  );
  candidates.add(`https://product-images.tcgplayer.com/fit-in/437x437/${id}.jpg`);
  candidates.add(`https://product-images.tcgplayer.com/fit-in/200x200/${id}.jpg`);

  return [...candidates].filter(Boolean);
}

export async function fetchTcgplayerCdnImage(
  productId: string,
  existingUrl?: string,
): Promise<{ buffer: Buffer; contentType: string; sourceUrl: string }> {
  const id = productId.trim();
  const headers = {
    "User-Agent": "CardScanner/1.0.0",
    Referer: `https://www.tcgplayer.com/product/${id}`,
  };

  for (const url of tcgplayerCdnImageCandidates(id, existingUrl)) {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(2_500),
    });
    if (!res.ok) continue;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.includes("image")) continue;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) continue;

    return { buffer, contentType, sourceUrl: url };
  }

  throw new Error(`TCGplayer CDN image unavailable for product ${id}`);
}
