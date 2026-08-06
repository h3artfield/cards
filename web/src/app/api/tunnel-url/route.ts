import { jsonOk } from "@/lib/api-utils";
import { getConfiguredAppUrl, isLocalhostUrl } from "@/lib/app-url";
import { clearLiveTunnelUrl, readLiveTunnelUrl } from "@/lib/tunnel-url-file";

async function probeTunnel(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/settings`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "buyback-tunnel-health" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isDevTunnelUrl(url: string): boolean {
  return url.includes("trycloudflare.com");
}

/** Customer QR base URL — never a dead dev tunnel when a public URL is configured. */
export async function resolveCustomerBaseUrl(): Promise<{
  baseUrl: string;
  reachable: boolean;
  source: "tunnel-file" | "env" | "env-fallback";
  configuredUrl: string;
  tunnelWasStale: boolean;
}> {
  const configuredUrl = getConfiguredAppUrl();
  const configuredIsPublic =
    !isLocalhostUrl(configuredUrl) && !configuredUrl.startsWith("http://192.168.");
  const allowTunnelFile = process.env.NODE_ENV !== "production";
  const tunnelUrl = allowTunnelFile ? readLiveTunnelUrl() : null;

  let baseUrl = configuredUrl;
  let source: "tunnel-file" | "env" | "env-fallback" = "env";
  let tunnelWasStale = false;

  if (tunnelUrl && isDevTunnelUrl(tunnelUrl)) {
    const tunnelLive = await probeTunnel(tunnelUrl);
    if (tunnelLive && !configuredIsPublic) {
      baseUrl = tunnelUrl;
      source = "tunnel-file";
    } else if (tunnelLive && configuredIsPublic) {
      // Dev tunnel running but prefer stable public URL for printed QR codes.
      baseUrl = configuredUrl;
      source = "env";
    } else {
      clearLiveTunnelUrl();
      tunnelWasStale = true;
      baseUrl = configuredUrl;
      source = "env-fallback";
    }
  }

  let reachable = false;
  if (isDevTunnelUrl(baseUrl)) {
    reachable = await probeTunnel(baseUrl);
  } else if (!isLocalhostUrl(baseUrl)) {
    reachable = true;
  }

  return { baseUrl, reachable, source, configuredUrl, tunnelWasStale };
}

export async function GET() {
  return jsonOk(await resolveCustomerBaseUrl());
}
