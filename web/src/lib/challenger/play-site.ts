const HEALTH_TIMEOUT_MS = 3000;

export function challengerPlaySiteUrl(): string | null {
  const raw = process.env.CHALLENGER_PLAY_SITE_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  url.hash = "";
  url.search = "";
  const base = url.toString().replace(/\/$/, "");
  return base || null;
}

export async function playSiteIsReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/healthz`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      headers: { "User-Agent": "CardScanner/1.0" },
      redirect: "manual",
    });
    return res.ok;
  } catch {
    return false;
  }
}
