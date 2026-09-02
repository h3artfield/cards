/**
 * Rebalance primaryArchitectRequirement slot counts after Constructor / Critic swaps.
 */
import type {
  CanonicalCardFactsV11,
  RequirementPoolV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
  SolDirectedSelectedNonlandV11,
} from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_ARCHITECT_COUNT_REPAIR_V1_1_1_VERSION =
  "professor-sol-directed-architect-count-repair-v1-1-1";

function requirementCounts(
  deck: SolDirectedConstructedDeckV11,
  contract: RetrievalContractV11,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const requirement of contract.cardRequirements) {
    counts[requirement.requirementId] = 0;
  }
  for (const card of deck.nonlands) {
    const id = card.primaryArchitectRequirement;
    if (id in counts) counts[id] += 1;
  }
  return counts;
}

function pickReplacementForRequirement(args: {
  requirementId: string;
  requirementPools: RequirementPoolV11[];
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  inDeckOracleIds: Set<string>;
}): SolDirectedSelectedNonlandV11 | null {
  const pool = args.requirementPools.find((row) => row.requirementId === args.requirementId);
  const oracleIds = pool?.oracleIds ?? [];
  for (const oracleId of oracleIds) {
    if (args.inDeckOracleIds.has(oracleId)) continue;
    const facts = args.candidateDictionary[oracleId];
    if (!facts || facts.isLand) continue;
    return {
      oracleId: facts.oracleId,
      name: facts.name,
      typeLine: facts.typeLine,
      primaryArchitectRequirement: args.requirementId,
      primaryRole: facts.typeLine,
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "Architect slot-count repair fill.",
      structuralNecessity: "FLEX",
    };
  }
  for (const facts of Object.values(args.candidateDictionary)) {
    if (facts.isLand || args.inDeckOracleIds.has(facts.oracleId)) continue;
    return {
      oracleId: facts.oracleId,
      name: facts.name,
      typeLine: facts.typeLine,
      primaryArchitectRequirement: args.requirementId,
      primaryRole: facts.typeLine,
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "Architect slot-count repair fill.",
      structuralNecessity: "FLEX",
    };
  }
  return null;
}

export function repairArchitectRequirementCountsV111(args: {
  deck: SolDirectedConstructedDeckV11;
  contract: RetrievalContractV11;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requirementPools: RequirementPoolV11[];
}): { deck: SolDirectedConstructedDeckV11; repairs: string[] } {
  const repairs: string[] = [];
  const deck: SolDirectedConstructedDeckV11 = {
    ...args.deck,
    nonlands: args.deck.nonlands.map((card) => ({ ...card })),
    lands: args.deck.lands.map((land) => ({ ...land })),
  };

  for (let pass = 0; pass < 24; pass += 1) {
    const counts = requirementCounts(deck, args.contract);
    const over = args.contract.cardRequirements.filter(
      (requirement) => (counts[requirement.requirementId] ?? 0) > requirement.requestedCount,
    );
    const under = args.contract.cardRequirements.filter(
      (requirement) => (counts[requirement.requirementId] ?? 0) < requirement.requestedCount,
    );
    if (over.length === 0 && under.length === 0) break;

    if (over.length > 0 && under.length > 0) {
      const fromRequirement = over[0]!;
      const toRequirement = under[0]!;
      const cardIndex = deck.nonlands.findIndex(
        (card) => card.primaryArchitectRequirement === fromRequirement.requirementId,
      );
      if (cardIndex < 0) break;
      const card = deck.nonlands[cardIndex]!;
      deck.nonlands[cardIndex] = {
        ...card,
        primaryArchitectRequirement: toRequirement.requirementId,
        whyInThisDeck: `${card.whyInThisDeck} Slot rebalance: ${fromRequirement.requirementId} → ${toRequirement.requirementId}.`,
      };
      repairs.push(`${card.name}: ${fromRequirement.requirementId} → ${toRequirement.requirementId}`);
      continue;
    }

    const inDeckOracleIds = new Set(deck.nonlands.map((card) => card.oracleId).filter(Boolean));

    if (under.length > 0) {
      const requirement = under[0]!;
      const replacement = pickReplacementForRequirement({
        requirementId: requirement.requirementId,
        requirementPools: args.requirementPools,
        candidateDictionary: args.candidateDictionary,
        inDeckOracleIds,
      });
      if (!replacement) break;

      if (deck.nonlands.length >= args.contract.nonlandSlotsRequired) {
        const flexIndex = deck.nonlands.findIndex((card) => card.structuralNecessity === "FLEX");
        const removeIndex =
          flexIndex >= 0
            ? flexIndex
            : deck.nonlands.findIndex(
                (card) =>
                  (counts[card.primaryArchitectRequirement] ?? 0) >
                  (args.contract.cardRequirements.find((row) => row.requirementId === card.primaryArchitectRequirement)
                    ?.requestedCount ?? Number.MAX_SAFE_INTEGER),
              );
        if (removeIndex >= 0) deck.nonlands.splice(removeIndex, 1);
        else if (deck.nonlands.length > 0) deck.nonlands.pop();
      }

      deck.nonlands.push(replacement);
      repairs.push(`added ${replacement.name} → ${requirement.requirementId}`);
      continue;
    }

    if (over.length > 0) {
      const requirement = over[0]!;
      const removeIndex = deck.nonlands.findIndex(
        (card) =>
          card.primaryArchitectRequirement === requirement.requirementId &&
          card.structuralNecessity === "FLEX",
      );
      const fallbackIndex =
        removeIndex >= 0
          ? removeIndex
          : deck.nonlands.findIndex(
              (card) => card.primaryArchitectRequirement === requirement.requirementId,
            );
      if (fallbackIndex < 0) break;
      const removed = deck.nonlands.splice(fallbackIndex, 1)[0]!;
      repairs.push(`trimmed ${removed.name} from ${requirement.requirementId}`);
      continue;
    }

    break;
  }

  return { deck, repairs };
}
