/**
 * Deterministic off-plan card replacement — cut Professor-flagged misallocations.
 */
import { normalizeCardNameForMatch } from "./professor-canonical-card-identity-v4-15-1-v1";
import type {
  CanonicalCardFactsV11,
  RequirementPoolV11,
  SolDirectedConstructedDeckV11,
  SolDirectedSelectedNonlandV11,
} from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_OFF_PLAN_REPAIR_V1_1_1_VERSION =
  "professor-sol-directed-off-plan-repair-v1-1-1";

export function normalizeOffPlanCardLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const dashMatch = trimmed.match(/^(.+?)\s+[—–-]\s+/);
  if (dashMatch?.[1]) return dashMatch[1].trim();

  const clauseMatch = trimmed.match(/^(.+?),\s+(?:when|assigned|because|which|but|as|since)\b/i);
  if (clauseMatch?.[1]) return clauseMatch[1].trim();

  return trimmed;
}

export function extractCardNamesFromProfessorFeedback(args: {
  offPlanCards?: string[];
  requiredChanges?: string[];
}): string[] {
  const names = new Set<string>();

  for (const raw of args.offPlanCards ?? []) {
    const label = normalizeOffPlanCardLabel(raw);
    if (label) names.add(label);
  }

  for (const change of args.requiredChanges ?? []) {
    const suchAsMatch = change.match(/(?:such as|including)\s+(.+?)(?:\.\s|$)/i);
    if (suchAsMatch?.[1]) {
      for (const part of suchAsMatch[1].split(/,\s+(?=[A-Z"'/])/)) {
        const candidate = part.trim().replace(/\.$/, "");
        if (candidate.length >= 3) names.add(candidate);
      }
    }

    const impostorMatch = change.match(/(?:impostors such as|Remove)\s+(.+?)\s+from/i);
    if (impostorMatch?.[1]) {
      for (const part of impostorMatch[1].split(/\s+and\s+|,\s+/)) {
        const candidate = part.trim().replace(/\.$/, "");
        if (candidate.length >= 3) names.add(candidate);
      }
    }

    const patterns = [
      /(?:Replace or reassign|Replace|Cut|Remove)\s+(.+?)\s+(?:so|from|out of|must|because)/i,
      /^(.+?)\s+must be replaced/i,
      /;\s*([A-Z][^;]+?)\s+must be replaced/i,
    ];
    for (const pattern of patterns) {
      const match = change.match(pattern);
      if (!match?.[1]) continue;
      const candidate = match[1].trim().replace(/\.$/, "");
      if (candidate.length >= 3) names.add(candidate);
    }
  }

  return [...names];
}

function pickReplacementNonland(args: {
  cutCard: SolDirectedSelectedNonlandV11;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requirementPools: RequirementPoolV11[];
  inDeckOracleIds: Set<string>;
}): CanonicalCardFactsV11 | null {
  const requirementId = args.cutCard.primaryArchitectRequirement;
  const pool = args.requirementPools.find((row) => row.requirementId === requirementId);
  const poolOracleIds = pool?.oracleIds ?? Object.keys(args.candidateDictionary);

  for (const oracleId of poolOracleIds) {
    if (args.inDeckOracleIds.has(oracleId)) continue;
    const facts = args.candidateDictionary[oracleId];
    if (facts && !facts.isLand) return facts;
  }

  for (const facts of Object.values(args.candidateDictionary)) {
    if (facts.isLand || args.inDeckOracleIds.has(facts.oracleId)) continue;
    return facts;
  }
  return null;
}

export function repairOffPlanNonlandsV111(args: {
  deck: SolDirectedConstructedDeckV11;
  offPlanCards: string[];
  requiredChanges?: string[];
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requirementPools: RequirementPoolV11[];
}): { deck: SolDirectedConstructedDeckV11; repairs: string[] } {
  const repairs: string[] = [];
  const deck: SolDirectedConstructedDeckV11 = {
    ...args.deck,
    nonlands: args.deck.nonlands.map((card) => ({ ...card })),
    lands: args.deck.lands.map((land) => ({ ...land })),
  };

  const flaggedNames = extractCardNamesFromProfessorFeedback({
    offPlanCards: args.offPlanCards,
    requiredChanges: args.requiredChanges,
  });
  const offPlanKeys = new Set(
    flaggedNames.map((label) => normalizeCardNameForMatch(label)).filter(Boolean),
  );
  if (offPlanKeys.size === 0) return { deck, repairs };

  const inDeckOracleIds = new Set(deck.nonlands.map((card) => card.oracleId).filter(Boolean));

  for (let i = 0; i < deck.nonlands.length; i += 1) {
    const card = deck.nonlands[i]!;
    const cardKey = normalizeCardNameForMatch(card.name);
    if (!offPlanKeys.has(cardKey)) continue;

    const replacement = pickReplacementNonland({
      cutCard: card,
      candidateDictionary: args.candidateDictionary,
      requirementPools: args.requirementPools,
      inDeckOracleIds,
    });
    if (!replacement) continue;

    deck.nonlands[i] = {
      ...card,
      oracleId: replacement.oracleId,
      name: replacement.name,
      typeLine: replacement.typeLine,
      whyInThisDeck: `Off-plan repair replaced ${card.name}.`,
    };
    inDeckOracleIds.add(replacement.oracleId);
    repairs.push(`${card.name} → ${replacement.name}`);
  }

  return { deck, repairs };
}
