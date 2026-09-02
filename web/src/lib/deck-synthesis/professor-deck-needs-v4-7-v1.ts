/**
 * Deck needs v4.7 — abstract requirements that drive Research card discovery.
 */
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { DeckSnapshotV46 } from "./professor-council-assembly-v4-6-v1";
import type { FunctionalRoleV47 } from "./professor-functional-profile-v4-7-v1";

export const PROFESSOR_DECK_NEEDS_V4_7_V1_VERSION = "professor-deck-needs-v4-7-v1";

export type DeckNeedSourceV47 =
  | "DECK_CHARTER"
  | "SNAPSHOT_DEFICIT"
  | "ENGINE_REQUIREMENT"
  | "PACKAGE_REQUIREMENT"
  | "USER_REQUEST"
  | "CRITIC_FINDING"
  | "SEMANTIC_DISCOVERY"
  | "CREATIVE_CONCEPT"
  | "BRACKET_CONTRACT";

export type DeckNeedCategoryV47 =
  | "RAMP"
  | "CARD_ADVANTAGE"
  | "INTERACTION"
  | "PROTECTION"
  | "RECOVERY"
  | "ENGINE"
  | "PAYOFF"
  | "WIN_PATH"
  | "MANA_FIXING"
  | "ROLE_COMPRESSION";

export type DeckNeedV47 = {
  needId: string;
  category: DeckNeedCategoryV47;
  role: FunctionalRoleV47 | string;
  reason: string;
  source: DeckNeedSourceV47;
  requiredFunctions: string[];
  preferredFunctions: string[];
  requiredMechanics: string[];
  preferredMechanics: string[];
  desiredProducedResources: string[];
  desiredConsumedResources: string[];
  desiredEvents: string[];
  urgency: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "PARTIAL" | "SATISFIED";
  conceptText?: string;
  packageName?: string;
};

export type ResearchCardQueryV47 = {
  queryId: string;
  needId: string;
  searchTerms: string[];
  requiredMechanics: string[];
  requiredRoles: FunctionalRoleV47[];
  conceptText: string;
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function looksLikeCardName(value: string): boolean {
  const v = value.trim();
  if (v.length < 4 || v.length > 48) return false;
  if (/^(ENABLER|FUEL|ENGINE|PAYOFF|PROTECTION|RECOVERY|CONVERSION|COMMANDER)/i.test(v)) return false;
  if (/produce|create|generate|payoff|drain|win|finish|scale|death|token|resource|counter engine/i.test(v) && !v.includes(",")) {
    return false;
  }
  return /^[A-Z][A-Za-z0-9' ,\-]+$/.test(v);
}

/** Decompose abstract Creative strings into searchable mechanics. */
export function decomposeCreativeConceptV47(concept: string): {
  mechanics: string[];
  roles: FunctionalRoleV47[];
  searchTerms: string[];
} {
  const text = concept.toLowerCase();
  const mechanics = new Set<string>();
  const roles = new Set<FunctionalRoleV47>();
  const searchTerms = new Set<string>();

  if (/proliferate/.test(text)) {
    mechanics.add("proliferate");
    roles.add("proliferate");
    searchTerms.add("proliferate");
  }
  if (/\+1\/\+1|plus one|counter engine|counter producer|place counter/.test(text)) {
    mechanics.add("place_counters");
    roles.add("counter-engine");
    searchTerms.add("+1/+1 counter");
  }
  if (/counter payoff|counter density|scale.*counter|benefit.*counter/.test(text)) {
    roles.add("counter-payoff");
    searchTerms.add("+1/+1 counter");
  }
  if (/lifegain|life gain/.test(text)) {
    roles.add("lifegain-enabler");
    searchTerms.add("gain life");
  }
  if (/proliferate payoff|counter payoff|scale.*counter|benefit.*counter density/.test(text)) {
    roles.add("counter-payoff");
    if (/proliferate/.test(text)) roles.add("proliferate");
  }
  if (/lifegain payoff|life gain payoff|convert.*life|draw.*life/.test(text)) {
    roles.add("lifegain-payoff");
    if (/draw|card advantage/.test(text)) roles.add("card-advantage");
  }
  if (/card advantage|draw card|card draw/.test(text) && !/proliferate payoff/.test(text)) {
    roles.add("card-advantage");
    searchTerms.add("draw");
  }
  if (/ramp|mana|acceler/.test(text)) {
    roles.add("ramp");
    searchTerms.add("add {");
  }
  if (/removal|interaction|destroy|exile target/.test(text)) {
    roles.add("interaction");
    searchTerms.add("destroy target");
  }
  if (/protection|hexproof|indestructible|resilien/.test(text)) {
    roles.add("protection");
    searchTerms.add("indestructible");
  }
  if (/sacrifice|death trigger/.test(text)) {
    roles.add("sacrifice-outlet");
    searchTerms.add("sacrifice");
  }
  if (/token/.test(text)) {
    roles.add("token-generation");
    searchTerms.add("create");
  }
  if (/legendary/.test(text)) {
    roles.add("legendary");
  }
  if (/recursion|graveyard|reanimate/.test(text)) {
    roles.add("recovery");
    searchTerms.add("graveyard");
  }

  if (mechanics.size === 0 && roles.size === 0) {
    searchTerms.add(concept.slice(0, 40));
  }

  return { mechanics: [...mechanics], roles: [...roles], searchTerms: [...searchTerms] };
}

function needFromConcept(args: {
  concept: string;
  source: DeckNeedSourceV47;
  category: DeckNeedCategoryV47;
  packageName?: string;
  urgency?: DeckNeedV47["urgency"];
}): DeckNeedV47 {
  const parsed = decomposeCreativeConceptV47(args.concept);
  const role = parsed.roles[0] ?? args.category.toLowerCase();
  return {
    needId: `need-${slugify(args.concept)}`,
    category: args.category,
    role,
    reason: args.concept,
    source: args.source,
    requiredFunctions: parsed.roles,
    preferredFunctions: parsed.roles,
    requiredMechanics: parsed.mechanics,
    preferredMechanics: parsed.mechanics,
    desiredProducedResources: [],
    desiredConsumedResources: [],
    desiredEvents: parsed.mechanics,
    urgency: args.urgency ?? "MEDIUM",
    status: "OPEN",
    conceptText: args.concept,
    packageName: args.packageName,
  };
}

export function buildInitialDeckNeedsV47(args: {
  charter: DeckCharterV45;
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
}): DeckNeedV47[] {
  const needs: DeckNeedV47[] = [];
  const seen = new Set<string>();

  const push = (need: DeckNeedV47) => {
    if (seen.has(need.needId)) return;
    seen.add(need.needId);
    needs.push(need);
  };

  push(
    needFromConcept({
      concept: args.charter.primaryStrategy,
      source: "DECK_CHARTER",
      category: "ENGINE",
      urgency: "HIGH",
    }),
  );

  for (const pkg of args.pass1.packages) {
    push(
      needFromConcept({
        concept: pkg.purpose,
        source: "PACKAGE_REQUIREMENT",
        category: "ENGINE",
        packageName: pkg.concept,
        urgency: "HIGH",
      }),
    );
    for (const item of pkg.likelyCardsOrEffects ?? []) {
      if (looksLikeCardName(item)) continue;
      push(
        needFromConcept({
          concept: item,
          source: "CREATIVE_CONCEPT",
          category: /payoff|finish|win/i.test(item) ? "PAYOFF" : "ENGINE",
          packageName: pkg.concept,
        }),
      );
    }
  }

  for (const item of args.theory.packages.flatMap((p) => p.candidateCards)) {
    if (looksLikeCardName(item)) continue;
    push(
      needFromConcept({
        concept: item,
        source: "CREATIVE_CONCEPT",
        category: "ENGINE",
      }),
    );
  }

  const structural: Array<{ concept: string; category: DeckNeedCategoryV47; role: FunctionalRoleV47 }> = [
    { concept: "Mana acceleration and ramp for curve", category: "RAMP", role: "ramp" },
    { concept: "Card advantage and draw engines", category: "CARD_ADVANTAGE", role: "card-advantage" },
    { concept: "Targeted removal and interaction", category: "INTERACTION", role: "interaction" },
    { concept: "Protection and resilience", category: "PROTECTION", role: "protection" },
  ];
  for (const s of structural) {
    push({
      needId: `need-${s.role}`,
      category: s.category,
      role: s.role,
      reason: s.concept,
      source: "DECK_CHARTER",
      requiredFunctions: [s.role],
      preferredFunctions: [s.role],
      requiredMechanics: [],
      preferredMechanics: [],
      desiredProducedResources: [],
      desiredConsumedResources: [],
      desiredEvents: [],
      urgency: "MEDIUM",
      status: "OPEN",
      conceptText: s.concept,
    });
  }

  return needs;
}

export function deriveDeckNeedsFromSnapshotV47(args: {
  snapshot: DeckSnapshotV46;
  charter: DeckCharterV45;
  existingNeedIds: Set<string>;
}): DeckNeedV47[] {
  const needs: DeckNeedV47[] = [];
  for (const weakness of args.snapshot.weaknesses) {
    const id = `need-deficit-${slugify(weakness)}`;
    if (args.existingNeedIds.has(id)) continue;
    const parsed = decomposeCreativeConceptV47(weakness);
    needs.push({
      needId: id,
      category: weakness.includes("card advantage") ? "CARD_ADVANTAGE" : "PAYOFF",
      role: parsed.roles[0] ?? "card-advantage",
      reason: weakness,
      source: "SNAPSHOT_DEFICIT",
      requiredFunctions: parsed.roles,
      preferredFunctions: parsed.roles,
      requiredMechanics: parsed.mechanics,
      preferredMechanics: parsed.mechanics,
      desiredProducedResources: args.snapshot.underusedResources,
      desiredConsumedResources: [],
      desiredEvents: parsed.mechanics,
      urgency: "HIGH",
      status: "OPEN",
      conceptText: weakness,
    });
  }
  return needs;
}

export function deckNeedsToResearchQueries(needs: DeckNeedV47[]): ResearchCardQueryV47[] {
  return needs
    .filter((n) => n.status === "OPEN" || n.status === "PARTIAL")
    .map((need) => {
      const parsed = decomposeCreativeConceptV47(need.conceptText ?? need.reason);
      return {
        queryId: `q-${need.needId}`,
        needId: need.needId,
        searchTerms: parsed.searchTerms.length > 0 ? parsed.searchTerms : [need.reason.slice(0, 40)],
        requiredMechanics: need.requiredMechanics.length > 0 ? need.requiredMechanics : parsed.mechanics,
        requiredRoles: (need.requiredFunctions as FunctionalRoleV47[]).length
          ? (need.requiredFunctions as FunctionalRoleV47[])
          : parsed.roles,
        conceptText: need.conceptText ?? need.reason,
      };
    });
}

export { looksLikeCardName };
