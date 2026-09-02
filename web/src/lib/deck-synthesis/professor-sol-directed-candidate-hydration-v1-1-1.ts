/**
 * P0 — Candidate-scoped Constructor selection hydration (v1.1.1).
 * Resolves model selections only against the supplied candidate dictionary / land pool.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import {
  canonicalizeDisplayName,
  normalizeCardNameForMatch,
} from "./professor-canonical-card-identity-v4-15-1-v1";
import { resolvePlayableExactNameInCatalog } from "./professor-playable-oracle-resolution-v1-1-1";
import type {
  CanonicalCardFactsV11,
  ConstructorInputBundleV11,
  LandPoolEntryV11,
  LandPoolV11,
  RequirementPoolV11,
  SolDirectedConstructedDeckV11,
  SolDirectedSelectedNonlandV11,
} from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_CANDIDATE_HYDRATION_V1_1_1_VERSION =
  "professor-sol-directed-candidate-hydration-v1-1-1";

export type CandidateHydrationResolutionSource = "CANDIDATE_DICTIONARY" | "LAND_POOL";

export type IdentityResolutionLedgerEntryV111 = {
  selectionName: string;
  resolvedOracleId: string | null;
  resolvedName: string | null;
  resolutionSource: CandidateHydrationResolutionSource | "OUT_OF_CANDIDATE_SELECTION";
  candidateRequirementIds: string[];
  primaryArchitectRequirement: string | null;
  error: string | null;
};

export type CandidateHydrationContextV111 = {
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requirementPools: RequirementPoolV11[];
  landPool: LandPoolV11;
  catalog?: DeckResolutionCatalog;
  commanderColorIdentity?: string[];
};

type RawNonlandSelection = {
  name?: string | null;
  primaryArchitectRequirement?: string | null;
  primaryRole?: string | null;
  secondaryRoles?: string[];
  packageMembership?: string[];
  whyInThisDeck?: string;
  structuralNecessity?: "REQUIRED" | "FLEX";
};

type RawLandSelection = {
  name?: string | null;
  copies?: number;
};

type RawConstructedDeckV11 = {
  lands?: RawLandSelection[];
  nonlands?: RawNonlandSelection[];
  landCount?: number;
  primaryWinPaths?: string[];
  secondaryWinPaths?: string[];
  expectedPlayPattern?: string;
  structuralNecessities?: string[];
  replaceableFlex?: string[];
};

function buildRequirementOracleSet(pools: RequirementPoolV11[]): Set<string> {
  const set = new Set<string>();
  for (const pool of pools) {
    for (const oracleId of pool.oracleIds) set.add(oracleId);
  }
  return set;
}

function requirementIdsForOracle(
  oracleId: string,
  pools: RequirementPoolV11[],
): string[] {
  return pools.filter((pool) => pool.oracleIds.includes(oracleId)).map((pool) => pool.requirementId);
}

function findNonlandCandidateMatches(args: {
  selectionName: string;
  dictionary: Record<string, CanonicalCardFactsV11>;
  allowedOracleIds: Set<string>;
}): CanonicalCardFactsV11[] {
  const key = normalizeCardNameForMatch(args.selectionName);
  return Object.values(args.dictionary).filter(
    (facts) =>
      args.allowedOracleIds.has(facts.oracleId) &&
      normalizeCardNameForMatch(facts.name) === key,
  );
}

function disambiguateNonlandCandidates(args: {
  matches: CanonicalCardFactsV11[];
  primaryArchitectRequirement: string | null;
  requirementPools: RequirementPoolV11[];
}): CanonicalCardFactsV11 | null {
  if (args.matches.length === 0) return null;
  if (args.matches.length === 1) return args.matches[0]!;

  if (args.primaryArchitectRequirement) {
    const pool = args.requirementPools.find((row) => row.requirementId === args.primaryArchitectRequirement);
    if (pool) {
      const inPool = args.matches.filter((facts) => pool.oracleIds.includes(facts.oracleId));
      if (inPool.length === 1) return inPool[0]!;
      if (inPool.length > 1) {
        return [...inPool].sort((a, b) => a.oracleId.localeCompare(b.oracleId))[0]!;
      }
    }
  }

  return [...args.matches].sort((a, b) => a.oracleId.localeCompare(b.oracleId))[0]!;
}

export function hydrateNonlandSelectionV111(args: {
  selection: RawNonlandSelection;
  context: CandidateHydrationContextV111;
}): IdentityResolutionLedgerEntryV111 {
  const selectionName = (args.selection.name ?? "").trim();
  const primaryArchitectRequirement =
    args.selection.primaryArchitectRequirement ?? args.selection.primaryRole ?? null;
  const allowedOracleIds = buildRequirementOracleSet(args.context.requirementPools);
  let matches = findNonlandCandidateMatches({
    selectionName,
    dictionary: args.context.candidateDictionary,
    allowedOracleIds,
  });

  if (matches.length === 0) {
    matches = findNonlandCandidateMatches({
      selectionName,
      dictionary: args.context.candidateDictionary,
      allowedOracleIds: new Set(Object.keys(args.context.candidateDictionary)),
    });
  }

  if (matches.length === 0 && args.context.catalog) {
    const resolved = resolvePlayableExactNameInCatalog({
      name: selectionName,
      catalog: args.context.catalog,
      commanderColorIdentity: args.context.commanderColorIdentity,
    });
    const facts = resolved.oracleId ? args.context.candidateDictionary[resolved.oracleId] : undefined;
    if (facts) matches = [facts];
  }

  if (matches.length === 0) {
    return {
      selectionName,
      resolvedOracleId: null,
      resolvedName: null,
      resolutionSource: "OUT_OF_CANDIDATE_SELECTION",
      candidateRequirementIds: [],
      primaryArchitectRequirement,
      error: "OUT_OF_CANDIDATE_SELECTION",
    };
  }

  const winner = disambiguateNonlandCandidates({
    matches,
    primaryArchitectRequirement,
    requirementPools: args.context.requirementPools,
  });
  if (!winner) {
    return {
      selectionName,
      resolvedOracleId: null,
      resolvedName: null,
      resolutionSource: "OUT_OF_CANDIDATE_SELECTION",
      candidateRequirementIds: [],
      primaryArchitectRequirement,
      error: "OUT_OF_CANDIDATE_SELECTION",
    };
  }

  return {
    selectionName,
    resolvedOracleId: winner.oracleId,
    resolvedName: canonicalizeDisplayName(winner.name),
    resolutionSource: "CANDIDATE_DICTIONARY",
    candidateRequirementIds: requirementIdsForOracle(winner.oracleId, args.context.requirementPools),
    primaryArchitectRequirement,
    error: null,
  };
}

export function findLandPoolMatches(selectionName: string, landPool: LandPoolV11): LandPoolEntryV11[] {
  const key = normalizeCardNameForMatch(selectionName);
  const matches = landPool.entries.filter(
    (entry) =>
      normalizeCardNameForMatch(entry.name) === key ||
      normalizeCardNameForMatch(canonicalizeDisplayName(entry.name)) === key,
  );
  if (matches.length > 0) return matches;

  const stripped = selectionName.split("//")[0]?.trim() ?? selectionName;
  if (stripped !== selectionName) {
    const strippedKey = normalizeCardNameForMatch(stripped);
    return landPool.entries.filter(
      (entry) =>
        normalizeCardNameForMatch(entry.name) === strippedKey ||
        normalizeCardNameForMatch(canonicalizeDisplayName(entry.name)) === strippedKey,
    );
  }
  return matches;
}

export function hydrateLandSelectionV111(args: {
  selection: RawLandSelection;
  context: CandidateHydrationContextV111;
}): IdentityResolutionLedgerEntryV111 {
  const selectionName = (args.selection.name ?? "").trim();
  const matches = findLandPoolMatches(selectionName, args.context.landPool);

  if (matches.length === 0) {
    return {
      selectionName,
      resolvedOracleId: null,
      resolvedName: null,
      resolutionSource: "OUT_OF_CANDIDATE_SELECTION",
      candidateRequirementIds: [],
      primaryArchitectRequirement: null,
      error: "OUT_OF_CANDIDATE_SELECTION",
    };
  }

  const winner =
    matches.length === 1
      ? matches[0]!
      : [...matches].sort((a, b) => a.oracleId.localeCompare(b.oracleId))[0]!;

  return {
    selectionName,
    resolvedOracleId: winner.oracleId,
    resolvedName: canonicalizeDisplayName(winner.name),
    resolutionSource: "LAND_POOL",
    candidateRequirementIds: [],
    primaryArchitectRequirement: null,
    error: null,
  };
}

export function hydrateSolDirectedConstructedDeckV111(args: {
  raw: Partial<RawConstructedDeckV11>;
  commander: CommanderBlueprintV417;
  context: CandidateHydrationContextV111;
}): {
  deck: SolDirectedConstructedDeckV11;
  ledger: IdentityResolutionLedgerEntryV111[];
  errors: string[];
} {
  const ledger: IdentityResolutionLedgerEntryV111[] = [];
  const errors: string[] = [];

  const lands = (args.raw.lands ?? []).map((land) => {
    const hydration = hydrateLandSelectionV111({ selection: land, context: args.context });
    ledger.push(hydration);
    if (hydration.error) errors.push(`${hydration.error}:${hydration.selectionName}`);
    return {
      name: hydration.resolvedName ?? canonicalizeDisplayName(land.name ?? "Unknown"),
      copies: Math.max(1, Number(land.copies ?? 1)),
      oracleId: hydration.resolvedOracleId ?? undefined,
    };
  });

  const nonlands: SolDirectedSelectedNonlandV11[] = (args.raw.nonlands ?? []).map((card) => {
    const hydration = hydrateNonlandSelectionV111({ selection: card, context: args.context });
    ledger.push(hydration);
    if (hydration.error) errors.push(`${hydration.error}:${hydration.selectionName}`);
    const oracleId = hydration.resolvedOracleId ?? "";
    const candidateFacts = oracleId
      ? args.context.candidateDictionary[oracleId]
      : undefined;
    return {
      oracleId,
      name: hydration.resolvedName ?? canonicalizeDisplayName(card.name ?? "Unknown"),
      typeLine: candidateFacts?.typeLine,
      primaryArchitectRequirement:
        card.primaryArchitectRequirement ?? card.primaryRole ?? hydration.primaryArchitectRequirement ?? "unknown",
      primaryRole: card.primaryRole ?? "",
      secondaryRoles: card.secondaryRoles ?? [],
      packageMembership: card.packageMembership ?? [],
      whyInThisDeck: card.whyInThisDeck ?? "",
      structuralNecessity: card.structuralNecessity ?? "FLEX",
    };
  });

  return {
    deck: {
      commander: args.commander,
      landCount: args.raw.landCount ?? lands.reduce((sum, land) => sum + land.copies, 0),
      lands: lands.map(({ name, copies }) => ({ name, copies })),
      nonlands,
      primaryWinPaths: args.raw.primaryWinPaths ?? [],
      secondaryWinPaths: args.raw.secondaryWinPaths ?? [],
      expectedPlayPattern: args.raw.expectedPlayPattern ?? "",
      structuralNecessities: args.raw.structuralNecessities ?? [],
      replaceableFlex: args.raw.replaceableFlex ?? [],
    },
    ledger,
    errors,
  };
}

export function candidateHydrationContextFromBundle(
  bundle: Pick<ConstructorInputBundleV11, "candidateDictionary" | "requirementPools" | "landPool">,
  extras?: { catalog?: DeckResolutionCatalog; commanderColorIdentity?: string[] },
): CandidateHydrationContextV111 {
  return {
    candidateDictionary: bundle.candidateDictionary,
    requirementPools: bundle.requirementPools,
    landPool: bundle.landPool,
    catalog: extras?.catalog,
    commanderColorIdentity: extras?.commanderColorIdentity,
  };
}

export function landOracleIdSet(landPool: LandPoolV11): Set<string> {
  const set = new Set<string>(landPool.nonBasicOracleIds);
  for (const entry of landPool.entries) set.add(entry.oracleId);
  return set;
}

export function candidateDictionaryOracleIdSet(
  dictionary: Record<string, CanonicalCardFactsV11>,
): Set<string> {
  return new Set(Object.keys(dictionary));
}

function pickFallbackNonland(args: {
  context: CandidateHydrationContextV111;
  requirementId: string | null;
  inDeckOracleIds: Set<string>;
}): CanonicalCardFactsV11 | null {
  const pools = args.requirementId
    ? args.context.requirementPools.filter((pool) => pool.requirementId === args.requirementId)
    : args.context.requirementPools;
  for (const pool of pools) {
    for (const oracleId of pool.oracleIds) {
      if (args.inDeckOracleIds.has(oracleId)) continue;
      const facts = args.context.candidateDictionary[oracleId];
      if (facts && !facts.isLand) return facts;
    }
  }
  for (const facts of Object.values(args.context.candidateDictionary)) {
    if (facts.isLand || args.inDeckOracleIds.has(facts.oracleId)) continue;
    return facts;
  }
  return null;
}

function pickFallbackLand(args: {
  context: CandidateHydrationContextV111;
  deckLands: SolDirectedConstructedDeckV11["lands"];
}): LandPoolEntryV11 | null {
  const priority: LandPoolEntryV11["category"][] = ["fetch", "dual", "utility", "other", "basic"];
  for (const category of priority) {
    for (const entry of args.context.landPool.entries) {
      if (entry.category !== category) continue;
      const copies =
        args.deckLands.find((land) => normalizeCardNameForMatch(land.name) === normalizeCardNameForMatch(entry.name))
          ?.copies ?? 0;
      if (copies >= entry.maxCopies) continue;
      return entry;
    }
  }
  return args.context.landPool.entries[0] ?? null;
}

function findNonlandFactsByName(
  name: string,
  dictionary: Record<string, CanonicalCardFactsV11>,
): CanonicalCardFactsV11 | null {
  const key = normalizeCardNameForMatch(name);
  return Object.values(dictionary).find((facts) => normalizeCardNameForMatch(facts.name) === key) ?? null;
}

function isLandNameInPool(name: string, landPool: LandPoolV11): boolean {
  return findLandPoolMatches(name, landPool).length > 0;
}

function deckToHydrationRaw(deck: SolDirectedConstructedDeckV11) {
  return {
    landCount: deck.landCount,
    lands: deck.lands,
    nonlands: deck.nonlands.map((card) => ({
      name: card.name,
      primaryArchitectRequirement: card.primaryArchitectRequirement,
      primaryRole: card.primaryRole,
      secondaryRoles: card.secondaryRoles,
      packageMembership: card.packageMembership,
      whyInThisDeck: card.whyInThisDeck,
      structuralNecessity: card.structuralNecessity,
    })),
    primaryWinPaths: deck.primaryWinPaths,
    secondaryWinPaths: deck.secondaryWinPaths,
    expectedPlayPattern: deck.expectedPlayPattern,
    structuralNecessities: deck.structuralNecessities,
    replaceableFlex: deck.replaceableFlex,
  };
}

/** Last-resort recovery when Constructor names cards outside the hydrated pool. */
export function repairConstructorHydrationFailuresV111(args: {
  deck: SolDirectedConstructedDeckV11;
  ledger: IdentityResolutionLedgerEntryV111[];
  context: CandidateHydrationContextV111;
}): { deck: SolDirectedConstructedDeckV11; repairs: string[]; errors: string[] } {
  const repairs: string[] = [];
  const errors: string[] = [];
  const deck: SolDirectedConstructedDeckV11 = {
    ...args.deck,
    lands: args.deck.lands.map((land) => ({ ...land })),
    nonlands: args.deck.nonlands.map((card) => ({ ...card })),
  };

  const inDeckOracleIds = new Set(deck.nonlands.map((card) => card.oracleId).filter(Boolean));

  for (let i = 0; i < deck.nonlands.length; i += 1) {
    const card = deck.nonlands[i]!;
    const inDictionary = Boolean(card.oracleId && args.context.candidateDictionary[card.oracleId]);
    if (inDictionary) continue;

    const byName = findNonlandFactsByName(card.name, args.context.candidateDictionary);
    if (byName && !inDeckOracleIds.has(byName.oracleId)) {
      deck.nonlands[i] = {
        ...card,
        oracleId: byName.oracleId,
        name: byName.name,
        typeLine: byName.typeLine,
        whyInThisDeck: card.whyInThisDeck || `Hydration repair matched ${card.name} to pool.`,
      };
      inDeckOracleIds.add(byName.oracleId);
      repairs.push(`${card.name} → ${byName.name}`);
      continue;
    }

    if (args.context.catalog) {
      const resolved = resolvePlayableExactNameInCatalog({
        name: card.name,
        catalog: args.context.catalog,
        commanderColorIdentity: args.context.commanderColorIdentity,
      });
      const facts = resolved.oracleId ? args.context.candidateDictionary[resolved.oracleId] : undefined;
      if (facts && !inDeckOracleIds.has(facts.oracleId)) {
        deck.nonlands[i] = {
          ...card,
          oracleId: facts.oracleId,
          name: facts.name,
          typeLine: facts.typeLine,
          whyInThisDeck: card.whyInThisDeck || `Hydration repair resolved ${card.name} via catalog.`,
        };
        inDeckOracleIds.add(facts.oracleId);
        repairs.push(`${card.name} → ${facts.name} (catalog)`);
        continue;
      }
    }

    const fallback = pickFallbackNonland({
      context: args.context,
      requirementId: card.primaryArchitectRequirement,
      inDeckOracleIds,
    });
    if (!fallback) {
      errors.push(`OUT_OF_CANDIDATE_SELECTION:${card.name}`);
      continue;
    }
    deck.nonlands[i] = {
      ...card,
      oracleId: fallback.oracleId,
      name: fallback.name,
      typeLine: fallback.typeLine,
      whyInThisDeck: `Hydration repair replaced unknown card ${card.name}.`,
    };
    inDeckOracleIds.add(fallback.oracleId);
    repairs.push(`${card.name} → ${fallback.name}`);
  }

  for (let i = 0; i < deck.lands.length; i += 1) {
    const land = deck.lands[i]!;
    if (isLandNameInPool(land.name, args.context.landPool)) continue;

    const fallback = pickFallbackLand({ context: args.context, deckLands: deck.lands });
    if (!fallback) {
      errors.push(`OUT_OF_CANDIDATE_SELECTION:${land.name}`);
      continue;
    }
    deck.lands[i] = { name: fallback.name, copies: land.copies };
    repairs.push(`${land.name} → ${fallback.name} (land pool)`);
  }

  deck.landCount = deck.lands.reduce((sum, land) => sum + land.copies, 0);
  return { deck, repairs, errors };
}

export function rehydrateRepairedConstructedDeckV111(args: {
  deck: SolDirectedConstructedDeckV11;
  context: CandidateHydrationContextV111;
}): {
  deck: SolDirectedConstructedDeckV11;
  ledger: IdentityResolutionLedgerEntryV111[];
  errors: string[];
} {
  return hydrateSolDirectedConstructedDeckV111({
    raw: deckToHydrationRaw(args.deck),
    commander: args.deck.commander,
    context: args.context,
  });
}
