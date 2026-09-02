/**
 * Professor candidate discovery v4.7 — needs-driven catalog search, not Creative card inventory.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  isCompetitiveDeckOracle,
  isCurrentlyCommanderLegal,
  paperMetaForOracle,
  type DeckResolutionCatalog,
} from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText, lookupGoldenByName } from "../../../scripts/lib/load-golden-catalog-index";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { normalizeCardNameForMatch } from "./professor-canonical-card-identity-v4-15-1-v1";
import { isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import { resolveBenchmarkCommanderName } from "./benchmark-commander-resolver-v1";
import type { CouncilCardV46, CouncilCardOriginV46 } from "./professor-council-assembly-v4-6-v1";
import type { CouncilSpeakerV45 } from "./professor-council-state-v4-5-v1";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import {
  buildInitialDeckNeedsV47,
  deckNeedsToResearchQueries,
  decomposeCreativeConceptV47,
  deriveDeckNeedsFromSnapshotV47,
  looksLikeCardName,
  type DeckNeedV47,
  type ResearchCardQueryV47,
} from "./professor-deck-needs-v4-7-v1";
import {
  buildFunctionalCardProfileV47,
  type FunctionalCardProfileV47,
  type FunctionalRoleV47,
} from "./professor-functional-profile-v4-7-v1";
import { MINIMUM_CANDIDATE_BUFFER_V47 } from "./professor-deck-completion-v4-7-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { DeckSnapshotV46 } from "./professor-council-assembly-v4-6-v1";
import type { ProfessorDeckListEntryV43 } from "./professor-brew-deck-list-v4-3-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import {
  applyBracketToDeckNeedV410,
  buildSearchComparisonV410,
  scoreCandidateForBracketV410,
} from "./professor-bracket-candidate-scoring-v4-10-v1";

export const PROFESSOR_CANDIDATE_DISCOVERY_V4_7_V1_VERSION = "professor-candidate-discovery-v4-7-v1";

export type CandidateDiscoverySourceV47 = CouncilCardOriginV46 | "GOLDEN_CATALOG" | "ARTICLE_RAG";

export type CandidateSearchResultV47 = {
  resultId: string;
  queryId: string;
  needId: string;
  oracleId: string;
  name: string;
  origin: CandidateDiscoverySourceV47;
  score: number;
  profile: FunctionalCardProfileV47;
  reason: string;
  needFit: number;
  roleCompression: number;
  evidenceConfidence: number;
};

export type CandidatePoolByNeedV47 = Record<string, CouncilCardV46[]>;

export type CandidateDiscoveryReportV47 = {
  queries: ResearchCardQueryV47[];
  results: CandidateSearchResultV47[];
  candidates: CouncilCardV46[];
  candidatesByNeed: CandidatePoolByNeedV47;
  namedModelPriorCount: number;
  conceptDiscoveryCount: number;
  catalogScanCount: number;
  rejectedIllegal: number;
  rejectedDuplicate: number;
  searchComparisons?: import("./professor-bracket-candidate-scoring-v4-10-v1").BracketSearchComparisonV410[];
  bracketScoringApplied?: boolean;
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function inferCategory(typeLine: string): ProfessorDeckListEntryV43["category"] {
  const tl = typeLine.toLowerCase();
  if (/\bland\b/.test(tl) && !/\bcreature\b|\bartifact\b|\benchantment\b/.test(tl)) return "land";
  if (/\bartifact\b/.test(tl)) return "artifact";
  if (/\binstant\b/.test(tl)) return "instant";
  if (/\bsorcery\b/.test(tl)) return "sorcery";
  if (/\benchantment\b/.test(tl)) return "enchantment";
  return "creature";
}

export function prefilterCatalogCardV47(args: {
  card: GoldenCatalogOracleCard;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  excludeOracleIds: Set<string>;
  excludeNames: Set<string>;
}): { ok: true } | { ok: false; reason: string } {
  const { card, catalog, colorIdentity, excludeOracleIds, excludeNames } = args;
  if (excludeOracleIds.has(card.oracleId)) return { ok: false, reason: "already_selected" };
  const nameKey = normalizeCardNameForMatch(card.canonicalName);
  if (excludeNames.has(card.canonicalName.toLowerCase()) || excludeNames.has(nameKey)) {
    return { ok: false, reason: "duplicate_name" };
  }
  const paper = paperMetaForOracle(catalog, card.oracleId);
  if (!paper.paperEligible) return { ok: false, reason: "not_paper_eligible" };
  if (!isCurrentlyCommanderLegal(card)) return { ok: false, reason: "not_commander_legal" };
  if (!isCompetitiveDeckOracle(catalog, card.oracleId)) return { ok: false, reason: "not_competitive_deck_eligible" };
  if (!commanderLegalInIdentity(card.colorIdentity ?? [], colorIdentity)) return { ok: false, reason: "color_identity" };
  return { ok: true };
}

function scoreProfileForQuery(profile: FunctionalCardProfileV47, query: ResearchCardQueryV47): number {
  let score = 0;
  for (const role of query.requiredRoles) {
    if (profile.roles.includes(role)) score += 4;
  }
  for (const mech of query.requiredMechanics) {
    if (profile.mechanics.includes(mech)) score += 3;
  }
  for (const term of query.searchTerms) {
    if (profile.exactOracleText.toLowerCase().includes(term.toLowerCase())) score += 2;
  }
  score += profile.roleCompressionScore * 0.5;
  return score;
}

function councilCardFromProfile(args: {
  profile: FunctionalCardProfileV47;
  origin: CandidateDiscoverySourceV47;
  proposedBy: CouncilSpeakerV45;
  reason: string;
  needId: string;
  revision: number;
}): CouncilCardV46 {
  return {
    cardId: `card-${args.profile.oracleId}`,
    oracleId: args.profile.oracleId,
    name: args.profile.name,
    proposedBy: args.proposedBy,
    origin: args.origin === "GOLDEN_CATALOG" ? "SEMANTIC_ORACLE" : args.origin,
    proposalReason: args.reason,
    functions: args.profile.roles,
    roles: args.profile.roles,
    packages: [],
    engines: args.profile.mechanics,
    commanderDependence: "MEDIUM",
    worksWithoutCommander: "MEDIUM",
    semanticConnections: [args.needId],
    oracleVerified: true,
    legalityVerified: true,
    colorIdentityVerified: true,
    criticStatus: "PREFILTER_OK",
    status: "CANDIDATE",
    addedAtRevision: args.revision,
    lastReviewedRevision: args.revision,
    category: inferCategory(args.profile.typeLine),
  };
}

function resolveNamedModelPrior(args: {
  name: string;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  excludeOracleIds: Set<string>;
  excludeNames: Set<string>;
  pass1: CreativeProfessorPass1V4;
  revision: number;
}): CouncilCardV46 | null {
  const resolved = resolveBenchmarkCommanderName(args.catalog, args.name);
  const oracleId = resolved.oracleId;
  let card: GoldenCatalogOracleCard | null = null;
  if (oracleId) card = args.catalog.byOracleId.get(oracleId) ?? null;
  if (!card) card = lookupGoldenByName(args.catalog, args.name);
  if (!card) return null;
  const pre = prefilterCatalogCardV47({
    card,
    catalog: args.catalog,
    colorIdentity: args.colorIdentity,
    excludeOracleIds: args.excludeOracleIds,
    excludeNames: args.excludeNames,
  });
  if (!pre.ok) return null;
  const profile = buildFunctionalCardProfileV47(card);
  return councilCardFromProfile({
    profile,
    origin: "MODEL_PRIOR",
    proposedBy: "CREATIVE",
    reason: `Creative named card — verified against catalog (${profile.roles.join(", ") || "plan"})`,
    needId: "model-prior",
    revision: args.revision,
  });
}

function searchCatalogForQuery(args: {
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  bracket: CommanderBracket;
  query: ResearchCardQueryV47;
  excludeOracleIds: Set<string>;
  excludeNames: Set<string>;
  perQueryCap?: number;
}): CandidateSearchResultV47[] {
  const cap = args.perQueryCap ?? 12;
  const results: CandidateSearchResultV47[] = [];
  let rejectedIllegal = 0;

  for (const [, card] of args.catalog.byOracleId.entries()) {
    if (results.length >= cap * 3) break;
    const pre = prefilterCatalogCardV47({
      card,
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      excludeOracleIds: args.excludeOracleIds,
      excludeNames: args.excludeNames,
    });
    if (!pre.ok) {
      rejectedIllegal++;
      continue;
    }
    const profile = buildFunctionalCardProfileV47(card);
    const score = scoreProfileForQuery(profile, args.query);
    if (score <= 0) continue;
    results.push({
      resultId: `res-${args.query.queryId}-${profile.oracleId.slice(0, 8)}`,
      queryId: args.query.queryId,
      needId: args.query.needId,
      oracleId: profile.oracleId,
      name: profile.name,
      origin: "GOLDEN_CATALOG",
      score,
      profile,
      reason: `Matches ${args.query.conceptText} via ${profile.roles.join("+") || "oracle scan"}`,
      needFit: score,
      roleCompression: profile.roleCompressionScore,
      evidenceConfidence: profile.roles.length > 0 ? 0.85 : 0.4,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, cap);
}

export async function discoverCandidatesV47(args: {
  catalog: DeckResolutionCatalog;
  charter: DeckCharterV45;
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
  colorIdentity: string[];
  bracket: CommanderBracket;
  deckNeeds: DeckNeedV47[];
  selectedOracleIds: Set<string>;
  selectedNames: Set<string>;
  snapshot?: DeckSnapshotV46 | null;
  revision?: number;
  perQueryCap?: number;
  powerPlan?: BracketPowerPlanV410 | null;
}): Promise<CandidateDiscoveryReportV47> {
  const revision = args.revision ?? 0;
  const excludeOracleIds = new Set(args.selectedOracleIds);
  const excludeNames = new Set(args.selectedNames);
  const seenOracle = new Set<string>();
  const candidates: CouncilCardV46[] = [];
  const candidatesByNeed: CandidatePoolByNeedV47 = {};
  const results: CandidateSearchResultV47[] = [];
  let namedModelPriorCount = 0;
  let conceptDiscoveryCount = 0;
  let catalogScanCount = 0;
  let rejectedIllegal = 0;
  let rejectedDuplicate = 0;

  const namedSources = new Set<string>();
  for (const pkg of args.pass1.packages) {
    for (const name of pkg.likelyCardsOrEffects ?? []) {
      if (looksLikeCardName(name)) namedSources.add(name);
    }
  }
  for (const pkg of args.theory.packages) {
    for (const name of pkg.candidateCards) {
      if (looksLikeCardName(name)) namedSources.add(name);
    }
  }

  for (const name of namedSources) {
    const card = resolveNamedModelPrior({
      name,
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      excludeOracleIds,
      excludeNames,
      pass1: args.pass1,
      revision,
    });
    if (!card || seenOracle.has(card.oracleId!)) continue;
    seenOracle.add(card.oracleId!);
    candidates.push(card);
    namedModelPriorCount++;
    const bucket = candidatesByNeed["model-prior"] ?? [];
    bucket.push(card);
    candidatesByNeed["model-prior"] = bucket;
  }

  let needs = [...args.deckNeeds].map((n) => applyBracketToDeckNeedV410(n, args.bracket));
  if (needs.length === 0) {
    needs = buildInitialDeckNeedsV47({ charter: args.charter, pass1: args.pass1, theory: args.theory });
  }
  if (args.snapshot) {
    needs = [...needs, ...deriveDeckNeedsFromSnapshotV47({
      snapshot: args.snapshot,
      charter: args.charter,
      existingNeedIds: new Set(needs.map((n) => n.needId)),
    })];
  }

  const queries = deckNeedsToResearchQueries(needs);

  const searchComparisons: import("./professor-bracket-candidate-scoring-v4-10-v1").BracketSearchComparisonV410[] = [];
  const comparisonNeedIds = new Set<string>();

  for (const query of queries) {
    const hits = searchCatalogForQuery({
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      bracket: args.bracket,
      query,
      excludeOracleIds,
      excludeNames,
      perQueryCap: args.perQueryCap ?? 10,
    });
    catalogScanCount += hits.length;
    const needBucket: CouncilCardV46[] = candidatesByNeed[query.needId] ?? [];
    const need = needs.find((n) => n.needId === query.needId);

    const rescoredHits = hits
      .map((hit) => {
        if (!args.powerPlan) return hit;
        const breakdown = scoreCandidateForBracketV410({
          profile: hit.profile,
          bracket: args.bracket,
          powerPlan: args.powerPlan,
          need: need ?? null,
          manaValue: hit.profile.manaValue,
        });
        return { ...hit, score: breakdown.finalScore, reason: `${hit.reason} [B${args.bracket} fit ${breakdown.bracketPowerFit}]` };
      })
      .sort((a, b) => b.score - a.score);

    if (need && comparisonNeedIds.size < 3 && rescoredHits.length > 0) {
      comparisonNeedIds.add(need.needId);
      searchComparisons.push(
        buildSearchComparisonV410({
          need,
          bracket: args.bracket,
          results: rescoredHits.map((h) => ({ name: h.name, score: h.score, reason: h.reason, profile: h.profile })),
          powerPlan: args.powerPlan ?? null,
        }),
      );
    }

    for (const hit of rescoredHits) {
      if (seenOracle.has(hit.oracleId)) {
        rejectedDuplicate++;
        continue;
      }
      seenOracle.add(hit.oracleId);
      results.push(hit);
      const card = councilCardFromProfile({
        profile: hit.profile,
        origin: hit.origin,
        proposedBy: "RESEARCH",
        reason: hit.reason,
        needId: query.needId,
        revision,
      });
      candidates.push(card);
      needBucket.push(card);
      conceptDiscoveryCount++;
    }
    candidatesByNeed[query.needId] = needBucket;
  }

  return {
    queries,
    results,
    candidates,
    candidatesByNeed,
    namedModelPriorCount,
    conceptDiscoveryCount,
    catalogScanCount,
    rejectedIllegal,
    rejectedDuplicate,
    searchComparisons,
    bracketScoringApplied: Boolean(args.powerPlan),
  };
}

function selectedCardKeys(selected: CouncilCardV46[]): { oracleIds: Set<string>; cardIds: Set<string> } {
  return {
    oracleIds: new Set(selected.map((c) => c.oracleId).filter(Boolean) as string[]),
    cardIds: new Set(selected.map((c) => c.cardId)),
  };
}

/** Drop pool entries that are already committed to the deck (by oracleId or cardId). */
export function sanitizeCandidatePoolV47(args: {
  pool: CouncilCardV46[];
  selectedCards: CouncilCardV46[];
}): CouncilCardV46[] {
  const { oracleIds, cardIds } = selectedCardKeys(args.selectedCards);
  return args.pool.filter(
    (c) => !cardIds.has(c.cardId) && (!c.oracleId || !oracleIds.has(c.oracleId)),
  );
}

export function countSelectableCandidatesV47(args: {
  pool: CouncilCardV46[];
  selectedCards: CouncilCardV46[];
}): number {
  const cleaned = sanitizeCandidatePoolV47({ pool: args.pool, selectedCards: args.selectedCards });
  return cleaned.filter((c) => c.status === "CANDIDATE" || c.status === "PROPOSED").length;
}

export async function forceEmergencyCandidateRefillV47(args: {
  catalog: DeckResolutionCatalog;
  charter: DeckCharterV45;
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
  colorIdentity: string[];
  bracket: CommanderBracket;
  deckNeeds: DeckNeedV47[];
  candidatePool: CouncilCardV46[];
  selectedCards: CouncilCardV46[];
  snapshot?: DeckSnapshotV46 | null;
  revision?: number;
  powerPlan?: BracketPowerPlanV410 | null;
}): Promise<{
  candidatePool: CouncilCardV46[];
  discoveryReport: CandidateDiscoveryReportV47;
}> {
  const cleaned = sanitizeCandidatePoolV47({ pool: args.candidatePool, selectedCards: args.selectedCards });
  const selectedOracleIds = new Set(args.selectedCards.map((c) => c.oracleId).filter(Boolean) as string[]);
  const selectedNames = new Set<string>();
  for (const card of args.selectedCards) {
    selectedNames.add(card.name.toLowerCase());
    if (!isBasicLandName(card.name)) {
      selectedNames.add(normalizeCardNameForMatch(card.name));
    }
  }
  const existingOracle = new Set(cleaned.map((c) => c.oracleId).filter(Boolean) as string[]);

  const report = await discoverCandidatesV47({
    catalog: args.catalog,
    charter: args.charter,
    pass1: args.pass1,
    theory: args.theory,
    colorIdentity: args.colorIdentity,
    bracket: args.bracket,
    deckNeeds: args.deckNeeds,
    selectedOracleIds,
    selectedNames,
    snapshot: args.snapshot,
    revision: args.revision ?? 0,
    perQueryCap: 12,
    powerPlan: args.powerPlan ?? null,
  });

  const merged = [...cleaned];
  const mergedOracle = new Set(existingOracle);
  for (const card of report.candidates) {
    if (!card.oracleId || mergedOracle.has(card.oracleId)) continue;
    mergedOracle.add(card.oracleId);
    merged.push(card);
  }

  return { candidatePool: merged, discoveryReport: report };
}

export async function ensureCandidateSupplyV47(args: {
  catalog: DeckResolutionCatalog;
  charter: DeckCharterV45;
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
  colorIdentity: string[];
  bracket: CommanderBracket;
  deckNeeds: DeckNeedV47[];
  candidatePool: CouncilCardV46[];
  selectedCards: CouncilCardV46[];
  snapshot?: DeckSnapshotV46 | null;
  revision?: number;
  minimumBuffer?: number;
  powerPlan?: BracketPowerPlanV410 | null;
}): Promise<{
  candidatePool: CouncilCardV46[];
  deckNeeds: DeckNeedV47[];
  discoveryReport: CandidateDiscoveryReportV47;
  refilled: boolean;
}> {
  const minimumBuffer = args.minimumBuffer ?? MINIMUM_CANDIDATE_BUFFER_V47;
  const sanitizedPool = sanitizeCandidatePoolV47({ pool: args.candidatePool, selectedCards: args.selectedCards });
  const usable = sanitizedPool.filter((c) => c.status === "CANDIDATE" || c.status === "PROPOSED");
  if (usable.length >= minimumBuffer) {
    return {
      candidatePool: sanitizedPool,
      deckNeeds: args.deckNeeds,
      discoveryReport: {
        queries: [],
        results: [],
        candidates: [],
        candidatesByNeed: {},
        namedModelPriorCount: 0,
        conceptDiscoveryCount: 0,
        catalogScanCount: 0,
        rejectedIllegal: 0,
        rejectedDuplicate: 0,
      },
      refilled: false,
    };
  }

  const selectedOracleIds = new Set(args.selectedCards.map((c) => c.oracleId).filter(Boolean) as string[]);
  const selectedNames = new Set<string>();
  for (const card of args.selectedCards) {
    selectedNames.add(card.name.toLowerCase());
    if (!isBasicLandName(card.name)) {
      selectedNames.add(normalizeCardNameForMatch(card.name));
    }
  }
  const existingOracle = new Set(sanitizedPool.map((c) => c.oracleId).filter(Boolean) as string[]);

  const report = await discoverCandidatesV47({
    catalog: args.catalog,
    charter: args.charter,
    pass1: args.pass1,
    theory: args.theory,
    colorIdentity: args.colorIdentity,
    bracket: args.bracket,
    deckNeeds: args.deckNeeds,
    selectedOracleIds,
    selectedNames,
    snapshot: args.snapshot,
    revision: args.revision,
    perQueryCap: 8,
    powerPlan: args.powerPlan ?? null,
  });

  const merged = [...sanitizedPool];
  const mergedIds = new Set(existingOracle);
  for (const card of report.candidates) {
    if (!card.oracleId || mergedIds.has(card.oracleId)) continue;
    mergedIds.add(card.oracleId);
    merged.push(card);
  }

  return {
    candidatePool: merged,
    deckNeeds: args.deckNeeds.length > 0 ? args.deckNeeds : buildInitialDeckNeedsV47({
      charter: args.charter,
      pass1: args.pass1,
      theory: args.theory,
    }),
    discoveryReport: report,
    refilled: report.candidates.length > 0,
  };
}

export function extractNamedCardsFromCreativeV47(args: {
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
}): string[] {
  const names = new Set<string>();
  for (const pkg of args.pass1.packages) {
    for (const n of pkg.likelyCardsOrEffects ?? []) {
      if (looksLikeCardName(n)) names.add(n);
    }
  }
  for (const pkg of args.theory.packages) {
    for (const n of pkg.candidateCards) {
      if (looksLikeCardName(n)) names.add(n);
    }
  }
  return [...names];
}

export function extractAbstractConceptsFromCreativeV47(args: {
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
}): string[] {
  const concepts = new Set<string>();
  for (const pkg of args.pass1.packages) {
    concepts.add(pkg.purpose);
    for (const n of pkg.likelyCardsOrEffects ?? []) {
      if (!looksLikeCardName(n)) concepts.add(n);
    }
  }
  for (const pkg of args.theory.packages) {
    for (const n of pkg.candidateCards) {
      if (!looksLikeCardName(n)) concepts.add(n);
    }
  }
  return [...concepts];
}

export { decomposeCreativeConceptV47 };
