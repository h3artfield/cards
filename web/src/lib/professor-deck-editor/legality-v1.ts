/**
 * The second validation contract: is this still a legal Commander deck?
 *
 * The Professor's terminal validator answers a much stronger question — was
 * every card drawn from the pool retrieved for this build, and does the list
 * satisfy the Architect's plan. A user editing their own deck breaks that
 * contract on the first card they add, and that is fine; it is their deck. What
 * must not break is format legality, which is the part a person can get wrong
 * without noticing until they are sat at a table.
 *
 * So an edited deck reports two independent facts, and the UI shows both:
 *
 *   professorEndorsed — the list is byte-identical to what the Professor sealed
 *   commanderLegal    — the list is playable in a Commander game
 *
 * Losing the first is a normal consequence of editing. Losing the second is a
 * problem. Conflating them, which is what a single "valid" boolean would do, is
 * how you end up either blocking legitimate edits or shipping illegal decks.
 */
import { boardCountsTowardDeckV1, isBasicLandNameV1, normalizeDeckCardNameV1 } from "./types-v1";
import type { EditableDeckCardV1, EditableDeckV1 } from "./types-v1";

export const PROFESSOR_DECK_EDITOR_LEGALITY_V1_VERSION = "professor-deck-editor-legality-v1";

/** The Commander singleton library size, excluding the commander itself. */
export const COMMANDER_LIBRARY_SIZE_V1 = 99;

/**
 * What the checker needs to know about a card, supplied by the caller so this
 * module stays free of Firestore and the golden catalog.
 */
export type DeckEditorCardFactsV1 = {
  oracleId: string | null;
  name: string;
  colorIdentity: string[];
  commanderLegal: boolean;
  isLand: boolean;
};

export type DeckEditorCardFactsLookupV1 = (
  card: EditableDeckCardV1,
) => DeckEditorCardFactsV1 | null;

export type DeckLegalityViolationKindV1 =
  | "deck_size"
  | "singleton"
  | "color_identity"
  | "banned"
  | "unresolved_card";

/**
 * `illegal` cannot be played. `incomplete` is a deck mid-edit — the right
 * response is a quiet counter, not a red banner, because a 98-card deck is what
 * every deck looks like halfway through a swap.
 */
export type DeckLegalitySeverityV1 = "illegal" | "incomplete";

export type DeckLegalityViolationV1 = {
  kind: DeckLegalityViolationKindV1;
  severity: DeckLegalitySeverityV1;
  cardKey: string | null;
  cardName: string | null;
  message: string;
};

export type DeckEditorLegalityReportV1 = {
  version: typeof PROFESSOR_DECK_EDITOR_LEGALITY_V1_VERSION;
  /** True when nothing outright illegal was found. Ignores `incomplete`. */
  commanderLegal: boolean;
  /** True when the mainboard is exactly the Professor's sealed list. */
  professorEndorsed: boolean;
  mainboardLibraryCount: number;
  violations: DeckLegalityViolationV1[];
  /** Cards no facts could be found for, so their legality is simply unknown. */
  unresolvedCardKeys: string[];
};

/** The mainboard signature, order-independent, used for endorsement. */
function mainboardSignature(cards: readonly EditableDeckCardV1[]): string {
  return cards
    .filter((card) => boardCountsTowardDeckV1(card.board))
    .map((card) => `${card.cardKey}x${card.copies}`)
    .sort()
    .join("|");
}

/**
 * True when the current mainboard still matches the sealed build.
 *
 * Board moves count as a change, since a card sitting in Considering is not in
 * the deck the Professor graded. Markers and the deck name do not, since they
 * annotate the list without altering it.
 */
export function isProfessorEndorsedV1(deck: EditableDeckV1): boolean {
  if (!deck.buildId || deck.baselineCards.length === 0) return false;
  return mainboardSignature(deck.cards) === mainboardSignature(deck.baselineCards);
}

function colorIdentityViolation(
  cardColors: readonly string[],
  commanderColors: readonly string[],
): string[] {
  const allowed = new Set(commanderColors.map((c) => c.toUpperCase()));
  return cardColors.map((c) => c.toUpperCase()).filter((c) => !allowed.has(c));
}

const COLOR_IDENTITY_NAMES_V1: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};

/** Full colour names for legality copy — never bare WUBRG letters in the UI. */
export function colorIdentityDisplayNamesV1(pips: readonly string[]): string {
  return pips
    .map((pip) => COLOR_IDENTITY_NAMES_V1[pip.toUpperCase()] ?? pip.toUpperCase())
    .join(", ");
}

export function checkEditableDeckLegalityV1(args: {
  deck: EditableDeckV1;
  lookup: DeckEditorCardFactsLookupV1;
}): DeckEditorLegalityReportV1 {
  const { deck } = args;
  const violations: DeckLegalityViolationV1[] = [];
  const unresolvedCardKeys: string[] = [];

  const mainboard = deck.cards.filter((card) => boardCountsTowardDeckV1(card.board));
  const mainboardLibraryCount = mainboard.reduce((sum, card) => sum + card.copies, 0);

  if (mainboardLibraryCount !== COMMANDER_LIBRARY_SIZE_V1) {
    const delta = mainboardLibraryCount - COMMANDER_LIBRARY_SIZE_V1;
    violations.push({
      kind: "deck_size",
      severity: "incomplete",
      cardKey: null,
      cardName: null,
      message:
        delta < 0
          ? `${Math.abs(delta)} card${Math.abs(delta) === 1 ? "" : "s"} short of 99`
          : `${delta} card${delta === 1 ? "" : "s"} over 99`,
    });
  }

  // Two cards can carry different oracle ids and the same name — reprints and
  // the two halves of a split card both do it — so singleton is checked on the
  // name, which is what the rule is actually written against.
  const byName = new Map<string, EditableDeckCardV1[]>();
  for (const card of mainboard) {
    const key = normalizeDeckCardNameV1(card.name);
    const bucket = byName.get(key);
    if (bucket) bucket.push(card);
    else byName.set(key, [card]);
  }

  for (const [, group] of byName) {
    const first = group[0];
    if (!first) continue;
    const basic = first.isBasicLand || isBasicLandNameV1(first.name);
    if (basic) continue;

    const total = group.reduce((sum, card) => sum + card.copies, 0);
    if (total > 1) {
      violations.push({
        kind: "singleton",
        severity: "illegal",
        cardKey: first.cardKey,
        cardName: first.name,
        message: `${first.name} appears ${total} times — Commander allows one copy of any card that is not a basic land`,
      });
    }
  }

  for (const card of mainboard) {
    const facts = args.lookup(card);
    if (!facts) {
      unresolvedCardKeys.push(card.cardKey);
      violations.push({
        kind: "unresolved_card",
        severity: "incomplete",
        cardKey: card.cardKey,
        cardName: card.name,
        message: `${card.name} could not be matched to a card in the catalog, so its legality is unknown`,
      });
      continue;
    }

    if (!facts.commanderLegal) {
      violations.push({
        kind: "banned",
        severity: "illegal",
        cardKey: card.cardKey,
        cardName: card.name,
        message: `${card.name} is not legal in Commander`,
      });
    }

    const offColor = colorIdentityViolation(
      facts.colorIdentity ?? [],
      deck.commander?.colorIdentity ?? [],
    );
    if (offColor.length > 0) {
      const colours = colorIdentityDisplayNamesV1(offColor);
      violations.push({
        kind: "color_identity",
        severity: "illegal",
        cardKey: card.cardKey,
        cardName: card.name,
        message: `${card.name}: ${colours} — not allowed in deck colour identity`,
      });
    }
  }

  return {
    version: PROFESSOR_DECK_EDITOR_LEGALITY_V1_VERSION,
    commanderLegal: !violations.some((v) => v.severity === "illegal"),
    professorEndorsed: isProfessorEndorsedV1(deck),
    mainboardLibraryCount,
    violations,
    unresolvedCardKeys,
  };
}
