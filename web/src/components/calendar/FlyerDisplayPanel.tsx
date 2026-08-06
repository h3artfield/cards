"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { adminFetch } from "@/lib/api-client";
import {
  buildStoreFlyerDisplayUrl,
  buildStoreFlyerLandscapeDisplayUrl,
  storeFlyerDisplayPath,
  storeFlyerLandscapeDisplayPath,
} from "@/lib/store-slug";
import type { StoreFlyerDisplayItem } from "@/lib/store-calendar/list-store-flyers";
import type { FlyerOrientation } from "@/lib/store-calendar/flyer-orientation";

type Props = {
  storeSlug: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function DisplayUrlBlock({
  title,
  description,
  path,
  fullUrl,
}: {
  title: string;
  description: string;
  path: string;
  fullUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      <p className="mt-1 text-xs text-gray-600">{description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="flex-1 rounded-lg bg-white px-3 py-2 text-xs text-gray-800">
          {fullUrl}
        </code>
        <button
          type="button"
          onClick={() => void copyUrl()}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
        >
          {copied ? "Copied!" : "Copy URL"}
        </button>
        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Open display
        </a>
      </div>
    </div>
  );
}

function flyerDownloadName(
  flyer: StoreFlyerDisplayItem,
  orientation: FlyerOrientation,
): string {
  const slug = flyer.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "flyer";
  const ext = flyer.mediaType === "video" ? "mp4" : "png";
  return `${slug}-${orientation}-flyer.${ext}`;
}

function FlyerGrid({
  title,
  orientation,
  flyers,
  loading,
  uploading,
  emptyMessage,
  aspectClass,
  onUpload,
  onDelete,
}: {
  title: string;
  orientation: FlyerOrientation;
  flyers: StoreFlyerDisplayItem[];
  loading: boolean;
  uploading: boolean;
  emptyMessage: string;
  aspectClass: string;
  onUpload: (file: File) => Promise<void>;
  onDelete: (flyer: StoreFlyerDisplayItem) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Please choose an image (PNG, JPG, WebP) or video (MP4, WebM).");
      return;
    }
    const maxBytes = file.type.startsWith("video/")
      ? 50 * 1024 * 1024
      : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(
        file.type.startsWith("video/")
          ? "Video must be under 50 MB."
          : "Image must be under 10 MB.",
      );
      return;
    }

    setError(null);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleDelete(flyer: StoreFlyerDisplayItem) {
    const label =
      flyer.source === "gallery"
        ? flyer.mediaType === "video"
          ? "custom video"
          : "custom image"
        : "event flyer";
    if (!window.confirm(`Remove this ${label} from the ${orientation} rotation?`)) {
      return;
    }

    setDeletingId(flyer.id);
    setError(null);
    try {
      await onDelete(flyer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove flyer");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDownload(flyer: StoreFlyerDisplayItem) {
    const filename = flyerDownloadName(flyer, orientation);
    try {
      const res = await fetch(flyer.imageUrl);
      if (!res.ok) throw new Error("Could not fetch image");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(flyer.imageUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {loading
              ? "Loading…"
              : `${flyers.length} flyer${flyers.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Add image or video"}
          </button>
        </div>
      </div>
      {error ? (
        <p className="border-b px-4 py-2 text-xs text-red-600">{error}</p>
      ) : null}
      {loading ? (
        <p className="px-4 py-6 text-sm text-gray-500">Loading flyers…</p>
      ) : flyers.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">{emptyMessage}</p>
      ) : (
        <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {flyers.map((flyer) => (
            <li
              key={flyer.id}
              className="overflow-hidden rounded-lg border bg-gray-50"
            >
              <div className="relative">
                {flyer.mediaType === "video" ? (
                  <video
                    src={flyer.imageUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className={`${aspectClass} w-full object-cover object-center`}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={flyer.imageUrl}
                    alt={flyer.title}
                    className={`${aspectClass} w-full object-cover object-top`}
                  />
                )}
                <div className="absolute right-2 top-2 flex flex-col items-stretch gap-1">
                  <button
                    type="button"
                    disabled={deletingId === flyer.id}
                    onClick={() => void handleDelete(flyer)}
                    className="rounded-lg bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-black/90 disabled:opacity-60"
                  >
                    {deletingId === flyer.id ? "Removing…" : "Remove"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownload(flyer)}
                    className="rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-indigo-500"
                  >
                    Download
                  </button>
                </div>
                {flyer.source === "gallery" ? (
                  <span className="absolute left-2 top-2 rounded-lg bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                    {flyer.mediaType === "video" ? "Video" : "Custom"}
                  </span>
                ) : null}
              </div>
              <div className="border-t px-3 py-2">
                <p className="text-sm font-medium text-gray-900">
                  {flyer.title}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                  {flyer.scheduleLabel}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FlyerDisplayPanel({ storeSlug }: Props) {
  const [portraitFlyers, setPortraitFlyers] = useState<StoreFlyerDisplayItem[]>(
    [],
  );
  const [landscapeFlyers, setLandscapeFlyers] = useState<
    StoreFlyerDisplayItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [uploadingOrientation, setUploadingOrientation] =
    useState<FlyerOrientation | null>(null);

  const portraitUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return storeFlyerDisplayPath(storeSlug);
    }
    return buildStoreFlyerDisplayUrl(storeSlug);
  }, [storeSlug]);

  const landscapeUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return storeFlyerLandscapeDisplayPath(storeSlug);
    }
    return buildStoreFlyerLandscapeDisplayUrl(storeSlug);
  }, [storeSlug]);

  const loadOrientation = useCallback(async (orientation: FlyerOrientation) => {
    const params = new URLSearchParams({ orientation });
    const res = await adminFetch(`/api/admin/store-flyers?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) return [];
    return (data.flyers ?? []) as StoreFlyerDisplayItem[];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [portrait, landscape] = await Promise.all([
        loadOrientation("portrait"),
        loadOrientation("landscape"),
      ]);
      setPortraitFlyers(portrait);
      setLandscapeFlyers(landscape);
    } finally {
      setLoading(false);
    }
  }, [loadOrientation]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFlyer(orientation: FlyerOrientation, file: File) {
    setUploadingOrientation(orientation);
    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      const res = await adminFetch("/api/admin/store-flyers/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orientation,
          mediaDataUrl: imageDataUrl,
          title: titleFromFilename(file.name) || "Custom media",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not add image");
      }
      await load();
    } finally {
      setUploadingOrientation(null);
    }
  }

  async function deleteFlyer(flyer: StoreFlyerDisplayItem) {
    const params = new URLSearchParams({
      source: flyer.source,
      orientation: flyer.orientation,
    });
    if (flyer.source === "gallery") {
      params.set("id", flyer.id);
    } else {
      params.set("eventId", flyer.eventId ?? flyer.id);
    }

    const res = await adminFetch(`/api/admin/store-flyers?${params.toString()}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Could not remove flyer");
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">
          In-store digital display
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Open the matching URL on each TV — no login required. Images rotate
          every 10 seconds; videos play through then advance. Content refreshes
          automatically when you add or remove items. Calendar must be published.
        </p>
        <div className="mt-4 space-y-3">
          <DisplayUrlBlock
            title="Portrait display (vertical TV)"
            description="9:16 flyers — use on portrait TVs or rotated screens."
            path={storeFlyerDisplayPath(storeSlug)}
            fullUrl={portraitUrl}
          />
          <DisplayUrlBlock
            title="Landscape display (horizontal TV)"
            description="16:9 flyers — use on standard widescreen TVs."
            path={storeFlyerLandscapeDisplayPath(storeSlug)}
            fullUrl={landscapeUrl}
          />
        </div>
      </div>

      <FlyerGrid
        title="Portrait flyers in rotation"
        orientation="portrait"
        flyers={portraitFlyers}
        loading={loading}
        uploading={uploadingOrientation === "portrait"}
        emptyMessage="No portrait items yet — add an image/video above or create a flyer on an event below."
        aspectClass="aspect-[9/16]"
        onUpload={(file) => uploadFlyer("portrait", file)}
        onDelete={deleteFlyer}
      />

      <FlyerGrid
        title="Landscape flyers in rotation"
        orientation="landscape"
        flyers={landscapeFlyers}
        loading={loading}
        uploading={uploadingOrientation === "landscape"}
        emptyMessage="No landscape items yet — add an image/video above or create a flyer on an event below."
        aspectClass="aspect-video"
        onUpload={(file) => uploadFlyer("landscape", file)}
        onDelete={deleteFlyer}
      />
    </div>
  );
}
