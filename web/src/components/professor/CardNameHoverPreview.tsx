"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { scryfallNamedImageUrl } from "@/lib/deck-synthesis/professor-brew-scryfall-images-v1";

const PREVIEW_W = 250;
const PREVIEW_H = 349;

/**
 * Image links a page already resolved, so a hover anywhere under it shows the
 * catalog image instead of asking Scryfall's rate-limited API for each name.
 */
const CardImageUrlsContextV1 = createContext<Record<string, string>>({});

export function CardImageUrlsProviderV1({
  imageUrls,
  children,
}: {
  imageUrls: Record<string, string>;
  children: ReactNode;
}) {
  const parent = useContext(CardImageUrlsContextV1);
  const merged = useMemo(() => ({ ...parent, ...imageUrls }), [parent, imageUrls]);
  return <CardImageUrlsContextV1.Provider value={merged}>{children}</CardImageUrlsContextV1.Provider>;
}

/**
 * Shows a card beside the pointer while something is hovered.
 *
 * Rendered through a portal and positioned against the viewport, so it escapes
 * the deck panel's overflow and column clipping instead of being cut off at the
 * edge of whatever list it happens to sit in.
 */
export function useCardHoverPreviewV1(name: string, imageUrl?: string) {
  const known = useContext(CardImageUrlsContextV1);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [failedPrimary, setFailedPrimary] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);

  const primaryUrl = imageUrl ?? known[name] ?? known[name.toLowerCase()] ?? scryfallNamedImageUrl(name);
  const fallbackUrl = scryfallNamedImageUrl(name, true);
  const previewUrl = failedPrimary ? fallbackUrl : primaryUrl;

  useEffect(() => {
    setFailedPrimary(false);
    setFailedFallback(false);
  }, [name, primaryUrl]);

  const place = useCallback((clientX: number, clientY: number) => {
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

  const handlers = {
    onMouseEnter: (e: React.MouseEvent) => {
      setVisible(true);
      place(e.clientX, e.clientY);
    },
    onMouseMove: (e: React.MouseEvent) => place(e.clientX, e.clientY),
    onMouseLeave: () => setVisible(false),
    // Picking a card up hands the pointer to the grab ghost.
    onPointerDown: () => setVisible(false),
  };

  const show = useCallback(
    (anchor: DOMRect) => {
      setVisible(true);
      place(anchor.right, anchor.top);
    },
    [place],
  );
  const hide = useCallback(() => setVisible(false), []);

  const preview =
    visible && typeof document !== "undefined"
      ? createPortal(
          <div
            className="card-hover-preview pointer-events-none fixed z-[100]"
            style={{ left: pos.x, top: pos.y, width: PREVIEW_W, height: PREVIEW_H }}
          >
            {!failedFallback ? (
              <img
                src={previewUrl}
                alt={name}
                className="h-full w-full object-cover"
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

  return { handlers, show, hide, preview, visible };
}

export type CardNameOverlayTone =
  | "owned"
  | "buy_here"
  | "need_elsewhere"
  | "mixed"
  | "none";

function nameToneClass(tone: CardNameOverlayTone | undefined, inStock?: boolean): string {
  const resolved = tone ?? (inStock ? "buy_here" : "none");
  if (resolved === "owned" || resolved === "mixed") return "professor-mtg-card-name--owned";
  if (resolved === "buy_here") return "professor-mtg-card-name--in-stock";
  if (resolved === "need_elsewhere") return "professor-mtg-card-name--need-elsewhere";
  return "";
}

/** A card name that shows the card when pointed at. */
export function CardNameHoverPreview({
  name,
  imageUrl,
  inStock,
  overlay,
  className,
  onClick,
  onDoubleClick,
  onHoverChange,
}: {
  name: string;
  imageUrl?: string;
  inStock?: boolean;
  overlay?: CardNameOverlayTone;
  className?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onHoverChange?: (over: boolean) => void;
}) {
  const hover = useCardHoverPreviewV1(name, imageUrl);
  const { visible } = hover;
  useEffect(() => {
    onHoverChange?.(visible);
    // Only the visibility change should notify, not a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <>
      <button
        type="button"
        className={`professor-mtg-card-name text-left underline decoration-transparent transition ${
          nameToneClass(overlay, inStock)
        } ${className ?? "min-w-0 flex-1"}`}
        title={name}
        {...hover.handlers}
        onFocus={(e) => hover.show(e.currentTarget.getBoundingClientRect())}
        onBlur={hover.hide}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {name}
      </button>
      {hover.preview}
    </>
  );
}

/** An inline card name inside running text, with the same hover preview. */
export function CardMentionV1({ name, children }: { name: string; children?: ReactNode }) {
  const hover = useCardHoverPreviewV1(name);
  return (
    <>
      <span className="card-mention" {...hover.handlers}>
        {children ?? name}
      </span>
      {hover.preview}
    </>
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prose with every known card name made hoverable.
 *
 * Longest names first, so "Thorin, King of Durin's Folk" is matched whole
 * rather than leaving a stray "Thorin" link inside it.
 */
export function CardMentionTextV1({ text, cardNames }: { text: string; cardNames: readonly string[] }) {
  const pattern = useMemo(() => {
    const names = [...new Set(cardNames.map((n) => n.trim()).filter((n) => n.length > 2))].sort(
      (a, b) => b.length - a.length,
    );
    if (!names.length) return null;
    return new RegExp(`(${names.map(escapeRegExp).join("|")})`, "g");
  }, [cardNames]);
  if (!pattern || !text) return <>{text}</>;
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? <CardMentionV1 key={index} name={part} /> : part,
      )}
    </>
  );
}
