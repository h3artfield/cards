export function isFirebaseStorageUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  return url.includes("firebasestorage.googleapis.com");
}

export function isTcgplayerCdnUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  return url.includes("tcgplayer-cdn.tcgplayer.com");
}
