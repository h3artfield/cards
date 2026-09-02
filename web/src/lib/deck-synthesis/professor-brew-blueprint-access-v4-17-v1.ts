/**
 * Professor v4.17 Slice 5.4 — relational access portfolio (not generic ACCESS density).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
  type CanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import {
  parseAccessMechanism,
  targetMatchesRestriction,
  type AccessDestinationV4164,
  type AccessTargetKindV4164,
  type AccessTargetV4164,
  type VerifiedAccessRouteV4164,
} from "./professor-verified-access-route-v4-16-4-v1";
import type { BrewBlueprintV417, RequirementFunctionV417 } from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_BREW_BLUEPRINT_ACCESS_V4_17_V1_VERSION = "professor-brew-blueprint-access-v4-17-v1";

export type AccessTargetV417 = AccessTargetV4164;
export type VerifiedAccessRouteV417 = VerifiedAccessRouteV4164;

export type AccessToolV417 = {
  oracleId: string;
  name: string;
  restriction: string;
  destination: AccessDestinationV4164;
  directness: VerifiedAccessRouteV4164["directness"];
  verifiedRoutes: VerifiedAccessRouteV417[];
  targetClassesReached: string[];
};

export type AccessToolRejectionV417 = {
  oracleId: string;
  name: string;
  reason:
    | "NOT_LEGAL"
    | "ORACLE_NOT_VERIFIED"
    | "NO_ACCESS_MECHANISM"
    | "IMPRECISE_ACCESS"
    | "NO_RELEVANT_TARGET"
    | "ALREADY_CONTRIBUTING";
  detail: string;
};

export type AccessPortfolioStateV417 = {
  version: typeof PROFESSOR_BREW_BLUEPRINT_ACCESS_V4_17_V1_VERSION;
  criticalTargets: AccessTargetV417[];
  accessTools: AccessToolV417[];
  verifiedRoutes: VerifiedAccessRouteV417[];
  targetClassesCovered: string[];
  targetClassesUncovered: string[];
  distinctAccessTools: number;
  routeCount: number;
  engineCoverage: number;
  winCoverage: number;
  protectionCoverage: number;
  minimumToolTarget?: number;
  preferredToolTarget?: number;
  status: "NOT_READY" | "BELOW_MINIMUM" | "MINIMUM_SATISFIED" | "PREFERRED_SATISFIED";
  rejectedTools: AccessToolRejectionV417[];
};

const ENGINE_FUNCTIONS = new Set<RequirementFunctionV417>([
  "ENGINE",
  "ENGINE_ENABLER",
  "ENGINE_PAYOFF",
  "GRAVEYARD_ENABLER",
  "RESOURCE_PRODUCTION",
  "RESOURCE_CONSUMER",
]);
const WIN_FUNCTIONS = new Set<RequirementFunctionV417>(["WIN_COMPONENT", "WIN_SUPPORT"]);
const PROTECTION_FUNCTIONS = new Set<RequirementFunctionV417>(["PROTECTION", "RECOVERY"]);

function targetClassLabel(target: AccessTargetV417): string {
  const types = target.cardTypes.length ? target.cardTypes.join("/") : "unknown";
  return `${target.kind}:${types}${target.manaValue != null ? `:mv${target.manaValue}` : ""}`;
}

function kindForFunctions(fns: RequirementFunctionV417[]): AccessTargetKindV4164 {
  if (fns.some((f) => WIN_FUNCTIONS.has(f))) return "PRIMARY_WIN";
  if (fns.some((f) => PROTECTION_FUNCTIONS.has(f))) return "PROTECTION";
  if (fns.some((f) => ENGINE_FUNCTIONS.has(f))) return "CRITICAL_ENGINE";
  return "CRITICAL_ENGINE";
}

function cardToTarget(
  card: { oracleId: string; name: string; satisfiedFunctions: RequirementFunctionV417[] },
  catalog: DeckResolutionCatalog | null,
  kindOverride?: AccessTargetKindV4164,
): AccessTargetV417 | null {
  const truth = resolveCanonicalCardTruthV4164({
    name: card.name,
    oracleId: card.oracleId,
    catalog,
  });
  if (!cardTruthAllowsIntelligenceParticipation(truth)) return null;
  return {
    name: truth.name,
    oracleId: truth.oracleId,
    kind: kindOverride ?? kindForFunctions(card.satisfiedFunctions),
    manaValue: truth.manaValue,
    cardTypes: truth.cardTypes,
  };
}

export function deriveCriticalAccessTargetsV417(
  blueprint: BrewBlueprintV417,
  catalog: DeckResolutionCatalog | null,
): AccessTargetV417[] {
  const byId = new Map<string, AccessTargetV417>();

  for (const card of blueprint.selectedCards) {
    const relevant =
      card.satisfiedFunctions.some((f) => ENGINE_FUNCTIONS.has(f)) ||
      card.satisfiedFunctions.some((f) => WIN_FUNCTIONS.has(f)) ||
      card.satisfiedFunctions.some((f) => PROTECTION_FUNCTIONS.has(f));
    if (!relevant) continue;
    const target = cardToTarget(card, catalog);
    if (target?.oracleId) byId.set(target.oracleId, target);
  }

  for (const pkg of blueprint.packages) {
    if (!pkg.core) continue;
    for (const oracleId of pkg.selectedCardIds) {
      const selected = blueprint.selectedCards.find((c) => c.oracleId === oracleId);
      if (selected) {
        const target = cardToTarget(selected, catalog, "CRITICAL_ENGINE");
        if (target?.oracleId) byId.set(target.oracleId, target);
      }
    }
  }

  for (const win of blueprint.winArchitecture) {
    for (const name of win.requiredCardsOrEquivalents) {
      const selected = blueprint.selectedCards.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (selected) {
        const target = cardToTarget(selected, catalog, "PRIMARY_WIN");
        if (target?.oracleId) byId.set(target.oracleId, target);
      }
    }
  }

  if (byId.size === 0) {
    for (const card of blueprint.selectedCards.slice(0, 8)) {
      const target = cardToTarget(card, catalog);
      if (target?.oracleId) byId.set(target.oracleId, target);
    }
  }

  return [...byId.values()];
}

function buildVerifiedRoutesForTool(args: {
  sourceTruth: CanonicalCardTruthV4164;
  mechanism: NonNullable<ReturnType<typeof parseAccessMechanism>>;
  targets: AccessTargetV417[];
  catalog: DeckResolutionCatalog | null;
}): VerifiedAccessRouteV417[] {
  const routes: VerifiedAccessRouteV417[] = [];
  for (const target of args.targets) {
    const targetTruth = resolveCanonicalCardTruthV4164({
      name: target.name,
      oracleId: target.oracleId,
      catalog: args.catalog,
    });
    if (!cardTruthAllowsIntelligenceParticipation(targetTruth)) continue;
    if (!targetMatchesRestriction(targetTruth, args.mechanism.restriction)) continue;
    routes.push({
      sourceOracleId: args.sourceTruth.oracleId!,
      sourceName: args.sourceTruth.name,
      targetOracleId: targetTruth.oracleId!,
      targetName: targetTruth.name,
      searchRestriction: args.mechanism.restriction,
      targetSatisfiesRestriction: true,
      destination: args.mechanism.destination,
      directness: args.mechanism.directness,
      activationRequirements: args.mechanism.activationRequirements,
      timingRestrictions: args.mechanism.timingRestrictions,
      repeatable: args.mechanism.repeatable,
      confidence: args.mechanism.confidence,
      verificationEvidence: args.mechanism.evidence,
    });
  }
  return routes;
}

export function evaluateAccessToolCandidateV417(args: {
  oracleId: string;
  name: string;
  oracleText: string;
  typeLine: string;
  commanderColorIdentity: string[];
  catalog: DeckResolutionCatalog | null;
  criticalTargets: AccessTargetV417[];
}): {
  qualifies: boolean;
  tool: AccessToolV417 | null;
  rejection: AccessToolRejectionV417 | null;
} {
  const card = args.catalog?.byOracleId.get(args.oracleId);
  if (card && !isCurrentlyCommanderLegal(card)) {
    return {
      qualifies: false,
      tool: null,
      rejection: { oracleId: args.oracleId, name: args.name, reason: "NOT_LEGAL", detail: "Not commander legal" },
    };
  }
  if (
    card &&
    !commanderLegalInIdentity(card.colorIdentity ?? card.colors ?? [], args.commanderColorIdentity)
  ) {
    return {
      qualifies: false,
      tool: null,
      rejection: {
        oracleId: args.oracleId,
        name: args.name,
        reason: "NOT_LEGAL",
        detail: "Outside commander color identity",
      },
    };
  }

  const sourceTruth = resolveCanonicalCardTruthV4164({
    name: args.name,
    oracleId: args.oracleId,
    oracleText: args.oracleText,
    typeLine: args.typeLine,
    catalog: args.catalog,
  });
  if (!cardTruthAllowsIntelligenceParticipation(sourceTruth)) {
    return {
      qualifies: false,
      tool: null,
      rejection: {
        oracleId: args.oracleId,
        name: args.name,
        reason: "ORACLE_NOT_VERIFIED",
        detail: "Canonical oracle truth unavailable",
      },
    };
  }

  const mechanism = parseAccessMechanism(sourceTruth);
  if (!mechanism) {
    return {
      qualifies: false,
      tool: null,
      rejection: {
        oracleId: args.oracleId,
        name: args.name,
        reason: "NO_ACCESS_MECHANISM",
        detail: "No verified library search / tutor mechanism",
      },
    };
  }
  if (mechanism.directness === "CARD_SELECTION" || mechanism.directness === "DRAW_ACCESS") {
    return {
      qualifies: false,
      tool: null,
      rejection: {
        oracleId: args.oracleId,
        name: args.name,
        reason: "IMPRECISE_ACCESS",
        detail: `Imprecise access (${mechanism.directness})`,
      },
    };
  }

  const verifiedRoutes = buildVerifiedRoutesForTool({
    sourceTruth,
    mechanism,
    targets: args.criticalTargets,
    catalog: args.catalog,
  });
  if (verifiedRoutes.length === 0) {
    return {
      qualifies: false,
      tool: null,
      rejection: {
        oracleId: args.oracleId,
        name: args.name,
        reason: "NO_RELEVANT_TARGET",
        detail: `Restriction "${mechanism.restriction}" reaches no critical target class`,
      },
    };
  }

  const targetClassesReached = [
    ...new Set(
      verifiedRoutes.map((r) => {
        const target = args.criticalTargets.find((t) => t.oracleId === r.targetOracleId || t.name === r.targetName);
        return target ? targetClassLabel(target) : r.searchRestriction;
      }),
    ),
  ];

  return {
    qualifies: true,
    tool: {
      oracleId: args.oracleId,
      name: args.name,
      restriction: mechanism.restriction,
      destination: mechanism.destination,
      directness: mechanism.directness,
      verifiedRoutes,
      targetClassesReached,
    },
    rejection: null,
  };
}

function countCoverage(targets: AccessTargetV417[], routes: VerifiedAccessRouteV417[]): number {
  if (targets.length === 0) return 0;
  let covered = 0;
  for (const target of targets) {
    if (
      routes.some(
        (route) =>
          route.targetSatisfiesRestriction &&
          (route.targetOracleId === target.oracleId || route.targetName === target.name),
      )
    ) {
      covered += 1;
    }
  }
  return covered;
}

export function resolveAccessPortfolioBudgetBoundsV417(blueprint: BrewBlueprintV417): {
  minimum: number;
  preferred: number;
} {
  for (const budget of blueprint.functionalBudgets) {
    const key = String(budget.category ?? budget.function ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (key === "tutorsandaccess") {
      const minimum = Number(budget.minimum ?? 6);
      const maximum = Number(budget.maximum ?? 8);
      return { minimum, preferred: Math.round((minimum + maximum) / 2) };
    }
  }
  return { minimum: 6, preferred: 7 };
}

export function buildAccessPortfolioStateV417(args: {
  blueprint: BrewBlueprintV417;
  catalog: DeckResolutionCatalog | null;
  candidateOracleIds?: string[];
}): AccessPortfolioStateV417 {
  const criticalTargets = deriveCriticalAccessTargetsV417(args.blueprint, args.catalog);
  const bounds = resolveAccessPortfolioBudgetBoundsV417(args.blueprint);
  const accessTools: AccessToolV417[] = [];
  const rejectedTools: AccessToolRejectionV417[] = [];
  const contributingIds = new Set<string>();

  for (const card of args.blueprint.selectedCards) {
    const cardMeta = args.catalog?.byOracleId.get(card.oracleId);
    const evaluation = evaluateAccessToolCandidateV417({
      oracleId: card.oracleId,
      name: card.name,
      oracleText: cardMeta ? combinedGoldenOracleText(cardMeta) : "",
      typeLine: cardMeta?.typeLine ?? "",
      commanderColorIdentity: args.blueprint.commander.colorIdentity,
      catalog: args.catalog,
      criticalTargets,
    });
    if (evaluation.qualifies && evaluation.tool) {
      accessTools.push(evaluation.tool);
      contributingIds.add(card.oracleId);
    }
  }

  if (args.candidateOracleIds) {
    for (const oracleId of args.candidateOracleIds) {
      if (contributingIds.has(oracleId)) continue;
      const card = args.catalog?.byOracleId.get(oracleId);
      if (!card) continue;
      const evaluation = evaluateAccessToolCandidateV417({
        oracleId,
        name: card.canonicalName,
        oracleText: combinedGoldenOracleText(card),
        typeLine: card.typeLine ?? "",
        commanderColorIdentity: args.blueprint.commander.colorIdentity,
        catalog: args.catalog,
        criticalTargets,
      });
      if (evaluation.rejection) rejectedTools.push(evaluation.rejection);
      if (evaluation.qualifies && evaluation.tool) accessTools.push(evaluation.tool);
    }
  }

  const verifiedRoutes = accessTools.flatMap((t) => t.verifiedRoutes);
  const engineTargets = criticalTargets.filter((t) => t.kind === "CRITICAL_ENGINE");
  const winTargets = criticalTargets.filter((t) => t.kind === "PRIMARY_WIN" || t.kind === "SECONDARY_WIN");
  const protectionTargets = criticalTargets.filter((t) => t.kind === "PROTECTION");

  const coveredClasses = new Set<string>();
  for (const route of verifiedRoutes) {
    const target = criticalTargets.find((t) => t.oracleId === route.targetOracleId || t.name === route.targetName);
    if (target) coveredClasses.add(targetClassLabel(target));
  }
  const allClasses = criticalTargets.map(targetClassLabel);
  const targetClassesCovered = [...coveredClasses];
  const targetClassesUncovered = allClasses.filter((c) => !coveredClasses.has(c));

  const distinctAccessTools = new Set(accessTools.map((t) => t.oracleId)).size;
  let status: AccessPortfolioStateV417["status"] = "NOT_READY";
  if (criticalTargets.length === 0) status = "NOT_READY";
  else if (distinctAccessTools < bounds.minimum) status = "BELOW_MINIMUM";
  else if (distinctAccessTools >= bounds.preferred) status = "PREFERRED_SATISFIED";
  else status = "MINIMUM_SATISFIED";

  return {
    version: PROFESSOR_BREW_BLUEPRINT_ACCESS_V4_17_V1_VERSION,
    criticalTargets,
    accessTools: accessTools.filter((t, i, arr) => arr.findIndex((x) => x.oracleId === t.oracleId) === i),
    verifiedRoutes,
    targetClassesCovered,
    targetClassesUncovered,
    distinctAccessTools,
    routeCount: verifiedRoutes.length,
    engineCoverage: countCoverage(engineTargets, verifiedRoutes),
    winCoverage: countCoverage(winTargets, verifiedRoutes),
    protectionCoverage: countCoverage(protectionTargets, verifiedRoutes),
    minimumToolTarget: bounds.minimum,
    preferredToolTarget: bounds.preferred,
    status,
    rejectedTools,
  };
}

export function isAccessPortfolioBudgetCategory(category: string): boolean {
  return category.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() === "tutorsandaccess";
}
