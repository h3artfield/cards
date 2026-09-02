/**
 * Versioned strategic assertion vocabulary for Professor v3 typed grounding.
 */
import type { EvidenceRef } from "./professor-planning-evidence-v3";

export const STRATEGIC_ASSERTION_VOCABULARY_V3_VERSION = "strategic-assertion-vocabulary-v3";

export const ASSERTION_PREDICATES_V3 = [
  "PERMITS_ACTION",
  "PRODUCES_STATE",
  "REQUIRES_STATE",
  "CONSUMES_STATE",
  "GRANTS_KEYWORD",
  "MODIFIES_COST",
  "TRIGGERS_ON",
  "ENABLES_BRIDGE",
] as const;

export type AssertionPredicateV3 = (typeof ASSERTION_PREDICATES_V3)[number];

export const ASSERTION_ACTIONS_V3 = [
  "CAST_FROM_GRAVEYARD",
  "PLAY_FROM_GRAVEYARD",
  "ADDITIONAL_LAND_PLAY",
  "MOVE_CARDS",
  "MILL",
  "TUTOR",
  "SEARCH_LIBRARY",
  "DRAW_CARD",
  "DEAL_DAMAGE",
  "CREATE_TOKEN",
  "MODIFY_TOKEN_CREATION",
  "SACRIFICE",
  "MODIFY_STATS",
  "ADD_MANA",
  "PUT_COUNTER",
] as const;

export type AssertionActionV3 = (typeof ASSERTION_ACTIONS_V3)[number];

export type StrategicAssertionV3 = {
  assertionId: string;
  packageId: string;
  predicate: AssertionPredicateV3;
  action?: string;
  object?: string;
  resourceOrState?: string;
  sourceZone?: string;
  destinationZone?: string;
  timing?: string;
  controllerScope?: string;
  quantityOrScaling?: string;
  provider?: string;
  evidenceRefs: EvidenceRef[];
};

export type CausalEdgeV3 = {
  edgeId: string;
  producerAssertionId: string;
  consumerAssertionId: string;
  resourceOrState: string;
  evidenceRefs: EvidenceRef[];
};

export function isAssertionPredicateV3(value: string): value is AssertionPredicateV3 {
  return (ASSERTION_PREDICATES_V3 as readonly string[]).includes(value);
}

export function normalizeAssertionField(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase().replace(/\s+/g, "_") : undefined;
}

export function normalizeStrategicAssertionV3(raw: StrategicAssertionV3): StrategicAssertionV3 {
  return {
    ...raw,
    action: normalizeAssertionField(raw.action),
    object: normalizeAssertionField(raw.object),
    resourceOrState: normalizeAssertionField(raw.resourceOrState),
    sourceZone: normalizeAssertionField(raw.sourceZone),
    destinationZone: normalizeAssertionField(raw.destinationZone),
    timing: normalizeAssertionField(raw.timing),
    controllerScope: normalizeAssertionField(raw.controllerScope),
    provider: normalizeAssertionField(raw.provider),
  };
}

/** Predicates that require canonical mechanism/oracle proof — RAG/research cannot alone ground these. */
export const CANONICAL_MECHANICAL_PREDICATES_V3: ReadonlySet<AssertionPredicateV3> = new Set([
  "PERMITS_ACTION",
  "GRANTS_KEYWORD",
  "MODIFIES_COST",
  "TRIGGERS_ON",
]);

export const PRODUCER_PREDICATES_V3: ReadonlySet<AssertionPredicateV3> = new Set(["PRODUCES_STATE", "ENABLES_BRIDGE"]);

export const CONSUMER_PREDICATES_V3: ReadonlySet<AssertionPredicateV3> = new Set([
  "REQUIRES_STATE",
  "CONSUMES_STATE",
  "PERMITS_ACTION",
]);
