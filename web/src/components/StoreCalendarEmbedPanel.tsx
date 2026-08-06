"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { getConfiguredAppUrl } from "@/lib/app-url";
import {
  buildStoreCalendarEmbedUrl,
  buildStoreCalendarUrl,
  storeCalendarEmbedPath,
  storeCalendarPath,
} from "@/lib/store-slug";

export function StoreCalendarEmbedPanel({
  storeSlug,
  storeName,
  calendarPublished,
  embedEnabled,
}: {
  storeSlug: string;
  storeName: string;
  calendarPublished?: boolean;
  embedEnabled?: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState(getConfiguredAppUrl());
  const [copied, setCopied] = useState<"page" | "embed" | null>(null);

  useEffect(() => {
    fetch("/api/tunnel-url")
      .then((r) => r.json())
      .then((d) => {
        if (d.baseUrl) setBaseUrl(String(d.baseUrl));
      })
      .catch(() => {
        /* use configured URL */
      });
  }, []);

  const pageUrl = buildStoreCalendarUrl(storeSlug, baseUrl);
  const embedUrl = buildStoreCalendarEmbedUrl(storeSlug, baseUrl);
  const iframeSnippet = `<iframe src="${embedUrl}" title="${storeName} event calendar" width="100%" height="900" style="border:0;" loading="lazy"></iframe>`;

  async function copy(text: string, kind: "page" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Event calendar</h3>
          <p className="mt-1 text-xs text-gray-600">
            Publish a month-view calendar for in-store events. Embed it on your
            Shopify site with the iframe snippet below.
          </p>
        </div>
        <Link
          href="/admin/calendar"
          className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          Manage events
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <StatusPill
          label={calendarPublished ? "Published" : "Draft"}
          tone={calendarPublished ? "green" : "amber"}
        />
        <StatusPill
          label={embedEnabled !== false ? "Embed enabled" : "Embed disabled"}
          tone={embedEnabled !== false ? "gray" : "amber"}
        />
      </div>

      <div className="mt-4 space-y-3 text-xs">
        <div>
          <p className="font-medium text-gray-700">Public calendar page</p>
          <p className="mt-1 break-all font-mono text-gray-600">{pageUrl}</p>
          <p className="mt-1 text-[10px] text-gray-500">
            Path: <code>{storeCalendarPath(storeSlug)}</code>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="!py-1.5 !text-xs"
              onClick={() => void copy(pageUrl, "page")}
            >
              {copied === "page" ? "Copied" : "Copy link"}
            </Button>
            <a
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50"
            >
              Preview
            </a>
          </div>
        </div>

        <div>
          <p className="font-medium text-gray-700">Shopify embed code</p>
          <p className="mt-1 text-[10px] text-gray-500">
            In Shopify Admin → Online Store → Pages, add a Custom HTML block and
            paste this iframe. Path:{" "}
            <code>{storeCalendarEmbedPath(storeSlug)}</code>
          </p>
          <textarea
            readOnly
            value={iframeSnippet}
            rows={4}
            className="mt-2 w-full rounded-lg border bg-gray-50 p-2 font-mono text-[10px] text-gray-800"
          />
          <Button
            type="button"
            variant="primary"
            className="mt-2 !py-1.5 !text-xs"
            onClick={() => void copy(iframeSnippet, "embed")}
          >
            {copied === "embed" ? "Copied" : "Copy embed code"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "amber" | "gray";
}) {
  const colors =
    tone === "green"
      ? "bg-green-50 text-green-800 border-green-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-900 border-amber-200"
        : "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-medium ${colors}`}>
      {label}
    </span>
  );
}
