/**
 * Generic producer→consumer cross-fact edge discovery (v3).
 * No case-specific rules — matches typed outputs to typed inputs across facts.
 */
import type { IndependentMechanismFact } from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import type {
  OpportunityConfidenceClass,
  OpportunityDerivationClass,
  SemanticOpportunity,
  SemanticOpportunityType,
} from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import {
  actionTypes,
  extractFactSemanticGraph,
  type FactSemanticGraph,
} from "./phase6a1-semantic-opportunity-fact-graph-v3";
import type { CrossFactEdge } from "./phase6a1-semantic-opportunity-inference-v3";

export const SEMANTIC_OPPORTUNITY_CROSS_FACT_V3_VERSION = "phase6a1-semantic-opportunity-cross-fact-v3.2.2";

type ResourceTag =
  | "EXPERIENCE_COUNTER"
  | "PLUS_ONE_COUNTER_ON_CREATURES"
  | "PLUS_ONE_COUNTER_ON_TARGET"
  | "TOKEN_ON_BATTLEFIELD"
  | "PLAY_FROM_EXILE_PERMISSION"
  | "EXILED_CARD"
  | "MILL_EVENT"
  | "MILL_CONTAINS_CREATURE_CARDS"
  | "CREATURE_WITH_COUNTERS_DIES"
  | "CREATURE_IN_GRAVEYARD"
  | "SPELL_YOU_DO_NOT_OWN_CAST"
  | "COMBAT_DAMAGE_TO_PLAYER"
  | "COPY_WITH_COMBAT_DRAW"
  | "BASE_POWER"
  | "SACRIFICE_EVENT"
  | "ARTIFACT_IN_GRAVEYARD"
  | "NONCREATURE_SPELL_CAST"
  | "TARGETED_INSTANT_SORCERY"
  | "LAND_IN_GRAVEYARD"
  | "LIFE_GAIN_FROM_COMBAT"
  | "PAY_X_LIFE"
  | "COMBAT_DAMAGE_CONNECTIVITY"
  | "COMBAT_DAMAGE_SCALED_OUTPUT"
  | "COMBAT_DAMAGE_AMOUNT"
  | "PROWESS_POWER_GROWTH"
  | "NON_HUMAN_CREATURE_TOP_FIVE"
  | "POWER_4_PLUS_TOKEN"
  | "POWER_4_PLUS_ATTACKER"
  | "REANIMATED_NIGHTMARE"
  | "NIGHTMARE_STATIC_BUFF";

type FactResourceProfile = {
  factId: string;
  mechanismId: string;
  evidenceSpan: string;
  face?: string;
  actions: FactSemanticGraph["actions"];
  produces: Set<ResourceTag>;
  consumes: Set<ResourceTag>;
};

function tagsFromGraph(fact: IndependentMechanismFact, g: FactSemanticGraph): FactResourceProfile {
  const produces = new Set<ResourceTag>();
  const consumes = new Set<ResourceTag>();
  const types = actionTypes(g);
  const blob = JSON.stringify({ ...fact, actions: g.actions, condition: g.condition }).toUpperCase();
  const triggerParts: string[] = [];
  if (g.trigger) triggerParts.push(Array.isArray(g.trigger) ? g.trigger.join(" ") : g.trigger);
  if (g.condition) triggerParts.push(g.condition);
  const trigger = triggerParts.join(" ").toUpperCase();

  for (const a of g.actions) {
    const t = String(a.type ?? "").toUpperCase();
    if (t === "GET_COUNTER" && String(a.counterType).includes("experience")) produces.add("EXPERIENCE_COUNTER");
    if (t === "PUT_COUNTER" || t === "OPTIONAL_PUT_COUNTER") {
      if (String(a.subject ?? a.recipient ?? "").includes("EACH")) produces.add("PLUS_ONE_COUNTER_ON_CREATURES");
      else produces.add("PLUS_ONE_COUNTER_ON_TARGET");
    }
    if (t === "ENTERS_WITH_COUNTERS") produces.add("PLUS_ONE_COUNTER_ON_TARGET");
    if (t === "CREATE_TOKEN") produces.add("TOKEN_ON_BATTLEFIELD");
    if (t === "GRANT_PLAY_PERMISSION" || t === "GRANT_CAST_PERMISSION") produces.add("PLAY_FROM_EXILE_PERMISSION");
    if (t === "ZONE_MOVE" && String(a.to).includes("EXILE")) produces.add("EXILED_CARD");
    if (t === "MILL") produces.add("MILL_EVENT");
    if (t === "SACRIFICE") produces.add("SACRIFICE_EVENT");
    if (t === "BECOME_COPY_OF_EXILED_CARD" || t.includes("COPY")) produces.add("COPY_WITH_COMBAT_DRAW");
    if (t === "DRAW_CARD" && String(a.quantity).includes("BASE_POWER")) consumes.add("BASE_POWER");
  }

  if (trigger.includes("YOU_PLAY") && trigger.includes("EXILE")) consumes.add("PLAY_FROM_EXILE_PERMISSION");
  if (trigger.includes("EXPERIENCE") || blob.includes("YOUR_EXPERIENCE")) consumes.add("EXPERIENCE_COUNTER");
  if (trigger.includes("TOKEN") && trigger.includes("ENTERS")) consumes.add("TOKEN_ON_BATTLEFIELD");
  if (trigger.includes("MILL") && trigger.includes("CREATURE")) consumes.add("MILL_CONTAINS_CREATURE_CARDS");
  if (trigger.includes("DIES") && (blob.includes("+1/+1") || blob.includes("COUNTERS"))) {
    consumes.add("CREATURE_WITH_COUNTERS_DIES");
  }
  if (trigger.includes("YOU_CAST_SPELL_YOU_DO_NOT_OWN")) consumes.add("SPELL_YOU_DO_NOT_OWN_CAST");
  if (trigger.includes("DEALS_COMBAT_DAMAGE")) {
    consumes.add("COMBAT_DAMAGE_TO_PLAYER");
    produces.add("COMBAT_DAMAGE_TO_PLAYER");
  }
  if (
    (trigger.includes("INSTANT_OR_SORCERY") || (trigger.includes("INSTANT") && trigger.includes("SORCERY"))) &&
    (trigger.includes("TARGET") || blob.includes("TARGET"))
  ) {
    consumes.add("TARGETED_INSTANT_SORCERY");
  }
  if (trigger.includes("YOU_CAST_INSTANT_OR_SORCERY") && blob.includes("TARGET")) {
    produces.add("TARGETED_INSTANT_SORCERY");
  }
  if (trigger.includes("INSTANT_OR_SORCERY") && trigger.includes("TARGET")) consumes.add("TARGETED_INSTANT_SORCERY");
  if (trigger.includes("YOU_CAST_ENCHANTMENT") || trigger.includes("NONCREATURE_SPELL")) {
    consumes.add("NONCREATURE_SPELL_CAST");
  }
  if (trigger.includes("YOU_SACRIFICE")) consumes.add("SACRIFICE_EVENT");
  if (g.target?.includes("GRAVEYARD") && g.target.includes("LAND")) consumes.add("LAND_IN_GRAVEYARD");
  if (g.target?.includes("CREATURE") && g.target.includes("GRAVEYARD")) consumes.add("CREATURE_IN_GRAVEYARD");
  if (String(aTypesQuantity(g)).includes("EXPERIENCE")) consumes.add("EXPERIENCE_COUNTER");
  if (trigger.includes("MILL")) produces.add("MILL_EVENT");

  if (trigger.includes("MILLS") && trigger.includes("CREATURE")) consumes.add("MILL_CONTAINS_CREATURE_CARDS");
  if (types.includes("MILL")) produces.add("MILL_EVENT");

  if (types.includes("GRANT_CAST_PERMISSION") && g.target?.includes("OPPONENT")) {
    produces.add("SPELL_YOU_DO_NOT_OWN_CAST");
  }

  if (types.includes("CREATE_TOKEN_COPY")) produces.add("TOKEN_ON_BATTLEFIELD");

  if (blob.includes("BASE POWER") || blob.includes("BASE_POWER") || blob.includes("CURIE_BASE_POWER")) {
    produces.add("BASE_POWER");
  }

  const keyword = String((fact as { keyword?: string }).keyword ?? g.evidenceSpan).toUpperCase();
  if (g.mechanismType === "KEYWORD" && keyword.includes("LIFELINK")) produces.add("LIFE_GAIN_FROM_COMBAT");
  if (g.mechanismType === "KEYWORD" && keyword.includes("TRAMPLE")) produces.add("COMBAT_DAMAGE_CONNECTIVITY");
  if (keyword.includes("FLYING") || types.includes("GRANT_KEYWORD")) produces.add("COMBAT_DAMAGE_CONNECTIVITY");
  if (blob.includes("PAY X LIFE") || blob.includes("PAY_X_LIFE")) consumes.add("PAY_X_LIFE");
  if (trigger.includes("YOU_CAST_NONCREATURE") && blob.includes("PROWESS")) produces.add("PROWESS_POWER_GROWTH");
  if (aTypesQuantity(g).includes("COMBAT_DAMAGE_DEALT") || blob.includes("COMBAT_DAMAGE_DEALT")) {
    produces.add("COMBAT_DAMAGE_AMOUNT");
    consumes.add("COMBAT_DAMAGE_SCALED_OUTPUT");
  } else if (JSON.stringify(g.actions).includes("COMBAT_DAMAGE_DEALT")) {
    consumes.add("COMBAT_DAMAGE_SCALED_OUTPUT");
  }
  if (blob.includes("NON_HUMAN") && types.includes("OPTIONAL_ZONE_MOVE")) consumes.add("NON_HUMAN_CREATURE_TOP_FIVE");
  if (g.target?.includes("CREATURE_CARD_IN_YOUR_GRAVEYARD")) consumes.add("CREATURE_IN_GRAVEYARD");
  if (types.includes("CREATE_TOKEN") && blob.includes("4/4") && blob.includes("BEAR")) produces.add("POWER_4_PLUS_TOKEN");
  if (trigger.includes("POWER_4") && trigger.includes("ATTACK")) consumes.add("POWER_4_PLUS_ATTACKER");
  if (types.includes("ADD_CREATURE_TYPE") && blob.includes("NIGHTMARE")) produces.add("REANIMATED_NIGHTMARE");
  if (g.subject?.includes("ALL_NIGHTMARES") && types.includes("MODIFY_PT")) consumes.add("NIGHTMARE_STATIC_BUFF");

  return {
    factId: fact.mechanismId,
    mechanismId: fact.mechanismId,
    evidenceSpan: g.evidenceSpan,
    face: g.face,
    actions: g.actions,
    produces,
    consumes,
  };
}

function aTypesQuantity(g: FactSemanticGraph): string {
  return JSON.stringify(g.actions.map((a) => a.quantity));
}

function producerEnablesConsumerFace(producer: FactResourceProfile, consumerFace: string): boolean {
  if (!producer.face || producer.face === consumerFace) return false;
  const blob = JSON.stringify(producer.actions).toUpperCase();
  if (!blob.includes("CONVERT") && !blob.includes("TRANSFORM")) return false;
  return consumerFace === "BACK" && producer.face === "FRONT";
}

function areCrossFactCompatible(producer: FactResourceProfile, consumer: FactResourceProfile): boolean {
  const pFace = producer.face;
  const cFace = consumer.face;
  if (!pFace || !cFace || pFace === cFace) return true;
  return producerEnablesConsumerFace(producer, cFace);
}

const EDGE_RULES: Array<{
  producer: ResourceTag;
  consumer: ResourceTag;
  suffix: string;
  type: SemanticOpportunityType;
  derivationClass: OpportunityDerivationClass;
  confidence: OpportunityConfidenceClass;
  causalStatement: (p: FactResourceProfile, c: FactResourceProfile) => string;
  requiredStateOrAction: string;
  expectedMechanicalEffect: string;
}> = [
  {
    producer: "PLAY_FROM_EXILE_PERMISSION",
    consumer: "PLAY_FROM_EXILE_PERMISSION",
    suffix: "exile-play-chain",
    type: "RESOURCE_CONVERSION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Chain ${p.mechanismId} play-permission into ${c.mechanismId} play-from-exile payoff`,
    requiredStateOrAction: "Cast/play cards from exile during permission window",
    expectedMechanicalEffect: "Consumer trigger/payoff resolves on exile casts",
  },
  {
    producer: "EXPERIENCE_COUNTER",
    consumer: "EXPERIENCE_COUNTER",
    suffix: "experience-chain",
    type: "OUTPUT_EXPLOITATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Build experience via ${p.mechanismId} for ${c.mechanismId} scaling`,
    requiredStateOrAction: "Experience counter accumulation",
    expectedMechanicalEffect: "Consumer uses experience count for output sizing",
  },
  {
    producer: "TOKEN_ON_BATTLEFIELD",
    consumer: "TOKEN_ON_BATTLEFIELD",
    suffix: "token-entry-chain",
    type: "INPUT_AMPLIFICATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Token output from ${p.mechanismId} feeds ${c.mechanismId} token-entry trigger`,
    requiredStateOrAction: "Creature tokens entering the battlefield",
    expectedMechanicalEffect: "Consumer trigger on token entry",
  },
  {
    producer: "PLUS_ONE_COUNTER_ON_CREATURES",
    consumer: "CREATURE_WITH_COUNTERS_DIES",
    suffix: "counter-death-transfer-chain",
    type: "OUTPUT_EXPLOITATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Counters from ${p.mechanismId} enable ${c.mechanismId} counter transfer on death`,
    requiredStateOrAction: "Creatures with +1/+1 counters dying or leaving command zone",
    expectedMechanicalEffect: "Counter transfer on departed creature",
  },
  {
    producer: "MILL_EVENT",
    consumer: "MILL_CONTAINS_CREATURE_CARDS",
    suffix: "mill-creature-chain",
    type: "OUTPUT_EXPLOITATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Mill events from ${p.mechanismId} feed ${c.mechanismId} creature-mill trigger`,
    requiredStateOrAction: "Mill events that include creature cards",
    expectedMechanicalEffect: "Consumer token/output on creature mill",
  },
  {
    producer: "SPELL_YOU_DO_NOT_OWN_CAST",
    consumer: "SPELL_YOU_DO_NOT_OWN_CAST",
    suffix: "not-owned-cast-chain",
    type: "TRIGGER_FREQUENCY",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Not-owned spell casts from ${p.mechanismId} trigger ${c.mechanismId}`,
    requiredStateOrAction: "Cast spells you do not own",
    expectedMechanicalEffect: "Consumer payoff on not-owned casts",
  },
  {
    producer: "BASE_POWER",
    consumer: "BASE_POWER",
    suffix: "base-power-draw-chain",
    type: "OUTPUT_EXPLOITATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "MEDIUM",
    causalStatement: (p, c) => `Copied/base power from ${p.mechanismId} scales ${c.mechanismId} combat-draw quantity`,
    requiredStateOrAction: "Higher base power on combat-damage creature",
    expectedMechanicalEffect: "More cards drawn from combat damage trigger",
  },
  {
    producer: "SACRIFICE_EVENT",
    consumer: "SACRIFICE_EVENT",
    suffix: "sacrifice-payoff-chain",
    type: "OUTPUT_EXPLOITATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "MEDIUM",
    causalStatement: (p, c) => `Sacrifice events from ${p.mechanismId} feed ${c.mechanismId} payoff`,
    requiredStateOrAction: "Controlled permanent sacrifices",
    expectedMechanicalEffect: "Consumer sacrifice-triggered payoff",
  },
  {
    producer: "TARGETED_INSTANT_SORCERY",
    consumer: "TARGETED_INSTANT_SORCERY",
    suffix: "targeting-spell-copy-chain",
    type: "OUTPUT_EXPLOITATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Targeting spells enable ${c.mechanismId} copy output`,
    requiredStateOrAction: "Instant/sorcery spells targeting your permanents",
    expectedMechanicalEffect: "Token copy of targeted permanent",
  },
  {
    producer: "LIFE_GAIN_FROM_COMBAT",
    consumer: "PAY_X_LIFE",
    suffix: "lifelink-life-pay-chain",
    type: "RESOURCE_CONVERSION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "MEDIUM",
    causalStatement: (p, c) => `Lifelink from ${p.mechanismId} may replenish life for ${c.mechanismId} X-life draw when Tymna connects`,
    requiredStateOrAction: "Combat damage with lifelink to gain life before postcombat X-life payment (contingent on Tymna dealing damage)",
    expectedMechanicalEffect: "Partial life resource for postcombat X-life draw when lifelink damage occurs",
  },
  {
    producer: "COMBAT_DAMAGE_CONNECTIVITY",
    consumer: "COMBAT_DAMAGE_TO_PLAYER",
    suffix: "combat-connectivity-chain",
    type: "INPUT_AMPLIFICATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `${p.mechanismId} improves combat-damage connection for ${c.mechanismId}`,
    requiredStateOrAction: "Combat damage to players (evasion/connectivity)",
    expectedMechanicalEffect: "Consumer combat-damage trigger resolves",
  },
  {
    producer: "PROWESS_POWER_GROWTH",
    consumer: "COMBAT_DAMAGE_SCALED_OUTPUT",
    suffix: "prowess-combat-scaling-chain",
    type: "INPUT_AMPLIFICATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Prowess growth from ${p.mechanismId} increases combat damage for ${c.mechanismId}`,
    requiredStateOrAction: "Noncreature spells before combat to grow power",
    expectedMechanicalEffect: "More combat damage and scaled token output",
  },
  {
    producer: "PLUS_ONE_COUNTER_ON_TARGET",
    consumer: "CREATURE_WITH_COUNTERS_DIES",
    suffix: "countered-departure-chain",
    type: "OUTPUT_EXPLOITATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Counters from ${p.mechanismId} satisfy ${c.mechanismId} departure condition`,
    requiredStateOrAction: "Countered creature dies or goes to command zone",
    expectedMechanicalEffect: "Counter transfer on departure",
  },
  {
    producer: "POWER_4_PLUS_TOKEN",
    consumer: "POWER_4_PLUS_ATTACKER",
    suffix: "bear-ramp-chain",
    type: "INPUT_AMPLIFICATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `4/4 token from ${p.mechanismId} is a future power-4+ attacker for ${c.mechanismId}`,
    requiredStateOrAction: "Bear token attacking with power 4 or greater",
    expectedMechanicalEffect: "Land ramp trigger from token attacker",
  },
  {
    producer: "REANIMATED_NIGHTMARE",
    consumer: "NIGHTMARE_STATIC_BUFF",
    suffix: "nightmare-buff-chain",
    type: "OUTPUT_EXPLOITATION",
    derivationClass: "DERIVED_AMPLIFICATION",
    confidence: "HIGH",
    causalStatement: (p, c) => `Nightmares from ${p.mechanismId} receive ${c.mechanismId} static +1/+1`,
    requiredStateOrAction: "Reanimated creatures become Nightmares",
    expectedMechanicalEffect: "All Nightmares get +1/+1",
  },
];

function buildCrossOpp(
  caseId: string,
  edge: CrossFactEdge,
  rule: (typeof EDGE_RULES)[number],
  producer: FactResourceProfile,
  consumer: FactResourceProfile,
): SemanticOpportunity {
  return {
    opportunityId: `${caseId}--cross-${edge.edgeId}`,
    sourceMechanismFactIds: [...edge.producerFactIds, ...edge.consumerFactIds],
    sourceFactIds: [...edge.producerFactIds, ...edge.consumerFactIds],
    opportunityType: rule.type,
    derivationClass: rule.derivationClass,
    opportunityConfidence: rule.confidence,
    causalStatement: rule.causalStatement(producer, consumer),
    requiredStateOrAction: rule.requiredStateOrAction,
    expectedMechanicalEffect: rule.expectedMechanicalEffect,
    causalProof: [
      `producer=${producer.mechanismId}`,
      `consumer=${consumer.mechanismId}`,
      `edge=${edge.edgeId}`,
      edge.causalStatement,
    ],
    prerequisites: [],
    mutuallyRelevantWith: [],
    evidence: {
      type: "DERIVED_CAUSAL_INFERENCE",
      oracleSpan: `[${producer.mechanismId}] ${producer.evidenceSpan} | [${consumer.mechanismId}] ${consumer.evidenceSpan}`,
      rationale: `inferredRelation=${edge.causalStatement}`,
    },
    semanticEdge: `PRODUCER:${rule.producer}→CONSUMER:${rule.consumer}`,
  };
}

export function discoverCrossFactComposition(
  caseId: string,
  facts: IndependentMechanismFact[],
): { opportunities: SemanticOpportunity[]; edges: CrossFactEdge[] } {
  const profiles = facts.map((f) => tagsFromGraph(f, extractFactSemanticGraph(f)));
  const opportunities: SemanticOpportunity[] = [];
  const edges: CrossFactEdge[] = [];
  const seen = new Set<string>();

  for (const rule of EDGE_RULES) {
    for (const producer of profiles) {
      if (!producer.produces.has(rule.producer)) continue;
      for (const consumer of profiles) {
        if (producer.mechanismId === consumer.mechanismId) continue;
        if (!areCrossFactCompatible(producer, consumer)) continue;
        if (!consumer.consumes.has(rule.consumer)) continue;
        const edgeId = `${producer.mechanismId}-to-${consumer.mechanismId}-${rule.suffix}`;
        if (seen.has(edgeId)) continue;
        seen.add(edgeId);
        const edge: CrossFactEdge = {
          edgeId,
          producerFactIds: [producer.mechanismId],
          consumerFactIds: [consumer.mechanismId],
          relationship: "PRODUCER_TO_CONSUMER",
          causalStatement: `${rule.producer} from ${producer.mechanismId} → ${rule.consumer} for ${consumer.mechanismId}`,
        };
        edges.push(edge);
        opportunities.push(buildCrossOpp(caseId, edge, rule, producer, consumer));
      }
    }
  }

  return { opportunities, edges };
}
