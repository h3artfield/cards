"use client";

import { scryfallNamedArtCropUrl } from "@/lib/deck-synthesis/professor-brew-scryfall-images-v1";
import { COMMANDER_LIBRARY_SIZE_V1 } from "@/lib/professor-deck-editor/legality-v1";
import type { ReactNode } from "react";

const COLOR_LABEL: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const COLOR_CLASS: Record<string, string> = {
  W: "deck-mana-pip--w",
  U: "deck-mana-pip--u",
  B: "deck-mana-pip--b",
  R: "deck-mana-pip--r",
  G: "deck-mana-pip--g",
};

function ManaPips({ colors }: { colors: readonly string[] }) {
  if (!colors.length) {
    return <span className="deck-mana-pip deck-mana-pip--c">C</span>;
  }
  return (
    <>
      {colors.map((color) => (
        <span
          key={color}
          className={`deck-mana-pip ${COLOR_CLASS[color] ?? "deck-mana-pip--c"}`}
          title={COLOR_LABEL[color] ?? color}
        >
          {color}
        </span>
      ))}
    </>
  );
}

export function DeckEditorHero({
  commanderName,
  commanderImageUrl,
  colorIdentity,
  deckName,
  nameDraft,
  onNameDraftChange,
  onNameCommit,
  onNameCancel,
  libraryCount,
  commanderLegal,
  handBuilt,
  readyToGrade,
  onCheckBracket,
  inStockCount,
  onAddInStockToCart,
  distributionSlot,
  hideTitle = false,
}: {
  commanderName: string;
  commanderImageUrl?: string;
  colorIdentity: readonly string[];
  deckName: string;
  nameDraft: string | null;
  onNameDraftChange: (value: string) => void;
  onNameCommit: () => void;
  onNameCancel: () => void;
  libraryCount: number;
  commanderLegal: boolean;
  handBuilt: boolean;
  readyToGrade: boolean;
  onCheckBracket: () => void;
  inStockCount: number;
  onAddInStockToCart?: () => void;
  distributionSlot?: ReactNode;
  /** Parent workspace already shows the commander name. */
  hideTitle?: boolean;
}) {
  const artUrl =
    commanderImageUrl ?? scryfallNamedArtCropUrl(commanderName, true);

  return (
    <header className="deck-editor-hero">
      {hideTitle ? null : (
        <div className="deck-editor-hero__head">
          <h2 className="deck-editor-hero__commander-name">{commanderName}</h2>
          <span className="deck-editor-hero__head-sep" aria-hidden>
            ·
          </span>
          <label className="sr-only" htmlFor="deck-editor-name">
            Deck name
          </label>
          <input
            id="deck-editor-name"
            className="deck-editor-hero__name-input professor-mtg-input"
            value={nameDraft ?? deckName}
            maxLength={120}
            placeholder="Name this deck…"
            onChange={(event) => onNameDraftChange(event.target.value)}
            onBlur={onNameCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                onNameCancel();
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      )}

      <div className="deck-editor-hero__row">
        <div className="deck-editor-hero__commander deck-magic-card deck-magic-card--commander">
          <div className="deck-magic-card__frame">
            <img src={artUrl} alt="" className="deck-magic-card__art" loading="eager" />
            <div className="deck-magic-card__inner-border" />
          </div>
        </div>

        <dl className="deck-editor-hero__side-stats">
          <div className="deck-editor-hero__card-topline">
            <p className="deck-magic-card__type">Commander</p>
            <div className="deck-magic-card__pips">
              <ManaPips colors={colorIdentity} />
            </div>
          </div>
          <div className="deck-editor-hero__card-stat">
            <dt>Library</dt>
            <dd>
              {libraryCount}
              <span className="deck-editor-hero__stat-dim">/{COMMANDER_LIBRARY_SIZE_V1}</span>
            </dd>
          </div>
          <div className="deck-editor-hero__card-stat">
            <dt>In store</dt>
            <dd>
              {inStockCount > 0 && onAddInStockToCart ? (
                <button
                  type="button"
                  className="deck-editor-hero__in-store"
                  onClick={onAddInStockToCart}
                  title="Add all in-store cards to your cart"
                >
                  {inStockCount} <span className="deck-editor-hero__in-store-buy">Buy</span>
                </button>
              ) : (
                <span>{inStockCount}</span>
              )}
            </dd>
          </div>
          <div className="deck-editor-hero__card-stat">
            <dt>Legality</dt>
            <dd className={commanderLegal ? "text-[var(--ok)]" : "text-[var(--bad)]"}>
              {commanderLegal ? "Commander legal" : "Needs review"}
            </dd>
          </div>
          {handBuilt ? (
            <div className="deck-editor-hero__actions">
              <button
                type="button"
                className="professor-mtg-btn px-3 py-1.5 text-[11px]"
                disabled={!readyToGrade}
                onClick={onCheckBracket}
              >
                Check bracket
              </button>
            </div>
          ) : null}
        </dl>

        {distributionSlot ? (
          <div className="deck-editor-hero__distribution min-w-0">{distributionSlot}</div>
        ) : null}
      </div>
    </header>
  );
}
