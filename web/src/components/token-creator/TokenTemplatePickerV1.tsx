"use client";

import type { TokenCardV1 } from "@/lib/token-creator/design-v1";
import { deckTokenLabelV1 } from "@/lib/deck-tokens/deck-tokens-v1";
import {
  defaultTokenCardV1,
  isTokenPickV1,
  POPULAR_TOKENS_V1,
  TOKEN_FAMILIES_V1,
  tokenKindByIdV1,
  withTokenV1,
} from "@/lib/token-creator/templates-v1";
import { tokenSetIndexEntryV1 } from "@/lib/token-creator/set-index-v1";
import { applyTokenSetTemplateV1 } from "@/lib/token-creator/set-templates-v1";
import { TokenCardCanvasV1 } from "./TokenCardCanvasV1";
import { TokenQuickStyleV1 } from "./TokenQuickStyleV1";
import { TokenSearchV1 } from "./TokenSearchV1";
import { TokenSetPickerV1 } from "./TokenSetPickerV1";

const SCRATCH: ReadonlyArray<{ kindId: string; label: string; text: string }> = [
  { kindId: "creature", label: "Custom creature", text: "Name it and set its power and toughness" },
  { kindId: "artifact", label: "Custom artifact", text: "Write your own name and text" },
  { kindId: "emblem", label: "Emblem", text: "For a planeswalker's emblem" },
  { kindId: "blank", label: "No template (full art)", text: "Just artwork, no frame or text" },
];

export type TokenStartStepV1 = 0 | 1 | 2;

const START_STEPS: Array<[TokenStartStepV1, string]> = [
  [0, "Token"],
  [1, "Look"],
  [2, "Colours & extras"],
];

/**
 * Step one, guided: which token this is (searched, or one of the popular
 * ones), which set or look it starts from, then its colours and extras. All
 * of it only fills in the card; everything stays editable afterwards.
 */
export function TokenTemplatePickerV1({
  slug,
  card,
  onChange,
  step,
  onStep,
  uploadApi,
}: {
  slug: string;
  card: TokenCardV1;
  onChange: (card: TokenCardV1) => void;
  step: TokenStartStepV1;
  onStep: (step: TokenStartStepV1) => void;
  uploadApi?: string;
}) {
  const blank = card.kindId === "blank";
  return (
    <div>
      <nav className="token-substeps" aria-label="Getting started">
        {START_STEPS.filter(([id]) => !blank || id === 0).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`token-substep${step === id ? " token-substep--on" : ""}${id < step ? " token-substep--done" : ""}`}
            aria-current={step === id ? "step" : undefined}
            onClick={() => onStep(id)}
          >
            <span className="token-substep__n">{id + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {step === 0 || blank ? <TokenPickStep slug={slug} card={card} onChange={onChange} /> : null}
      {step === 1 && !blank ? <TokenLookStep card={card} onChange={onChange} /> : null}
      {step === 2 && !blank ? <TokenQuickStyleV1 card={card} onChange={onChange} uploadApi={uploadApi} /> : null}
      <div className="mt-6 flex justify-between gap-2">
        {step > 0 && !blank ? (
          <button type="button" className="deck-toolbar-chip" onClick={() => onStep((step - 1) as TokenStartStepV1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < 2 && !blank ? (
          <button type="button" className="professor-mtg-btn px-4 py-2 text-xs" onClick={() => onStep((step + 1) as TokenStartStepV1)}>
            {step === 0 ? "Next: pick a look" : "Next: colours & extras"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TokenPickStep({ slug, card, onChange }: { slug: string; card: TokenCardV1; onChange: (card: TokenCardV1) => void }) {
  const fromScratch = (kindId: string) => {
    const blank = tokenKindByIdV1(kindId).layout === "blank";
    const set = blank ? null : tokenSetIndexEntryV1(card.setCode);
    let next = defaultTokenCardV1(kindId, blank || card.familyId === "completely_blank" || set ? undefined : card.familyId);
    if (kindId === "creature") {
      next = { ...next, name: "Creature", typeLine: "Token Creature", power: "1", toughness: "1", colors: [], rulesText: "", rulesSource: "none" };
    }
    onChange(set ? applyTokenSetTemplateV1(next, set) : next);
  };
  const popularPicked = POPULAR_TOKENS_V1.some((t) => isTokenPickV1(card, t));

  return (
    <div className="space-y-6">
      <section>
        <h3 className="token-section-title">What are you making?</h3>
        <TokenSearchV1 slug={slug} onPick={(hit) => onChange(withTokenV1(card, hit))} />
        {card.kindId !== "blank" && card.name && !popularPicked ? (
          <p className="professor-mtg-muted mt-2 text-[12px]">
            Making: <strong className="text-[var(--text-hi,#f3eee6)]">{card.name}</strong> · {card.typeLine}
            {card.power || card.toughness ? ` · ${card.power}/${card.toughness}` : ""}
          </p>
        ) : null}

        <p className="token-subhead mt-4">Popular tokens</p>
        <div className="token-kind-grid">
          {POPULAR_TOKENS_V1.map((token) => {
            const on = isTokenPickV1(card, token);
            return (
              <button
                key={token.id}
                type="button"
                className={`token-kind${on ? " token-kind--on" : ""}`}
                aria-pressed={on}
                onClick={() => onChange(withTokenV1(card, token))}
              >
                <span className="token-kind__label">{token.name}</span>
                <span className="token-kind__text">
                  {token.power ? deckTokenLabelV1({ ...token, kind: "token" }) : token.text}
                  {token.power && token.text ? ` · ${token.text}` : ""}
                </span>
              </button>
            );
          })}
        </div>

        <p className="token-subhead mt-4">Or start from scratch</p>
        <div className="token-kind-grid">
          {SCRATCH.map((s) => {
            const on = !popularPicked && card.kindId === s.kindId && (s.kindId !== "creature" || card.name === "Creature");
            return (
              <button
                key={s.kindId}
                type="button"
                className={`token-kind token-kind--compact${on ? " token-kind--on" : ""}`}
                aria-pressed={on}
                onClick={() => fromScratch(s.kindId)}
              >
                <span className="token-kind__label">{s.label}</span>
                <span className="token-kind__text">{s.text}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TokenLookStep({ card, onChange }: { card: TokenCardV1; onChange: (card: TokenCardV1) => void }) {
  return (
    <div className="space-y-6">
      <TokenSetPickerV1 card={card} onChange={onChange} />

      <section>
        <h3 className="token-section-title">Or pick an original look</h3>
        <p className="professor-mtg-muted mb-3 text-[12px]">
          Each look sets the frame, name plate, rules box and lettering. You can change any part of it next.
        </p>
        <div className="token-family-grid">
          {TOKEN_FAMILIES_V1.map((fam) => {
            const sample = fam.apply(card);
            const on = card.familyId === fam.id;
            return (
              <button
                key={fam.id}
                type="button"
                className={`token-family${on ? " token-family--on" : ""}`}
                aria-pressed={on}
                onClick={() => onChange(sample)}
              >
                <TokenCardCanvasV1 card={sample} width={120} label={`${fam.label} template`} />
                <span className="token-family__label">{fam.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
