"use client";

import { useMemo } from "react";
import { ProfessorDeckBracketPanel } from "../ProfessorDeckBracketPanel";
import { deckEditorKeyQueryV1 } from "./deck-key-v1";
import type { DeckEditorKeyV1 } from "./deck-key-v1";
import type { DeckEditorCard } from "./types";

/**
 * What the deck on screen measures. Letter grade and COS are not headlines
 * here — the measured bracket is the only number this panel publishes.
 * Deck Rating last-three digits stay unpublished for every band until W
 * moves with the list and passes the §6 tests.
 */
export function DeckRegradePanelV1({
  slug,
  commanderName,
  partnerName,
  cards,
  requestedBracket,
  deckKey,
  revision,
}: {
  slug: string;
  commanderName: string;
  commanderOracleId: string;
  partnerName?: string | null;
  cards: readonly DeckEditorCard[];
  requestedBracket: number | null;
  deckKey: DeckEditorKeyV1;
  revision: number;
}) {
  const bracketCards = useMemo(
    () => [
      // The bracket rubric takes one commander; a partner still counts toward
      // Game Changers and combos, so it rides along as a card.
      ...(partnerName ? [{ name: partnerName, copies: 1 }] : []),
      ...cards.map((card) => ({ name: card.name, copies: card.copies })),
    ],
    [cards, partnerName],
  );

  return (
    <div>
      <ProfessorDeckBracketPanel
        storeSlug={slug}
        commanderName={commanderName}
        cards={bracketCards}
        requestedBracket={requestedBracket}
        onMeasured={(bracket) => {
          void fetch(
            `/api/store/${encodeURIComponent(slug)}/professor/deck-editor/measured-bracket?${deckEditorKeyQueryV1(
              deckKey,
            )}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bracket, atRevision: revision }),
            },
          ).catch(() => {});
        }}
      />
    </div>
  );
}
