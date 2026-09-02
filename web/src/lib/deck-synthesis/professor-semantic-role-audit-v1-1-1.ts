/**
 * Deterministic Semantic Oracle quality audit after Constructor.
 * Flags suspicious role assignments for Critic — does not replace cards.
 */
import type { SemanticOracleFactsV111 } from "./professor-semantic-oracle-facts-v1-1-1";
import { scoreRequirementSemanticFitV111 } from "./professor-requirement-semantic-profiles-v1-1-1";
import type {
  CanonicalCardFactsV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SEMANTIC_ROLE_AUDIT_V1_1_1_VERSION =
  "professor-semantic-role-audit-v1-1-1";

export type SemanticRoleAuditFlagV111 = {
  name: string;
  oracleId: string;
  assignedRequirement: string;
  assignedRole: string;
  suspicion: string;
  expected: string;
  observedActions: string[];
  observedRoles: string[];
  observedRepeatability: string | null;
};

function factsForCard(
  card: { oracleId?: string; name: string },
  dictionary: Record<string, CanonicalCardFactsV11>,
): CanonicalCardFactsV11 | null {
  if (card.oracleId && dictionary[card.oracleId]) return dictionary[card.oracleId]!;
  const key = card.name.trim().toLowerCase();
  return Object.values(dictionary).find((facts) => facts.name.trim().toLowerCase() === key) ?? null;
}

function describeExpected(requirementId: string, primaryRole: string): string {
  const hay = `${requirementId} ${primaryRole}`.toLowerCase();
  if (hay.includes("token") && (hay.includes("repeat") || hay.includes("engine"))) {
    return "repeatable token creation (CREATE_TOKEN + triggered/activated/replacement)";
  }
  if (hay.includes("sacrifice") && hay.includes("outlet")) {
    return "reusable sacrifice functionality";
  }
  if (hay.includes("recur") || hay.includes("graveyard") || hay.includes("reanimat")) {
    return "return, recast, or recover relevant cards from graveyard";
  }
  if (hay.includes("ramp") || hay.includes("mana")) {
    return "repeatable or reliable mana production / land ramp";
  }
  if (hay.includes("advantage") || hay.includes("draw")) {
    return "repeatable or substantial card advantage — not a lone cantrip";
  }
  if (hay.includes("protect")) {
    return "protection for the commander or key permanents";
  }
  if (hay.includes("interact") || hay.includes("removal")) {
    return "creature or permanent interaction";
  }
  return `functional fulfillment of ${requirementId || primaryRole}`;
}

function compactFacts(facts: SemanticOracleFactsV111 | null): {
  observedActions: string[];
  observedRoles: string[];
  observedRepeatability: string | null;
} {
  if (!facts) {
    return { observedActions: [], observedRoles: [], observedRepeatability: null };
  }
  return {
    observedActions: facts.semanticActions.slice(0, 8),
    observedRoles: facts.semanticFunctions.slice(0, 8),
    observedRepeatability: facts.repeatability,
  };
}

export function auditSemanticRoleAssignmentsV111(args: {
  deck: SolDirectedConstructedDeckV11;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
}): SemanticRoleAuditFlagV111[] {
  const flags: SemanticRoleAuditFlagV111[] = [];
  for (const card of args.deck.nonlands) {
    const facts = factsForCard(card, args.candidateDictionary);
    const semantic = facts?.semanticOracle ?? null;
    const fit = scoreRequirementSemanticFitV111({
      facts: semantic,
      requirementId: card.primaryArchitectRequirement,
      primaryRole: card.primaryRole,
    });
    if (!semantic) continue;
    if (fit.functionalMatch) continue;

    flags.push({
      name: card.name,
      oracleId: facts?.oracleId ?? card.oracleId ?? "",
      assignedRequirement: card.primaryArchitectRequirement,
      assignedRole: card.primaryRole,
      suspicion: `Semantic Oracle does not support assigned role ${card.primaryArchitectRequirement}`,
      expected: describeExpected(card.primaryArchitectRequirement, card.primaryRole),
      ...compactFacts(semantic),
    });
  }
  flags.sort((a, b) => a.name.localeCompare(b.name) || a.assignedRequirement.localeCompare(b.assignedRequirement));
  return flags;
}
