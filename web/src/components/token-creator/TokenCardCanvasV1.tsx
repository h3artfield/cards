"use client";

import { useEffect, useRef } from "react";
import { CARD_H, CARD_W, type TokenBoxV1, type TokenCardV1 } from "@/lib/token-creator/design-v1";
import { drawTokenFrontV1, tokenLayerAtV1, type TokenLayerIdV1 } from "@/lib/token-creator/render-v1";
import { useTokenArtV1, useTokenFontsV1, useTokenPanelArtV1, useTokenSymbolArtV1 } from "./useTokenAssetsV1";

type MovableLayer = "title" | "type" | "rules" | "pt";

/**
 * The card face as the customer edits it, drawn by the print renderer at
 * screen resolution. With `onMoveLayer`, text layers can be dragged into
 * place; the trim line and safe margin show while `guides` is on.
 */
export function TokenCardCanvasV1({
  card,
  artUrl,
  width,
  guides = false,
  selectedLayer = null,
  onSelectLayer,
  onMoveLayer,
  className = "",
  label,
}: {
  card: TokenCardV1;
  artUrl?: string | null;
  width: number;
  guides?: boolean;
  selectedLayer?: TokenLayerIdV1 | null;
  onSelectLayer?: (layer: TokenLayerIdV1 | null) => void;
  onMoveLayer?: (layer: MovableLayer, box: TokenBoxV1) => void;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const art = useTokenArtV1(artUrl);
  const panelArt = useTokenPanelArtV1(card);
  const symbolArt = useTokenSymbolArtV1(card);
  const fontsTick = useTokenFontsV1(card);
  const height = Math.round((width * CARD_H) / CARD_W);
  const drag = useRef<{ layer: MovableLayer; startX: number; startY: number; box: TokenBoxV1 } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    const scale = (width * dpr) / CARD_W;
    canvas.width = Math.round(CARD_W * scale);
    canvas.height = Math.round(CARD_H * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTokenFrontV1(ctx, card, {
      art,
      artWidth: art?.naturalWidth,
      artHeight: art?.naturalHeight,
      scale,
      bleed: false,
      guides,
      selectedLayer,
      panelArt,
      symbolArt,
    });
  }, [card, art, panelArt, symbolArt, width, guides, selectedLayer, fontsTick]);

  const toCard = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CARD_W,
      y: ((event.clientY - rect.top) / rect.height) * CARD_H,
    };
  };

  const interactive = Boolean(onSelectLayer || onMoveLayer);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label ?? `${card.name || "Token"} card preview`}
      className={`token-card-canvas ${interactive ? "token-card-canvas--edit" : ""} ${className}`}
      style={{ width, height }}
      onPointerDown={
        interactive
          ? (event) => {
              const p = toCard(event);
              const hit = tokenLayerAtV1(card, p.x, p.y);
              onSelectLayer?.(hit ?? "art");
              if (hit && hit !== "art" && onMoveLayer) {
                drag.current = { layer: hit, startX: p.x, startY: p.y, box: { ...card[hit].box } };
                event.currentTarget.setPointerCapture(event.pointerId);
              }
            }
          : undefined
      }
      onPointerMove={
        onMoveLayer
          ? (event) => {
              const d = drag.current;
              if (!d) return;
              const p = toCard(event);
              onMoveLayer(d.layer, {
                ...d.box,
                x: Math.round(d.box.x + p.x - d.startX),
                y: Math.round(d.box.y + p.y - d.startY),
              });
            }
          : undefined
      }
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}
