"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FlyerOrientation } from "@/lib/store-calendar/flyer-orientation";
import type { DisplayGalleryMediaType } from "@/lib/store-calendar/types";

const SLIDE_MS = 10_000;
const REFRESH_MS = 60_000;
const VIDEO_MAX_MS = 180_000;
const ROTATION_STORAGE_KEY = "buyback_flyer_display_rotation";

export type FlyerSlide = {
  id: string;
  title: string;
  imageUrl: string;
  mediaType?: DisplayGalleryMediaType;
  scheduleLabel: string;
  updatedAt: string;
};

type Props = {
  fetchFlyers: () => Promise<{ flyers: FlyerSlide[]; storeName?: string }>;
  onUnauthorized?: () => void;
  orientation?: FlyerOrientation;
};

function readStoredRotation(): number {
  try {
    const raw = localStorage.getItem(ROTATION_STORAGE_KEY);
    const n = raw != null ? Number(raw) : 0;
    return n === 90 || n === 180 || n === 270 ? n : 0;
  } catch {
    return 0;
  }
}

function requestFullscreen(el: HTMLElement): Promise<void> | undefined {
  const legacy = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (el.requestFullscreen) return el.requestFullscreen();
  if (legacy.webkitRequestFullscreen) {
    return Promise.resolve(legacy.webkitRequestFullscreen());
  }
  return undefined;
}

export function FlyerDisplaySlideshow({
  fetchFlyers,
  onUnauthorized,
  orientation = "portrait",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [flyers, setFlyers] = useState<FlyerSlide[]>([]);
  const [index, setIndex] = useState(0);
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fade, setFade] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const advanceSlide = useCallback(() => {
    if (flyers.length <= 1) return;
    setFade(false);
    window.setTimeout(() => {
      setIndex((i) => (i + 1) % flyers.length);
      setFade(true);
    }, 300);
  }, [flyers.length]);

  useEffect(() => {
    setRotation(readStoredRotation());
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchFlyers();
      setFlyers(data.flyers);
      if (data.storeName) setStoreName(data.storeName);
      setError(null);
      setIndex((current) =>
        data.flyers.length === 0
          ? 0
          : Math.min(current, data.flyers.length - 1),
      );
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        onUnauthorized?.();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load flyers");
    } finally {
      setLoading(false);
    }
  }, [fetchFlyers, onUnauthorized]);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(refresh);
  }, [load]);

  const current = flyers[index];
  const isVideo = current?.mediaType === "video";

  useEffect(() => {
    if (flyers.length <= 1 || isVideo) return;

    const timer = window.setInterval(() => {
      advanceSlide();
    }, SLIDE_MS);

    return () => window.clearInterval(timer);
  }, [flyers.length, index, isVideo, advanceSlide]);

  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current;
    if (!video) return;

    void video.play().catch(() => {});

    const maxTimer = window.setTimeout(() => {
      advanceSlide();
    }, VIDEO_MAX_MS);

    return () => window.clearTimeout(maxTimer);
  }, [index, isVideo, current?.id, advanceSlide]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  function rotateImage() {
    setRotation((current) => {
      const next = (current + 90) % 360;
      try {
        localStorage.setItem(ROTATION_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function enterFullscreen() {
    const el = rootRef.current;
    if (!el) return;
    void requestFullscreen(el)?.catch(() => {});
  }

  const isSideways = rotation === 90 || rotation === 270;
  const mediaClass = `object-contain transition-opacity duration-300 ${
    fade ? "opacity-100" : "opacity-0"
  } ${
    isSideways ? "max-h-[100vw] max-w-[100vh]" : "max-h-screen max-w-full"
  }`;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-lg">Loading flyers…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
        <p className="text-lg text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-black px-6 text-center text-white">
        <p className="text-xl font-semibold">No flyers yet</p>
        <p className="max-w-md text-sm text-white/70">
          Create event flyers in the admin calendar — they will appear here
          automatically.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-screen flex-col bg-black"
    >
      {!isFullscreen ? (
        <div className="absolute right-4 top-4 z-20 flex gap-2">
          {orientation === "portrait" ? (
            <button
              type="button"
              onClick={rotateImage}
              className="rounded-lg bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/80"
            >
              Rotate 90°
            </button>
          ) : null}
          <button
            type="button"
            onClick={enterFullscreen}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Full screen
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 items-center justify-center overflow-hidden p-0">
        {isVideo ? (
          <video
            key={current.id}
            ref={videoRef}
            src={current.imageUrl}
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={() => {
              if (flyers.length <= 1) {
                const video = videoRef.current;
                if (video) {
                  video.currentTime = 0;
                  void video.play().catch(() => {});
                }
                return;
              }
              advanceSlide();
            }}
            style={{ transform: `rotate(${rotation}deg)` }}
            className={mediaClass}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={current.imageUrl}
            alt={current.title}
            style={{ transform: `rotate(${rotation}deg)` }}
            className={mediaClass}
          />
        )}
      </div>

      {!isFullscreen ? (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-6 pb-6 pt-16">
          <p className="text-lg font-semibold text-white">{current.title}</p>
          <p className="mt-1 text-sm uppercase tracking-wide text-white/80">
            {current.scheduleLabel}
          </p>
          {storeName ? (
            <p className="mt-2 text-xs text-white/50">{storeName}</p>
          ) : null}
          {flyers.length > 1 ? (
            <p className="mt-2 text-xs text-white/40">
              {index + 1} / {flyers.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
