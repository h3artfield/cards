/**
 * Deterministic validator for v1.1 constructed decks (land copies supported).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import { isCanonicalLandForDeckPartition } from "./professor-canonical-deck-partition-v1";
import { basicLandColorIdentity } from "./professor-basic-land-name-v1";
import { isBasicLandName, evaluateSingletonPool } from "./professor-commander-legality-v4-9-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import type { SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";
import type { SolDirectedValidationV1 } from "./professor-sol-directed-types-v1";
import type { RetrievalContractV11 } from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_VALIDATOR_V1_1_VERSION = "professor-sol-directed-validator-v1-1";

export function validateSolDirectedDeckV11(args: {
  deck: SolDirectedConstructedDeckV11;
  catalog: DeckResolutionCatalog;
  contract: RetrievalContractV11;
  prohibitedOracleIds?: string[];
}): SolDirectedValidationV1 {
  const violations: string[] = [];
  const prohibited = new Set(args.prohibitedOracleIds ?? []);
  const resolvedNonlands: Array<{ name: string; oracleText: string; manaValue: number | null }> = [];

  for (const card of args.deck.nonlands) {
    const truth = resolveCanonicalCardTruthV4164({
      name: card.name,
      oracleId: card.oracleId || undefined,
      catalog: args.catalog,
    });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) {
      violations.push(`UNRESOLVED_NONLAND:${card.name}`);
      continue;
    }
    if (prohibited.has(truth.oracleId!)) violations.push(`GUARDRAIL_PROHIBITED:${card.name}`);
    if (isCanonicalLandForDeckPartition(truth)) violations.push(`LAND_IN_NONLANDS:${card.name}`);
    if (!isCurrentlyCommanderLegal(args.catalog.byOracleId.get(truth.oracleId!)!)) {
      violations.push(`ILLEGAL:${card.name}`);
    }
    if (!commanderLegalInIdentity(truth.colorIdentity, args.deck.commander.colorIdentity)) {
      violations.push(`OFF_COLOR:${card.name}`);
    }
    if (!card.primaryArchitectRequirement?.trim()) {
      violations.push(`MISSING_PRIMARY_REQUIREMENT:${card.name}`);
    }
    resolvedNonlands.push({ name: truth.name, oracleText: truth.oracleText, manaValue: truth.manaValue });
  }

  const landNamesExpanded: string[] = [];
  for (const land of args.deck.lands) {
    const truth = resolveCanonicalCardTruthV4164({ name: land.name, catalog: args.catalog });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) {
      violations.push(`UNRESOLVED_LAND:${land.name}`);
      continue;
    }
    if (!isCanonicalLandForDeckPartition(truth)) violations.push(`NONLAND_IN_LANDS:${land.name}`);
    if (prohibited.has(truth.oracleId!)) violations.push(`GUARDRAIL_LAND:${land.name}`);
    // A basic's printed color identity is unreliable in the catalog, so derive it
    // from the name the same way the v1.1.1 gate does.
    const landColorIdentity = isBasicLandName(truth.name)
      ? basicLandColorIdentity(truth.name)
      : truth.colorIdentity;
    if (!commanderLegalInIdentity(landColorIdentity, args.deck.commander.colorIdentity)) {
      violations.push(`OFF_COLOR_LAND:${land.name}`);
    }
    if (!isBasicLandName(truth.name) && land.copies > 1) {
      violations.push(`NONBASIC_DUPLICATE:${land.name}x${land.copies}`);
    }
    for (let i = 0; i < land.copies; i += 1) landNamesExpanded.push(truth.name);
  }

  const libraryCount = resolvedNonlands.length + landNamesExpanded.length;
  if (libraryCount !== COMMANDER_DECK_LIBRARY_SIZE_V47) {
    violations.push(`LIBRARY_COUNT:${libraryCount}!=${COMMANDER_DECK_LIBRARY_SIZE_V47}`);
  }
  const landCount = landNamesExpanded.length;
  if (landCount !== args.contract.landSlotsRequired) {
    violations.push(`LAND_COUNT:${landCount}!=${args.contract.landSlotsRequired}`);
  }

  const singleton = evaluateSingletonPool([
    ...resolvedNonlands.map((c) => c.name),
    ...landNamesExpanded.filter((n) => !isBasicLandName(n)),
  ]);
  if (!singleton.pass) violations.push(`DUPLICATES:${singleton.duplicateNonBasics.join(",")}`);

  const hay = (t: string) => t.toLowerCase();
  const auditCounts = {
    ramp: resolvedNonlands.filter((c) => /\badd \{/.test(hay(c.oracleText))).length,
    draw: resolvedNonlands.filter((c) => /draw (a|one|two|three|\d+) card|draws .* card/.test(hay(c.oracleText))).length,
    interaction: resolvedNonlands.filter((c) => /destroy target|exile target|counter target/.test(hay(c.oracleText))).length,
    protection: resolvedNonlands.filter((c) => /hexproof|indestructible|protection from/.test(hay(c.oracleText))).length,
    tutorsAccess: resolvedNonlands.filter((c) => /search your library/.test(hay(c.oracleText))).length,
    averageMv:
      resolvedNonlands.length > 0
        ? resolvedNonlands.reduce((s, c) => s + (c.manaValue ?? 0), 0) / resolvedNonlands.length
        : 0,
  };

  return {
    pass: violations.length === 0,
    libraryCount,
    landCount,
    nonlandCount: resolvedNonlands.length,
    violations,
    auditCounts,
  };
}
