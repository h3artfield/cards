/**
 * Professor v4.17 Slice 5.3 — adaptive full-corpus retrieval, candidate pools, supply tracing.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText, type GoldenCatalogOracleCard } from "../../../scripts/lib/load-golden-catalog-index";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import type { BrewRequirementV417, RequirementFunctionV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { RequirementCandidateEvaluationV417, RequirementCandidateInputV417 } from "./professor-requirement-candidate-v4-17-v1";
import { evaluateFunctionalMatch } from "./functional-match-v1";

export const PROFESSOR_REQUIREMENT_ADAPTIVE_RETRIEVAL_V4_17_V1_VERSION =
  "professor-requirement-adaptive-retrieval-v4-17-v1";

export type ObjectiveTypeV417 =
  | "FUNCTIONAL_REQUIREMENT"
  | "FUNCTIONAL_DENSITY"
  | "PACKAGE_DENSITY"
  | "FLEX";

export type RetrievalTierV417 =
  | "TIER_1_CACHED_SEEDS"
  | "TIER_2_FUNCTION_POOL"
  | "TIER_3_GOLDEN_PREDICATE"
  | "TIER_4_FUNCTION_UNION_CORPUS"
  | "TIER_5_FULL_LEGAL_CORPUS";

export type TailTerminalReasonV417 =
  | "NO_SEMANTIC_MATCH"
  | "NO_LEGAL_MATCH"
  | "QUALITY_FLOOR"
  | "NO_POSITIVE_MARGINAL_UTILITY"
  | "ALL_MATCHES_ALREADY_SELECTED"
  | "TRUE_SEARCH_SPACE_EXHAUSTION";

export type CandidateSupplyTraceV417 = {
  objectiveId: string;
  objectiveType: ObjectiveTypeV417;
  legalCorpusSize: number;
  retrievalSourcesAttempted: RetrievalTierV417[];
  retrievedUnique: number;
  alreadySelected: number;
  canonicalLegal: number;
  semanticEligible: number;
  hardConstraintPassed: number;
  bracketQualityPassed: number;
  positiveBlueprintDelta: number;
  selectedCount: number;
  rejectionBreakdown: Record<string, number>;
  searchSpaceExhausted: boolean;
  tiers: Array<{ tier: RetrievalTierV417; newIds: number; cumulativeUnique: number }>;
};

export type TailObjectiveExhaustionV417 = {
  objectiveId: string;
  objectiveType: ObjectiveTypeV417;
  fullCorpusAttempted: boolean;
  legalCorpusCovered: number;
  uniqueCandidatesEvaluated: number;
  semanticEligible: number;
  qualityPassed: number;
  positiveUtility: number;
  terminalReason: TailTerminalReasonV417;
  supplyTrace: CandidateSupplyTraceV417;
  densityChallenge?: {
    budgetId: string;
    category: string;
    requestedMinimum: number;
    viableAtQualityFloor: number;
    proposedMinimum: number;
    proposedPreferred: number;
  };
};

export type FunctionalCandidatePoolV417 = {
  functionKey: string;
  colorIdentity: string[];
  hardConstraintFingerprint: string;
  oracleIds: string[];
  sourceCoverage: RetrievalTierV417[];
};

export type AdaptiveRetrievalBuildContextV417 = {
  pools: Map<string, FunctionalCandidatePoolV417>;
  lastSupplyTrace: CandidateSupplyTraceV417 | null;
  lastTailExhaustion: TailObjectiveExhaustionV417 | null;
  tailExhaustions: TailObjectiveExhaustionV417[];
};

export function createAdaptiveRetrievalBuildContextV417(): AdaptiveRetrievalBuildContextV417 {
  return { pools: new Map(), lastSupplyTrace: null, lastTailExhaustion: null, tailExhaustions: [] };
}

function isBasicLand(typeLine: string): boolean {
  return /\bBasic\b.*\bLand\b/i.test(typeLine);
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function poolKey(functions: RequirementFunctionV417[], colorIdentity: string[]): string {
  return `${[...colorIdentity].sort().join("")}::${[...functions].sort().join(",")}`;
}

export function buildLegalCommanderCorpusV417(args: {
  catalog: DeckResolutionCatalog;
  commanderColorIdentity: string[];
}): GoldenCatalogOracleCard[] {
  const cards: GoldenCatalogOracleCard[] = [];
  for (const card of args.catalog.byOracleId.values()) {
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!commanderLegalInIdentity(card.colorIdentity ?? card.colors ?? [], args.commanderColorIdentity)) continue;
    if (isBasicLand(card.typeLine ?? "")) continue;
    cards.push(card);
  }
  cards.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  return cards;
}

function cardToInput(card: GoldenCatalogOracleCard): RequirementCandidateInputV417 {
  return {
    oracleId: card.oracleId,
    name: card.canonicalName,
    oracleText: combinedGoldenOracleText(card),
    typeLine: card.typeLine ?? "",
    manaValue: card.manaValue ?? card.cmc ?? null,
    colors: card.colors ?? [],
  };
}

function rotateCorpus(corpus: GoldenCatalogOracleCard[], objectiveId: string): GoldenCatalogOracleCard[] {
  if (corpus.length === 0) return corpus;
  const offset = hashString(objectiveId) % corpus.length;
  return [...corpus.slice(offset), ...corpus.slice(0, offset)];
}

export function adaptiveRetrieveCandidateInputsV417(args: {
  catalog: DeckResolutionCatalog;
  commanderColorIdentity: string[];
  objectiveId: string;
  objectiveType: ObjectiveTypeV417;
  functionalMatchToken: string;
  functionalMatchTokens?: string[];
  probeFunctions: RequirementFunctionV417[];
  researchSeeds?: string[];
  excludeOracleIds: Set<string>;
  alreadyContributingIds?: Set<string>;
  boundedScan?: number;
  boundedEvaluate?: number;
  buildContext?: AdaptiveRetrievalBuildContextV417;
  /** When false, stop after tier 3 unless tier 3 finds zero semantic matches. */
  requireFullCorpus?: boolean;
}): { inputs: RequirementCandidateInputV417[]; trace: CandidateSupplyTraceV417 } {
  const legalCorpus = buildLegalCommanderCorpusV417({
    catalog: args.catalog,
    commanderColorIdentity: args.commanderColorIdentity,
  });
  const boundedScan = args.boundedScan ?? 12000;
  const boundedEvaluate = args.boundedEvaluate ?? 400;
  const seen = new Set<string>();
  const tiers: CandidateSupplyTraceV417["tiers"] = [];
  const sourcesAttempted: RetrievalTierV417[] = [];
  const rejectionBreakdown: Record<string, number> = {};
  const fnKey = poolKey(args.probeFunctions, args.commanderColorIdentity);
  const ctx = args.buildContext ?? createAdaptiveRetrievalBuildContextV417();

  const addTier = (tier: RetrievalTierV417, ids: string[]) => {
    const before = seen.size;
    for (const id of ids) seen.add(id);
    const newIds = seen.size - before;
    if (newIds > 0 || !sourcesAttempted.includes(tier)) {
      tiers.push({ tier, newIds, cumulativeUnique: seen.size });
    }
    if (!sourcesAttempted.includes(tier)) sourcesAttempted.push(tier);
  };

  const matchTokens = args.functionalMatchTokens?.length
    ? args.functionalMatchTokens
    : [args.functionalMatchToken];

  const prefilterIds = (oracleIds: string[]): string[] => {
    const matched: string[] = [];
    for (const oracleId of oracleIds) {
      if (args.excludeOracleIds.has(oracleId)) {
        rejectionBreakdown.ALREADY_SELECTED = (rejectionBreakdown.ALREADY_SELECTED ?? 0) + 1;
        continue;
      }
      if (args.alreadyContributingIds?.has(oracleId)) {
        rejectionBreakdown.ALREADY_CONTRIBUTING = (rejectionBreakdown.ALREADY_CONTRIBUTING ?? 0) + 1;
        continue;
      }
      const card = args.catalog.byOracleId.get(oracleId);
      if (!card) continue;
      const oracleText = combinedGoldenOracleText(card);
      const typeLine = card.typeLine ?? "";
      let passes = false;
      for (const token of matchTokens) {
        const quick = evaluateFunctionalMatch({
          requirementId: args.objectiveId,
          requirementToken: token,
          candidateOracleId: oracleId,
          oracleText,
          typeLine,
        });
        if (quick.matchType !== "NONE" && quick.matchType !== "ADJACENT") {
          passes = true;
          break;
        }
      }
      if (!passes) {
        rejectionBreakdown.SEMANTIC_PREFILTER_REJECT = (rejectionBreakdown.SEMANTIC_PREFILTER_REJECT ?? 0) + 1;
        continue;
      }
      matched.push(oracleId);
    }
    return matched;
  };

  // TIER 1 — cached seeds / research seeds
  const tier1Ids: string[] = [];
  for (const seed of args.researchSeeds ?? []) {
    if (args.catalog.byOracleId.has(seed)) tier1Ids.push(seed);
  }
  for (const fn of args.probeFunctions) {
    const cached = ctx.pools.get(`${fnKey.split("::")[0]}::${fn}`);
    if (cached) tier1Ids.push(...cached.oracleIds.slice(0, 64));
  }
  addTier("TIER_1_CACHED_SEEDS", prefilterIds([...new Set(tier1Ids)]));

  // TIER 2 — function pool cache (partial from prior builds)
  const tier2Ids = ctx.pools.get(fnKey)?.oracleIds ?? [];
  addTier("TIER_2_FUNCTION_POOL", prefilterIds(tier2Ids.filter((id) => !seen.has(id))));

  // TIER 3 — bounded golden predicate scan with objective-specific rotation
  const rotated = rotateCorpus(legalCorpus, args.objectiveId);
  const tier3Prefilter: string[] = [];
  let scanned = 0;
  for (const card of rotated) {
    if (scanned >= boundedScan) break;
    scanned++;
    if (seen.has(card.oracleId)) continue;
    const matched = prefilterIds([card.oracleId]);
    if (matched.length > 0) tier3Prefilter.push(matched[0]!);
    if (tier3Prefilter.length >= boundedEvaluate) break;
  }
  addTier("TIER_3_GOLDEN_PREDICATE", tier3Prefilter);

  const needFullCorpus = args.requireFullCorpus === true || tier3Prefilter.length === 0;

  if (needFullCorpus) {
    // TIER 4 — function union across entire legal corpus
    const tier4Prefilter: string[] = [];
    for (const card of legalCorpus) {
      if (seen.has(card.oracleId)) continue;
      const matched = prefilterIds([card.oracleId]);
      if (matched.length > 0) tier4Prefilter.push(matched[0]!);
    }
    addTier("TIER_4_FUNCTION_UNION_CORPUS", tier4Prefilter);

    // TIER 5 — full legal corpus fallback coverage proof
    addTier("TIER_5_FULL_LEGAL_CORPUS", legalCorpus.map((c) => c.oracleId).filter((id) => seen.has(id)));
  }

  const poolIds = [...seen];
  ctx.pools.set(fnKey, {
    functionKey: fnKey,
    colorIdentity: [...args.commanderColorIdentity],
    hardConstraintFingerprint: "legal_in_color_identity",
    oracleIds: poolIds,
    sourceCoverage: sourcesAttempted,
  });

  const inputs = poolIds
    .map((id) => args.catalog.byOracleId.get(id))
    .filter((c): c is GoldenCatalogOracleCard => c != null)
    .map(cardToInput);

  const trace: CandidateSupplyTraceV417 = {
    objectiveId: args.objectiveId,
    objectiveType: args.objectiveType,
    legalCorpusSize: legalCorpus.length,
    retrievalSourcesAttempted: sourcesAttempted,
    retrievedUnique: seen.size,
    alreadySelected: args.excludeOracleIds.size,
    canonicalLegal: 0,
    semanticEligible: 0,
    hardConstraintPassed: 0,
    bracketQualityPassed: 0,
    positiveBlueprintDelta: 0,
    selectedCount: 0,
    rejectionBreakdown,
    searchSpaceExhausted: sourcesAttempted.includes("TIER_5_FULL_LEGAL_CORPUS"),
    tiers,
  };

  ctx.lastSupplyTrace = trace;
  return { inputs, trace };
}

export function evaluateRetrievedCandidateFunnelV417(args: {
  trace: CandidateSupplyTraceV417;
  evaluations: RequirementCandidateEvaluationV417[];
  minQualityScore: number;
  utilityByOracleId?: Map<string, number>;
  selectedOracleId?: string | null;
}): CandidateSupplyTraceV417 {
  const rejectionBreakdown = { ...args.trace.rejectionBreakdown };
  let canonicalLegal = 0;
  let semanticEligible = 0;
  let hardConstraintPassed = 0;
  let bracketQualityPassed = 0;
  let positiveBlueprintDelta = 0;

  for (const ev of args.evaluations) {
    canonicalLegal++;
    if (!ev.requirementEligible) {
      const reason = ev.rejectionReason ?? "SEMANTIC_INELIGIBLE";
      rejectionBreakdown[reason] = (rejectionBreakdown[reason] ?? 0) + 1;
      continue;
    }
    semanticEligible++;
    hardConstraintPassed++;
    if (ev.finalRequirementScore < args.minQualityScore) {
      rejectionBreakdown.BELOW_QUALITY = (rejectionBreakdown.BELOW_QUALITY ?? 0) + 1;
      continue;
    }
    bracketQualityPassed++;
    const utility = args.utilityByOracleId?.get(ev.oracleId) ?? 0;
    if (utility <= 0) {
      rejectionBreakdown.NO_POSITIVE_UTILITY = (rejectionBreakdown.NO_POSITIVE_UTILITY ?? 0) + 1;
      continue;
    }
    positiveBlueprintDelta++;
  }

  return {
    ...args.trace,
    canonicalLegal,
    semanticEligible,
    hardConstraintPassed,
    bracketQualityPassed,
    positiveBlueprintDelta,
    selectedCount: args.selectedOracleId ? 1 : 0,
    rejectionBreakdown,
  };
}

export function diagnoseTailObjectiveExhaustionV417(args: {
  trace: CandidateSupplyTraceV417;
  requirement?: BrewRequirementV417;
  densityState?: { budgetId: string; category: string; minimum: number; remainingMinimumDeficit: number };
  minQualityScore: number;
}): TailObjectiveExhaustionV417 {
  const { trace } = args;
  let terminalReason: TailTerminalReasonV417 = "TRUE_SEARCH_SPACE_EXHAUSTION";

  if (trace.legalCorpusSize === 0) {
    terminalReason = "NO_LEGAL_MATCH";
  } else   if (trace.semanticEligible === 0) {
    terminalReason = trace.searchSpaceExhausted ? "NO_SEMANTIC_MATCH" : "NO_SEMANTIC_MATCH";
  } else if (!trace.searchSpaceExhausted && trace.positiveBlueprintDelta === 0 && trace.bracketQualityPassed === 0) {
    terminalReason = "QUALITY_FLOOR";
  } else if (trace.bracketQualityPassed === 0 && trace.semanticEligible > 0) {
    terminalReason = "QUALITY_FLOOR";
  } else if (!trace.searchSpaceExhausted) {
    terminalReason = "NO_POSITIVE_MARGINAL_UTILITY";
  } else if (trace.positiveBlueprintDelta === 0 && trace.bracketQualityPassed > 0) {
    terminalReason = "NO_POSITIVE_MARGINAL_UTILITY";
  } else if (
    trace.positiveBlueprintDelta === 0 &&
    (trace.rejectionBreakdown.ALREADY_SELECTED ?? 0) + (trace.rejectionBreakdown.ALREADY_CONTRIBUTING ?? 0) >= trace.semanticEligible
  ) {
    terminalReason = "ALL_MATCHES_ALREADY_SELECTED";
  }

  const exhaustion: TailObjectiveExhaustionV417 = {
    objectiveId: trace.objectiveId,
    objectiveType: trace.objectiveType,
    fullCorpusAttempted: trace.searchSpaceExhausted,
    legalCorpusCovered: trace.legalCorpusSize,
    uniqueCandidatesEvaluated: trace.canonicalLegal,
    semanticEligible: trace.semanticEligible,
    qualityPassed: trace.bracketQualityPassed,
    positiveUtility: trace.positiveBlueprintDelta,
    terminalReason,
    supplyTrace: trace,
  };

  if (
    args.densityState &&
    trace.searchSpaceExhausted &&
    terminalReason === "QUALITY_FLOOR" &&
    trace.bracketQualityPassed < args.densityState.remainingMinimumDeficit &&
    args.densityState.category.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() !== "tutorsandaccess"
  ) {
    exhaustion.densityChallenge = {
      budgetId: args.densityState.budgetId,
      category: args.densityState.category,
      requestedMinimum: args.densityState.minimum,
      viableAtQualityFloor: trace.bracketQualityPassed,
      proposedMinimum: trace.bracketQualityPassed,
      proposedPreferred: Math.min(args.densityState.minimum, trace.bracketQualityPassed + 2),
    };
  }

  return exhaustion;
}

export function objectiveTypeForRequirement(req: BrewRequirementV417): ObjectiveTypeV417 {
  if (req.requirementId.startsWith("flex-")) return "FLEX";
  if (req.family === "FUNCTIONAL_DENSITY" || req.requirementId.startsWith("fd-")) return "FUNCTIONAL_DENSITY";
  if (req.family === "PACKAGE_DENSITY" || req.requirementId.startsWith("pkg-density-")) return "PACKAGE_DENSITY";
  return "FUNCTIONAL_REQUIREMENT";
}
