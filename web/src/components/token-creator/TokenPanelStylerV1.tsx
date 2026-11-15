"use client";

import { useState } from "react";
import type { TokenCardV1, TokenPanelArtV1 } from "@/lib/token-creator/design-v1";
import { TokenCardCanvasV1 } from "./TokenCardCanvasV1";

const LAYERS: Array<[keyof Pick<TokenPanelArtV1, "title" | "type" | "rules" | "pt">, string]> = [
  ["title", "Name"],
  ["type", "Type line"],
  ["rules", "Rules box"],
  ["pt", "P/T"],
];

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/** Plates and panels the texture can actually fill; empty shapes become plain ones. */
function withDrawableShapes(card: TokenCardV1): TokenCardV1 {
  const panelless = card.rules.panel === "none" || card.rules.panel === "glow" || card.rules.panel === "integrated";
  return {
    ...card,
    title: card.title.plate === "none" ? { ...card.title, plate: "bar", plateOpacity: 1 } : card.title,
    type: card.type.plate === "none" ? { ...card.type, plate: "bar", plateOpacity: 1 } : card.type,
    pt: card.pt.plate === "none" ? { ...card.pt, plate: "bar" } : card.pt,
    rules: panelless ? { ...card.rules, panel: "box", panelOpacity: Math.max(card.rules.panelOpacity, 0.9) } : card.rules,
  };
}

/**
 * AI-made surfaces for the name plate and rules box, drawn in the chosen art
 * style. One image per try; it is laid into the card's existing plate shapes,
 * so the text stays crisp type rather than AI lettering.
 */
export function TokenPanelStylerV1({
  api,
  card,
  artUrl,
  styleId,
  blendStyleId,
  blendWeight,
  disabled,
  onChange,
  onApply,
  onRemaining,
}: {
  api: string;
  card: TokenCardV1;
  artUrl: string | null;
  styleId: string | null;
  blendStyleId: string | null;
  blendWeight: number;
  disabled: boolean;
  /** Edits the card on screen. */
  onChange: (card: TokenCardV1) => void;
  /** Edits the card and saves the design, for changes that cost an image. */
  onApply: (card: TokenCardV1) => Promise<void> | void;
  onRemaining: (remaining: number) => void;
}) {
  const [description, setDescription] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = card.panelArt ?? null;
  const textIsDark = isDark(card.rules.color);

  async function make() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`${api}/panels`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, styleId, blendStyleId, blendWeight, tone: textIsDark ? "light" : "dark" }),
      });
      const data = (await res.json().catch(() => ({}))) as { path?: string; remainingToday?: number; error?: string };
      if (!res.ok || !data.path) throw new Error(data.error ?? "Could not make the panels");
      const next = withDrawableShapes(card);
      await onApply({
        ...next,
        panelArt: {
          path: data.path,
          title: panel?.title ?? true,
          type: panel?.type ?? true,
          rules: panel?.rules ?? true,
          pt: panel?.pt ?? true,
          strength: panel?.strength ?? 0.85,
        },
      });
      if (typeof data.remainingToday === "number") onRemaining(data.remainingToday);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the panels");
    } finally {
      setWorking(false);
    }
  }

  const update = (patch: Partial<TokenPanelArtV1>) => {
    if (panel) onChange({ ...card, panelArt: { ...panel, ...patch } });
  };

  return (
    <div className="token-panels">
      <div className="min-w-0 flex-1">
        <h3 className="token-section-title">AI-styled name &amp; rules panels</h3>
        <p className="professor-mtg-muted text-[12px]">
          Paints a matching surface for the name plate and rules box in your art style
          {textIsDark ? " (light, so your dark text stays readable)" : " (dark, so your light text stays readable)"}. The
          lettering stays sharp printed type. Uses one image from today&apos;s allowance.
        </p>
        {card.setCode ? (
          <p className="token-warnings mt-2">
            Your token is styled like a Magic set. Panels paint over that set&apos;s coloured name bar, type line and P/T, so
            leave them off to keep the set&apos;s look.
          </p>
        ) : null}
        <label className="token-field mt-3">
          <span className="token-field__label">Panel look (optional)</span>
          <input
            className="token-input"
            maxLength={400}
            value={description}
            placeholder="e.g. weathered bronze with vine engravings"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="professor-mtg-btn px-4 py-2 text-xs"
            disabled={disabled || working || (!description.trim() && !styleId)}
            onClick={() => void make()}
          >
            {working ? "Painting panels…" : panel ? "Make new panels" : "Make panels"}
          </button>
          {working ? <span className="professor-mtg-muted text-[11px]">Usually under a minute; can take up to three.</span> : null}
          {panel ? (
            <button type="button" className="token-link" disabled={working} onClick={() => void onApply({ ...card, panelArt: null })}>
              Remove AI panels
            </button>
          ) : null}
          {!styleId && !description.trim() ? (
            <span className="professor-mtg-muted text-[11px]">Pick an art style above or describe the look.</span>
          ) : null}
        </div>
        {error ? <p className="token-error mt-2">{error}</p> : null}
        {panel ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-3">
              {LAYERS.map(([id, label]) => (
                <label key={id} className="token-toggle">
                  <input type="checkbox" checked={panel[id]} onChange={(e) => update({ [id]: e.target.checked })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <label className="token-field">
              <span className="token-field__label">Texture strength</span>
              <span className="token-range">
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={panel.strength}
                  onChange={(e) => update({ strength: Number(e.target.value) })}
                />
                <span className="token-range__value">{Math.round(panel.strength * 100)}%</span>
              </span>
            </label>
          </div>
        ) : null}
      </div>
      <TokenCardCanvasV1 card={card} artUrl={artUrl} width={170} label="Panel preview" />
    </div>
  );
}
