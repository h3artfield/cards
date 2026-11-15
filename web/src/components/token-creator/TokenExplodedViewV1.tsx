"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_H, CARD_W, tokenLayerOrderV1, type TokenCardV1 } from "@/lib/token-creator/design-v1";
import { drawTokenFrontV1, type TokenLayerIdV1, type TokenPartV1 } from "@/lib/token-creator/render-v1";
import { useTokenArtV1, useTokenFontsV1, useTokenPanelArtV1, useTokenSymbolArtV1 } from "./useTokenAssetsV1";

const LABELS: Record<TokenPartV1, string> = {
  art: "Artwork",
  frame: "Frame",
  title: "Name",
  type: "Type line",
  rules: "Rules box",
  pt: "P/T",
  symbol: "Icon",
  finish: "Finish",
};

function partsOf(card: TokenCardV1): TokenPartV1[] {
  const stack = tokenLayerOrderV1(card).filter((l) =>
    l === "symbol" ? Boolean(card.symbol) && (card.layerOpacity?.symbol ?? 1) > 0 : card[l].show,
  );
  return ["art", "frame", ...stack, ...(card.finish !== "none" ? (["finish"] as const) : [])];
}

function Plane({
  card,
  part,
  width,
  art,
  panelArt,
  symbolArt,
  fontsTick,
}: {
  card: TokenCardV1;
  part: TokenPartV1;
  width: number;
  art: HTMLImageElement | null;
  panelArt: HTMLImageElement | null;
  symbolArt: HTMLImageElement | null;
  fontsTick: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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
      panelArt,
      symbolArt,
      parts: [part],
    });
  }, [card, part, width, art, panelArt, symbolArt, fontsTick]);
  return <canvas ref={ref} style={{ width, height: Math.round((width * CARD_H) / CARD_W) }} />;
}

/**
 * The card pulled apart into its layers, stacked in 3D, so the customer can
 * see how it is built. Click a layer to edit it.
 */
export function TokenExplodedViewV1({
  card,
  artUrl,
  width,
  selected,
  onSelect,
}: {
  card: TokenCardV1;
  artUrl?: string | null;
  width: number;
  selected?: TokenLayerIdV1 | null;
  onSelect?: (layer: TokenLayerIdV1) => void;
}) {
  const art = useTokenArtV1(artUrl);
  const panelArt = useTokenPanelArtV1(card);
  const symbolArt = useTokenSymbolArtV1(card);
  const fontsTick = useTokenFontsV1(card);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setOpen(true), 30);
    return () => window.clearTimeout(id);
  }, []);
  const parts = partsOf(card);
  const height = Math.round((width * CARD_H) / CARD_W);
  const gap = Math.max(26, Math.min(48, 260 / parts.length));
  const tabOf = (p: TokenPartV1): TokenLayerIdV1 | null =>
    p === "art" || p === "frame" ? "art" : p === "symbol" ? "type" : p === "finish" ? null : p;

  return (
    <div className="token-exploded" style={{ width, height: height + gap * parts.length * 0.5 }}>
      <div className={`token-exploded__stack${open ? " token-exploded__stack--open" : ""}`} style={{ width, height }}>
        {parts.map((part, i) => {
          const tab = tabOf(part);
          const on = Boolean(tab && selected === tab && part !== "frame" && part !== "symbol");
          return (
            <div
              key={part}
              className={`token-exploded__plane${on ? " token-exploded__plane--on" : ""}`}
              style={{ transform: open ? `translateZ(${i * gap}px)` : "translateZ(0)" }}
            >
              <Plane card={card} part={part} width={width} art={art} panelArt={panelArt} symbolArt={symbolArt} fontsTick={fontsTick} />
              <button
                type="button"
                className="token-exploded__label"
                style={{ top: `${8 + (i / Math.max(1, parts.length - 1)) * 70}%` }}
                disabled={!tab || !onSelect}
                onClick={tab && onSelect ? () => onSelect(tab) : undefined}
              >
                {LABELS[part]}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
