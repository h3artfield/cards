/**
 * Professor v4.16.5 — access architecture with theory realization readiness.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import {
  assessTheoryRealizationV4165,
  committedPackageTargets,
  unrealizedCorePackages,
  type TheoryRealizationV4165,
} from "./professor-theory-realization-v4-16-5-v1";
import {
  adaptAccessArchitectureV4164ToV4163,
  buildAccessArchitectureV4164,
  type AccessArchitectureV4164,
} from "./professor-verified-access-route-v4-16-4-v1";
import { normalizeCardNameForMatch } from "./professor-canonical-card-identity-v4-15-1-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";

export const PROFESSOR_VERIFIED_ACCESS_ROUTE_V4_16_5_V1_VERSION = "professor-verified-access-route-v4-16-5-v1";

export type AccessReadinessStatusV4165 = "READY" | "THEORY_UNREALIZED" | "NOT_READY";

export type AccessArchitectureV4165 = AccessArchitectureV4164 & {
  accessReadiness: AccessReadinessStatusV4165;
  theoryRealizations: TheoryRealizationV4165[];
  unrealizedPackageCount: number;
};

function targetsFromRealizedPackages(args: {
  theoryRealizations: TheoryRealizationV4165[];
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog | null;
}) {
  const selectedByName = new Map(args.selectedCards.map((c) => [normalizeCardNameForMatch(c.name), c]));
  const targetNames = committedPackageTargets(args.theoryRealizations);
  const criticalEngine: AccessArchitectureV4165["criticalEnginePieces"] = [];
  for (const name of targetNames) {
    const card = selectedByName.get(normalizeCardNameForMatch(name));
    if (!card) continue;
    const truth = resolveCanonicalCardTruthV4164({ name: card.name, oracleId: card.oracleId, catalog: args.catalog });
    if (cardTruthAllowsIntelligenceParticipation(truth)) {
      criticalEngine.push({
        name: truth.name,
        oracleId: truth.oracleId,
        kind: "CRITICAL_ENGINE",
        manaValue: truth.manaValue,
        cardTypes: truth.cardTypes,
      });
    }
  }
  return criticalEngine;
}

export function buildAccessArchitectureV4165(args: {
  selectedCards: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  theory?: WorkingDeckTheoryV4 | null;
  catalog?: DeckResolutionCatalog | null;
}): AccessArchitectureV4165 {
  const theoryRealizations = assessTheoryRealizationV4165({
    theory: args.theory ?? null,
    selectedCards: args.selectedCards,
  });
  const unrealized = unrealizedCorePackages(theoryRealizations);
  const base = buildAccessArchitectureV4164({
    selectedCards: args.selectedCards,
    charter: args.charter,
    theory: args.theory ?? null,
    catalog: args.catalog,
  });

  const realizedTargets = targetsFromRealizedPackages({
    theoryRealizations,
    selectedCards: args.selectedCards,
    catalog: args.catalog ?? null,
  });

  let accessReadiness: AccessReadinessStatusV4165 = "READY";
  if (unrealized.length > 0 && (args.charter?.requestedBracket ?? 0) >= 4) {
    accessReadiness = "THEORY_UNREALIZED";
  } else if (
    base.criticalEnginePieces.length === 0 &&
    base.primaryWinPieces.length === 0 &&
    realizedTargets.length === 0 &&
    (args.charter?.requestedBracket ?? 0) >= 4
  ) {
    accessReadiness = "NOT_READY";
  }

  const criticalEnginePieces = realizedTargets.length > 0 ? realizedTargets : base.criticalEnginePieces;
  const summary =
    accessReadiness === "THEORY_UNREALIZED"
      ? `Access NOT_READY — ${unrealized.length} CORE package(s) unrealized in deck`
      : accessReadiness === "NOT_READY"
        ? "Access NOT_READY — no realized critical/win targets for charter"
        : base.summary;

  return {
    ...base,
    version: PROFESSOR_VERIFIED_ACCESS_ROUTE_V4_16_5_V1_VERSION,
    criticalEnginePieces,
    accessReadiness,
    theoryRealizations,
    unrealizedPackageCount: unrealized.length,
    criticalAccessFailure: accessReadiness !== "READY" || base.criticalAccessFailure,
    summary,
  };
}

export function adaptAccessArchitectureV4165ToV4163(arch: AccessArchitectureV4165) {
  return adaptAccessArchitectureV4164ToV4163(arch);
}
