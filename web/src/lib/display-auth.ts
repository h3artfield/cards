/** Client-side session for in-store display TVs (cookie-less / old WebViews). */

export const DISPLAY_TOKEN_STORAGE_KEY = "buyback_display_session";
export const DISPLAY_TOKEN_QUERY_PARAM = "dt";

export function saveDisplayToken(token: string): void {
  try {
    localStorage.setItem(DISPLAY_TOKEN_STORAGE_KEY, token);
  } catch {
    // old WebViews may block storage — URL param still works for this session
  }
}

export function getDisplayToken(): string | null {
  try {
    return localStorage.getItem(DISPLAY_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearDisplayToken(): void {
  try {
    localStorage.removeItem(DISPLAY_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function captureDisplayTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const token = sp.get(DISPLAY_TOKEN_QUERY_PARAM)?.trim();
  if (!token) return null;
  saveDisplayToken(token);
  sp.delete(DISPLAY_TOKEN_QUERY_PARAM);
  const qs = sp.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  window.history.replaceState({}, "", next);
  return token;
}

export function displayAuthHeaders(): HeadersInit {
  const token = getDisplayToken();
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
    "X-Display-Token": token,
  };
}

export function showPathWithDisplayToken(
  showPath: string,
  token: string,
): string {
  return `${showPath}?${DISPLAY_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`;
}
