/**
 * Generic semantic research primitives v4 — mechanism-shape search, no commander branches.
 */
import type { IndependentMechanismFact } from "./independent-truth-types-v1";
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type { ProfessorPlanningContextV3 } from "./professor-planning-contracts-v3";
import {
  canonicalStatesFromMechanismFact,
  flattenMechanismActions,
  normalizedResourcesFromTokenDescriptor,
  requiredStatesFromMechanismFact,
} from "./grounding-derivation-graph-v1";

export const PROFESSOR_SEMANTIC_RESEARCH_PRIMITIVES_V4_VERSION = "professor-semantic-research-primitives-v4";

export type SemanticResearchPrimitiveKindV4 =
  | "STATE_PRODUCER_TO_CONSUMERS"
  | "REQUIRED_EVENT_TO_PRODUCERS"
  | "ZONE_MOVE_BENEFICIARIES"
  | "RESOURCE_PRODUCER_TO_ALTERNATIVE_CONSUMERS"
  | "QUANTITY_SCALING_NONLINEAR_PAYOFFS"
  | "DEATH_ETB_RESET_LOOPS"
  | "TOKEN_CREATION_CROSS_RESOURCE"
  | "COST_PAYMENT_ALTERNATIVE_PRODUCERS";

export type SemanticResearchPrimitiveResultV4 = {
  primitive: SemanticResearchPrimitiveKindV4;
  producerStateOrEvent: string;
  candidates: string[];
  mechanicalBasis: string;
  evidenceRefs: EvidenceRef[];
};

/** Generic token/resource classes for cross-resource discovery — not commander-specific. */
export const GENERIC_TOKEN_RESOURCE_CLASSES_V4 = [
  "Treasure",
  "Clue",
  "Food",
  "Blood",
  "Map",
  "artifact token",
  "copy token",
  "noncreature token",
] as const;

function actionType(action: Record<string, unknown>): string {
  return String(action.type ?? "").toUpperCase();
}

function mechanismFactRef(factId: string, statement?: string): EvidenceRef {
  return { kind: "MECHANISM_FACT", factIds: [factId], statement };
}

export function extractProducedStatesFromFacts(facts: IndependentMechanismFact[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const fact of facts) {
    map.set(fact.mechanismId, [...canonicalStatesFromMechanismFact(fact)].sort());
  }
  return map;
}

export function extractRequiredStatesFromFacts(facts: IndependentMechanismFact[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const fact of facts) {
    map.set(fact.mechanismId, [...requiredStatesFromMechanismFact(fact)].sort());
  }
  return map;
}

export function searchStateProducerToConsumers(args: {
  facts: IndependentMechanismFact[];
}): SemanticResearchPrimitiveResultV4[] {
  const results: SemanticResearchPrimitiveResultV4[] = [];
  for (const fact of args.facts) {
    const produced = [...canonicalStatesFromMechanismFact(fact)];
    if (produced.length === 0) continue;
    for (const state of produced) {
      const consumers = args.facts
        .filter((other) => other.mechanismId !== fact.mechanismId)
        .filter((other) => [...requiredStatesFromMechanismFact(other)].some((req) => req.includes(state.split("_")[0]!) || state.includes(req.split("_")[0]!)))
        .map((other) => other.mechanismId);
      if (consumers.length === 0) continue;
      results.push({
        primitive: "STATE_PRODUCER_TO_CONSUMERS",
        producerStateOrEvent: state,
        candidates: consumers,
        mechanicalBasis: `Mechanism ${fact.mechanismId} produces ${state}; other facts may consume related states.`,
        evidenceRefs: [mechanismFactRef(fact.mechanismId, fact.evidenceSpan)],
      });
    }
  }
  return results;
}

export function searchRequiredEventToProducers(args: {
  facts: IndependentMechanismFact[];
}): SemanticResearchPrimitiveResultV4[] {
  const results: SemanticResearchPrimitiveResultV4[] = [];
  for (const fact of args.facts) {
    const trigger = String(fact.trigger ?? "").trim();
    if (!trigger) continue;
    const producers = args.facts
      .filter((other) => other.mechanismId !== fact.mechanismId)
      .filter((other) => {
        const actions = flattenMechanismActions(other);
        return actions.some((a) => {
          const t = actionType(a);
          return t === "SACRIFICE" || t === "ZONE_MOVE" || t === "CREATE_TOKEN" || t === "GET_COUNTER";
        });
      })
      .map((other) => other.mechanismId);
    if (producers.length === 0) continue;
    results.push({
      primitive: "REQUIRED_EVENT_TO_PRODUCERS",
      producerStateOrEvent: trigger,
      candidates: producers,
      mechanicalBasis: `Fact ${fact.mechanismId} is gated on ${trigger}; other mechanisms may repeatedly produce qualifying events.`,
      evidenceRefs: [mechanismFactRef(fact.mechanismId, fact.evidenceSpan)],
    });
  }
  return results;
}

export function searchZoneMoveBeneficiaries(args: {
  facts: IndependentMechanismFact[];
}): SemanticResearchPrimitiveResultV4[] {
  const results: SemanticResearchPrimitiveResultV4[] = [];
  for (const fact of args.facts) {
    for (const action of flattenMechanismActions(fact)) {
      if (actionType(action) !== "CONDITIONAL_ZONE_MOVE" && actionType(action) !== "ZONE_MOVE") continue;
      const from = String((action.ifTrue as { from?: string } | undefined)?.from ?? action.from ?? "UNKNOWN");
      const toTrue = String((action.ifTrue as { to?: string } | undefined)?.to ?? action.to ?? "UNKNOWN");
      const toFalse = String((action.ifFalse as { to?: string } | undefined)?.to ?? "");
      results.push({
        primitive: "ZONE_MOVE_BENEFICIARIES",
        producerStateOrEvent: `${from}->${toTrue}${toFalse ? `|${toFalse}` : ""}`,
        candidates: [
          `cards benefiting from leaving ${from}`,
          `cards benefiting from entering ${toTrue}`,
          ...(toFalse ? [`cards benefiting from entering ${toFalse}`] : []),
          "reset-when-reentering-battlefield effects",
        ],
        mechanicalBasis: `Zone movement in ${fact.mechanismId} creates reusable ETB/death asymmetry opportunities.`,
        evidenceRefs: [mechanismFactRef(fact.mechanismId, fact.evidenceSpan)],
      });
    }
  }
  return results;
}

export function searchTokenCreationCrossResource(args: {
  facts: IndependentMechanismFact[];
}): SemanticResearchPrimitiveResultV4[] {
  const results: SemanticResearchPrimitiveResultV4[] = [];
  for (const fact of args.facts) {
    const actions = flattenMechanismActions(fact);
    const modify = actions.find((a) => actionType(a) === "MODIFY_TOKEN_CREATION");
    if (!modify) continue;
    const preserves = modify.preservesOriginalTokens === true;
    const nested = modify.addsAdditionalTokens as Record<string, unknown> | undefined;
    const addedToken = nested ? String(nested.token ?? "") : "";
    const addedResources = normalizedResourcesFromTokenDescriptor(addedToken);
    const candidates = GENERIC_TOKEN_RESOURCE_CLASSES_V4.map(
      (klass) => `${klass} token engines amplified by additional ${addedResources.join("/") || "creature tokens"}`,
    );
    results.push({
      primitive: "TOKEN_CREATION_CROSS_RESOURCE",
      producerStateOrEvent: preserves ? "MODIFY_TOKEN_CREATION_PRESERVES_ORIGINAL" : "MODIFY_TOKEN_CREATION",
      candidates,
      mechanicalBasis: preserves
        ? "Replacement/modification preserves original token type while adding a second resource class from one creation event."
        : "Token creation modification may intersect multiple resource classes.",
      evidenceRefs: [mechanismFactRef(fact.mechanismId, fact.evidenceSpan)],
    });
  }
  return results;
}

export function searchDeathEtbResetLoops(args: {
  facts: IndependentMechanismFact[];
}): SemanticResearchPrimitiveResultV4[] {
  const results: SemanticResearchPrimitiveResultV4[] = [];
  const hasDeathTrigger = args.facts.some((f) => String(f.trigger ?? "").includes("DIES"));
  const hasZoneReturn = args.facts.some((f) =>
    flattenMechanismActions(f).some((a) => {
      const t = actionType(a);
      return t === "CONDITIONAL_ZONE_MOVE" || (t === "ZONE_MOVE" && String(a.to ?? "").includes("BATTLEFIELD"));
    }),
  );
  if (!hasDeathTrigger || !hasZoneReturn) return results;
  results.push({
    primitive: "DEATH_ETB_RESET_LOOPS",
    producerStateOrEvent: "DEATH_THEN_RECUR",
    candidates: [
      "self-sacrificing utility creatures",
      "creatures with strong ETB/death asymmetry",
      "creatures that replace themselves on death",
      "permanents whose upkeep/phase triggers reset on reentry",
    ],
    mechanicalBasis: "Commander facts combine creature death triggers with graveyard-to-battlefield recursion.",
    evidenceRefs: args.facts
      .filter((f) => String(f.trigger ?? "").includes("DIES") || flattenMechanismActions(f).some((a) => actionType(a) === "CONDITIONAL_ZONE_MOVE"))
      .map((f) => mechanismFactRef(f.mechanismId, f.evidenceSpan)),
  });
  return results;
}

export function searchSacrificeScalingModifiers(args: {
  facts: IndependentMechanismFact[];
}): SemanticResearchPrimitiveResultV4[] {
  const results: SemanticResearchPrimitiveResultV4[] = [];
  for (const fact of args.facts) {
    for (const action of flattenMechanismActions(fact)) {
      if (actionType(action) !== "MODIFY_STATS") continue;
      const qty = String(action.quantity ?? action.powerModifier ?? "X");
      if (!qty.includes("X") && qty !== "SCALING") continue;
      results.push({
        primitive: "QUANTITY_SCALING_NONLINEAR_PAYOFFS",
        producerStateOrEvent: "SACRIFICE_COUNT_SCALES_EFFECT",
        candidates: [
          "mass token producers",
          "repeatable sacrifice outlets",
          "token doublers",
          "payoffs scaling with quantity sacrificed",
        ],
        mechanicalBasis: `Scaling modifier in ${fact.mechanismId} rewards batch sacrifice events.`,
        evidenceRefs: [mechanismFactRef(fact.mechanismId, fact.evidenceSpan)],
      });
    }
  }
  return results;
}

export function runAllSemanticResearchPrimitivesV4(
  ctx: ProfessorPlanningContextV3,
): SemanticResearchPrimitiveResultV4[] {
  const facts = ctx.commanderMechanismFacts;
  return [
    ...searchStateProducerToConsumers({ facts }),
    ...searchRequiredEventToProducers({ facts }),
    ...searchZoneMoveBeneficiaries({ facts }),
    ...searchTokenCreationCrossResource({ facts }),
    ...searchDeathEtbResetLoops({ facts }),
    ...searchSacrificeScalingModifiers({ facts }),
  ];
}
