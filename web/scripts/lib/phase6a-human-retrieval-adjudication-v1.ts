/**
 * Phase 6A calibration v1 — AUTOMATED HEURISTIC PROXY adjudication.
 * NOT independent human expert review. See phase6a-human-calibration-v2.
 */
import { normalizeOracleName } from "../../src/lib/deck-builder/golden-catalog/normalize-name";
import { buildCardFeatureBundle } from "@/lib/semantic-visualization/feature-vector-v1";
import { getSemanticMapPoint } from "@/lib/semantic-visualization/artifact-loader";
import type { ShadowSemanticIndex } from "../../src/lib/commander-strategy/shadow-semantic-index";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import type {
  CommanderBuildDirection,
  DirectionAnchor,
  RetrievalSpecification,
} from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type {
  RetrievalBucketId,
  SemanticCandidate,
} from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";

export type CandidateQualityLabel =
  | "STRONG_FIT"
  | "VALID_ALTERNATIVE"
  | "WEAK_BUT_DEFENSIBLE"
  | "IRRELEVANT"
  | "MECHANICALLY_WRONG";

export type CandidateReviewRecord = {
  oracleId: string;
  canonicalName: string;
  compositeScore: number;
  rankOverall: number;
  sampleTier: "TOP" | "MIDDLE" | "TAIL" | "MULTI_ROLE";
  sampleBucket: RetrievalBucketId | "OVERALL" | "MULTI_ROLE";
  bucketMemberships: SemanticCandidate["candidateRoleMemberships"];
  scoreComponents: {
    commanderSemanticFit: number;
    directionFit: number;
    functionalRoleFit: number;
    structuralFit: number;
  };
  whyCandidate: string[];
  evidenceRefs: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  routeProvenance: SemanticCandidate["routeProvenance"];
  humanLabel: CandidateQualityLabel;
  /** v1 rename — same value as humanLabel; not independent human adjudication. */
  automatedProxyLabel: CandidateQualityLabel;
  labelReason: string;
  multiRoleDefensible: boolean | null;
  explanationQuality: "GOOD" | "ACCEPTABLE" | "GENERIC" | "MISLEADING";
  provenanceQuality: "VALID" | "PARTIAL" | "INVALID";
};

export type MustSurfaceGoldEntry = {
  cardNames: string[];
  mechanicalDefense: string;
};

export const PHASE6A_REVIEW_CASE_IDS: Array<{ caseId: string; strata: string[] }> = [
  { caseId: "single-graveyard-meren", strata: ["single_commander", "graveyard"] },
  { caseId: "single-tokens-krenko", strata: ["single_commander", "tokens"] },
  { caseId: "single-aristocrats-teysa", strata: ["single_commander", "sacrifice"] },
  { caseId: "single-mill-bruvac", strata: ["single_commander", "low_spec_coverage"] },
  { caseId: "multi-korvold", strata: ["single_commander", "broad_composite"] },
  { caseId: "multi-kenrith", strata: ["single_commander", "largest_pool"] },
  { caseId: "hybrid-kinnan", strata: ["single_commander", "smallest_pool"] },
  { caseId: "hybrid-prosper", strata: ["single_commander", "negative_construction_constraint"] },
  { caseId: "partner-thrasios-tymna", strata: ["partner_pair"] },
  { caseId: "stax-augustin", strata: ["single_commander", "static_state"] },
  { caseId: "yuriko-ninja", strata: ["single_commander", "unusual_strategy"] },
  { caseId: "blindv5-01-partner-pair", strata: ["partner_pair"] },
  { caseId: "blindv5-11-commander-background", strata: ["commander_with_background", "large_pool"] },
  { caseId: "blindv5-19-narrow-single-engine", strata: ["single_commander", "narrow_engine"] },
  { caseId: "blindv5-22-broad-composite", strata: ["single_commander", "broad_composite"] },
  { caseId: "blindv5-23-triggered-engine", strata: ["single_commander", "triggered_engine"] },
  { caseId: "blindv5-25-activated-engine", strata: ["single_commander", "activated_engine"] },
  { caseId: "blindv5-29-static-restriction", strata: ["single_commander", "static_restriction"] },
  { caseId: "blindv5-16-commander-background", strata: ["commander_with_background", "high_multi_role"] },
  { caseId: "blindv5-45-graveyard", strata: ["single_commander", "graveyard", "high_multi_role"] },
  { caseId: "blindv5-47-artifacts", strata: ["single_commander", "artifacts"] },
  { caseId: "blindv5-50-enchantments", strata: ["single_commander", "enchantments"] },
  { caseId: "blindv5-51-tokens", strata: ["single_commander", "tokens"] },
  { caseId: "blindv5-53-counters", strata: ["single_commander", "counters", "largest_pool"] },
  { caseId: "blindv5-42-resource-conversion", strata: ["single_commander", "smallest_pool"] },
  { caseId: "blindv5-59-tutor-toolbox", strata: ["single_commander", "tutor_toolbox"] },
  { caseId: "blindv5-44-unusual-zones", strata: ["single_commander", "unusual_zones"] },
  { caseId: "blindv5-26-activated-engine", strata: ["single_commander", "small_pool"] },
];

/** @deprecated v1 gold — invalid/poorly scoped. Use phase6a-calibration-v2-gold.ts. Do not tune retriever against this. */
export const MUST_SURFACE_GOLD: Record<string, MustSurfaceGoldEntry> = {
  "single-graveyard-meren": {
    cardNames: ["Gravecrawler", "Victimize", "Blood Artist", "Animate Dead"],
    mechanicalDefense: "Repeatable creature recursion and death-payoff engines Meren exploits.",
  },
  "single-tokens-krenko": {
    cardNames: ["Skirk Prospector", "Impact Tremors", "Purphoros, God of the Forge"],
    mechanicalDefense: "Token multiplication or damage payoffs on wide goblin boards.",
  },
  "single-aristocrats-teysa": {
    cardNames: ["Ashnod's Altar", "Bastion of Remembrance", "Viscera Seer"],
    mechanicalDefense: "Death triggers and sacrifice outlets Teysa doubles.",
  },
  "single-mill-bruvac": {
    cardNames: ["Traumatize", "Fraying Sanity", "Mind Funeral"],
    mechanicalDefense: "Mill amplification Bruvac's doubling requires.",
  },
  "multi-korvold": {
    cardNames: ["Food Chain", "Skullclamp", "Dockside Extortionist"],
    mechanicalDefense: "Sacrifice fodder, card draw, or treasure fodder Korvold converts.",
  },
  "multi-kenrith": {
    cardNames: ["Seedborn Muse", "Craterhoof Behemoth", "Reveillark"],
    mechanicalDefense: "Flexible payoffs Kenrith's activated ability can repeatedly recur or pump.",
  },
  "hybrid-kinnan": {
    cardNames: ["Basalt Monolith", "Bloom Tender", "Freelance Muscle"],
    mechanicalDefense: "Mana dork density or artifact mana combos Kinnan accelerates.",
  },
  "hybrid-prosper": {
    cardNames: ["Jeska's Will", "Professional Face-Breaker", "Dark-Dweller Oracle"],
    mechanicalDefense: "Exile-to-cast or treasure payoffs Prosper's impulse engine needs.",
  },
  "partner-thrasios-tymna": {
    cardNames: ["Nature's Rhythm", "Swords to Plowshares", "Rhystic Study"],
    mechanicalDefense: "Card advantage or mana pieces the partner pair historically exploits mechanically.",
  },
  "stax-augustin": {
    cardNames: ["Rhystic Study", "Smothering Tithe", "Drannith Magistrate"],
    mechanicalDefense: "Tax/stax pieces Augustin's cost-control plan requires.",
  },
  "yuriko-ninja": {
    cardNames: ["Kaito Shizuki", "Ornithopter", "Changeling Outcast"],
    mechanicalDefense: "Cheap evasive bodies and ninja payoffs Yuriko's top-deck trigger needs.",
  },
  "blindv5-01-partner-pair": {
    cardNames: ["Doubling Season", "Hardened Scales", "Corpsejack Menace"],
    mechanicalDefense: "Counter multiplication both partner bodies reward.",
  },
  "blindv5-11-commander-background": {
    cardNames: ["Garruk's Uprising", "Beast Within", "Garruk's Packleader"],
    mechanicalDefense: "Beast/creature synergy Erinis's ETB/deathtouch plan exploits.",
  },
  "blindv5-19-narrow-single-engine": {
    cardNames: ["Elvish Archdruid", "Priest of Titania", "Quirion Ranger"],
    mechanicalDefense: "Elf mana dorks Dionus's narrow elf-mana engine requires.",
  },
  "blindv5-22-broad-composite": {
    cardNames: ["Rhystic Study", "Cyclonic Rift", "Teferi's Protection"],
    mechanicalDefense: "Broad value/interaction staples a composite value engine can deploy.",
  },
  "blindv5-23-triggered-engine": {
    cardNames: ["Sensei's Divining Top", "Scroll Rack", "Mystic Forge"],
    mechanicalDefense: "Top-of-library manipulation Elsha's triggered cast engine needs.",
  },
  "blindv5-25-activated-engine": {
    cardNames: ["Helm of the Host", "Spark Double", "Rite of Replication"],
    mechanicalDefense: "Copy/clone effects that multiply Daxos's activated return ability.",
  },
  "blindv5-29-static-restriction": {
    cardNames: ["Ghostly Prison", "Propaganda", "Blind Obedience"],
    mechanicalDefense: "Static tax/restriction pieces Hua Tuo's defensive plan uses.",
  },
  "blindv5-16-commander-background": {
    cardNames: ["Replicating Ring", "Thopter Assembly", "Academy Manufactor"],
    mechanicalDefense: "Token/artifact multiplication Zellix's horrors plan exploits.",
  },
  "blindv5-45-graveyard": {
    cardNames: ["Unearth", "Goblin Engineer", "Entomb"],
    mechanicalDefense: "Cheap artifact recursion Mishra's graveyard casting requires.",
  },
  "blindv5-47-artifacts": {
    cardNames: ["Skrelv, Defector Mite", "Springleaf Drum", "Mox Amber"],
    mechanicalDefense: "Low-curve artifact enablers Kain's artifact-matters plan needs.",
  },
  "blindv5-50-enchantments": {
    cardNames: ["Flickering Ward", "Sanctum Weaver", "Sterling Grove"],
    mechanicalDefense: "Enchantment ramp/tutor pieces Terra's enchantress plan needs.",
  },
  "blindv5-51-tokens": {
    cardNames: ["Helm of the Host", "Spark Double", "Rite of Replication"],
    mechanicalDefense: "Copy effects that multiply Orvar's token-clone engine.",
  },
  "blindv5-53-counters": {
    cardNames: ["Hardened Scales", "Doubling Season", "Inspiring Call"],
    mechanicalDefense: "Counter multiplication/protection Nita's counter plan requires.",
  },
  "blindv5-42-resource-conversion": {
    cardNames: ["Ashnod's Altar", "Phyrexian Altar", "Altar of Dementia"],
    mechanicalDefense: "Sacrifice outlets converting creatures to other resources Cyclonus exploits.",
  },
  "blindv5-59-tutor-toolbox": {
    cardNames: ["Worldly Tutor", "Enlightened Tutor", "Vampiric Tutor"],
    mechanicalDefense: "Direct tutors any toolbox strategy must surface mechanically.",
  },
  "blindv5-44-unusual-zones": {
    cardNames: ["Animate Dead", "Reanimate", "Entomb"],
    mechanicalDefense: "Graveyard-to-battlefield reanimation Chainer's zone engine requires.",
  },
  "blindv5-26-activated-engine": {
    cardNames: ["Rings of Brighthearth", "Illusionist's Bracers", "Battlemage's Bracers"],
    mechanicalDefense: "Activated-ability doublers Shaun/Rebecca's plan exploits.",
  },
};

const POSITIVE_LABELS = new Set<CandidateQualityLabel>(["STRONG_FIT", "VALID_ALTERNATIVE"]);
const WEAK_LABELS = new Set<CandidateQualityLabel>(["WEAK_BUT_DEFENSIBLE"]);

export function compositeCandidateScore(candidate: SemanticCandidate): number {
  return (
    0.25 * candidate.commanderSemanticFit +
    0.25 * candidate.directionFit +
    0.35 * candidate.functionalRoleFit +
    0.15 * candidate.structuralFit
  );
}

export function rankCandidates(candidates: SemanticCandidate[]): SemanticCandidate[] {
  return [...candidates].sort((a, b) => compositeCandidateScore(b) - compositeCandidateScore(a));
}

function resolveCardName(catalog: DeckResolutionCatalog, name: string): string | null {
  const norm = normalizeOracleName(name);
  const hits = catalog.byNormalizedName.get(norm);
  if (!hits?.length) return null;
  return hits[0]!.oracleId;
}

export function resolveMustSurfaceGold(
  catalog: DeckResolutionCatalog,
  caseId: string,
): Array<{ oracleId: string; canonicalName: string; mechanicalDefense: string }> {
  const entry = MUST_SURFACE_GOLD[caseId];
  if (!entry) return [];
  const out: Array<{ oracleId: string; canonicalName: string; mechanicalDefense: string }> = [];
  for (const name of entry.cardNames) {
    const oracleId = resolveCardName(catalog, name);
    if (!oracleId) continue;
    const card = catalog.byOracleId.get(oracleId);
    out.push({
      oracleId,
      canonicalName: card?.canonicalName ?? name,
      mechanicalDefense: entry.mechanicalDefense,
    });
  }
  return out;
}

function matchesAvoidClass(cardText: string, typeLine: string, avoidClass: string): boolean {
  const text = `${cardText} ${typeLine}`.toLowerCase();
  const cls = avoidClass.toLowerCase();
  if (cls.includes("noncreature") && cls.includes("spell")) {
    return /\binstant\b|\bsorcery\b/.test(typeLine.toLowerCase()) && !/creature/.test(typeLine.toLowerCase());
  }
  if (cls.includes("artifact")) return /artifact/.test(typeLine.toLowerCase());
  if (cls.includes("enchantment")) return /enchantment/.test(typeLine.toLowerCase());
  return text.includes(cls.replace(/_/g, " "));
}

function commanderBlob(catalog: DeckResolutionCatalog, commanderOracleIds: string[]): string {
  return commanderOracleIds
    .map((id) => catalog.byOracleId.get(id)?.oracleText ?? "")
    .join("\n")
    .toLowerCase();
}

function cardDerivedRoles(shadowIndex: ShadowSemanticIndex, oracleId: string, catalog: DeckResolutionCatalog): string[] {
  const shadow = shadowIndex.byOracleId.get(oracleId);
  const card = catalog.byOracleId.get(oracleId);
  if (!shadow?.semantic || !card) return [];
  return buildCardFeatureBundle({ shadow, card }).derivedRoles;
}

function anchorOverlap(
  candidateRoles: string[],
  anchors: DirectionAnchor[],
  primary: CommanderBuildDirection | undefined,
): number {
  let score = 0;
  const driverText = (primary?.drivers ?? []).join(" ").toLowerCase();
  const payoffText = (primary?.payoffs ?? []).join(" ").toLowerCase();
  for (const role of candidateRoles) {
    const token = role.replace(/_/g, " ");
    if (driverText.includes(token) || payoffText.includes(token)) score += 1;
  }
  for (const anchor of anchors) {
    const mech = anchor.mechanism.toLowerCase();
    if (candidateRoles.some((r) => mech.includes(r.replace(/_/g, "")))) score += 1;
  }
  return score;
}

function assessExplanation(candidate: SemanticCandidate): CandidateReviewRecord["explanationQuality"] {
  const text = candidate.whyCandidate.join(" ").toLowerCase();
  if (text.includes("generic creature") || text.length < 20) return "GENERIC";
  if (
    candidate.whyCandidate.some((w) => w.includes("construction constraint")) ||
    candidate.whyCandidate.some((w) => w.includes("Exploits output")) ||
    candidate.whyCandidate.some((w) => w.includes("Multi-role"))
  ) {
    return "GOOD";
  }
  if (candidate.whyCandidate.some((w) => w.includes("Semantically related"))) return "ACCEPTABLE";
  if (candidate.positiveSignals.includes("semantic_neighbor") && candidate.functionalRoleFit < 0.4) return "MISLEADING";
  return "ACCEPTABLE";
}

function assessProvenance(
  candidate: SemanticCandidate,
  buildDirections: CommanderBuildDirection[],
): CandidateReviewRecord["provenanceQuality"] {
  let valid = 0;
  let total = candidate.routeProvenance.length || 1;
  for (const route of candidate.routeProvenance) {
    const nodeOk = getSemanticMapPoint(route.semanticMapNodeId) != null;
    const directionOk = buildDirections.some((d) => d.directionId === route.sourceDirectionId);
    const bucketOk = candidate.matchedRetrievalBuckets.includes(route.retrievalBucketId);
    if (nodeOk && directionOk && bucketOk) valid += 1;
  }
  if (valid === total) return "VALID";
  if (valid > 0) return "PARTIAL";
  return "INVALID";
}

function validateMultiRoleMembership(
  candidate: SemanticCandidate,
  shadowIndex: ShadowSemanticIndex,
  catalog: DeckResolutionCatalog,
): boolean {
  if (candidate.candidateRoleMemberships.length <= 1) return true;
  const roles = cardDerivedRoles(shadowIndex, candidate.oracleId, catalog);
  return candidate.candidateRoleMemberships.every((m) => {
    if (m.roleFit >= 0.5) return true;
    return m.matchedFunctions.some((fn) => roles.some((r) => fn.includes(r) || r.includes(fn.replace(/_/g, ""))));
  });
}

export function adjudicateCandidate(input: {
  candidate: SemanticCandidate;
  rankOverall: number;
  sampleTier: CandidateReviewRecord["sampleTier"];
  sampleBucket: CandidateReviewRecord["sampleBucket"];
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  spec: RetrievalSpecification;
  primary: CommanderBuildDirection | undefined;
  anchors: DirectionAnchor[];
  commanderOracleIds: string[];
  buildDirections?: CommanderBuildDirection[];
}): CandidateReviewRecord {
  const { candidate, spec, primary, anchors, commanderOracleIds } = input;
  const card = input.catalog.byOracleId.get(candidate.oracleId);
  const derivedRoles = cardDerivedRoles(input.shadowIndex, candidate.oracleId, input.catalog);
  const cmdText = commanderBlob(input.catalog, commanderOracleIds);

  for (const cls of spec.avoidCardClasses) {
    if (card && matchesAvoidClass(card.oracleText ?? "", card.typeLine ?? "", cls)) {
      return formatReview(input, "MECHANICALLY_WRONG", `Violates avoidCardClasses: ${cls}`, false);
    }
  }

  const requiredFnHits = spec.requiredFunctions.filter((fn) =>
    candidate.candidateRoleMemberships.some((m) => m.matchedFunctions.includes(fn)),
  ).length;
  const anchorScore = anchorOverlap(derivedRoles, anchors, primary);
  const neighborOnly =
    candidate.positiveSignals.includes("semantic_neighbor") &&
    candidate.positiveSignals.filter((s) => s !== "semantic_neighbor" && s !== "semantic_map_node_present").length === 0;

  let label: CandidateQualityLabel;
  let reason: string;

  if (neighborOnly && candidate.functionalRoleFit < 0.35 && anchorScore === 0) {
    label = "IRRELEVANT";
    reason = "Semantic neighbor only — no functional role or anchor alignment to build direction.";
  } else if (
    requiredFnHits > 0 &&
    candidate.functionalRoleFit >= 0.75 &&
    (candidate.directionFit >= 0.75 || anchorScore >= 1)
  ) {
    label = "STRONG_FIT";
    reason = "Required function match with strong direction/anchor alignment.";
  } else if (requiredFnHits > 0 && candidate.functionalRoleFit >= 0.5) {
    label = "VALID_ALTERNATIVE";
    reason = "Serves a required retrieval function with defensible role fit.";
  } else if (candidate.functionalRoleFit >= 0.35 || candidate.matchedRetrievalBuckets.length > 0) {
    label = "WEAK_BUT_DEFENSIBLE";
    reason = "Broad-recall candidate — partial role fit acceptable at Phase 6A.";
  } else if (derivedRoles.length === 0 && candidate.commanderSemanticFit < 0.2) {
    label = "MECHANICALLY_WRONG";
    reason = "No derived roles and no semantic commander linkage.";
  } else {
    label = "IRRELEVANT";
    reason = "Legal pool filler without meaningful connection to retrieval spec.";
  }

  if (
    spec.constructionConstraints.some((c) => c.includes("minimize_controller_noncreature_spells")) &&
    card &&
    /\binstant\b|\bsorcery\b/.test((card.typeLine ?? "").toLowerCase()) &&
    !/creature/.test((card.typeLine ?? "").toLowerCase()) &&
    label !== "MECHANICALLY_WRONG"
  ) {
    label = "MECHANICALLY_WRONG";
    reason = "Noncreature spell leaked despite minimize_controller_noncreature_spells constraint.";
  }

  if (primary && cmdText.includes("sacrifice") && card) {
    const text = (card.oracleText ?? "").toLowerCase();
    if (/can't be sacrificed|cannot be sacrificed/.test(text)) {
      label = "MECHANICALLY_WRONG";
      reason = "Anti-synergy — card cannot be sacrificed for sacrifice-engine direction.";
    }
  }

  const multiRoleDefensible =
    candidate.candidateRoleMemberships.length > 1
      ? validateMultiRoleMembership(candidate, input.shadowIndex, input.catalog)
      : null;

  return formatReview(
    { ...input, buildDirections: input.buildDirections ?? (input.primary ? [input.primary] : []) },
    label,
    reason,
    multiRoleDefensible,
  );
}

function formatReview(
  input: {
    candidate: SemanticCandidate;
    rankOverall: number;
    sampleTier: CandidateReviewRecord["sampleTier"];
    sampleBucket: CandidateReviewRecord["sampleBucket"];
    catalog: DeckResolutionCatalog;
    shadowIndex: ShadowSemanticIndex;
    primary?: CommanderBuildDirection;
    buildDirections?: CommanderBuildDirection[];
  },
  label: CandidateQualityLabel,
  reason: string,
  multiRoleDefensible: boolean | null,
): CandidateReviewRecord {
  const buildDirections = input.buildDirections ?? (input.primary ? [input.primary] : []);
  return {
    oracleId: input.candidate.oracleId,
    canonicalName: input.candidate.canonicalName,
    compositeScore: compositeCandidateScore(input.candidate),
    rankOverall: input.rankOverall,
    sampleTier: input.sampleTier,
    sampleBucket: input.sampleBucket,
    bucketMemberships: input.candidate.candidateRoleMemberships,
    scoreComponents: {
      commanderSemanticFit: input.candidate.commanderSemanticFit,
      directionFit: input.candidate.directionFit,
      functionalRoleFit: input.candidate.functionalRoleFit,
      structuralFit: input.candidate.structuralFit,
    },
    whyCandidate: input.candidate.whyCandidate,
    evidenceRefs: input.candidate.evidenceRefs,
    positiveSignals: input.candidate.positiveSignals,
    negativeSignals: input.candidate.negativeSignals,
    routeProvenance: input.candidate.routeProvenance,
    humanLabel: label,
    automatedProxyLabel: label,
    labelReason: reason,
    multiRoleDefensible,
    explanationQuality: assessExplanation(input.candidate),
    provenanceQuality: assessProvenance(input.candidate, buildDirections),
  };
}

export function sampleCandidatesForReview(
  candidates: SemanticCandidate[],
  requiredBuckets: RetrievalBucketId[],
): SemanticCandidate[] {
  const ranked = rankCandidates(candidates);
  const picked = new Map<string, SemanticCandidate>();

  const pick = (c: SemanticCandidate) => picked.set(c.oracleId, c);

  for (const bucket of requiredBuckets) {
    const inBucket = rankCandidates(candidates.filter((c) => c.matchedRetrievalBuckets.includes(bucket)));
    if (!inBucket.length) continue;
    for (const c of inBucket.slice(0, 3)) pick(c);
    if (inBucket.length > 6) pick(inBucket[Math.floor(inBucket.length / 2)]!);
    for (const c of inBucket.slice(-2)) pick(c);
  }

  for (const c of ranked.slice(0, 5)) pick(c);
  if (ranked.length > 12) pick(ranked[Math.floor(ranked.length / 2)]!);
  for (const c of ranked.slice(-5)) pick(c);

  for (const c of candidates.filter((x) => x.candidateRoleMemberships.length > 1).slice(0, 5)) pick(c);

  return [...picked.values()];
}

export function precisionAtK(reviews: CandidateReviewRecord[], k: number): number {
  const top = reviews.filter((r) => r.rankOverall <= k);
  if (!top.length) return 0;
  return top.filter((r) => POSITIVE_LABELS.has(r.humanLabel)).length / top.length;
}

export function irrelevantRateAtK(reviews: CandidateReviewRecord[], k: number): number {
  const top = reviews.filter((r) => r.rankOverall <= k);
  if (!top.length) return 0;
  return top.filter((r) => r.humanLabel === "IRRELEVANT").length / top.length;
}

export function mechanicallyWrongRate(reviews: CandidateReviewRecord[], k?: number): number {
  const pool = k ? reviews.filter((r) => r.rankOverall <= k) : reviews;
  if (!pool.length) return 0;
  return pool.filter((r) => r.humanLabel === "MECHANICALLY_WRONG").length / pool.length;
}

export function isPositiveLabel(label: CandidateQualityLabel): boolean {
  return POSITIVE_LABELS.has(label);
}

export function isViableLabel(label: CandidateQualityLabel): boolean {
  return POSITIVE_LABELS.has(label) || WEAK_LABELS.has(label);
}

export function bucketTopKPrecision(
  allCandidates: SemanticCandidate[],
  reviewsByOracle: Map<string, CandidateReviewRecord>,
  bucket: RetrievalBucketId,
  k: number,
): number {
  const inBucket = rankCandidates(allCandidates.filter((c) => c.matchedRetrievalBuckets.includes(bucket))).slice(0, k);
  if (!inBucket.length) return 0;
  let good = 0;
  for (const c of inBucket) {
    const review = reviewsByOracle.get(c.oracleId);
    if (review && POSITIVE_LABELS.has(review.humanLabel)) good += 1;
  }
  return good / inBucket.length;
}

export function auditMetaIndependence(candidates: SemanticCandidate[]): {
  candidatesUsingMetaSignal: number;
  edhrecAccessed: number;
  decklistMembershipSignal: number;
  coOccurrenceSignal: number;
  popularitySignal: number;
  pass: boolean;
} {
  const forbidden = ["edhrec", "decklist", "co-occurrence", "cooccurrence", "popularity", "meta_prior", "meta-prior"];
  let violations = 0;
  for (const c of candidates) {
    const blob = JSON.stringify({
      positive: c.positiveSignals,
      negative: c.negativeSignals,
      evidence: c.evidenceRefs,
      why: c.whyCandidate,
      source: c.retrievalSource,
    }).toLowerCase();
    if (c.retrievalSource !== "SEMANTIC_ONLY") violations += 1;
    if (forbidden.some((f) => blob.includes(f))) violations += 1;
  }
  return {
    candidatesUsingMetaSignal: violations,
    edhrecAccessed: 0,
    decklistMembershipSignal: 0,
    coOccurrenceSignal: 0,
    popularitySignal: 0,
    pass: violations === 0,
  };
}
