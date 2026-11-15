"use client";

import { tokenLayerOrderV1, type TokenCardV1, type TokenStackLayerV1 } from "@/lib/token-creator/design-v1";
import type { TokenLayerIdV1 } from "@/lib/token-creator/render-v1";

const LABELS: Record<TokenStackLayerV1, string> = {
  title: "Name",
  type: "Type line",
  rules: "Rules box",
  pt: "Power / toughness",
  symbol: "Type-line icon",
};

const shownOf = (card: TokenCardV1, layer: TokenStackLayerV1): boolean =>
  layer === "symbol" ? (card.layerOpacity?.symbol ?? 1) > 0 : card[layer].show;

/**
 * The card's layers as a stack, top first, like an image editor: pick one to
 * edit it, hide it, fade it or move it above or below the others. Art and
 * frame always sit at the bottom.
 */
export function TokenLayerListV1({
  card,
  onChange,
  selected,
  onSelect,
}: {
  card: TokenCardV1;
  onChange: (card: TokenCardV1) => void;
  selected: TokenLayerIdV1 | null;
  onSelect: (layer: TokenLayerIdV1) => void;
}) {
  const order = tokenLayerOrderV1(card).filter((l) => l !== "symbol" || card.symbol);
  const top = [...order].reverse();

  const move = (layer: TokenStackLayerV1, dir: 1 | -1) => {
    const full = tokenLayerOrderV1(card);
    const i = full.indexOf(layer);
    let j = i + dir;
    while (j >= 0 && j < full.length && full[j] === "symbol" && !card.symbol) j += dir;
    if (j < 0 || j >= full.length) return;
    const next = [...full];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange({ ...card, layerOrder: next });
  };

  const setShown = (layer: TokenStackLayerV1, show: boolean) => {
    if (layer === "symbol") {
      onChange({ ...card, layerOpacity: { ...card.layerOpacity, symbol: show ? 1 : 0 } });
    } else {
      onChange({ ...card, [layer]: { ...card[layer], show } });
    }
  };

  const setOpacity = (layer: TokenStackLayerV1, value: number) =>
    onChange({ ...card, layerOpacity: { ...card.layerOpacity, [layer]: value } });

  return (
    <section className="token-layer-list" aria-label="Layers">
      <span className="token-field__label">Layers</span>
      <ol>
        {top.map((layer, i) => {
          const shown = shownOf(card, layer);
          const tab: TokenLayerIdV1 = layer === "symbol" ? "type" : layer;
          const on = selected === tab && layer !== "symbol";
          const opacity = card.layerOpacity?.[layer] ?? 1;
          return (
            <li key={layer} className={`token-layer-row${on ? " token-layer-row--on" : ""}${shown ? "" : " token-layer-row--hidden"}`}>
              <button
                type="button"
                className="token-layer-row__eye"
                aria-pressed={shown}
                aria-label={`${shown ? "Hide" : "Show"} ${LABELS[layer]}`}
                title={shown ? "Hide" : "Show"}
                onClick={() => setShown(layer, !shown)}
              >
                {shown ? "◉" : "○"}
              </button>
              <button type="button" className="token-layer-row__name" onClick={() => onSelect(tab)}>
                {LABELS[layer]}
              </button>
              {layer !== "symbol" ? (
                <input
                  type="range"
                  className="token-layer-row__opacity"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={opacity}
                  disabled={!shown}
                  aria-label={`${LABELS[layer]} opacity`}
                  title={`Opacity ${Math.round(opacity * 100)}%`}
                  onChange={(e) => setOpacity(layer, Number(e.target.value))}
                />
              ) : (
                <span className="token-layer-row__opacity" />
              )}
              <span className="token-layer-row__moves">
                <button type="button" aria-label={`Move ${LABELS[layer]} up`} disabled={i === 0} onClick={() => move(layer, 1)}>
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${LABELS[layer]} down`}
                  disabled={i === top.length - 1}
                  onClick={() => move(layer, -1)}
                >
                  ▼
                </button>
              </span>
            </li>
          );
        })}
        <li className={`token-layer-row token-layer-row--fixed${selected === "art" ? " token-layer-row--on" : ""}`}>
          <span className="token-layer-row__eye" aria-hidden>
            ◉
          </span>
          <button type="button" className="token-layer-row__name" onClick={() => onSelect("art")}>
            Art &amp; frame
          </button>
        </li>
      </ol>
    </section>
  );
}
