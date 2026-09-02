/**
 * Phase 6A — Semantic Candidate Retrieval v1.
 * Converts RetrievalSpecification into legal, meta-independent candidate pools.
 * Does NOT construct the final 99 — optimizer remains WAIT.
 */
import { createHash } from "node:crypto";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import { buildCardFeatureBundle } from "@/lib/semantic-visualization/feature-vector-v1";
import { DERIVED_ROLE_NAMES, type DerivedRoleName } from "@/lib/semantic-visualization/derived-features-v1";
import { getSemanticMapPoint } from "@/lib/semantic-visualization/artifact-loader";
import type { ShadowSemanticIndex } from "../commander-strategy/shadow-semantic-index";
import {
  isCompetitiveDeckOracle,
  isCurrentlyCommanderLegal,
  paperMetaForOracle,
  type DeckResolutionCatalog,
} from "../../../scripts/lib/load-deck-resolution-catalog";
import { getBracketPolicy, type CommanderBracket } from "../bracket-policy/bracket-policy-v1";
import {
  gameChangerOracleIdSet,
  type CommanderGameChangerSnapshot,
} from "../commander-strategy/model-c/game-changer-snapshot-v1";
import type {
  CommandZoneComposition,
  CommanderBuildDirection,
  DirectionAnchor,
  RetrievalSpecification,
} from "./archetype-discovery-types-v1";
import type { CatalogRoleIndex } from "./catalog-feasibility-v1";
import { CANDIDATE_RETRIEVAL_MODE_V1 } from "./commander-deck-synthesis-v1-spec";

export const SEMANTIC_CANDIDATE_RETRIEVAL_V1_VERSION = "semantic-candidate-retrieval-v1";
export const SEMANTIC_CANDIDATE_RETRIEVAL_MODE = "SEMANTIC_ONLY" as const;

export type RetrievalBucketId =
  | "ENABLERS"
  | "ENGINE_PIECES"
  | "PAYOFFS"
  | "REDUNDANCY"
  | "RESOURCE_SUPPORT"
  | "CARD_ADVANTAGE"
  | "PROTECTION"
  | "INTERACTION"
  | "RECURSION"
  | "STRUCTURAL_SUPPORT"
  | "MANA_SUPPORT"
  | "STATE_BUILDERS"
  | "STATE_MAINTAINERS"
  | "RESOURCE_PRODUCERS"
  | "RESOURCE_CONSUMERS"
  | "CONSTRUCTION_CONSTRAINT_SUPPORT";

export type SemanticCandidateRoleMembership = {
  bucketId: RetrievalBucketId;
  matchedFunctions: string[];
  roleFit: number;
};

export type SemanticCandidateRouteProvenance = {
  semanticMapNodeId: string;
  sourceDirectionId: string;
  retrievalBucketId: RetrievalBucketId;
  relationshipReason: string;
  relationshipEvidence: string[];
};

export type SemanticCandidateLegalityStatus = "LEGAL" | "EXCLUDED" | "UNCERTAIN";

export type SemanticCandidateBracketStatus = {
  bracketRulesSatisfied: boolean | "UNCERTAIN";
  bracketIntentFit: null;
  gameChanger: boolean;
  exclusionReasons: string[];
  note: "bracketRulesSatisfied is per-card pre-deck check — not candidate quality";
};

export type SemanticCandidate = {
  oracleId: string;
  semanticMapNodeId: string;
  canonicalName: string;
  matchedDirections: string[];
  matchedRetrievalBuckets: RetrievalBucketId[];
  candidateRoleMemberships: SemanticCandidateRoleMembership[];
  commanderSemanticFit: number;
  directionFit: number;
  functionalRoleFit: number;
  structuralFit: number;
  matchedAnchors: string[];
  matchedMechanics: string[];
  evidenceRefs: string[];
  whyCandidate: string[];
  legalityStatus: SemanticCandidateLegalityStatus;
  bracketStatus: SemanticCandidateBracketStatus;
  positiveSignals: string[];
  negativeSignals: string[];
  retrievalSource: typeof SEMANTIC_CANDIDATE_RETRIEVAL_MODE;
  routeProvenance: SemanticCandidateRouteProvenance[];
};

export type SemanticCandidateUserConstraints = {
  mustExcludeOracleIds?: string[];
  mustExcludeNames?: string[];
};

export type SemanticCandidateRetrievalRequest = {
  commandZoneConfiguration: string;
  bracket: CommanderBracket;
  commanderOracleIds: string[];
  combinedColorIdentity: string[];
  buildDirections: CommanderBuildDirection[];
  directionAnchors: DirectionAnchor[];
  retrievalSpecifications: RetrievalSpecification[];
  commandZoneComposition?: CommandZoneComposition | null;
  userConstraints?: SemanticCandidateUserConstraints;
  namedArchetype?: string | null;
  perBucketCap?: number;
};

export type SemanticCandidatePoolStats = {
  candidateCount: number;
  candidatesPerBucket: Record<string, number>;
  crossBucketCandidates: number;
  duplicateCollapseCount: number;
  legalExclusions: number;
  bracketExclusions: number;
  negativeConstraintExclusions: number;
  colorIdentityExclusions: number;
  catalogPoolSize: number;
  retrievalSpecificationCoverage: number;
};

export type SemanticCandidateRetrievalReport = {
  version: typeof SEMANTIC_CANDIDATE_RETRIEVAL_V1_VERSION;
  retrievalMode: typeof SEMANTIC_CANDIDATE_RETRIEVAL_MODE;
  generatedAt: string;
  abstentionReason: string | null;
  candidates: SemanticCandidate[];
  poolStats: SemanticCandidatePoolStats;
  roleCoverage: Record<string, number>;
  functionCoverage: Record<string, { requested: boolean; candidateCount: number }>;
  retrievalSpecificationFieldsUsed: string[];
  candidatePoolHash: string;
  professorEscalationEligible: boolean;
  metaIndependenceAudit: null | Record<string, unknown>;
};

export type SemanticCandidateRetrievalContext = {
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  roleIndex: CatalogRoleIndex;
  semanticNeighbors: Map<string, Array<{ oracleId: string; distance: number }>>;
  gameChangerSnapshot: CommanderGameChangerSnapshot;
};

const DEFAULT_PER_BUCKET_CAP = 40;

const ROLE_ALIASES: Record<string, DerivedRoleName> = {
  ramp: "ramp",
  mana: "ramp",
  mana_ramp: "ramp",
  card_draw: "card_draw",
  draw: "card_draw",
  card_advantage: "card_advantage",
  removal: "removal",
  countermagic: "countermagic",
  counter: "countermagic",
  tutor: "tutor",
  recursion: "recursion",
  reanimation: "reanimation",
  token_generation: "token_generation",
  tokens: "token_generation",
  sacrifice: "sacrifice_outlet",
  sacrifice_outlet: "sacrifice_outlet",
  sacrifice_payoff: "sacrifice_payoff",
  protection: "protection",
  board_wipe: "board_wipe",
  combat_payoff: "combat_payoff",
  graveyard_setup: "graveyard_setup",
  mill: "mill",
  opponent_mill_amplification: "mill",
  play_card_from_exile: "card_advantage",
  land_ramp: "ramp",
  graveyard_to_library_top: "recursion",
  unearth: "recursion",
  enchantment_recursion: "recursion",
  saga_token_copy: "token_generation",
  creature_from_library_top: "tutor",
  spell_cost_reduction: "cost_reduction",
  opponent_spell_tax: "cost_reduction",
  mana_doubling: "ramp",
  cost_reduction: "cost_reduction",
};

const FUNCTION_TO_BUCKET: Record<string, RetrievalBucketId> = {
  ramp: "MANA_SUPPORT",
  mana_generation: "MANA_SUPPORT",
  card_draw: "CARD_ADVANTAGE",
  card_advantage: "CARD_ADVANTAGE",
  removal: "INTERACTION",
  countermagic: "INTERACTION",
  board_wipe: "INTERACTION",
  tutor: "ENABLERS",
  recursion: "RECURSION",
  reanimation: "RECURSION",
  token_generation: "ENGINE_PIECES",
  sacrifice_outlet: "RESOURCE_CONSUMERS",
  sacrifice_payoff: "PAYOFFS",
  protection: "PROTECTION",
  combat_payoff: "PAYOFFS",
  graveyard_setup: "STATE_BUILDERS",
  blink_flicker: "ENABLERS",
  cost_reduction: "MANA_SUPPORT",
  combat_manipulation: "INTERACTION",
  mill: "STRUCTURAL_SUPPORT",
};

function mergeRetrievalSpecs(specs: RetrievalSpecification[]): RetrievalSpecification {
  const out: RetrievalSpecification = {
    requiredFunctions: [],
    desiredFunctions: [],
    requiredInputs: [],
    outputsToExploit: [],
    resourcesToProduce: [],
    resourcesToConsume: [],
    statesToMaintain: [],
    statesToIncrease: [],
    relevantCardTypes: [],
    relevantZones: [],
    protectionNeeds: [],
    redundancyNeeds: [],
    structuralNeeds: [],
    avoidFunctions: [],
    avoidCardClasses: [],
    selfPenaltyConditions: [],
    constructionConstraints: [],
  };
  for (const spec of specs) {
    out.selfPenaltyConditions.push(...spec.selfPenaltyConditions);
    for (const key of Object.keys(out) as (keyof RetrievalSpecification)[]) {
      if (key === "selfPenaltyConditions") continue;
      const acc = out[key] as string[];
      for (const v of spec[key] as string[]) {
        if (!acc.includes(v)) acc.push(v);
      }
    }
  }
  return out;
}

function resolveRole(fn: string): DerivedRoleName | null {
  if ((DERIVED_ROLE_NAMES as readonly string[]).includes(fn)) return fn as DerivedRoleName;
  return ROLE_ALIASES[fn.toLowerCase()] ?? ROLE_ALIASES[fn] ?? null;
}

function bucketForFunction(fn: string): RetrievalBucketId {
  const role = resolveRole(fn);
  if (role && FUNCTION_TO_BUCKET[role]) return FUNCTION_TO_BUCKET[role];
  if (fn.includes("ramp") || fn.includes("mana")) return "MANA_SUPPORT";
  if (fn.includes("draw")) return "CARD_ADVANTAGE";
  if (fn.includes("sacrifice")) return "RESOURCE_CONSUMERS";
  if (fn.includes("token")) return "ENGINE_PIECES";
  if (fn.includes("protection")) return "PROTECTION";
  if (fn.includes("recursion") || fn.includes("graveyard")) return "RECURSION";
  if (fn.includes("payoff") || fn.includes("damage")) return "PAYOFFS";
  return "STRUCTURAL_SUPPORT";
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

function matchesConstructionPreference(
  card: { typeLine?: string; oracleText?: string },
  constraint: string,
): boolean {
  const tl = (card.typeLine ?? "").toLowerCase();
  const text = (card.oracleText ?? "").toLowerCase();
  const c = constraint.toLowerCase();
  if (c.includes("minimize_controller_noncreature_spells")) {
    return /creature/.test(tl) && (/add .* mana|add \{/.test(text) || /search your library for .* land/.test(text));
  }
  if (c.includes("creature") && c.includes("ramp")) {
    return /creature/.test(tl) && (/add .* mana|add \{/.test(text) || /search your library for .* land/.test(text));
  }
  return /sacrifice/.test(text) && c.includes("sacrifice");
}

function validateCandidateCard(input: {
  oracleId: string;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  bracket: CommanderBracket;
  gameChangerSet: Set<string>;
  mergedSpec: RetrievalSpecification;
  userConstraints?: SemanticCandidateUserConstraints;
}): { eligible: boolean; legalityStatus: SemanticCandidateLegalityStatus; bracketStatus: SemanticCandidateBracketStatus; exclusionReasons: string[] } {
  const exclusionReasons: string[] = [];
  const card = input.catalog.byOracleId.get(input.oracleId);
  if (!card) {
    return {
      eligible: false,
      legalityStatus: "EXCLUDED",
      bracketStatus: {
        bracketRulesSatisfied: false,
        bracketIntentFit: null,
        gameChanger: false,
        exclusionReasons: ["UNRESOLVED_ORACLE"],
        note: "bracketRulesSatisfied is per-card pre-deck check — not candidate quality",
      },
      exclusionReasons: ["UNRESOLVED_ORACLE"],
    };
  }

  const paper = paperMetaForOracle(input.catalog, input.oracleId);
  if (!paper.paperEligible) exclusionReasons.push("NOT_PAPER_ELIGIBLE");
  if (!isCurrentlyCommanderLegal(card)) exclusionReasons.push("NOT_COMMANDER_FORMAT_LEGAL");
  if (!isCompetitiveDeckOracle(input.catalog, input.oracleId)) exclusionReasons.push("NOT_COMPETITIVE_DECK_ELIGIBLE");
  if (!commanderLegalInIdentity(card.colorIdentity ?? [], input.colorIdentity)) exclusionReasons.push("COLOR_IDENTITY");

  for (const id of input.userConstraints?.mustExcludeOracleIds ?? []) {
    if (id === input.oracleId) exclusionReasons.push("USER_MUST_EXCLUDE");
  }

  for (const cls of input.mergedSpec.avoidCardClasses) {
    if (matchesAvoidClass(card.oracleText ?? "", card.typeLine ?? "", cls)) exclusionReasons.push(`AVOID_CLASS:${cls}`);
  }

  const isGc = input.gameChangerSet.has(input.oracleId);
  const policy = getBracketPolicy(input.bracket);
  let bracketRulesSatisfied: boolean | "UNCERTAIN" = "UNCERTAIN";
  const bracketExclusions: string[] = [];
  if (isGc && policy.hardRules.gameChangerMax === 0) {
    bracketRulesSatisfied = false;
    bracketExclusions.push("GAME_CHANGER_NOT_ALLOWED_IN_BRACKET");
  } else if (isGc) {
    bracketRulesSatisfied = "UNCERTAIN";
    bracketExclusions.push("GAME_CHANGER_COUNT_UNCERTAIN_WITHOUT_FULL_DECK");
  } else {
    bracketRulesSatisfied = true;
  }

  const hardExclusions = exclusionReasons.filter((r) => !r.startsWith("AVOID_"));
  const eligible = hardExclusions.length === 0 && bracketRulesSatisfied !== false;

  return {
    eligible,
    legalityStatus: eligible ? (bracketRulesSatisfied === "UNCERTAIN" ? "UNCERTAIN" : "LEGAL") : "EXCLUDED",
    bracketStatus: {
      bracketRulesSatisfied,
      bracketIntentFit: null,
      gameChanger: isGc,
      exclusionReasons: bracketExclusions,
      note: "bracketRulesSatisfied is per-card pre-deck check — not candidate quality",
    },
    exclusionReasons: [...exclusionReasons, ...bracketExclusions],
  };
}

type QueryHit = {
  oracleId: string;
  bucketId: RetrievalBucketId;
  matchedFunctions: string[];
  source: "role_index" | "semantic_neighbor" | "zone_type" | "structural" | "output_exploit";
  evidence: string[];
};

function executeFunctionalQueries(input: {
  mergedSpec: RetrievalSpecification;
  roleIndex: CatalogRoleIndex;
  commanderOracleIds: string[];
  semanticNeighbors: Map<string, Array<{ oracleId: string; distance: number }>>;
  perBucketCap: number;
}): QueryHit[] {
  const hits: QueryHit[] = [];
  const seen = new Set<string>();

  const pushHit = (hit: QueryHit) => {
    const key = `${hit.oracleId}::${hit.bucketId}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };

  for (const fn of [...input.mergedSpec.requiredFunctions, ...input.mergedSpec.desiredFunctions]) {
    const role = resolveRole(fn);
    const bucket = bucketForFunction(fn);
    if (role) {
      for (const oracleId of input.roleIndex.roleToOracleIds.get(role) ?? []) {
        pushHit({ oracleId, bucketId: bucket, matchedFunctions: [fn], source: "role_index", evidence: [`role:${role}`, `function:${fn}`] });
      }
    }
  }

  for (const inputNeed of input.mergedSpec.requiredInputs) {
    const role = resolveRole(inputNeed);
    if (role) {
      for (const oracleId of input.roleIndex.roleToOracleIds.get(role) ?? []) {
        pushHit({ oracleId, bucketId: "STATE_BUILDERS", matchedFunctions: [inputNeed], source: "role_index", evidence: [`requiredInput:${inputNeed}`] });
      }
    }
  }

  for (const output of input.mergedSpec.outputsToExploit) {
    const role = resolveRole(output);
    if (role) {
      for (const oracleId of input.roleIndex.roleToOracleIds.get(role) ?? []) {
        pushHit({ oracleId, bucketId: "PAYOFFS", matchedFunctions: [output], source: "output_exploit", evidence: [`outputToExploit:${output}`] });
      }
    }
  }

  for (const zone of input.mergedSpec.relevantZones) {
    if (!zone.includes("graveyard")) continue;
    for (const role of ["recursion", "reanimation", "graveyard_setup"] as DerivedRoleName[]) {
      for (const oracleId of input.roleIndex.roleToOracleIds.get(role) ?? []) {
        pushHit({ oracleId, bucketId: "RECURSION", matchedFunctions: [zone], source: "zone_type", evidence: [`relevantZone:${zone}`, `role:${role}`] });
      }
    }
  }

  for (const constraint of input.mergedSpec.constructionConstraints) {
    if (!constraint.includes("ramp")) continue;
    for (const role of ["ramp", "mana_generation"] as DerivedRoleName[]) {
      for (const oracleId of input.roleIndex.roleToOracleIds.get(role) ?? []) {
        pushHit({ oracleId, bucketId: "CONSTRUCTION_CONSTRAINT_SUPPORT", matchedFunctions: [constraint], source: "structural", evidence: [`constructionConstraint:${constraint}`] });
      }
    }
  }

  for (const cmdId of input.commanderOracleIds) {
    for (const n of (input.semanticNeighbors.get(cmdId) ?? []).slice(0, 15)) {
      pushHit({
        oracleId: n.oracleId,
        bucketId: "ENABLERS",
        matchedFunctions: ["semantic_neighbor"],
        source: "semantic_neighbor",
        evidence: [`semantic_neighbor:distance=${n.distance.toFixed(3)}`, `from:${cmdId}`],
      });
    }
  }

  const bucketCounts = new Map<RetrievalBucketId, number>();
  const capped: QueryHit[] = [];
  for (const hit of hits) {
    const n = bucketCounts.get(hit.bucketId) ?? 0;
    if (n >= input.perBucketCap) continue;
    bucketCounts.set(hit.bucketId, n + 1);
    capped.push(hit);
  }
  return capped;
}

function buildCandidate(
  oracleId: string,
  hits: QueryHit[],
  input: {
    catalog: DeckResolutionCatalog;
    shadowIndex: ShadowSemanticIndex;
    buildDirections: CommanderBuildDirection[];
    directionAnchors: DirectionAnchor[];
    commanderOracleIds: string[];
    semanticNeighbors: Map<string, Array<{ oracleId: string; distance: number }>>;
    mergedSpec: RetrievalSpecification;
    bracket: CommanderBracket;
    gameChangerSet: Set<string>;
    colorIdentity: string[];
    userConstraints?: SemanticCandidateUserConstraints;
  },
): SemanticCandidate | null {
  const validation = validateCandidateCard({
    oracleId,
    catalog: input.catalog,
    colorIdentity: input.colorIdentity,
    bracket: input.bracket,
    gameChangerSet: input.gameChangerSet,
    mergedSpec: input.mergedSpec,
    userConstraints: input.userConstraints,
  });
  if (!validation.eligible) return null;

  const card = input.catalog.byOracleId.get(oracleId)!;
  const shadow = input.shadowIndex.byOracleId.get(oracleId);
  const bundle = shadow?.semantic ? buildCardFeatureBundle({ shadow, card }) : null;

  const buckets = [...new Set(hits.map((h) => h.bucketId))];
  const memberships: SemanticCandidateRoleMembership[] = buckets.map((bucketId) => {
    const bucketHits = hits.filter((h) => h.bucketId === bucketId);
    const fns = [...new Set(bucketHits.flatMap((h) => h.matchedFunctions))];
    const roleMatches = fns.filter((fn) => {
      const role = resolveRole(fn);
      return role && bundle?.derivedRoles.includes(role);
    }).length;
    return { bucketId, matchedFunctions: fns, roleFit: fns.length ? roleMatches / fns.length : 0.5 };
  });

  let neighborFit = 0;
  for (const cmdId of input.commanderOracleIds) {
    const match = (input.semanticNeighbors.get(cmdId) ?? []).find((n) => n.oracleId === oracleId);
    if (match) neighborFit = Math.max(neighborFit, 1 - Math.min(match.distance, 1));
  }

  const matchedDirections = input.buildDirections.filter((d) => d.phase6RetrievalReady).map((d) => d.directionId);
  const anchorMatches = input.directionAnchors.filter((a) => {
    if (!bundle) return false;
    return bundle.derivedRoles.some((r) => a.requirement.includes(r) || a.mechanism.toLowerCase().includes(r.replace(/_/g, "")));
  });

  const functionalRoleFit = memberships.reduce((s, m) => s + m.roleFit, 0) / Math.max(memberships.length, 1);
  let structuralFit = 1;
  for (const c of input.mergedSpec.constructionConstraints) {
    if (!matchesConstructionPreference(card, c)) structuralFit *= 0.85;
  }

  const whyCandidate: string[] = [];
  for (const hit of hits.slice(0, 4)) {
    if (hit.source === "role_index") whyCandidate.push(`Provides ${hit.matchedFunctions.join(", ")} required by the retrieval specification.`);
    else if (hit.source === "semantic_neighbor") whyCandidate.push("Semantically related to the commander via catalog semantic-map neighborhood.");
    else if (hit.source === "structural") whyCandidate.push(`Supports construction constraint: ${hit.matchedFunctions[0]}.`);
    else if (hit.source === "output_exploit") whyCandidate.push(`Exploits output ${hit.matchedFunctions[0]} from the build direction.`);
  }
  if (memberships.length > 1) whyCandidate.push(`Multi-role: ${memberships.map((m) => m.bucketId).join(" + ")}.`);

  return {
    oracleId,
    semanticMapNodeId: oracleId,
    canonicalName: card.canonicalName,
    matchedDirections,
    matchedRetrievalBuckets: buckets,
    candidateRoleMemberships: memberships,
    commanderSemanticFit: neighborFit,
    directionFit: matchedDirections.length > 0 ? 0.7 + anchorMatches.length * 0.1 : 0.3,
    functionalRoleFit,
    structuralFit,
    matchedAnchors: anchorMatches.map((a) => a.anchorId),
    matchedMechanics: bundle?.topActions ?? [],
    evidenceRefs: hits.flatMap((h) => h.evidence).slice(0, 12),
    whyCandidate: [...new Set(whyCandidate)].slice(0, 5),
    legalityStatus: validation.legalityStatus,
    bracketStatus: validation.bracketStatus,
    positiveSignals: hits.map((h) => h.source),
    negativeSignals: validation.exclusionReasons,
    retrievalSource: SEMANTIC_CANDIDATE_RETRIEVAL_MODE,
    routeProvenance: hits.slice(0, 3).map((hit) => ({
      semanticMapNodeId: oracleId,
      sourceDirectionId: matchedDirections[0] ?? "direction:unknown",
      retrievalBucketId: hit.bucketId,
      relationshipReason: hit.source,
      relationshipEvidence: hit.evidence,
    })),
  };
}

export function retrieveSemanticCandidates(
  request: SemanticCandidateRetrievalRequest,
  ctx: SemanticCandidateRetrievalContext,
): SemanticCandidateRetrievalReport {
  const readyDirections = request.buildDirections.filter((d) => d.phase6RetrievalReady);
  if (readyDirections.length === 0) {
    return {
      version: SEMANTIC_CANDIDATE_RETRIEVAL_V1_VERSION,
      retrievalMode: SEMANTIC_CANDIDATE_RETRIEVAL_MODE,
      generatedAt: new Date().toISOString(),
      abstentionReason: "NO_RETRIEVAL_READY_DIRECTION",
      candidates: [],
      poolStats: emptyPoolStats(ctx.roleIndex.poolSize),
      roleCoverage: {},
      functionCoverage: {},
      retrievalSpecificationFieldsUsed: [],
      candidatePoolHash: createHash("sha256").update("abstain").digest("hex"),
      professorEscalationEligible: true,
      metaIndependenceAudit: null,
    };
  }

  const specs = request.retrievalSpecifications.length > 0 ? request.retrievalSpecifications : readyDirections.map((d) => d.retrievalSpecification);
  const mergedSpec = mergeRetrievalSpecs(specs);
  const gameChangerSet = gameChangerOracleIdSet(ctx.gameChangerSnapshot);
  const hits = executeFunctionalQueries({
    mergedSpec,
    roleIndex: ctx.roleIndex,
    commanderOracleIds: request.commanderOracleIds,
    semanticNeighbors: ctx.semanticNeighbors,
    perBucketCap: request.perBucketCap ?? DEFAULT_PER_BUCKET_CAP,
  });

  const byCard = new Map<string, QueryHit[]>();
  for (const hit of hits) {
    const list = byCard.get(hit.oracleId) ?? [];
    list.push(hit);
    byCard.set(hit.oracleId, list);
  }

  const candidates: SemanticCandidate[] = [];
  let legalExclusions = 0;
  let bracketExclusions = 0;
  let negativeConstraintExclusions = 0;
  let colorIdentityExclusions = 0;

  for (const [oracleId, cardHits] of byCard) {
    const candidate = buildCandidate(oracleId, cardHits, {
      catalog: ctx.catalog,
      shadowIndex: ctx.shadowIndex,
      buildDirections: readyDirections,
      directionAnchors: request.directionAnchors,
      commanderOracleIds: request.commanderOracleIds,
      semanticNeighbors: ctx.semanticNeighbors,
      mergedSpec,
      bracket: request.bracket,
      gameChangerSet,
      colorIdentity: request.combinedColorIdentity,
      userConstraints: request.userConstraints,
    });
    if (!candidate) {
      const v = validateCandidateCard({ oracleId, catalog: ctx.catalog, colorIdentity: request.combinedColorIdentity, bracket: request.bracket, gameChangerSet, mergedSpec, userConstraints: request.userConstraints });
      if (v.exclusionReasons.includes("COLOR_IDENTITY")) colorIdentityExclusions += 1;
      else if (v.bracketStatus.bracketRulesSatisfied === false) bracketExclusions += 1;
      else if (v.exclusionReasons.some((r) => r.startsWith("AVOID_"))) negativeConstraintExclusions += 1;
      else legalExclusions += 1;
      continue;
    }
    if (getSemanticMapPoint(oracleId)) candidate.positiveSignals.push("semantic_map_node_present");
    candidates.push(candidate);
  }

  const candidatesPerBucket: Record<string, number> = {};
  for (const c of candidates) {
    for (const b of c.matchedRetrievalBuckets) candidatesPerBucket[b] = (candidatesPerBucket[b] ?? 0) + 1;
  }

  const roleCoverage: Record<string, number> = {};
  for (const fn of mergedSpec.requiredFunctions) {
    roleCoverage[fn] = candidates.filter((c) => c.candidateRoleMemberships.some((m) => m.matchedFunctions.includes(fn))).length;
  }

  const functionCoverage: Record<string, { requested: boolean; candidateCount: number }> = {};
  for (const fn of [...mergedSpec.requiredFunctions, ...mergedSpec.desiredFunctions]) {
    functionCoverage[fn] = { requested: mergedSpec.requiredFunctions.includes(fn), candidateCount: roleCoverage[fn] ?? 0 };
  }

  const coveredRequired = mergedSpec.requiredFunctions.filter((fn) => (roleCoverage[fn] ?? 0) > 0).length;
  const retrievalSpecificationCoverage = mergedSpec.requiredFunctions.length > 0 ? coveredRequired / mergedSpec.requiredFunctions.length : 1;

  return {
    version: SEMANTIC_CANDIDATE_RETRIEVAL_V1_VERSION,
    retrievalMode: SEMANTIC_CANDIDATE_RETRIEVAL_MODE,
    generatedAt: new Date().toISOString(),
    abstentionReason: null,
    candidates,
    poolStats: {
      candidateCount: candidates.length,
      candidatesPerBucket,
      crossBucketCandidates: candidates.filter((c) => c.matchedRetrievalBuckets.length > 1).length,
      duplicateCollapseCount: hits.length - byCard.size,
      legalExclusions,
      bracketExclusions,
      negativeConstraintExclusions,
      colorIdentityExclusions,
      catalogPoolSize: ctx.roleIndex.poolSize,
      retrievalSpecificationCoverage,
    },
    roleCoverage,
    functionCoverage,
    retrievalSpecificationFieldsUsed: Object.entries(mergedSpec).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([k]) => k),
    candidatePoolHash: createHash("sha256").update(JSON.stringify(candidates.map((c) => c.oracleId).sort())).digest("hex"),
    professorEscalationEligible: false,
    metaIndependenceAudit: null,
  };
}

function emptyPoolStats(catalogPoolSize: number): SemanticCandidatePoolStats {
  return {
    candidateCount: 0,
    candidatesPerBucket: {},
    crossBucketCandidates: 0,
    duplicateCollapseCount: 0,
    legalExclusions: 0,
    bracketExclusions: 0,
    negativeConstraintExclusions: 0,
    colorIdentityExclusions: 0,
    catalogPoolSize,
    retrievalSpecificationCoverage: 0,
  };
}

export function findSemanticCandidates(request: SemanticCandidateRetrievalRequest, ctx: SemanticCandidateRetrievalContext) {
  if (CANDIDATE_RETRIEVAL_MODE_V1.defaultMode !== "SEMANTIC_ONLY") throw new Error("Phase 6A requires SEMANTIC_ONLY");
  return retrieveSemanticCandidates(request, ctx);
}

export function getCandidateEvidence(report: SemanticCandidateRetrievalReport, oracleId: string) {
  return report.candidates.find((c) => c.oracleId === oracleId) ?? null;
}

export function getAlternativesForFunction(report: SemanticCandidateRetrievalReport, fn: string, excludeOracleId?: string) {
  return report.candidates.filter((c) => c.oracleId !== excludeOracleId && c.candidateRoleMemberships.some((m) => m.matchedFunctions.includes(fn)));
}

export function inspectCandidatePool(report: SemanticCandidateRetrievalReport) {
  return { candidateCount: report.poolStats.candidateCount, candidatesPerBucket: report.poolStats.candidatesPerBucket, crossBucketCandidates: report.poolStats.crossBucketCandidates, candidatePoolHash: report.candidatePoolHash, retrievalMode: report.retrievalMode };
}

export function inspectRoleCoverage(report: SemanticCandidateRetrievalReport) {
  return {
    roleCoverage: report.roleCoverage,
    functionCoverage: report.functionCoverage,
    retrievalSpecificationCoverage: report.poolStats.retrievalSpecificationCoverage,
    uncoveredRequiredFunctions: Object.entries(report.functionCoverage).filter(([, v]) => v.requested && v.candidateCount === 0).map(([fn]) => fn),
  };
}

export type ProfessorAssistanceRequest = {
  signal: "PROFESSOR_ASSISTANCE_REQUEST";
  commandZoneConfiguration: string;
  bracket: CommanderBracket;
  buildDirections: CommanderBuildDirection[];
  retrievalReport: SemanticCandidateRetrievalReport | null;
  abstentionReason: string;
  selectedCardOracleIds?: string[];
  selectedCount?: number;
  targetDeckSize?: number;
};

export function buildProfessorAssistanceRequest(input: {
  request: SemanticCandidateRetrievalRequest;
  report: SemanticCandidateRetrievalReport;
  reason: string;
  selectedCardOracleIds?: string[];
}): ProfessorAssistanceRequest {
  return {
    signal: "PROFESSOR_ASSISTANCE_REQUEST",
    commandZoneConfiguration: input.request.commandZoneConfiguration,
    bracket: input.request.bracket,
    buildDirections: input.request.buildDirections,
    retrievalReport: input.report,
    abstentionReason: input.reason,
    selectedCardOracleIds: input.selectedCardOracleIds,
    selectedCount: input.selectedCardOracleIds?.length,
    targetDeckSize: 100,
  };
}
