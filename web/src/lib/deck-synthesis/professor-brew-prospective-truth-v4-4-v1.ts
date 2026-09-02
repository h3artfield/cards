/**
 * Build dynamic mechanism-truth catalog entries from golden catalog oracle cards.
 * Used for arbitrary-commander live brew — not a production fixture gate.
 */
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { IndependentMechanismFact } from "./independent-truth-types-v1";
import {
  IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION,
  IMPLEMENTED_MECHANISM_TRUTH_SOURCE,
  type ImplementedMechanismCatalogEntry,
} from "../../../scripts/lib/phase6a1-implemented-mechanism-catalog-v1";
import { INDEPENDENT_TRUTH_LOADER_V1_VERSION } from "../../../scripts/lib/phase6a1-independent-truth-loader-v1";

export const PROFESSOR_BREW_PROSPECTIVE_TRUTH_V4_4_V1_VERSION = "professor-brew-prospective-truth-v4-4-v1";

function deriveOracleMechanismHints(card: GoldenCatalogOracleCard): IndependentMechanismFact[] {
  const oracle = (card.oracleText ?? "").trim();
  if (!oracle) return [];

  const facts: IndependentMechanismFact[] = [];
  const push = (mechanismId: string, mechanismType: string, evidenceSpan: string, extra: Record<string, unknown> = {}) => {
    facts.push({
      mechanismId,
      mechanismType,
      evidenceSpan,
      commander: card.canonicalName,
      ...extra,
    });
  };

  if (/whenever .+ dies/i.test(oracle)) {
    push("oracle-dies-trigger", "TRIGGERED_ABILITY", oracle.split("\n").find((l) => /whenever .+ dies/i.test(l)) ?? oracle);
  }
  if (/create .+ token/i.test(oracle)) {
    push("oracle-token-creation", "TRIGGERED_ABILITY", oracle.split("\n").find((l) => /create .+ token/i.test(l)) ?? oracle);
  }
  if (/from your graveyard|in your graveyard|graveyard to/i.test(oracle)) {
    push("oracle-graveyard", "STATIC_ABILITY", oracle.slice(0, 240));
  }
  if (/cast .+ from (?:your )?graveyard|cast .+ from exile/i.test(oracle)) {
    push("oracle-cast-from-zone", "PLAY_PERMISSION", oracle.slice(0, 240));
  }
  if (/\+1\/\+1 counter/i.test(oracle)) {
    push("oracle-counters", "TRIGGERED_ABILITY", oracle.slice(0, 240));
  }
  if (/draw a card|draw cards/i.test(oracle)) {
    push("oracle-draw", "TRIGGERED_ABILITY", oracle.slice(0, 240));
  }
  if (/sacrifice/i.test(oracle)) {
    push("oracle-sacrifice", "ACTIVATED_ABILITY", oracle.slice(0, 240));
  }

  return facts.slice(0, 8);
}

export function buildProspectiveMechanismCatalogEntry(args: {
  card: GoldenCatalogOracleCard;
  caseId?: string;
  bracket?: number;
}): ImplementedMechanismCatalogEntry {
  const colorIdentity = [...(args.card.colorIdentity ?? [])].sort();
  return {
    caseId: args.caseId ?? `live-${args.card.oracleId.slice(0, 12)}`,
    commanders: [args.card.canonicalName],
    commandZoneConfiguration: "single_commander",
    combinedColorIdentity: colorIdentity,
    bracket: args.bracket ?? 3,
    commanderOracleTexts: [
      {
        sourceOracleId: args.card.oracleId,
        name: args.card.canonicalName,
        oracleText: args.card.oracleText ?? "",
      },
    ],
    crossMemberRelationshipsAsSupplied: [],
    independentMechanismFacts: deriveOracleMechanismHints(args.card),
    factStatus: "INDEPENDENTLY_ADJUDICATED",
    implementationSource: IMPLEMENTED_MECHANISM_TRUTH_SOURCE,
    implementationVersion: IMPLEMENTED_MECHANISM_CATALOG_V1_VERSION,
    loaderVersion: INDEPENDENT_TRUTH_LOADER_V1_VERSION,
    adjudicationStatus: "FROZEN_DEV_TRUTH",
  };
}
