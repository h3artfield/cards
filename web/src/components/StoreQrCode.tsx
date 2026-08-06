"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/Button";
import { getConfiguredAppUrl, qrCodeWarningForBase } from "@/lib/app-url";
import {
  buildStoreEntryUrl,
  slugifyStoreName,
  storeEntryPath,
} from "@/lib/store-slug";

type TunnelInfo = {
  baseUrl: string;
  reachable: boolean;
  source: string;
  configuredUrl: string;
};

/** On-screen preview size (CSS pixels). */
const DISPLAY_PX = 320;
/** PNG export size — suitable for print (~4″ at 300 DPI). */
const DOWNLOAD_PX = 2048;

const QR_OPTIONS = {
  margin: 2,
  errorCorrectionLevel: "H" as const,
  color: { dark: "#1e1b4b", light: "#ffffff" },
};

export function StoreQrCode({
  storeSlug,
  storeName,
}: {
  storeSlug: string;
  storeName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [customerUrl, setCustomerUrl] = useState<string | null>(null);
  const [downloadDataUrl, setDownloadDataUrl] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [tunnelInfo, setTunnelInfo] = useState<TunnelInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/tunnel-url");
        const data = await res.json();
        if (cancelled) return;

        const info: TunnelInfo = {
          baseUrl: data.baseUrl ?? getConfiguredAppUrl(),
          reachable: Boolean(data.reachable),
          source: data.source ?? "env",
          configuredUrl: data.configuredUrl ?? getConfiguredAppUrl(),
        };
        setTunnelInfo(info);

        const effectiveBase =
          info.baseUrl.includes("trycloudflare.com") && !info.reachable
            ? info.configuredUrl
            : info.baseUrl;
        const url = buildStoreEntryUrl(storeSlug, effectiveBase);
        setCustomerUrl(url);

        if (
          info.baseUrl.includes("trycloudflare.com") &&
          !info.reachable &&
          effectiveBase !== info.baseUrl
        ) {
          setWarning(
            `Dev tunnel offline — QR uses your public URL: ${effectiveBase}`,
          );
        } else if (info.baseUrl.includes("trycloudflare.com") && !info.reachable) {
          setWarning(
            "Cloudflare tunnel is offline. Set NEXT_PUBLIC_APP_URL to your staging URL in .env.local, or run npm run dev:tunnel for local phone testing.",
          );
        } else if (data.tunnelWasStale) {
          setWarning(`Stale dev tunnel removed. QR now uses ${info.baseUrl}.`);
        } else {
          setWarning(qrCodeWarningForBase(info.baseUrl));
        }
      } catch {
        if (cancelled) return;
        const base = getConfiguredAppUrl();
        setCustomerUrl(buildStoreEntryUrl(storeSlug, base));
        setWarning(qrCodeWarningForBase(base));
      }
    }

    void load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [storeSlug]);

  useEffect(() => {
    if (!customerUrl) return;
    const url = customerUrl;
    let cancelled = false;

    async function render() {
      const canvas = canvasRef.current;
      if (canvas) {
        await QRCode.toCanvas(canvas, url, {
          ...QR_OPTIONS,
          width: DISPLAY_PX,
        }).catch(() => {
          /* canvas unavailable */
        });
      }
      const dataUrl = await QRCode.toDataURL(url, {
        ...QR_OPTIONS,
        width: DOWNLOAD_PX,
        margin: 4,
      }).catch(() => null);
      if (!cancelled && dataUrl) {
        setDownloadDataUrl(dataUrl);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [customerUrl]);

  async function copyLink() {
    if (!customerUrl) return;
    try {
      await navigator.clipboard.writeText(customerUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function downloadQr() {
    if (!customerUrl) return;
    setDownloading(true);
    try {
      let dataUrl = downloadDataUrl;
      if (!dataUrl) {
        dataUrl = await QRCode.toDataURL(customerUrl, {
          ...QR_OPTIONS,
          width: DOWNLOAD_PX,
          margin: 4,
        });
      }
      const fileBase = slugifyStoreName(storeName || storeSlug);
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${fileBase}-customer-qr.png`;
      anchor.click();
    } catch {
      /* ignore */
    } finally {
      setDownloading(false);
    }
  }

  const statusLabel =
    tunnelInfo?.baseUrl.includes("trycloudflare.com") && tunnelInfo.reachable
      ? "Tunnel online"
      : tunnelInfo?.baseUrl.includes("trycloudflare.com")
        ? "Tunnel offline"
        : null;

  const customerPath = storeEntryPath(storeSlug);

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Customer QR code</h3>
      <p className="mt-1 text-xs text-gray-600">
        Print and display at your counter. Customers scan to open{" "}
        <strong>{storeName}</strong> and sign in to start a buyback.
      </p>

      {statusLabel && (
        <p
          className={`mt-2 text-xs font-medium ${
            tunnelInfo?.reachable ? "text-green-700" : "text-red-700"
          }`}
        >
          {statusLabel}
        </p>
      )}

      {warning && (
        <div
          className={`mt-3 rounded-lg border p-3 text-xs ${
            tunnelInfo?.reachable === false &&
            tunnelInfo.baseUrl.includes("trycloudflare.com")
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {warning}
        </div>
      )}

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {customerUrl ? (
          <a
            href={customerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group shrink-0 rounded-xl ring-1 ring-gray-200 transition hover:ring-2 hover:ring-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label={`Open customer page for ${storeName}`}
          >
            <canvas
              ref={canvasRef}
              width={DISPLAY_PX}
              height={DISPLAY_PX}
              className="block max-w-full rounded-xl"
              style={{ width: DISPLAY_PX, height: DISPLAY_PX }}
            />
            <span className="mt-2 block text-center text-[10px] font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              Tap to open store page
            </span>
          </a>
        ) : (
          <canvas
            ref={canvasRef}
            width={DISPLAY_PX}
            height={DISPLAY_PX}
            className="shrink-0 rounded-xl ring-1 ring-gray-200"
            style={{ width: DISPLAY_PX, height: DISPLAY_PX }}
            aria-label={`QR code for ${storeName} buyback`}
          />
        )}

        <div className="min-w-0 flex-1 text-xs">
          <p className="font-medium text-gray-700">Customer store link</p>
          <p className="mt-1 break-all text-gray-600">
            {customerUrl ?? `…${customerPath}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={copyLink}
              disabled={!customerUrl}
              className="!py-2 !text-xs"
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void downloadQr()}
              disabled={!customerUrl || downloading}
              className="!py-2 !text-xs"
            >
              {downloading ? "Preparing…" : "Download PNG"}
            </Button>
            {customerUrl && (
              <a
                href={customerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
              >
                Test link
              </a>
            )}
          </div>
          <p className="mt-3 text-[10px] text-gray-500">
            Download is {DOWNLOAD_PX}×{DOWNLOAD_PX}px — print-ready. Live URL:{" "}
            <span className="font-mono">{tunnelInfo?.baseUrl ?? "…"}</span>
            {tunnelInfo?.source === "tunnel-file" && " (from active tunnel)"}
          </p>
        </div>
      </div>
    </div>
  );
}
