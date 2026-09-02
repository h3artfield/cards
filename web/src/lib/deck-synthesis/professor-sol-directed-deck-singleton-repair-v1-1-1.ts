/**
 * Remove duplicate nonbasics and backfill slots from the candidate pool.
 */
import { evaluateSingletonPool, isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import { normalizeCardNameForMatch } from "./professor-card-name-match-client-v4-15-1-v1";
import type {
  CanonicalCardFactsV11,
  LandPoolV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
  SolDirectedSelectedNonlandV11,
} from "./professor-sol-directed-types-v1-1";
import { repairSolDirectedConstructedDeckCountsV111 } from "./professor-sol-directed-deck-count-repair-v1-1-1";

export const PROFESSOR_SOL_DIRECTED_DECK_SINGLETON_REPAIR_V1_1_1_VERSION =
  "professor-sol-directed-deck-singleton-repair-v1-1-1";

function mergeLandRows(
  lands: SolDirectedConstructedDeckV11["lands"],
): SolDirectedConstructedDeckV11["lands"] {
  const merged = new Map<string, { name: string; copies: number }>();
  for (const land of lands) {
    const key = normalizeCardNameForMatch(land.name);
    const existing = merged.get(key);
    if (existing) existing.copies += land.copies;
    else merged.set(key, { name: land.name.trim(), copies: land.copies });
  }
  return [...merged.values()];
}

function deckSingletonNames(deck: SolDirectedConstructedDeckV11): string[] {
  const landNames = deck.lands.flatMap((land) => Array.from({ length: land.copies }, () => land.name));
  return [...deck.nonlands.map((card) => card.name), ...landNames];
}

function pickReplacementNonland(args: {
  deck: SolDirectedConstructedDeckV11;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  preferredRequirement?: string;
}): SolDirectedSelectedNonlandV11 | null {
  const inDeck = new Set(args.deck.nonlands.map((card) => normalizeCardNameForMatch(card.name)));
  const candidates = Object.values(args.candidateDictionary)
    .filter((facts) => !facts.isLand && !inDeck.has(normalizeCardNameForMatch(facts.name)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const facts = candidates[0];
  if (!facts) return null;

  return {
    oracleId: facts.oracleId,
    name: facts.name,
    typeLine: facts.typeLine,
    primaryArchitectRequirement: args.preferredRequirement?.trim() || "flex_replacement",
    primaryRole: facts.typeLine,
    secondaryRoles: [],
    packageMembership: [],
    whyInThisDeck: "Singleton repair replacement for duplicate slot.",
    structuralNecessity: "FLEX",
  };
}

export function repairSolDirectedDeckSingletonViolationsV111(args: {
  deck: SolDirectedConstructedDeckV11;
  contract: RetrievalContractV11;
  landPool: LandPoolV11;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
}): { deck: SolDirectedConstructedDeckV11; repairs: string[] } {
  const repairs: string[] = [];
  const deck: SolDirectedConstructedDeckV11 = {
    ...args.deck,
    lands: mergeLandRows(args.deck.lands),
    nonlands: [...args.deck.nonlands],
  };

  const seenNonlands = new Set<string>();
  const dedupedNonlands: SolDirectedSelectedNonlandV11[] = [];
  const removedDuplicates: SolDirectedSelectedNonlandV11[] = [];

  for (const card of deck.nonlands) {
    const key = normalizeCardNameForMatch(card.name);
    if (seenNonlands.has(key)) {
      removedDuplicates.push(card);
      repairs.push(`removed duplicate nonland: ${card.name}`);
      continue;
    }
    seenNonlands.add(key);
    dedupedNonlands.push(card);
  }
  deck.nonlands = dedupedNonlands;

  const seenNonBasicLands = new Set<string>();
  const nextLands: SolDirectedConstructedDeckV11["lands"] = [];
  for (const land of deck.lands) {
    if (isBasicLandName(land.name)) {
      nextLands.push({ ...land });
      continue;
    }
    const key = normalizeCardNameForMatch(land.name);
    if (seenNonBasicLands.has(key)) {
      repairs.push(`removed duplicate nonbasic land: ${land.name}`);
      continue;
    }
    seenNonBasicLands.add(key);
    nextLands.push({ name: land.name, copies: 1 });
    if (land.copies > 1) repairs.push(`trimmed duplicate copies of ${land.name} to 1`);
  }
  deck.lands = nextLands;

  for (const removed of removedDuplicates) {
    const replacement = pickReplacementNonland({
      deck,
      candidateDictionary: args.candidateDictionary,
      preferredRequirement: removed.primaryArchitectRequirement,
    });
    if (!replacement) {
      repairs.push(`could not replace duplicate slot for ${removed.name}`);
      continue;
    }
    deck.nonlands.push(replacement);
    repairs.push(`${removed.name} → ${replacement.name}`);
  }

  const singleton = evaluateSingletonPool(deckSingletonNames(deck));
  if (!singleton.pass) {
    repairs.push(`singleton still failing: ${singleton.duplicateNonBasics.join(", ")}`);
  }

  const countRepair = repairSolDirectedConstructedDeckCountsV111({
    deck,
    contract: args.contract,
    landPool: args.landPool,
  });

  return {
    deck: countRepair.deck,
    repairs: [...repairs, ...countRepair.repairs],
  };
}
