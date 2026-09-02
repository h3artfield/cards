import type { CardInteractionProfile, SemanticSynergyEdge } from "./types";
import { SEMANTIC_SYNERGY_EDGES_VERSION } from "./types";
import { scoredDimensionsToVector } from "./card-interaction-profile-v1";
import type { DerivedRoleName } from "@/lib/semantic-visualization/derived-features-v1";

/** Candidate synergy mechanisms — NOT all-pairs (34k² forbidden). */
const SYNERGY_RULES: Array<{
  mechanism: string;
  direction: SemanticSynergyEdge["direction"];
  producerRole: DerivedRoleName;
  payoffRole: DerivedRoleName;
  minStrength?: number;
}> = [
  { mechanism: "token_producer_to_sacrifice_outlet", direction: "producer_to_payoff", producerRole: "token_generation", payoffRole: "sacrifice_outlet" },
  { mechanism: "sacrifice_outlet_to_death_payoff", direction: "enabler_to_payoff", producerRole: "sacrifice_outlet", payoffRole: "sacrifice_payoff" },
  { mechanism: "self_mill_to_reanimation", direction: "setup_to_payoff", producerRole: "graveyard_setup", payoffRole: "reanimation" },
  { mechanism: "etb_creature_to_blink", direction: "producer_to_payoff", producerRole: "combat_payoff", payoffRole: "blink_flicker" },
  { mechanism: "cast_from_exile_to_exile_payoff", direction: "setup_to_payoff", producerRole: "cast_from_exile", payoffRole: "cast_from_exile" },
  { mechanism: "counters_produced_to_counters_payoff", direction: "producer_to_payoff", producerRole: "counter_synergy", payoffRole: "combat_payoff" },
];

type CardRoleBundle = {
  oracleId: string;
  derivedRoles: DerivedRoleName[];
  profile?: CardInteractionProfile;
};

export function generateDeckSynergyEdges(input: {
  cards: CardRoleBundle[];
  semanticVersion: string;
  maxEdges?: number;
}): SemanticSynergyEdge[] {
  const edges: SemanticSynergyEdge[] = [];
  const maxEdges = input.maxEdges ?? 500;

  for (let i = 0; i < input.cards.length; i += 1) {
    for (let j = i + 1; j < input.cards.length; j += 1) {
      const a = input.cards[i];
      const b = input.cards[j];
      for (const rule of SYNERGY_RULES) {
        const aProducer = a.derivedRoles.includes(rule.producerRole);
        const bPayoff = b.derivedRoles.includes(rule.payoffRole);
        const bProducer = b.derivedRoles.includes(rule.producerRole);
        const aPayoff = a.derivedRoles.includes(rule.payoffRole);

        if (aProducer && bPayoff) {
          edges.push(makeEdge(a, b, rule, input.semanticVersion));
        }
        if (bProducer && aPayoff) {
          edges.push(makeEdge(b, a, rule, input.semanticVersion));
        }
        if (edges.length >= maxEdges) return edges;
      }

      if (a.profile && b.profile) {
        const aDep = scoredDimensionsToVector(a.profile.dependencies);
        const bAnswer = scoredDimensionsToVector(b.profile.answerCapabilities);
        for (const [depKey, depScore] of Object.entries(aDep)) {
          const answerKey = depKey.replace("_dependent", "");
          if ((bAnswer[`${answerKey}_interaction`] ?? 0) > 0.2 && depScore > 0.2) {
            edges.push({
              sourceOracleId: b.oracleId,
              destinationOracleId: a.oracleId,
              mechanism: "semantic_answer_to_dependency",
              direction: "enabler_to_payoff",
              evidence: [{ oracleId: b.oracleId, note: `answers ${depKey}` }],
              semanticStrength: depScore * (bAnswer[`${answerKey}_interaction`] ?? 0.5),
              semanticVersion: input.semanticVersion,
              edgeVersion: SEMANTIC_SYNERGY_EDGES_VERSION,
            });
          }
        }
      }
    }
  }

  return edges.slice(0, maxEdges);
}

function makeEdge(
  source: CardRoleBundle,
  destination: CardRoleBundle,
  rule: (typeof SYNERGY_RULES)[number],
  semanticVersion: string,
): SemanticSynergyEdge {
  return {
    sourceOracleId: source.oracleId,
    destinationOracleId: destination.oracleId,
    mechanism: rule.mechanism,
    direction: rule.direction,
    evidence: [
      { oracleId: source.oracleId, note: rule.producerRole },
      { oracleId: destination.oracleId, note: rule.payoffRole },
    ],
    semanticStrength: 0.5,
    semanticVersion,
    edgeVersion: SEMANTIC_SYNERGY_EDGES_VERSION,
  };
}
