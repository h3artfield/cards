"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { TokenCardV1 } from "@/lib/token-creator/design-v1";
import { ensureTokenFontsV1, loadTokenImageV1 } from "@/lib/token-creator/render-v1";

/** Turns a stored token asset path into a URL this page may load it from. */
export const TokenAssetUrlContextV1 = createContext<((path: string) => string) | null>(null);

/** The artwork as a decoded image, or null while it loads or when there is none. */
export function useTokenArtV1(url: string | null | undefined): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!url) return;
    let active = true;
    loadTokenImageV1(url)
      .then((img) => {
        if (active) setLoaded({ url, img });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [url]);
  return url && loaded?.url === url ? loaded.img : null;
}

/** The card's AI panel texture, decoded, when it has one. */
export function useTokenPanelArtV1(card: TokenCardV1): HTMLImageElement | null {
  const toUrl = useContext(TokenAssetUrlContextV1);
  const path = card.panelArt?.path;
  return useTokenArtV1(path && toUrl ? toUrl(path) : null);
}

/** The customer's uploaded type-line icon, decoded, when the card uses one. */
export function useTokenSymbolArtV1(card: TokenCardV1): HTMLImageElement | null {
  const toUrl = useContext(TokenAssetUrlContextV1);
  const path = card.symbol?.icon === "upload" ? card.symbol.path : null;
  return useTokenArtV1(path && toUrl ? toUrl(path) : null);
}

/** Bumps whenever the card's fonts finish loading, so canvases redraw with the real faces. */
export function useTokenFontsV1(card: TokenCardV1): number {
  const [tick, setTick] = useState(0);
  const key = `${card.title.font}|${card.type.font}|${card.rules.font}|${card.pt.font}`;
  useEffect(() => {
    let active = true;
    void ensureTokenFontsV1(card).then(() => {
      if (active) setTick((t) => t + 1);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tick;
}
