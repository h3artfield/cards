/**
 * Server-only bridge from a decklist to the combo facts the rubric needs.
 *
 * Reuses the compiled CommanderSpellbook detector table rather than a second
 * combo model, so the rubric and COS agree on what a combo is. Kept apart from
 * the pure rubric core because it reads artifacts from disk.
 */
import { architectureFromHits } from "@/lib/commander-optimization-score/v1/architecture-from-hits";
import { detectCompleteCombos } from "@/lib/commander-optimization-score/v1/detect";
import { loadSpellbookComboArtifacts } from "@/lib/commander-optimization-score/v1/load-artifacts";
import { loadComboBracketTagsV1 } from "./combo-bracket-tags";
import { comboSummaryFromArchitecture } from "./detectors";
import type { BracketRubricCard, BracketRubricComboSet, BracketRubricComboSummary } from "./types";

export async function comboSummaryForDeck(args: {
  cards: BracketRubricCard[];
}): Promise<BracketRubricComboSummary> {
  const { comboIndex, compiled } = await loadSpellbookComboArtifacts();
  const tags = loadComboBracketTagsV1();

  const deckOracleIds = new Set<string>();
  const commanderOracleIds = new Set<string>();
  for (const card of args.cards) {
    deckOracleIds.add(card.oracleId);
    if (card.isCommander) commanderOracleIds.add(card.oracleId);
  }

  const detected = detectCompleteCombos({ deckOracleIds, commanderOracleIds, compiled });
  const architecture = architectureFromHits(detected.hits, comboIndex, detected.nNativeVariants);
  const summary = comboSummaryFromArchitecture(architecture);

  const nameByOracleId = new Map(args.cards.map((card) => [card.oracleId, card.name] as const));
  const seen = new Set<string>();
  const comboSets: BracketRubricComboSet[] = [];
  for (const hit of detected.hits) {
    if (seen.has(hit.cardSetSignature)) continue;
    seen.add(hit.cardSetSignature);
    const row = comboIndex.get(hit.cardSetSignature);
    if (!row) continue;
    const tagRow = tags.get(hit.cardSetSignature);
    const nTemplates = tagRow?.nTemplates ?? row.nTemplates ?? 0;
    comboSets.push({
      cardCount: row.comboCardCount,
      cards: hit.cardSetSignature
        .split("|")
        .filter(Boolean)
        .map((oracleId) => ({ oracleId, name: nameByOracleId.get(oracleId) ?? oracleId })),
      winsOnResolution: row.isTerminalRoute,
      bracketTag: tagRow?.tag ?? null,
      requiresUnsatisfiedTemplate: nTemplates > 0,
    });
  }

  const live = comboSets.filter((set) => !set.requiresUnsatisfiedTemplate);
  return {
    ...summary,
    twoCardCombos: live.filter((set) => set.cardCount === 2).length,
    totalCombos: live.length,
    comboSets,
  };
}
