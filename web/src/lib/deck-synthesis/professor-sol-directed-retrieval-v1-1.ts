/**
 * Requirement-specific retrieval with global candidate dictionary, seeds, guardrails, land plan.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";

/** The catalog's card record, named locally so land ranking can be typed. */
type CatalogCardV11 = NonNullable<ReturnType<DeckResolutionCatalog["byOracleId"]["get"]>>;
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import { isCanonicalLandForDeckPartition } from "./professor-canonical-deck-partition-v1";
import {
  classifyLandManaQualityV1,
  isLandUnusableInIdentityV1,
  landManaQualityRankV1,
} from "./professor-sol-directed-land-mana-quality-v1";
import { basicLandColorIdentity, isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import { resolveCanonicalCardIdentity } from "./professor-canonical-card-identity-v4-15-1-v1";
import { resolvePlayableExactNameInCatalog } from "./professor-playable-oracle-resolution-v1-1-1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import {
  cardMatchesDeckSetRestrictions,
  parseDeckSetRestrictions,
  type DeckSetRestrictionsV111,
} from "./professor-sol-directed-deck-preferences-v1-1-1";
import type {
  CanonicalCardFactsV11,
  LandPoolEntryV11,
  LandPoolV11,
  PreferredExampleResolutionV11,
  RequirementPoolV11,
  RetrievalContractRequirementV11,
  RetrievalContractV11,
  RetrievalResultV11,
  SemanticNeighborIndexV11,
} from "./professor-sol-directed-types-v1-1";
import { PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION } from "./professor-sol-directed-types-v1-1";
import { inferCardSemanticFunctions } from "./professor-card-semantic-functions-v1-1-1";
import { getSemanticOracleFactsForOracleId } from "./professor-semantic-oracle-facts-v1-1-1";
import { scoreRequirementSemanticFitV111 } from "./professor-requirement-semantic-profiles-v1-1-1";
import {
  scoreUserSemanticPreferencesV111,
  type UserSemanticPreferencesV111,
} from "./professor-user-semantic-preferences-v1-1-1";
import {
  bracketPowerAdjustmentV1,
  bracketPowerAppetiteV1,
  type BracketPowerAdjustmentV1,
  type BracketPowerAppetiteV1,
} from "./professor-sol-directed-bracket-power-ranking-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";

export const PROFESSOR_SOL_DIRECTED_RETRIEVAL_V1_1_VERSION = "professor-sol-directed-retrieval-v1-1";

const BASIC_LAND_KINDS: Array<{
  kind: string;
  name: string;
  colors: string[];
  roleHint: string;
}> = [
  { kind: "plains", name: "Plains", colors: ["W"], roleHint: "plains" },
  { kind: "island", name: "Island", colors: ["U"], roleHint: "island" },
  { kind: "swamp", name: "Swamp", colors: ["B"], roleHint: "swamp" },
  { kind: "mountain", name: "Mountain", colors: ["R"], roleHint: "mountain" },
  { kind: "forest", name: "Forest", colors: ["G"], roleHint: "forest" },
  { kind: "wastes", name: "Wastes", colors: [], roleHint: "wastes" },
];

type RoleSearchProfile = {
  extraTokens: string[];
  oraclePatterns: RegExp[];
  typeHints: string[];
};

const ROLE_SEARCH_PROFILES: Record<string, RoleSearchProfile> = {
  ramp_and_fixing: {
    extraTokens: ["ramp", "mana", "land", "add", "search your library for a basic", "rock", "signet", "sol ring"],
    oraclePatterns: [/\badd \{[WUBRGC]\}/, /search your library for a .* land/, /put .* land .* onto the battlefield/],
    typeHints: ["artifact", "creature", "instant", "sorcery"],
  },
  repeatable_token_engines: {
    extraTokens: ["token", "every upkeep", "each upkeep", "beginning of", "create", "persist", "engine"],
    oraclePatterns: [/create .* token/, /at the beginning of .* create/, /whenever .* create .* token/],
    typeHints: ["enchantment", "creature", "artifact", "planeswalker"],
  },
  burst_token_production: {
    extraTokens: ["create", "tokens", "multiple", "sweep", "storm", "instant", "sorcery"],
    oraclePatterns: [/create (two|three|four|five|six|seven|eight|nine|ten|\d+) .* token/, /create that many token/],
    typeHints: ["instant", "sorcery", "creature"],
  },
  sacrifice_outlets: {
    extraTokens: ["sacrifice", "outlet", "without paying", "free", "activate", "another creature"],
    oraclePatterns: [/\bsacrifice (a|another|target) creature/, /sacrifice a creature:/, /: sacrifice/],
    typeHints: ["creature", "artifact", "enchantment"],
  },
  token_and_death_payoffs: {
    extraTokens: ["whenever a creature dies", "whenever .* dies", "drain", "lose life", "token", "aristocrats"],
    oraclePatterns: [/whenever .* dies/, /whenever a creature dies/, /each opponent loses .* life/],
    typeHints: ["creature", "enchantment"],
  },
  card_advantage_and_selection: {
    extraTokens: ["draw", "draws", "draw a card", "draw cards", "selection", "scry", "surveil", "discover"],
    oraclePatterns: [/draw (a|one|two|three|\d+) card/, /draws .* card/, /draw cards equal to/],
    typeHints: ["instant", "sorcery", "enchantment", "artifact", "creature"],
  },
  interaction: {
    extraTokens: ["destroy", "exile", "remove", "counter target", "sweep", "destroy all", "toxic deluge"],
    oraclePatterns: [/destroy target/, /exile target/, /counter target/, /destroy all/, /each creature gets -/],
    typeHints: ["instant", "sorcery", "artifact", "enchantment", "creature"],
  },
  protection: {
    extraTokens: ["hexproof", "indestructible", "protection", "prevent", "regenerate", "shield", "save"],
    oraclePatterns: [/hexproof/, /indestructible/, /protection from/, /prevent all damage/, /regenerate/],
    typeHints: ["instant", "sorcery", "enchantment"],
  },
  recursion: {
    extraTokens: ["return", "graveyard", "from your graveyard", "recover", "reanimate", "flashback"],
    oraclePatterns: [/return .* from .* graveyard/, /from your graveyard to/, /cast .* from .* graveyard/],
    typeHints: ["instant", "sorcery", "enchantment", "creature"],
  },
  combat_finishers: {
    extraTokens: ["overrun", "trample", "power", "combat", "attacking", "double strike", "craterhoof", "stampede"],
    oraclePatterns: [/gets \+\d+\/\+\d+ until end of turn/, /gain .* trample/, /power .* attacking/, /double strike/],
    typeHints: ["instant", "sorcery", "enchantment", "creature"],
  },
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function collectProhibitedNames(contract: RetrievalContractV11): Set<string> {
  const names = new Set<string>();
  const guardrails = contract.comboAndPowerGuardrails;
  const prohibitedCards = Array.isArray(guardrails.prohibitedCards) ? guardrails.prohibitedCards : [];
  for (const item of prohibitedCards) {
    if (item && typeof item === "object" && "name" in item && typeof (item as { name: string }).name === "string") {
      names.add((item as { name: string }).name.toLowerCase());
    }
  }
  const prohibitedPackages = Array.isArray(guardrails.prohibitedPackages) ? guardrails.prohibitedPackages : [];
  for (const pkg of prohibitedPackages) {
    if (pkg && typeof pkg === "object" && Array.isArray((pkg as { cards?: string[] }).cards)) {
      for (const name of (pkg as { cards: string[] }).cards) names.add(name.toLowerCase());
    }
  }
  return names;
}

function isExcludedByGuardrail(name: string, prohibitedNames: Set<string>): boolean {
  const lower = name.toLowerCase();
  for (const banned of prohibitedNames) {
    if (lower === banned || lower.includes(banned)) return true;
  }
  return false;
}

function toCardFacts(args: {
  oracleId: string;
  catalog: DeckResolutionCatalog;
}): CanonicalCardFactsV11 | null {
  const card = args.catalog.byOracleId.get(args.oracleId);
  if (!card) return null;
  const truth = resolveCanonicalCardTruthV4164({
    name: card.canonicalName,
    oracleId: card.oracleId,
    catalog: args.catalog,
  });
  if (!cardTruthAllowsIntelligenceParticipation(truth)) return null;
  const oracleText = truth.oracleText;
  const typeLine = truth.typeLine;
  return {
    oracleId: truth.oracleId!,
    name: truth.name,
    manaValue: truth.manaValue,
    typeLine,
    colorIdentity: truth.colorIdentity,
    oracleText,
    semanticFunctions: inferCardSemanticFunctions(oracleText, typeLine),
    semanticOracle: getSemanticOracleFactsForOracleId(truth.oracleId!),
    commanderLegal: isCurrentlyCommanderLegal(card),
    isLand: isCanonicalLandForDeckPartition(truth),
  };
}

export function exactResolvePreferredExampleV11(args: {
  exampleName: string;
  requirementId: string;
  catalog: DeckResolutionCatalog;
  commanderColorIdentity: string[];
  prohibitedNames: Set<string>;
}): PreferredExampleResolutionV11 {
  const excluded = isExcludedByGuardrail(args.exampleName, args.prohibitedNames);
  const resolved = resolvePlayableExactNameInCatalog({
    name: args.exampleName,
    catalog: args.catalog,
    commanderColorIdentity: args.commanderColorIdentity,
  });
  if (!resolved.resolved || !resolved.oracleId) {
    return {
      exampleName: args.exampleName,
      requirementId: args.requirementId,
      oracleId: null,
      canonicalName: null,
      resolved: false,
      commanderLegal: false,
      colorLegal: false,
      excludedByGuardrail: excluded,
      exclusionReason: excluded ? "GUARDRAIL" : "NOT_IN_CATALOG",
    };
  }
  return {
    exampleName: args.exampleName,
    requirementId: args.requirementId,
    oracleId: resolved.oracleId,
    canonicalName: resolved.canonicalName,
    resolved: true,
    commanderLegal: resolved.commanderLegal,
    colorLegal: resolved.colorLegal,
    excludedByGuardrail: excluded,
    exclusionReason: excluded ? "GUARDRAIL" : null,
  };
}

export type RetrievalLaneV11 = "primary" | "expansion" | "below_expansion_threshold";

/** Expansion pass 1 / pass 2 score floors — used only after primary functional matches. */
export const RETRIEVAL_EXPANSION_MIN_SCORE_PASS1_V11 = 16;
export const RETRIEVAL_EXPANSION_MIN_SCORE_PASS2_V11 = 8;

/**
 * The RC8 artifact stores 20 neighbors per card; the far half of that list is already only loosely
 * related, so functional substitutes are looked for in the nearer half only.
 */
export const RETRIEVAL_NEIGHBOR_CANDIDATES_PER_SEED_V11 = 10;

/**
 * Pool-selected matches also seed neighbor expansion, but only the strongest few: the tail of a pool
 * is itself expansion-lane filler, and its neighbors drift another step away from the requirement.
 */
export const RETRIEVAL_NEIGHBOR_SEEDS_FROM_POOL_V11 = 5;

/**
 * Hard ceiling on neighbor-sourced ids per requirement pool. The smallest pool target is 12
 * (computeTargetPoolSize), so 6 leaves scored retrieval the majority source in every pool and bounds
 * how far one mis-seeded requirement can drag the constructor prompt away from the architect's plan.
 */
export const RETRIEVAL_NEIGHBOR_POOL_CAP_V11 = 6;

export function classifyRetrievalLaneV11(args: {
  functionalMatch: boolean;
  score: number;
}): RetrievalLaneV11 {
  if (args.functionalMatch) return "primary";
  if (args.score >= RETRIEVAL_EXPANSION_MIN_SCORE_PASS2_V11) return "expansion";
  return "below_expansion_threshold";
}

function scoreForRequirement(args: {
  facts: CanonicalCardFactsV11;
  requirement: RetrievalContractRequirementV11;
  profile: RoleSearchProfile;
  userSemanticPreferences?: UserSemanticPreferencesV111 | null;
}): { score: number; functionalMatch: boolean; lane: RetrievalLaneV11 } {
  const hay = `${args.facts.oracleText} ${args.facts.typeLine} ${args.facts.name}`.toLowerCase();
  let score = 0;
  const reqText = [
    args.requirement.primaryRole,
    ...args.requirement.naturalLanguageRequirements,
    ...args.profile.extraTokens,
  ].join(" ");
  for (const token of tokenize(reqText)) {
    if (hay.includes(token)) score += 2;
  }
  for (const pattern of args.profile.oraclePatterns) {
    if (pattern.test(hay)) score += 8;
  }
  for (const hint of args.profile.typeHints) {
    if (hay.includes(hint)) score += 1;
  }

  const semanticFit = scoreRequirementSemanticFitV111({
    facts: args.facts.semanticOracle,
    requirementId: args.requirement.requirementId,
    primaryRole: args.requirement.primaryRole,
  });
  score += semanticFit.score;
  score += scoreUserSemanticPreferencesV111({
    facts: args.facts.semanticOracle,
    typeLine: args.facts.typeLine,
    manaValue: args.facts.manaValue,
    preferences: args.userSemanticPreferences,
  });

  const functionalMatch = semanticFit.functionalMatch;
  return { score, functionalMatch, lane: classifyRetrievalLaneV11({ functionalMatch, score }) };
}

export function diagnoseRequirementRetrievalV11(args: {
  facts: CanonicalCardFactsV11;
  requirement: RetrievalContractRequirementV11;
  userSemanticPreferences?: UserSemanticPreferencesV111 | null;
}): { score: number; functionalMatch: boolean; lane: RetrievalLaneV11 } {
  const profile = ROLE_SEARCH_PROFILES[args.requirement.requirementId] ?? {
    extraTokens: tokenize(args.requirement.primaryRole),
    oraclePatterns: [],
    typeHints: [],
  };
  return scoreForRequirement({
    facts: args.facts,
    requirement: args.requirement,
    profile,
    userSemanticPreferences: args.userSemanticPreferences,
  });
}

function computeTargetPoolSize(requestedCount: number): number {
  return Math.max(12, requestedCount * 3);
}

function legalNonlandCorpus(args: {
  catalog: DeckResolutionCatalog;
  commanderColorIdentity: string[];
  commanderOracleId: string;
  prohibitedOracleIds: Set<string>;
  setRestrictions?: DeckSetRestrictionsV111 | null;
}): string[] {
  const ids: string[] = [];
  for (const card of args.catalog.byOracleId.values()) {
    if (card.oracleId === args.commanderOracleId) continue;
    if (args.prohibitedOracleIds.has(card.oracleId)) continue;
    if (args.setRestrictions && !cardMatchesDeckSetRestrictions(card, args.setRestrictions)) continue;
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!commanderLegalInIdentity(card.colorIdentity ?? [], args.commanderColorIdentity)) continue;
    const truth = resolveCanonicalCardTruthV4164({
      name: card.canonicalName,
      oracleId: card.oracleId,
      catalog: args.catalog,
    });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) continue;
    if (isCanonicalLandForDeckPartition(truth)) continue;
    ids.push(card.oracleId);
  }
  ids.sort((a, b) => a.localeCompare(b));
  return ids;
}

/**
 * Everything retrieval needs to let the requested bracket influence pool
 * ranking. Supplied by the caller so retrieval stays free of artifact loading.
 */
export type BracketPowerContextV11 = {
  appetite: BracketPowerAppetiteV1;
  gameChangerOracleIds: ReadonlySet<string>;
  /** Share of colour-eligible tournament decks playing each card. */
  playRateByOracleId: ReadonlyMap<string, number>;
};

/**
 * Resolves one card's bracket-power verdict. With no context supplied this is
 * a no-op, which is what keeps the feature inert until a caller opts in.
 */
function bracketPowerForOracleV11(
  context: BracketPowerContextV11 | null | undefined,
  oracleId: string,
): BracketPowerAdjustmentV1 {
  if (!context) return { excluded: false, bonus: 0 };
  return bracketPowerAdjustmentV1({
    appetite: context.appetite,
    isGameChanger: context.gameChangerOracleIds.has(oracleId),
    playRate: context.playRateByOracleId.get(oracleId) ?? null,
  });
}

/**
 * Neighbor ids ranked by seed priority then RC8 cosine distance, so architect-preferred examples
 * outrank pool-selected matches, which outrank the commander's generic neighborhood.
 */
function collectNeighborExpansionIdsV11(args: {
  requirementSeedOracleIds: string[];
  poolSelectedOracleIds: string[];
  commanderOracleId: string;
  neighbors: SemanticNeighborIndexV11;
  corpusOracleIdSet: Set<string>;
  alreadyInPool: Set<string>;
  limit: number;
  catalog: DeckResolutionCatalog;
  dictionary: Map<string, CanonicalCardFactsV11>;
  bracketPower?: BracketPowerContextV11 | null;
}): string[] {
  if (args.limit <= 0) return [];

  const seedTiers: string[][] = [
    args.requirementSeedOracleIds,
    args.poolSelectedOracleIds.slice(0, RETRIEVAL_NEIGHBOR_SEEDS_FROM_POOL_V11),
    [args.commanderOracleId],
  ];

  const ranked = new Map<string, { seedTier: number; distance: number }>();
  for (const [seedTier, seeds] of seedTiers.entries()) {
    for (const seedOracleId of seeds) {
      const seedNeighbors = args.neighbors.get(seedOracleId) ?? [];
      for (const neighbor of seedNeighbors.slice(0, RETRIEVAL_NEIGHBOR_CANDIDATES_PER_SEED_V11)) {
        if (args.alreadyInPool.has(neighbor.oracleId)) continue;
        // Membership in the legal corpus is the whole legality/color-identity/guardrail/non-land gate.
        if (!args.corpusOracleIdSet.has(neighbor.oracleId)) continue;
        const prior = ranked.get(neighbor.oracleId);
        const better =
          !prior ||
          seedTier < prior.seedTier ||
          (seedTier === prior.seedTier && neighbor.distance < prior.distance);
        if (better) ranked.set(neighbor.oracleId, { seedTier, distance: neighbor.distance });
      }
    }
  }

  const ordered = [...ranked.entries()].sort(
    (a, b) => a[1].seedTier - b[1].seedTier || a[1].distance - b[1].distance || a[0].localeCompare(b[0]),
  );

  const accepted: string[] = [];
  for (const [oracleId] of ordered) {
    if (accepted.length >= args.limit) break;
    if (bracketPowerForOracleV11(args.bracketPower, oracleId).excluded) continue;
    const facts = args.dictionary.get(oracleId) ?? toCardFacts({ oracleId, catalog: args.catalog });
    if (!facts || facts.isLand) continue;
    args.dictionary.set(facts.oracleId, facts);
    accepted.push(facts.oracleId);
  }
  return accepted;
}

function retrieveRequirementPool(args: {
  requirement: RetrievalContractRequirementV11;
  contract: RetrievalContractV11;
  catalog: DeckResolutionCatalog;
  commander: CommanderBlueprintV417;
  prohibitedNames: Set<string>;
  prohibitedOracleIds: Set<string>;
  corpusOracleIds: string[];
  dictionary: Map<string, CanonicalCardFactsV11>;
  userSemanticPreferences?: UserSemanticPreferencesV111 | null;
  /** Both supplied together only when the caller enabled semantic-neighbor expansion. */
  semanticNeighbors?: SemanticNeighborIndexV11 | null;
  corpusOracleIdSet?: Set<string> | null;
  /** Supplied only when the caller enabled bracket-aware power ranking. */
  bracketPower?: BracketPowerContextV11 | null;
}): RequirementPoolV11 {
  const profile = ROLE_SEARCH_PROFILES[args.requirement.requirementId] ?? {
    extraTokens: tokenize(args.requirement.primaryRole),
    oraclePatterns: [],
    typeHints: [],
  };
  const poolTargetSize = computeTargetPoolSize(args.requirement.requestedCount);
  const seedOracleIds: string[] = [];
  const semanticOracleIds: string[] = [];

  for (const example of args.requirement.preferredExamples) {
    const resolution = exactResolvePreferredExampleV11({
      exampleName: example,
      requirementId: args.requirement.requirementId,
      catalog: args.catalog,
      commanderColorIdentity: args.commander.colorIdentity,
      prohibitedNames: args.prohibitedNames,
    });
    if (
      resolution.resolved &&
      resolution.oracleId &&
      resolution.commanderLegal &&
      resolution.colorLegal &&
      !resolution.excludedByGuardrail &&
      // An architect naming a Game Changer must not smuggle one into a bracket
      // whose hard rules allow none.
      !bracketPowerForOracleV11(args.bracketPower, resolution.oracleId).excluded
    ) {
      const facts = toCardFacts({ oracleId: resolution.oracleId, catalog: args.catalog });
      if (facts && !facts.isLand) {
        args.dictionary.set(facts.oracleId, facts);
        if (!seedOracleIds.includes(facts.oracleId)) seedOracleIds.push(facts.oracleId);
      }
    }
  }

  const scored: Array<{ oracleId: string; score: number; functionalMatch: boolean }> = [];
  for (const oracleId of args.corpusOracleIds) {
    if (seedOracleIds.includes(oracleId)) continue;
    const facts = args.dictionary.get(oracleId) ?? toCardFacts({ oracleId, catalog: args.catalog });
    if (!facts || facts.isLand) continue;
    args.dictionary.set(facts.oracleId, facts);
    const ranked = scoreForRequirement({
      facts,
      requirement: args.requirement,
      profile,
      userSemanticPreferences: args.userSemanticPreferences,
    });
    if (ranked.score <= 0 && !ranked.functionalMatch) continue;
    const power = bracketPowerForOracleV11(args.bracketPower, oracleId);
    if (power.excluded) continue;
    scored.push({
      oracleId,
      score: ranked.score + power.bonus,
      functionalMatch: ranked.functionalMatch,
    });
  }
  scored.sort(
    (a, b) =>
      Number(b.functionalMatch) - Number(a.functionalMatch) ||
      b.score - a.score ||
      a.oracleId.localeCompare(b.oracleId),
  );

  for (const row of scored) {
    if (semanticOracleIds.length + seedOracleIds.length >= poolTargetSize) break;
    if (!row.functionalMatch) continue;
    if (!semanticOracleIds.includes(row.oracleId)) semanticOracleIds.push(row.oracleId);
  }

  let expansionPass = 0;
  while (seedOracleIds.length + semanticOracleIds.length < poolTargetSize && expansionPass < 2) {
    expansionPass += 1;
    const minScore = expansionPass === 1 ? 16 : 8;
    for (const row of scored) {
      if (seedOracleIds.includes(row.oracleId) || semanticOracleIds.includes(row.oracleId)) continue;
      if (row.score < minScore) continue;
      semanticOracleIds.push(row.oracleId);
      if (seedOracleIds.length + semanticOracleIds.length >= poolTargetSize) break;
    }
  }

  const neighborOracleIds: string[] = [];
  const filledPoolSize = seedOracleIds.length + semanticOracleIds.length;
  if (args.semanticNeighbors && args.corpusOracleIdSet && filledPoolSize < poolTargetSize) {
    neighborOracleIds.push(
      ...collectNeighborExpansionIdsV11({
        requirementSeedOracleIds: seedOracleIds,
        poolSelectedOracleIds: semanticOracleIds,
        commanderOracleId: args.commander.oracleId,
        neighbors: args.semanticNeighbors,
        corpusOracleIdSet: args.corpusOracleIdSet,
        alreadyInPool: new Set([...seedOracleIds, ...semanticOracleIds]),
        limit: Math.min(RETRIEVAL_NEIGHBOR_POOL_CAP_V11, poolTargetSize - filledPoolSize),
        catalog: args.catalog,
        dictionary: args.dictionary,
        bracketPower: args.bracketPower,
      }),
    );
  }

  return {
    requirementId: args.requirement.requirementId,
    primaryRole: args.requirement.primaryRole,
    requestedCount: args.requirement.requestedCount,
    targetPoolSize: poolTargetSize,
    oracleIds: [...seedOracleIds, ...semanticOracleIds, ...neighborOracleIds],
    seedOracleIds,
    semanticOracleIds,
    ...(neighborOracleIds.length > 0 ? { neighborOracleIds } : {}),
  };
}

function resolveLandName(args: {
  name: string;
  catalog: DeckResolutionCatalog;
  commanderColorIdentity: string[];
  category: LandPoolEntryV11["category"];
  maxCopies?: number;
}): LandPoolEntryV11 | null {
  const identity = resolveCanonicalCardIdentity({ name: args.name, catalog: args.catalog });
  if (!identity.oracleId) return null;
  const card = args.catalog.byOracleId.get(identity.oracleId)!;
  const truth = resolveCanonicalCardTruthV4164({
    name: card.canonicalName,
    oracleId: identity.oracleId,
    catalog: args.catalog,
  });
  if (!isCanonicalLandForDeckPartition(truth)) return null;
  if (!isCurrentlyCommanderLegal(card)) return null;
  const landColorIdentity = isBasicLandName(truth.name)
    ? basicLandColorIdentity(truth.name)
    : truth.colorIdentity;
  if (!commanderLegalInIdentity(landColorIdentity, args.commanderColorIdentity)) return null;
  const lower = identity.canonicalName.toLowerCase();
  const isBasic = lower === "forest" || lower === "swamp";
  return {
    name: identity.canonicalName,
    oracleId: identity.oracleId,
    isBasic,
    basicKind: lower === "forest" ? "forest" : lower === "swamp" ? "swamp" : null,
    maxCopies: args.maxCopies ?? (isBasic ? 99 : 1),
    category: args.category,
    resolved: true,
  };
}

function buildLandPool(args: {
  contract: RetrievalContractV11;
  catalog: DeckResolutionCatalog;
  commanderColorIdentity: string[];
  setRestrictions?: DeckSetRestrictionsV111 | null;
}): LandPoolV11 {
  const landPlan = args.contract.landPlan;
  const targetCount = args.contract.landSlotsRequired || Number(landPlan.target ?? 36);
  const basicSlots: Record<string, number> = Object.fromEntries(BASIC_LAND_KINDS.map((b) => [b.kind, 0]));
  const architecture = Array.isArray(landPlan.architecture) ? landPlan.architecture : [];
  for (const row of architecture) {
    if (!row || typeof row !== "object") continue;
    const role = String((row as { role?: string }).role ?? "").toLowerCase();
    const count = Number((row as { count?: number }).count ?? 0);
    for (const basic of BASIC_LAND_KINDS) {
      if (role.includes(basic.roleHint)) basicSlots[basic.kind] = count;
    }
  }

  const identity = args.commanderColorIdentity;
  const hasIdentitySlot = BASIC_LAND_KINDS.some(
    (basic) => basicSlots[basic.kind] > 0 && commanderLegalInIdentity(basic.colors, identity),
  );
  if (!hasIdentitySlot) {
    // maxCopies is a hard ceiling on how many of a basic the deck may ever
    // hold, not a target. These were five hand-tuned constants, and Swamp's was
    // 7 against Forest's 14, so a mono-black deck could never hold an eighth
    // Swamp — the "only seven basic Swamps" defect the Head Professor kept
    // reporting on Mikaeus builds, which no land repair could fix because the
    // pool forbade the fix. A single-colour deck gets a ceiling derived from
    // its land count instead.
    const monoColorCap = Math.max(16, Math.round(targetCount * 0.5));
    for (const basic of BASIC_LAND_KINDS) {
      if (!commanderLegalInIdentity(basic.colors, identity)) continue;
      if (identity.length === 1) {
        basicSlots[basic.kind] = Math.max(basicSlots[basic.kind]!, monoColorCap);
        continue;
      }
      if (basic.kind === "forest" && identity.includes("G")) basicSlots.forest = Math.max(basicSlots.forest, 14);
      if (basic.kind === "swamp" && identity.includes("B")) basicSlots.swamp = Math.max(basicSlots.swamp, 7);
      if (basic.kind === "plains" && identity.includes("W")) basicSlots.plains = Math.max(basicSlots.plains, 10);
      if (basic.kind === "island" && identity.includes("U")) basicSlots.island = Math.max(basicSlots.island, 10);
      if (basic.kind === "mountain" && identity.includes("R")) basicSlots.mountain = Math.max(basicSlots.mountain, 10);
    }
  }

  let redirectedOffColorBasicSlots = 0;
  const entries: LandPoolEntryV11[] = [];
  for (const basic of BASIC_LAND_KINDS) {
    const slots = basicSlots[basic.kind];
    if (slots <= 0) continue;
    if (!commanderLegalInIdentity(basic.colors, identity)) {
      redirectedOffColorBasicSlots += slots;
      continue;
    }
    entries.push({
      name: basic.name,
      oracleId:
        resolveCanonicalCardIdentity({ name: basic.name, catalog: args.catalog }).oracleId ?? `basic:${basic.kind}`,
      isBasic: true,
      basicKind:
        basic.kind === "forest" ? "forest" : basic.kind === "swamp" ? "swamp" : null,
      maxCopies: slots,
      category: "basic",
      resolved: true,
    });
  }

  if (redirectedOffColorBasicSlots > 0) {
    const primaryBasic =
      entries.find((entry) => entry.isBasic && entry.basicKind === "forest") ??
      entries.find((entry) => entry.isBasic);
    if (primaryBasic) {
      primaryBasic.maxCopies += redirectedOffColorBasicSlots;
    }
  }

  const addNamed = (names: unknown, category: LandPoolEntryV11["category"]) => {
    if (!Array.isArray(names)) return;
    for (const name of names) {
      if (typeof name !== "string") continue;
      const resolved = resolveLandName({
        name,
        catalog: args.catalog,
        commanderColorIdentity: args.commanderColorIdentity,
        category,
      });
      if (resolved) entries.push(resolved);
    }
  };

  addNamed(landPlan.preferredDuals, "dual");
  addNamed(landPlan.preferredFlexibleLands, "fetch");
  addNamed(landPlan.preferredUtilityLands, "utility");

  const seen = new Set<string>();
  const nonBasicOracleIds: string[] = [];
  for (const entry of entries) {
    if (entry.isBasic) continue;
    if (seen.has(entry.oracleId)) continue;
    seen.add(entry.oracleId);
    nonBasicOracleIds.push(entry.oracleId);
  }

  if (nonBasicOracleIds.length < 15) {
    // Legality alone is not enough here. A colorless land has an empty color
    // identity, so it satisfies any identity check, and this backfill used to
    // walk the catalog in whatever order it happened to be in — which is how a
    // mono-black deck was handed Bant Panorama, whose only ability fetches a
    // basic Forest, Plains, or Island. Rank on whether the land can actually
    // cast the deck's spells, and drop the ones that never could.
    const backfill: Array<{ card: CatalogCardV11; rank: number }> = [];
    for (const card of args.catalog.byOracleId.values()) {
      const truth = resolveCanonicalCardTruthV4164({
        name: card.canonicalName,
        oracleId: card.oracleId,
        catalog: args.catalog,
      });
      if (!isCanonicalLandForDeckPartition(truth)) continue;
      if (!isCurrentlyCommanderLegal(card)) continue;
      if (!commanderLegalInIdentity(truth.colorIdentity, args.commanderColorIdentity)) continue;
      if (args.setRestrictions && !cardMatchesDeckSetRestrictions(card, args.setRestrictions)) continue;
      if (seen.has(card.oracleId)) continue;

      const profile = classifyLandManaQualityV1({
        name: card.canonicalName,
        oracleText: combinedGoldenOracleText(card),
        commanderColorIdentity: args.commanderColorIdentity,
      });
      if (isLandUnusableInIdentityV1(profile)) continue;

      backfill.push({ card, rank: landManaQualityRankV1(profile) });
    }

    backfill.sort((a, b) => b.rank - a.rank || a.card.canonicalName.localeCompare(b.card.canonicalName));

    for (const { card } of backfill) {
      if (nonBasicOracleIds.length >= 40) break;
      if (seen.has(card.oracleId)) continue;
      seen.add(card.oracleId);
      entries.push({
        name: card.canonicalName,
        oracleId: card.oracleId,
        isBasic: false,
        basicKind: null,
        maxCopies: 1,
        category: "other",
        resolved: true,
      });
      nonBasicOracleIds.push(card.oracleId);
    }
  }

  const basicForestSlots = entries.find((entry) => entry.basicKind === "forest")?.maxCopies ?? 0;
  const basicSwampSlots = entries.find((entry) => entry.basicKind === "swamp")?.maxCopies ?? 0;

  return {
    targetCount,
    basicForestSlots,
    basicSwampSlots,
    entries,
    nonBasicOracleIds,
  };
}

export function runSolDirectedRetrievalV11(args: {
  contract: RetrievalContractV11;
  catalog: DeckResolutionCatalog;
  commander: CommanderBlueprintV417;
  deckPreferences?: string;
  userSemanticPreferences?: UserSemanticPreferencesV111 | null;
  /** OFF unless a caller opts in: neighbor expansion widens pools past the architect's own examples. */
  semanticNeighborExpansionEnabled?: boolean;
  /** From loadSemanticMapNeighbors(); expansion stays off when the artifact is unavailable. */
  semanticNeighbors?: SemanticNeighborIndexV11 | null;
  /** OFF unless a caller opts in: lets the requested bracket reorder pools by measured power. */
  bracketPowerRankingEnabled?: boolean;
  /** The bracket the player asked for. Power ranking stays off without it. */
  requestedBracket?: CommanderBracket | null;
  gameChangerOracleIds?: ReadonlySet<string> | null;
  playRateByOracleId?: ReadonlyMap<string, number> | null;
}): RetrievalResultV11 {
  const prohibitedNames = collectProhibitedNames(args.contract);
  const prohibitedOracleIds = new Set<string>();
  const exactResolutionHits: PreferredExampleResolutionV11[] = [];
  const setRestrictions = parseDeckSetRestrictions(args.deckPreferences ?? "");

  for (const requirement of args.contract.cardRequirements) {
    for (const example of requirement.preferredExamples) {
      const hit = exactResolvePreferredExampleV11({
        exampleName: example,
        requirementId: requirement.requirementId,
        catalog: args.catalog,
        commanderColorIdentity: args.commander.colorIdentity,
        prohibitedNames,
      });
      exactResolutionHits.push(hit);
      if (hit.resolved && hit.oracleId && hit.excludedByGuardrail) {
        prohibitedOracleIds.add(hit.oracleId);
      }
    }
  }

  for (const [oracleId, card] of args.catalog.byOracleId.entries()) {
    if (isExcludedByGuardrail(card.canonicalName, prohibitedNames)) {
      prohibitedOracleIds.add(oracleId);
    }
  }

  const dictionary = new Map<string, CanonicalCardFactsV11>();
  const corpusOracleIds = legalNonlandCorpus({
    catalog: args.catalog,
    commanderColorIdentity: args.commander.colorIdentity,
    commanderOracleId: args.commander.oracleId,
    prohibitedOracleIds,
    setRestrictions,
  });

  const neighborExpansionActive =
    args.semanticNeighborExpansionEnabled === true &&
    !!args.semanticNeighbors &&
    args.semanticNeighbors.size > 0;
  const corpusOracleIdSet = neighborExpansionActive ? new Set(corpusOracleIds) : null;

  const bracketPower: BracketPowerContextV11 | null =
    args.bracketPowerRankingEnabled === true && args.requestedBracket != null
      ? {
          appetite: bracketPowerAppetiteV1(args.requestedBracket),
          gameChangerOracleIds: args.gameChangerOracleIds ?? new Set<string>(),
          playRateByOracleId: args.playRateByOracleId ?? new Map<string, number>(),
        }
      : null;

  let expansionPasses = 0;
  const requirementPools: RequirementPoolV11[] = [];
  for (const requirement of args.contract.cardRequirements) {
    requirementPools.push(
      retrieveRequirementPool({
        requirement,
        contract: args.contract,
        catalog: args.catalog,
        commander: args.commander,
        prohibitedNames,
        prohibitedOracleIds,
        corpusOracleIds,
        dictionary,
        userSemanticPreferences: args.userSemanticPreferences,
        semanticNeighbors: neighborExpansionActive ? args.semanticNeighbors : null,
        corpusOracleIdSet,
        bracketPower,
      }),
    );
  }

  const uniqueSet = new Set<string>();
  for (const pool of requirementPools) {
    for (const id of pool.oracleIds) uniqueSet.add(id);
  }

  const landPool = buildLandPool({
    contract: args.contract,
    catalog: args.catalog,
    commanderColorIdentity: args.commander.colorIdentity,
    setRestrictions,
  });

  for (const oracleId of landPool.nonBasicOracleIds) {
    const card = args.catalog.byOracleId.get(oracleId);
    if (!card) continue;
    const oracleText = combinedGoldenOracleText(card).slice(0, 600);
    const typeLine = card.typeLine ?? "Land";
    dictionary.set(oracleId, {
      oracleId,
      name: card.canonicalName,
      manaValue: card.manaValue ?? card.cmc ?? 0,
      typeLine,
      colorIdentity: card.colorIdentity ?? [],
      oracleText,
      semanticFunctions: inferCardSemanticFunctions(oracleText, typeLine),
      semanticOracle: getSemanticOracleFactsForOracleId(oracleId),
      commanderLegal: isCurrentlyCommanderLegal(card),
      isLand: true,
    });
  }

  return {
    version: PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION,
    candidateDictionary: Object.fromEntries(dictionary.entries()),
    requirementPools,
    landPool,
    uniqueNonlandOracleIds: [...uniqueSet],
    uniqueNonlandCount: uniqueSet.size,
    exactResolutionHits,
    expansionPasses,
    prohibitedOracleIds: [...prohibitedOracleIds],
  };
}
