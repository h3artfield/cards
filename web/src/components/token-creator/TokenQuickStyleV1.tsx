"use client";

import { themeForColorsV1, type TokenCardV1, type TokenFinishV1 } from "@/lib/token-creator/design-v1";
import { syncTokenSetCardV1 } from "@/lib/token-creator/set-templates-v1";
import { TokenSymbolPickerV1 } from "./TokenSymbolPickerV1";

const COLORS: Array<[string, string]> = [
  ["W", "White"],
  ["U", "Blue"],
  ["B", "Black"],
  ["R", "Red"],
  ["G", "Green"],
];

const FINISHES: Array<[TokenFinishV1, string]> = [
  ["none", "Plain"],
  ["foil", "Foil shimmer"],
  ["vignette", "Vignette"],
  ["grain", "Film grain"],
];

/**
 * The guided start's last step: the card's colours, the touches real tokens
 * add (legendary crown, enchantment starfield, a type-line icon) and a finish.
 * Everything here is also in the full editor.
 */
export function TokenQuickStyleV1({
  card,
  onChange,
  uploadApi,
}: {
  card: TokenCardV1;
  onChange: (card: TokenCardV1) => void;
  uploadApi?: string;
}) {
  const setLook = Boolean(card.setCode);
  const update = (next: TokenCardV1) => onChange(syncTokenSetCardV1(card, next));

  return (
    <div className="space-y-6">
      <section>
        <h3 className="token-section-title">Colours</h3>
        <p className="professor-mtg-muted mb-3 text-[12px]">
          {setLook
            ? "The name bar, type line and P/T box take these colours, the way the set's real tokens do."
            : "The frame takes these colours. Fine-tune each part later."}
        </p>
        <span className="token-colors">
          {COLORS.map(([id, label]) => {
            const on = card.colors.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                title={label}
                className={`token-mana token-mana--${id}${on ? " token-mana--on" : ""}`}
                onClick={() => {
                  const colors = on ? card.colors.filter((c) => c !== id) : [...card.colors, id];
                  const theme = themeForColorsV1(colors);
                  update(setLook ? { ...card, colors } : { ...card, colors, frame: { ...card.frame, color: theme.frame, accent: theme.accent } });
                }}
              >
                {id}
              </button>
            );
          })}
        </span>
      </section>

      <section>
        <h3 className="token-section-title">Extras</h3>
        <div className="token-toggles">
          <label className="token-toggle">
            <input
              type="checkbox"
              checked={Boolean(card.title.crown)}
              onChange={(e) => update({ ...card, title: { ...card.title, crown: e.target.checked } })}
            />
            <span>Legendary crown</span>
          </label>
          <label className="token-toggle">
            <input
              type="checkbox"
              checked={Boolean(card.title.starfield)}
              onChange={(e) => update({ ...card, title: { ...card.title, starfield: e.target.checked } })}
            />
            <span>Starfield name bar (enchantments)</span>
          </label>
        </div>
        <TokenSymbolPickerV1 card={card} onChange={update} uploadApi={uploadApi} />
      </section>

      <section>
        <h3 className="token-section-title">Finish</h3>
        <div className="flex flex-wrap gap-2">
          {FINISHES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={card.finish === id}
              className={`token-chip${card.finish === id ? " token-chip--on" : ""}`}
              onClick={() => update({ ...card, finish: id })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
