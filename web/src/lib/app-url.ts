export function getConfiguredAppUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function isUnusableOAuthHostname(hostname: string): boolean {
  return (
    !hostname ||
    hostname === "0.0.0.0" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/** Public origin for OAuth redirects — Cloud Run often serves requests as 0.0.0.0:8080 internally. */
export function getPublicRequestOriginFromParts(parts: {
  url: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
}): string {
  const forwardedHost = parts.forwardedHost?.split(",")[0]?.trim();
  const forwardedProto =
    parts.forwardedProto?.split(",")[0]?.trim() || "https";
  if (forwardedHost) {
    const hostname = forwardedHost.split(":")[0] ?? "";
    if (!isUnusableOAuthHostname(hostname)) {
      return `${forwardedProto}://${forwardedHost}`;
    }
  }

  const host = parts.host?.trim();
  if (host) {
    const hostname = host.split(":")[0] ?? "";
    if (!isUnusableOAuthHostname(hostname)) {
      const proto = new URL(parts.url).protocol.replace(":", "") || "https";
      return `${proto}://${host}`;
    }
  }

  const requestOrigin = new URL(parts.url).origin;
  const requestHostname = new URL(parts.url).hostname;
  if (!isUnusableOAuthHostname(requestHostname)) {
    return requestOrigin;
  }

  const configuredRedirect = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configuredRedirect) {
    return new URL(configuredRedirect).origin;
  }

  return getConfiguredAppUrl();
}

export function isLocalhostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return true;
  }
}

/**
 * Base URL for customer-facing links (QR codes, etc.).
 * In the browser, falls back to the current origin when env still points at localhost.
 */
export function resolveAppBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return getConfiguredAppUrl();
}

export function qrCodeWarningForBase(baseUrl: string): string | null {
  if (isLocalhostUrl(baseUrl)) {
    return "This QR uses localhost — phones cannot open it. On your PC, open admin at http://YOUR-PC-IP:3000/admin/settings (find IP with ipconfig), or run npm run dev:tunnel and set NEXT_PUBLIC_APP_URL to the https URL, then restart npm run dev.";
  }
  if (baseUrl.startsWith("http://") && !isLocalhostUrl(baseUrl)) {
    return "Using HTTP on your local network. That works for sign-in, but live camera preview needs HTTPS — use Upload Photo on the scan page, or npm run dev:tunnel.";
  }
  return null;
}
