/**
 * Professor v4.16.1 — canonical legality gate.
 * Illegal decks must never receive final grade, effective bracket, or TARGET_ACHIEVED.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  basicLandAllowsDuplicate,
  evaluateSingletonPool,
  isBasicLandName,
} from "./professor-commander-legality-v4-9-v1";
import {
  COMMANDER_DECK_LIBRARY_SIZE_V47,
  COMMANDER_DECK_TOTAL_CARDS_V47,
  countCommittedDeckCardsV47,
  expectedDeckTotalsV47,
  type LegalityGateResultV47,
} from "./professor-deck-completion-v4-7-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import {
  cardsShareCanonicalIdentity,
  normalizeCardNameForMatch,
  resolveCanonicalCardIdentity,
} from "./professor-canonical-card-identity-v4-15-1-v1";

export const PROFESSOR_V4_16_1_CANONICAL_LEGALITY_DECISION_V1 =
  "PROFESSOR_V4_16_1_CANONICAL_LEGALITY_BRACKET_FLOOR_AND_GRADE_TRUTH_V1_AUTHORIZED";

export const PROFESSOR_CANONICAL_LEGALITY_V4_16_1_V1_VERSION = "professor-canonical-legality-v4-16-1-v1";

export type CanonicalLegalityAssessmentV4161 = {
  version: typeof PROFESSOR_CANONICAL_LEGALITY_V4_16_1_V1_VERSION;
  /** Selected cards are individually legal so far (singleton, color, identity). */
  selectedCardsLegalSoFar: boolean;
  /** Full 99-card Commander library legality. */
  completeDeckLegal: boolean;
  /** @deprecated Use completeDeckLegal — kept for backward compatibility. */
  finalDeckLegal: boolean;
  gradeEligible: boolean;
  draftReadyEligible: boolean;
  effectiveBracketEvaluable: boolean;
  libraryCardCount: number;
  expectedLibraryCards: number;
  duplicateNonBasics: string[];
  failures: string[];
  gate: LegalityGateResultV47;
};

export type CouncilCardLikeV4161 = {
  name: string;
  oracleId?: string | null;
  cardId?: string;
  category?: string;
  colorIdentityVerified?: boolean;
  legalityVerified?: boolean;
};

export function cardAlreadyInWorkingDeckV4161(args: {
  selected: CouncilCardLikeV4161[];
  candidate: CouncilCardLikeV4161;
  catalog?: DeckResolutionCatalog | null;
}): boolean {
  if (basicLandAllowsDuplicate(args.candidate.name)) return false;
  const candidateIdentity = resolveCanonicalCardIdentity({
    name: args.candidate.name,
    oracleId: args.candidate.oracleId,
    catalog: args.catalog ?? undefined,
  });
  const candidateNameKey = normalizeCardNameForMatch(candidateIdentity.canonicalName);
  for (const existing of args.selected) {
    if (
      cardsShareCanonicalIdentity(
        { name: existing.name, oracleId: existing.oracleId },
        { name: args.candidate.name, oracleId: args.candidate.oracleId },
        args.catalog ?? undefined,
      )
    ) {
      return true;
    }
    const existingIdentity = resolveCanonicalCardIdentity({
      name: existing.name,
      oracleId: existing.oracleId,
      catalog: args.catalog ?? undefined,
    });
    if (normalizeCardNameForMatch(existingIdentity.canonicalName) === candidateNameKey) {
      return true;
    }
  }
  return false;
}

export function isCardAvailableForSingletonAddV4161(args: {
  selected: CouncilCardLikeV4161[];
  candidate: CouncilCardLikeV4161;
  catalog?: DeckResolutionCatalog | null;
}): { available: boolean; reason?: string } {
  if (cardAlreadyInWorkingDeckV4161(args)) {
    const identity = resolveCanonicalCardIdentity({
      name: args.candidate.name,
      oracleId: args.candidate.oracleId,
      catalog: args.catalog ?? undefined,
    });
    return {
      available: false,
      reason: `singleton_violation:${identity.canonicalName}`,
    };
  }
  return { available: true };
}

export function assessCanonicalDeckLegalityV4161(args: {
  selectedCards: CouncilCardLikeV4161[];
  commanderName: string;
  catalog?: DeckResolutionCatalog | null;
  /** When true, require exactly 99 library cards (final deck). */
  requireFullLibrary?: boolean;
}): CanonicalLegalityAssessmentV4161 {
  const expected = expectedDeckTotalsV47();
  const names = args.selectedCards.map((c) => c.name);
  const singleton = evaluateSingletonPool(names);
  const total = countCommittedDeckCardsV47({ selectedNonCommanderCount: args.selectedCards.length });
  const unresolved = args.selectedCards.filter((c) => c.legalityVerified === false).map((c) => c.name);
  const colorIdentityPass = args.selectedCards.every((c) => c.colorIdentityVerified !== false);

  const failures: string[] = [];
  if (args.requireFullLibrary && args.selectedCards.length !== COMMANDER_DECK_LIBRARY_SIZE_V47) {
    failures.push(
      `Expected ${COMMANDER_DECK_LIBRARY_SIZE_V47} library cards, have ${args.selectedCards.length}`,
    );
  }
  if (args.requireFullLibrary && total !== expected.totalCards) {
    failures.push(`Expected ${expected.totalCards} total cards, have ${total}`);
  }
  if (!singleton.pass) {
    failures.push(`Singleton violation (${singleton.duplicateNonBasics.join(", ")})`);
  }
  if (unresolved.length > 0) failures.push(`${unresolved.length} unresolved card identities`);
  if (!colorIdentityPass) failures.push("Color identity violation in selected pool");

  const structuralLegal = singleton.pass && colorIdentityPass && unresolved.length === 0;
  const selectedCardsLegalSoFar = structuralLegal;
  const completeDeckLegal =
    structuralLegal &&
    args.selectedCards.length === COMMANDER_DECK_LIBRARY_SIZE_V47 &&
    total === COMMANDER_DECK_TOTAL_CARDS_V47;
  const finalDeckLegal = completeDeckLegal;

  const gate: LegalityGateResultV47 = {
    pass: completeDeckLegal,
    totalCards: total,
    expectedTotal: expected.totalCards,
    libraryCards: args.selectedCards.length,
    expectedLibrary: expected.libraryCards,
    commandZoneCards: 1,
    colorIdentityPass,
    singletonPass: singleton.pass,
    unresolvedIdentities: unresolved,
    failures,
  };

  return {
    version: PROFESSOR_CANONICAL_LEGALITY_V4_16_1_V1_VERSION,
    selectedCardsLegalSoFar,
    completeDeckLegal,
    finalDeckLegal,
    gradeEligible: completeDeckLegal,
    draftReadyEligible: completeDeckLegal,
    effectiveBracketEvaluable: selectedCardsLegalSoFar,
    libraryCardCount: args.selectedCards.length,
    expectedLibraryCards: expected.libraryCards,
    duplicateNonBasics: singleton.duplicateNonBasics,
    failures,
    gate,
  };
}

export function applyCanonicalLegalityToCouncilStateV4161<T extends { selectedCards: CouncilCardLikeV4161[] }>(
  state: T,
  args: { commanderName: string; catalog?: DeckResolutionCatalog | null; requireFullLibrary?: boolean },
): T & { legalityGate: LegalityGateResultV47; canonicalLegalityV4161: CanonicalLegalityAssessmentV4161 } {
  const assessment = assessCanonicalDeckLegalityV4161({
    selectedCards: state.selectedCards,
    commanderName: args.commanderName,
    catalog: args.catalog,
    requireFullLibrary: args.requireFullLibrary,
  });
  return {
    ...state,
    legalityGate: assessment.gate,
    canonicalLegalityV4161: assessment,
  };
}

/** Match keys already present in working deck (for pool filtering). */
export function selectedCanonicalMatchKeysV4161(
  selected: CouncilCardLikeV4161[],
  catalog?: DeckResolutionCatalog | null,
): Set<string> {
  const keys = new Set<string>();
  for (const card of selected) {
    if (isBasicLandName(card.name)) continue;
    const identity = resolveCanonicalCardIdentity({
      name: card.name,
      oracleId: card.oracleId,
      catalog: catalog ?? undefined,
    });
    keys.add(identity.matchKey);
    keys.add(`name:${normalizeCardNameForMatch(identity.canonicalName)}`);
  }
  return keys;
}

export function candidatePassesSingletonPrefilterV4161(args: {
  candidate: CouncilCardLikeV4161;
  selected: CouncilCardLikeV4161[];
  catalog?: DeckResolutionCatalog | null;
}): boolean {
  return isCardAvailableForSingletonAddV4161(args).available;
}
