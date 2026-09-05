"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { scryfallNamedImageUrl } from "@/lib/deck-synthesis/professor-brew-scryfall-images-v1";

const PREVIEW_W = 220;
const PREVIEW_H = 308;

/**
 * A card name that shows the card when pointed at.
 *
 * Rendered through a portal and positioned against the viewport, so it escapes
 * the deck panel's overflow and column clipping instead of being cut off at the
 * edge of whatever list it happens to sit in.
 */
export function CardNameHoverPreview({
  name,
  imageUrl,
  inStock,
  className,
  onClick,
}: {
  name: string;
  imageUrl?: string;
  inStock?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [failedPrimary, setFailedPrimary] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);

  const primaryUrl = imageUrl ?? scryfallNamedImageUrl(name);
  const fallbackUrl = scryfallNamedImageUrl(name, true);
  const previewUrl = failedPrimary ? fallbackUrl : primaryUrl;
  const showImage = !failedFallback;

  useEffect(() => {
    setFailedPrimary(false);
    setFailedFallback(false);
  }, [name, imageUrl]);

  const updatePos = useCallback((clientX: number, clientY: number) => {
    const pad = 12;
    let x = clientX + 18;
    let y = clientY - PREVIEW_H / 2;
    if (typeof window !== "undefined") {
      if (x + PREVIEW_W + pad > window.innerWidth) x = clientX - PREVIEW_W - 18;
      if (y < pad) y = pad;
      if (y + PREVIEW_H + pad > window.innerHeight) y = window.innerHeight - PREVIEW_H - pad;
    }
    setPos({ x, y });
  }, []);

  const preview =
    visible && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed z-[100] overflow-hidden border border-[var(--mtg-gold-dim)] bg-[var(--mtg-stone-deep)] shadow-[0_0_20px_rgba(201,162,39,0.2)]"
            style={{ left: pos.x, top: pos.y, width: PREVIEW_W, height: PREVIEW_H }}
          >
            {showImage ? (
              <img
                src={previewUrl}
                alt={name}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={() => {
                  if (!failedPrimary) setFailedPrimary(true);
                  else setFailedFallback(true);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--mtg-stone-deep)] p-3 text-center text-xs text-[var(--mtg-parchment-muted)]">
                {name}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={`professor-mtg-card-name text-left underline decoration-transparent transition ${
          inStock ? "professor-mtg-card-name--in-stock" : ""
        } ${className ?? "min-w-0 flex-1"}`}
        title={name}
        onMouseEnter={(e) => {
          setVisible(true);
          updatePos(e.clientX, e.clientY);
        }}
        onMouseMove={(e) => updatePos(e.clientX, e.clientY)}
        onMouseLeave={() => setVisible(false)}
        onFocus={(e) => {
          setVisible(true);
          updatePos(
            e.currentTarget.getBoundingClientRect().right,
            e.currentTarget.getBoundingClientRect().top,
          );
        }}
        onBlur={() => setVisible(false)}
        onClick={onClick}
      >
        {name}
      </button>
      {preview}
    </>
  );
}
