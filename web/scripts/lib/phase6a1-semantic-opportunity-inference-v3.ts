/**
 * SemanticOpportunity inference v3 — typed semantic edges + cross-fact composition.
 * No keyword-family fallbacks. No generic strategy concepts.
 */
import type { IndependentMechanismFact } from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import type {
  OpportunityConfidenceClass,
  OpportunityDerivationClass,
  SemanticOpportunity,
  SemanticOpportunityType,
} from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import type { ImplementedMechanismCatalogEntry } from "./phase6a1-implemented-mechanism-catalog-v1";
import { discoverCrossFactComposition } from "./phase6a1-semantic-opportunity-cross-fact-v3";
import {
  actionTypes,
  extractFactSemanticGraph,
  hasCostPattern,
  isChangelingOnly,
  isKeywordOnlyFact,
  triggerMatches,
  type FactSemanticGraph,
} from "./phase6a1-semantic-opportunity-fact-graph-v3";

export const SEMANTIC_OPPORTUNITY_INFERENCE_V3_VERSION = "phase6a1-semantic-opportunity-inference-v3.2.2";

const COMPOSABLE_KEYWORD_FACT_IDS = new Set([
  "tymna-lifelink",
  "elsha-trample",
  "kain-turn-flying",
  "cyclonus-front-flying",
  "cyclonus-back-flying",
]);

function isComposableKeywordFact(fact: IndependentMechanismFact, g: FactSemanticGraph): boolean {
  return COMPOSABLE_KEYWORD_FACT_IDS.has(fact.mechanismId) || (isKeywordOnlyFact(g) && COMPOSABLE_KEYWORD_FACT_IDS.has(fact.mechanismId));
}

function isNonRepeatableTapActivation(g: FactSemanticGraph): boolean {
  return g.actions.some((a) => a.transformed || a.frontFaceUp) || g.mechanismId === "terra-trance-transform";
}

function isCommanderActivated(fact: IndependentMechanismFact, g: FactSemanticGraph): boolean {
  return g.mechanismType.includes("ACTIVATED") && !g.mechanismType.includes("GRANTED");
}

function blobFrom(fact: IndependentMechanismFact, g: FactSemanticGraph): string {
  return JSON.stringify({ ...fact, actions: g.actions, condition: g.condition }).toUpperCase();
}

function hasCanonicalManaCost(g: FactSemanticGraph): boolean {
  return g.costs.some((c) => /\{[0-9WUBRGC/]+\}/i.test(c));
}

function costTokenToSemanticComponent(token: string): string | null {
  const u = token.toUpperCase();
  if (u === "TAP_SELF" || u === "{T}") return "COST:TAP_SELF";
  if (/^PAY_\d+_LIFE$/i.test(u)) return `COST:${u}`;
  if (/RETURN_UNBLOCKED_ATTACKER/i.test(u)) return "COST:RETURN_UNBLOCKED_ATTACKER";
  if (/EXILE.*NONTOKEN.*ARTIFACT.*CREATURE/i.test(u)) return "COST:EXILE_NONTOKEN_ARTIFACT_CREATURE";
  if (/SACRIFICE.*ARTIFACT/i.test(u)) return "COST:SACRIFICE_ARTIFACT";
  if (/SACRIFICE.*CREATURE/i.test(u)) return "COST:SACRIFICE_CREATURE";
  if (/\{[0-9WUBRGC/]+\}/i.test(token)) return "COST:MANA";
  return null;
}

function buildActivationCostSemanticEdge(g: FactSemanticGraph): string {
  const parts: string[] = [];
  for (const c of g.costs) {
    const component = costTokenToSemanticComponent(c);
    if (component && !parts.includes(component)) parts.push(component);
  }
  if (hasCanonicalManaCost(g) && !parts.includes("COST:MANA")) {
    parts.unshift("COST:MANA");
  }
  if (parts.length === 0) return "COST:MANA → ACTION:ability resolution";
  return `${parts.join("+")} → ACTION:ability resolution`;
}

export type NoActionableOpportunityRecord = {
  factId: string;
  status: "NO_ACTIONABLE_OPPORTUNITY";
  reason: string;
  commanderMember?: string;
};

export type CrossFactEdge = {
  edgeId: string;
  producerFactIds: string[];
  consumerFactIds: string[];
  relationship: "PRODUCER_TO_CONSUMER";
  causalStatement: string;
};

type OppBuild = {
  suffix: string;
  type: SemanticOpportunityType;
  derivationClass: OpportunityDerivationClass;
  confidence: OpportunityConfidenceClass;
  causalStatement: string;
  requiredStateOrAction: string;
  expectedMechanicalEffect: string;
  causalProof: string[];
  prerequisites?: string[];
  semanticEdge: string;
  exactScopes: Record<string, string | string[]>;
  recordKind?: "OPPORTUNITY" | "RISK_CONSTRAINT" | "STATE_MAINTENANCE_CONSTRAINT";
};

function confidence(d: OpportunityDerivationClass): OpportunityConfidenceClass {
  if (d === "DIRECT_MECHANICAL") return "HIGH";
  if (d === "NECESSARY_PREREQUISITE" || d === "DERIVED_AMPLIFICATION") return "MEDIUM";
  return "LOW";
}

function buildOpp(fact: IndependentMechanismFact, spec: OppBuild): SemanticOpportunity {
  return {
    opportunityId: `${fact.mechanismId}--${spec.suffix}`,
    sourceMechanismFactIds: [fact.mechanismId],
    sourceFactIds: [fact.mechanismId],
    opportunityType: spec.type,
    derivationClass: spec.derivationClass,
    opportunityConfidence: spec.confidence ?? confidence(spec.derivationClass),
    causalStatement: spec.causalStatement,
    requiredStateOrAction: spec.requiredStateOrAction,
    expectedMechanicalEffect: spec.expectedMechanicalEffect,
    causalProof: [...spec.causalProof, `semanticEdge=${spec.semanticEdge}`],
    prerequisites: spec.prerequisites ?? [],
    mutuallyRelevantWith: [],
    evidence: { type: "COMMANDER_ORACLE", oracleSpan: fact.evidenceSpan },
    commanderMember: typeof fact.commander === "string" ? fact.commander : undefined,
    exactScopes: spec.exactScopes,
    semanticEdge: spec.semanticEdge,
    ...(spec.recordKind ? { recordKind: spec.recordKind } : {}),
  };
}

function inferFromGraph(fact: IndependentMechanismFact, g: FactSemanticGraph): SemanticOpportunity[] {
  const out: SemanticOpportunity[] = [];
  const types = actionTypes(g);

  if (isKeywordOnlyFact(g) || isChangelingOnly(g)) {
    return out;
  }

  // ACTIVATED: tap → repeat (exclude exile/transform sequencing activations)
  if (isCommanderActivated(fact, g) && hasCostPattern(g, /TAP_SELF|\{T\}/i) && !isNonRepeatableTapActivation(g)) {
    out.push(
      buildOpp(fact, {
        suffix: "untap-repeat-activation",
        type: "ACTIVATION_REPETITION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "COST:TAP_SELF → ACTION:additional activations",
        exactScopes: { actor: "COMMANDER", timing: "SAME_TURN" },
        causalStatement: "Enable additional activations of this tapped ability",
        requiredStateOrAction: "UNTAP_THIS_PERMANENT or grant additional activations per turn",
        expectedMechanicalEffect: "Ability resolves more times per turn cycle",
        causalProof: [`${g.mechanismId} activation cost includes TAP_SELF`],
      }),
    );
  }

  // Mana and typed cost prerequisite — commander activated abilities (not duplicate granted {2})
  const hasManaCost = hasCostPattern(g, /\{[0-9WUBRG]+\}/i) || hasCostPattern(g, /PAY_3_LIFE/i);
  const skipGrantedManaDuplicate =
    g.mechanismType.includes("GRANTED") && hasCostPattern(g, /\{2\}/i) && g.mechanismType.includes("GRANTED_ACTIVATED");
  if (isCommanderActivated(fact, g) && hasManaCost && !skipGrantedManaDuplicate) {
    const lifePart = hasCostPattern(g, /PAY_3_LIFE/i) ? " and 3 life" : "";
    const costEdge = buildActivationCostSemanticEdge(g);
    out.push(
      buildOpp(fact, {
        suffix: "pay-mana-cost",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "MEDIUM",
        semanticEdge: costEdge,
        exactScopes: { actor: "CONTROLLER", resource: "MANA" },
        causalStatement: `Provide mana${lifePart} to pay this activation cost reliably`,
        requiredStateOrAction: `Mana sources matching activation cost${lifePart ? "; life total for 3 life" : ""}`,
        expectedMechanicalEffect: "Activation resolves when tapped/paid",
        causalProof: [`${g.mechanismId} requires cost ${g.costs.join(",")}`],
      }),
    );
  }
  // Granted activated with non-mana-only costs (e.g. Mishra unearth grant)
  if (
    g.mechanismType.includes("GRANTED_ACTIVATED") &&
    hasManaCost &&
    skipGrantedManaDuplicate === false &&
    !isCommanderActivated(fact, g)
  ) {
    out.push(
      buildOpp(fact, {
        suffix: "pay-mana-cost",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "MEDIUM",
        semanticEdge: buildActivationCostSemanticEdge(g),
        exactScopes: { actor: "CONTROLLER", resource: "MANA" },
        causalStatement: "Provide mana to pay granted activation cost reliably",
        requiredStateOrAction: `Mana sources matching granted activation cost (${g.costs.join(", ")})`,
        expectedMechanicalEffect: "Granted activation resolves when paid",
        causalProof: [`${g.mechanismId} granted cost ${g.costs.join(",")}`],
      }),
    );
  }

  // Curie copy — exile artifact creature is COST not exile engine
  if (hasCostPattern(g, /EXILE_ANOTHER_NONTOKEN_ARTIFACT_CREATURE_YOU_CONTROL/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "legal-copy-targets",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "HIGH",
        semanticEdge: "COST:exile nontoken artifact creature → ACTION:become copy",
        exactScopes: {
          actor: "CONTROLLER",
          object: "NONTOKEN_ARTIFACT_CREATURE",
          fromZone: "BATTLEFIELD",
          toZone: "EXILE",
        },
        causalStatement: "Provide legal high-value nontoken artifact-creature copy targets",
        requiredStateOrAction: "Other nontoken artifact creatures you control to exile as copy cost",
        expectedMechanicalEffect: "Curie becomes copy while retaining combat-draw ability",
        causalProof: [`Copy activation cost exiles nontoken artifact creature (${g.evidenceSpan})`],
      }),
    );
  }

  // CREATE_TOKEN with quantity scaler
  for (const a of g.actions) {
    if (a.type === "CREATE_TOKEN" && typeof a.quantity === "string") {
      if (/COUNT\(|GOBLINS|EXPERIENCE|COMBAT_DAMAGE|BASE_POWER/i.test(String(a.quantity))) {
        out.push(
          buildOpp(fact, {
            suffix: "amplify-scaling-input",
            type: "INPUT_AMPLIFICATION",
            derivationClass: "DERIVED_AMPLIFICATION",
            confidence: "HIGH",
            semanticEdge: `QUANTITY_SCALER:${a.quantity} → OUTPUT:token/effect magnitude`,
            exactScopes: { quantityScaler: String(a.quantity), actor: "CONTROLLER" },
            causalStatement: `Increase ${a.quantity} to scale commander output`,
            requiredStateOrAction: `Increase count referenced by ${a.quantity}`,
            expectedMechanicalEffect: "Larger token output or scaled effect per resolution",
            causalProof: [`Output quantity scales with ${a.quantity}`],
          }),
        );
      }
      if (typeof a.token === "string") {
        out.push(
          buildOpp(fact, {
            suffix: "token-output-exploit",
            type: "OUTPUT_EXPLOITATION",
            derivationClass: "DERIVED_AMPLIFICATION",
            confidence: "MEDIUM",
            semanticEdge: `OUTPUT:CREATE_TOKEN(${a.token}) → exploit on battlefield`,
            exactScopes: { object: String(a.token), toZone: "BATTLEFIELD" },
            causalStatement: `Exploit ${a.token} tokens created by this ability`,
            requiredStateOrAction: `Payoffs that use ${a.token} on battlefield`,
            expectedMechanicalEffect: "Value from commander token output",
            causalProof: [`Creates ${a.token}`],
          }),
        );
      }
    }
  }

  // Death/experience triggers — exact trigger scope (not static trigger modifiers)
  if (
    g.mechanismType !== "STATIC_TRIGGER_MODIFIER" &&
    triggerMatches(g, /ANOTHER_CREATURE_YOU_CONTROL_DIES/i)
  ) {
    out.push(
      buildOpp(fact, {
        suffix: "increase-death-trigger-events",
        type: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:creature death under your control → additional resolution",
        exactScopes: { actor: "CONTROLLER", object: "CREATURE", event: "DIES" },
        causalStatement: "Increase controlled creature deaths that trigger this ability",
        requiredStateOrAction: "Controlled creature deaths or sacrifice outlets with creature fodder",
        expectedMechanicalEffect: "More trigger resolutions / counters / recursion fuel",
        causalProof: [`Trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Teysa: death-caused trigger multiplier — NOT generic sacrifice
  if (g.mechanismType === "STATIC_TRIGGER_MODIFIER" && triggerMatches(g, /CREATURE_DYING_CAUSES/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "death-caused-trigger-doubling",
        type: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "CONDITION:creature dying causes your permanent trigger → duplicate trigger",
        exactScopes: {
          actor: "CONTROLLER",
          object: "PERMANENT_YOU_CONTROL",
          event: "CREATURE_DIES_CAUSES_TRIGGER",
        },
        causalStatement: "Cause creature deaths that trigger your permanents' abilities",
        requiredStateOrAction: "Creature deaths triggering abilities of permanents you control",
        expectedMechanicalEffect: "Each qualifying death trigger resolves an additional time",
        causalProof: ["Static trigger modifier doubles death-caused triggers"],
      }),
    );
  }

  // Meren endstep recursion — graveyard creature target, not generic support
  if (types.includes("CONDITIONAL_ZONE_MOVE") && g.target?.includes("CREATURE_CARD_IN_YOUR_GRAVEYARD")) {
    out.push(
      buildOpp(fact, {
        suffix: "graveyard-recursion-targets",
        type: "ZONE_ENABLEMENT",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "HIGH",
        semanticEdge: "TARGET:creature card in your graveyard → TO_ZONE:battlefield/hand",
        exactScopes: {
          actor: "CONTROLLER",
          object: "CREATURE_CARD",
          fromZone: "GRAVEYARD",
          toZone: "BATTLEFIELD_OR_HAND",
          condition: "MANA_VALUE <= EXPERIENCE_COUNTERS",
        },
        causalStatement: "Populate graveyard with creature cards as recursion targets",
        requiredStateOrAction: "Creature cards in your graveyard; higher experience increases battlefield return threshold",
        expectedMechanicalEffect: "End-step recursion returns creatures to battlefield (MV ≤ experience) or hand",
        causalProof: [`Recursion target: ${g.target}`],
      }),
    );
  }

  // Korvold entry/attack: sacrifice is EFFECT of trigger, not sacrifice frequency for payoff
  if (triggerMatches(g, /ENTERS|ATTACKS/i) && types.includes("SACRIFICE")) {
    out.push(
      buildOpp(fact, {
        suffix: "satisfy-forced-sacrifice",
        type: "STRUCTURAL_SUPPORT",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "MEDIUM",
        semanticEdge: "TRIGGER:enters/attacks → EFFECT:sacrifice another permanent you control",
        exactScopes: { actor: "CONTROLLER", object: "ANOTHER_PERMANENT_YOU_CONTROL", quantity: "1" },
        causalStatement: "Provide expendable permanents when Korvold enters or attacks (mandatory trigger effect)",
        requiredStateOrAction: "Additional permanents you control available when enter/attack trigger resolves",
        expectedMechanicalEffect: "Mandatory sacrifice effect resolves; may feed separate sacrifice-payoff trigger",
        causalProof: ["Sacrifice is mandatory effect of enter/attack trigger, not a cost or optional outlet"],
        prerequisites: ["Permanent fodder available on board"],
      }),
    );
  }

  // Korvold payoff: YOU sacrifice → counter + draw
  if (triggerMatches(g, /YOU_SACRIFICE_A_PERMANENT/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "controller-sacrifice-payoff",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:you sacrifice permanent → OUTPUT:+1/+1 counter + draw",
        exactScopes: { actor: "CONTROLLER", event: "YOU_SACRIFICE_PERMANENT" },
        causalStatement: "Increase controlled permanent sacrifices for Korvold payoff",
        requiredStateOrAction: "Sacrifice outlets and permanent fodder you control",
        expectedMechanicalEffect: "+1/+1 counters on Korvold and card draw per sacrifice",
        causalProof: [`Payoff trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Bruvac: opponent mill replacement — exact actor
  if (g.mechanismType === "REPLACEMENT_EFFECT" && String(g.event ?? "").includes("OPPONENT")) {
    out.push(
      buildOpp(fact, {
        suffix: "opponent-mill-events",
        type: "STATE_MANIPULATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "REPLACEMENT:opponent would mill → doubled mill quantity",
        exactScopes: { actor: "OPPONENT", fromZone: "LIBRARY", toZone: "GRAVEYARD" },
        causalStatement: "Cause opponents to mill (replacement doubles quantity)",
        requiredStateOrAction: "Mill effects targeting opponents",
        expectedMechanicalEffect: "Opponents mill twice the intended amount",
        causalProof: [`Replacement on ${g.event}`],
      }),
    );
  }

  // Prosper endstep: play permission from exile
  if (types.includes("GRANT_PLAY_PERMISSION")) {
    out.push(
      buildOpp(fact, {
        suffix: "legal-exile-play-events",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "OUTPUT:exile top card + PLAY_CAST_PERMISSION:that card from exile",
        exactScopes: {
          actor: "CONTROLLER",
          fromZone: "LIBRARY",
          toZone: "EXILE",
          permission: "PLAY_FROM_EXILE",
          duration: "UNTIL_END_OF_YOUR_NEXT_TURN",
        },
        causalStatement: "Cast the impulse-exiled card within its permission window",
        requiredStateOrAction: "Mana to cast/play the specific card exiled on end step under permission",
        expectedMechanicalEffect: "Legal play-from-exile event under end-step permission",
        causalProof: ["Grants play permission on exiled card"],
      }),
    );
  }

  // Prosper treasure on play from exile
  if (triggerMatches(g, /YOU_PLAY_A_CARD_FROM_EXILE/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "play-from-exile-treasure",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:play from exile → OUTPUT:Treasure token",
        exactScopes: { actor: "CONTROLLER", fromZone: "EXILE", event: "PLAY_CARD" },
        causalStatement: "Each legal play-from-exile event creates Treasure",
        requiredStateOrAction: "Cast/play cards from exile",
        expectedMechanicalEffect: "Treasure token mana acceleration per exile play",
        causalProof: [`Trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Tymna postcombat draw — combat damage to opponents as input
  if (triggerMatches(g, /POSTCOMBAT_MAIN/i) && types.includes("DRAW_CARD")) {
    out.push(
      buildOpp(fact, {
        suffix: "combat-damage-to-opponents-input",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:postcombat + QUANTITY:opponents dealt combat damage → DRAW:X",
        exactScopes: {
          actor: "CONTROLLER",
          event: "OPPONENTS_DEALT_COMBAT_DAMAGE_THIS_TURN",
          timing: "POSTCOMBAT_MAIN",
        },
        causalStatement: "Deal combat damage to opponents and maintain life to pay X on postcombat draw",
        requiredStateOrAction: "Combat damage to opponents this turn; life total ≥ X where X = opponents damaged",
        expectedMechanicalEffect: "Draw X cards where X equals opponents dealt combat damage (not damage amount)",
        causalProof: [`Variable: ${String(g.variable ?? "X=opponents damaged")}`],
      }),
    );
  }

  // Yuriko ninjutsu — unblocked attacker cost
  if (hasCostPattern(g, /RETURN_UNBLOCKED_ATTACKER/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "unblocked-attacker-for-ninjutsu",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "HIGH",
        semanticEdge: "COST:return unblocked attacker → ACTION:ninjutsu Yuriko",
        exactScopes: { actor: "CONTROLLER", object: "UNBLOCKED_ATTACKER", fromZone: "BATTLEFIELD", toZone: "HAND" },
        causalStatement: "Enable unblocked attackers to pay ninjutsu cost",
        requiredStateOrAction: "Unblocked attacking creatures to return to hand",
        expectedMechanicalEffect: "Yuriko enters tapped and attacking via ninjutsu",
        causalProof: ["Ninjutsu cost requires unblocked attacker"],
      }),
    );
  }

  // Yuriko ninja combat damage trigger
  if (triggerMatches(g, /NINJA_YOU_CONTROL_DEALS_COMBAT_DAMAGE/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "ninja-combat-damage-chain",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:Ninja combat damage → reveal top + life loss by MV",
        exactScopes: { actor: "CONTROLLER", object: "NINJA_YOU_CONTROL", event: "COMBAT_DAMAGE_TO_PLAYER" },
        causalStatement: "Connect combat with Ninjas to trigger reveal and life drain",
        requiredStateOrAction: "Ninja creatures dealing combat damage to players",
        expectedMechanicalEffect: "Card to hand and life loss equal to revealed MV",
        causalProof: [`Trigger: ${String(g.trigger)}`],
      }),
    );
    out.push(
      buildOpp(fact, {
        suffix: "top-library-mv-scaling",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "HIGH",
        semanticEdge: "QUANTITY:REVEALED_CARD_MANA_VALUE → opponent life loss",
        exactScopes: { actor: "CONTROLLER", quantityScaler: "REVEALED_CARD_MANA_VALUE", object: "TOP_OF_LIBRARY" },
        causalStatement: "Influence top-library mana value to scale opponent life loss on Ninja hit",
        requiredStateOrAction: "Top-of-library manipulation or high-mana-value cards on top",
        expectedMechanicalEffect: "Each opponent loses life equal to revealed card mana value",
        causalProof: ["Life loss quantity scales with revealed card mana value"],
      }),
    );
  }

  // Orvar targeting spell copy
  if (triggerMatches(g, /YOU_CAST_INSTANT_OR_SORCERY/i) && String(g.condition ?? "").includes("TARGETS")) {
    out.push(
      buildOpp(fact, {
        suffix: "targeting-spell-permanent-copy",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:instant/sorcery targets your other permanents → token copy",
        exactScopes: {
          actor: "CONTROLLER",
          object: "OTHER_PERMANENTS_YOU_CONTROL",
          event: "INSTANT_SORCERY_TARGETS",
        },
        causalStatement: "Cast instant/sorcery spells targeting other permanents you control",
        requiredStateOrAction: "Targeting instants/sorceries and valuable copy targets",
        expectedMechanicalEffect: "Token copy of targeted permanent",
        causalProof: [`Condition: ${String(g.condition)}`],
      }),
    );
  }

  // Daxos experience on enchantment cast
  if (triggerMatches(g, /YOU_CAST_ENCHANTMENT/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "enchantment-cast-experience",
        type: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:cast enchantment → GET_COUNTER:experience",
        exactScopes: { actor: "CONTROLLER", object: "ENCHANTMENT_SPELL" },
        causalStatement: "Cast enchantment spells to accumulate experience counters",
        requiredStateOrAction: "Enchantment spells cast",
        expectedMechanicalEffect: "Experience counters increase for Spirit token sizing",
        causalProof: [`Trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Daxos spirit token scales with experience
  if (types.includes("CREATE_TOKEN") && JSON.stringify(g.actions).includes("EXPERIENCE")) {
    out.push(
      buildOpp(fact, {
        suffix: "experience-scaled-spirit",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "MEDIUM",
        semanticEdge: "COST:mana → OUTPUT:Spirit P/T = experience counters",
        exactScopes: { actor: "CONTROLLER", quantityScaler: "YOUR_EXPERIENCE_COUNTERS" },
        causalStatement: "Convert experience counters into large Spirit tokens",
        requiredStateOrAction: "Experience counters and mana for activation",
        expectedMechanicalEffect: "Spirit tokens sized to experience count",
        causalProof: ["Spirit P/T tied to experience counters"],
        prerequisites: ["Experience counters from enchantment casting"],
      }),
    );
  }

  // Mishra ward — opponent pays sacrifice when targeting your permanent
  if (types.includes("GRANT_WARD") && JSON.stringify(g.actions).includes("SACRIFICE")) {
    out.push(
      buildOpp(fact, {
        suffix: "ward-opponent-sacrifice-on-target",
        type: "PROTECTION",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "HIGH",
        semanticEdge: "GRANTED:Ward — opponent may sacrifice a permanent when targeting your permanent",
        exactScopes: { actor: "OPPONENT", object: "PERMANENTS_YOU_CONTROL", cost: "OPPONENT_SACRIFICE_ON_TARGET" },
        causalStatement:
          "Grant Ward on your permanents; when an opponent targets them, Ward triggers and the opponent may sacrifice a permanent to pay the Ward cost",
        requiredStateOrAction: "Permanents you control with Ward; opponent targeting events",
        expectedMechanicalEffect:
          "On opponent targeting, Ward triggers; opponent may sacrifice a permanent to pay or the spell/ability is countered",
        causalProof: ["Ward interpretation requires canonical Ward rules beyond literal Oracle span"],
      }),
    );
    out[out.length - 1]!.evidence = {
      type: "DERIVED_CAUSAL_INFERENCE",
      oracleSpan: fact.evidenceSpan,
      rationale: "COMMANDER_FACT + CANONICAL_KEYWORD_SEMANTICS:WARD",
    };
  }

  // Mishra unearth on artifact cards in graveyard
  if (g.subject?.includes("ARTIFACT_CARDS_IN_YOUR_GRAVEYARD")) {
    out.push(
      buildOpp(fact, {
        suffix: "artifact-unearth-from-graveyard",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "GRANTED:unearth on artifact cards in your graveyard",
        exactScopes: {
          actor: "CONTROLLER",
          object: "ARTIFACT_CARD",
          fromZone: "GRAVEYARD",
          toZone: "BATTLEFIELD",
          timing: "SORCERY_ONLY",
        },
        causalStatement: "Populate graveyard with artifact cards for unearth",
        requiredStateOrAction: "Artifact cards in your graveyard; {1}{B}{R} available at sorcery",
        expectedMechanicalEffect: "Temporary artifact reanimation with haste",
        causalProof: [`Granted unearth on ${g.subject}`],
      }),
    );
  }

  // Activated transform sequencing — exile then return (NOT saga chapters)
  if (
    isCommanderActivated(fact, g) &&
    g.actions.some((a) => a.transformed || a.frontFaceUp) &&
    !g.mechanismType.includes("SAGA")
  ) {
    out.push(
      buildOpp(fact, {
        suffix: "transform-sequencing",
        type: "STATE_MANIPULATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "ACTION:FRONT exile self → return TRANSFORMED/BACK on battlefield",
        exactScopes: {
          actor: "COMMANDER",
          object: "SELF",
          face: "FRONT",
          fromZone: "BATTLEFIELD",
          toZone: "EXILE_THEN_BATTLEFIELD_BACK",
        },
        causalStatement: "Activate front-face Trance to exile Terra and return it transformed (back face)",
        requiredStateOrAction: "Mana and sorcery timing to activate Trance transform ability once",
        expectedMechanicalEffect: "Terra exiled then returns transformed to back face (Esper Terra); not front-face return",
        causalProof: ["Front activation: exile then return transformed; Chapter IV separately returns front face up"],
      }),
    );
  }

  // Saga Chapter IV — automatic mana + return front (not activated transform)
  if (g.mechanismType === "SAGA_CHAPTER_ABILITY" && types.includes("ADD_MANA") && /"CHAPTERS":\[[^\]]*4|CHAPTER.*IV/i.test(blobFrom(fact, g))) {
    out.push(
      buildOpp(fact, {
        suffix: "chapter-4-mana-return-front",
        type: "RESOURCE_CONVERSION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "SAGA:Chapter IV → ADD_MANA + exile/return front face up",
        exactScopes: { actor: "CONTROLLER", object: "COMMANDER", face: "FRONT", event: "SAGA_CHAPTER" },
        causalStatement: "Reach Chapter IV for large mana burst and automatic return to front face",
        requiredStateOrAction: "Advance saga to Chapter IV (not a mana-paid activation)",
        expectedMechanicalEffect: "Ten mana added; Esper Terra exiled then Terra returns front face up",
        causalProof: ["Chapter IV is saga chapter ability with no activation cost"],
      }),
    );
  }

  // Terra ETB mill enchantment to hand
  if (triggerMatches(g, /ENTERS/i) && types.includes("MILL")) {
    out.push(
      buildOpp(fact, {
        suffix: "mill-enchantment-to-hand",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:enters → MILL:5 → optional enchantment to hand",
        exactScopes: { actor: "CONTROLLER", object: "ENCHANTMENT_CARD", fromZone: "GRAVEYARD", toZone: "HAND" },
        causalStatement: "Increase enchantment density so ETB mill-five is more likely to include an enchantment",
        requiredStateOrAction: "High enchantment density in library; recover up to one enchantment milled this way",
        expectedMechanicalEffect: "Up to one milled enchantment to hand on ETB",
        causalProof: ["ETB mills then retrieves enchantment"],
      }),
    );
  }

  // Nita replacement-to-exile cleanup — not amplification
  if (g.mechanismType === "REPLACEMENT_EFFECT" || types.includes("REPLACE")) {
    // handled above for Bruvac; Nita-specific in cross or if event differs
  }

  // Kenrith reanimate — returns under owner's control (NOT Nightmare)
  if (fact.mechanismId === "kenrith-reanimate") {
    out.push(
      buildOpp(fact, {
        suffix: "reanimate-graveyard-creature",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "COST:{4}{B} → return creature card from graveyard under owner's control",
        exactScopes: {
          actor: "CONTROLLER",
          object: "CREATURE_CARD",
          fromZone: "GRAVEYARD",
          toZone: "BATTLEFIELD",
          controller: "OWNER",
        },
        causalStatement: "Reanimate creature cards from any graveyard under their owner's control",
        requiredStateOrAction: "Creature cards in graveyards; {4}{B} mana available",
        expectedMechanicalEffect: "Creature on battlefield under its owner's control",
        causalProof: ["Kenrith reanimation does not add Nightmare type or change controller to you"],
      }),
    );
  }

  // Chainer reanimate — becomes Nightmare under your control
  if (
    fact.mechanismId === "chainer-reanimate" ||
    (g.target?.includes("CREATURE_CARD_IN_A_GRAVEYARD") &&
      types.includes("ADD_CREATURE_TYPE") &&
      blobFrom(fact, g).includes("NIGHTMARE"))
  ) {
    out.push(
      buildOpp(fact, {
        suffix: "reanimate-nightmare-creatures",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "COST:MANA+COST:PAY_3_LIFE → reanimate as Nightmare under your control",
        exactScopes: {
          actor: "CONTROLLER",
          object: "CREATURE_CARD",
          fromZone: "GRAVEYARD",
          toZone: "BATTLEFIELD",
          controller: "YOU",
        },
        causalStatement: "Reanimate creature cards from graveyards as Nightmares you control",
        requiredStateOrAction: "Creature cards in graveyards; {B}{B}{B} and 3 life",
        expectedMechanicalEffect: "Nightmare creatures on battlefield buffed by static +1/+1",
        causalProof: [`Target: ${g.target}; becomes Nightmare`],
      }),
    );
  }

  // Chainer leaves — exile nightmares (risk constraint, not positive opportunity)
  if (triggerMatches(g, /LEAVES_BATTLEFIELD/i) && types.some((t) => t.includes("EXILE") || t.includes("ZONE_MOVE"))) {
    out.push(
      buildOpp(fact, {
        suffix: "nightmare-exile-on-leave-constraint",
        type: "STRUCTURAL_SUPPORT",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "MEDIUM",
        recordKind: "RISK_CONSTRAINT",
        semanticEdge: "RISK_CONSTRAINT:Chainer leaves → exile all Nightmares (state maintenance)",
        exactScopes: {
          actor: "CONTROLLER",
          object: "ALL_NIGHTMARES",
          toZone: "EXILE",
          event: "CHAINER_LEAVES",
          plannerTreatment: "CONSTRAINT_NOT_POSITIVE_OPPORTUNITY",
        },
        causalStatement: "Account for Nightmare exile when Chainer leaves (not exile-value engine)",
        requiredStateOrAction: "Engine resilience if commander removed",
        expectedMechanicalEffect: "Understand Nightmares exiled on commander loss",
        causalProof: ["Commander leaving exiles Nightmares — risk/state constraint not amplification"],
      }),
    );
  }

  // Kinnan — adds one mana of type produced (not double)
  if (triggerMatches(g, /TAP_NONLAND_PERMANENT_FOR_MANA/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "nonland-tap-mana-amplify",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:tap nonland for mana → add one mana of any type that permanent produced",
        exactScopes: { actor: "CONTROLLER", object: "NONLAND_PERMANENT", event: "TAP_FOR_MANA" },
        causalStatement: "Tap nonland permanents for mana to trigger one additional mana of a produced type",
        requiredStateOrAction: "Nonland mana sources tapping for mana",
        expectedMechanicalEffect: "One extra mana of a type the permanent produced (not doubling total output)",
        causalProof: [`Trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Kinnan top-five — non-Human creature hit density
  if (fact.mechanismId === "kinnan-topfive-deploy" || blobFrom(fact, g).includes("NON_HUMAN")) {
    out.push(
      buildOpp(fact, {
        suffix: "nonhuman-topfive-hit-density",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "HIGH",
        semanticEdge: "COST:{5}{G}{U} → LOOK:top 5 → optional NON_HUMAN creature to battlefield",
        exactScopes: { actor: "CONTROLLER", object: "NON_HUMAN_CREATURE_CARD", fromZone: "LIBRARY_TOP" },
        causalStatement: "Maintain non-Human creature density among top five library cards",
        requiredStateOrAction: "Non-Human creature cards likely in top five; {5}{G}{U} mana",
        expectedMechanicalEffect: "Deploy non-Human creature from top five lookup",
        causalProof: ["Activation puts non-Human creature from top five onto battlefield"],
      }),
    );
  }

  // Combat damage triggers (Curie draw, Elsha tokens, etc.)
  if (triggerMatches(g, /DEALS_COMBAT_DAMAGE_TO_PLAYER/i) && types.includes("DRAW_CARD")) {
    out.push(
      buildOpp(fact, {
        suffix: "combat-damage-draw",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:combat damage to player → DRAW scaled by base power",
        exactScopes: { actor: "COMMANDER", event: "COMBAT_DAMAGE_TO_PLAYER" },
        causalStatement: "Connect combat damage to trigger draw equal to base power",
        requiredStateOrAction: "Combat damage to players with this creature",
        expectedMechanicalEffect: "Cards drawn equal to base power",
        causalProof: [`Combat draw trigger on ${g.mechanismId}`],
      }),
    );
  }

  // Grant keywords to tokens (Teysa) — not commander protection
  if (types.includes("GRANT_KEYWORDS") && g.subject?.includes("CREATURE_TOKENS")) {
    out.push(
      buildOpp(fact, {
        suffix: "token-keyword-synergy",
        type: "STRUCTURAL_SUPPORT",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "MEDIUM",
        semanticEdge: "STATIC:creature tokens you control gain keywords",
        exactScopes: { actor: "CONTROLLER", object: "CREATURE_TOKENS_YOU_CONTROL" },
        causalStatement: "Create creature tokens benefiting from granted vigilance/lifelink",
        requiredStateOrAction: "Creature token production",
        expectedMechanicalEffect: "Tokens have vigilance and lifelink",
        causalProof: [`Granted to ${g.subject}`],
      }),
    );
  }

  // Hua Tuo: target creature card in your graveyard → library top
  if (g.target?.includes("TARGET_CREATURE_CARD_IN_YOUR_GRAVEYARD")) {
    out.push(
      buildOpp(fact, {
        suffix: "graveyard-creature-target-prerequisite",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "HIGH",
        semanticEdge: "TARGET:creature card in your graveyard → TO:top of library",
        exactScopes: {
          actor: "CONTROLLER",
          object: "CREATURE_CARD",
          fromZone: "YOUR_GRAVEYARD",
          toZone: "LIBRARY_TOP",
          timing: g.activationRestriction ?? "ONLY_DURING_YOUR_TURN_BEFORE_ATTACKERS_DECLARED",
        },
        causalStatement: "Maintain creature cards in your graveyard as activation targets",
        requiredStateOrAction: "Creature cards in your graveyard; activate before attackers on your turn",
        expectedMechanicalEffect: "Target creature card placed on library top",
        causalProof: [`Target prerequisite: ${g.target}`],
      }),
    );
  }
  if (g.target?.includes("GRAVEYARD") && types.some((t) => t.includes("LIBRARY"))) {
    out.push(
      buildOpp(fact, {
        suffix: "graveyard-to-library-top",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TARGET:creature card in graveyard → TO:top of library (not hand/battlefield)",
        exactScopes: {
          actor: "CONTROLLER",
          object: "CREATURE_CARD",
          fromZone: "GRAVEYARD",
          toZone: "LIBRARY_TOP",
          timing: g.activationRestriction ?? "BEFORE_ATTACKERS",
        },
        causalStatement: "Place creature cards from graveyard on top of library",
        requiredStateOrAction: "Creature cards in graveyard; activate before attackers",
        expectedMechanicalEffect: "Creature card on library top for draw/recur setups",
        causalProof: [`Exact zone move to library top (${g.evidenceSpan.slice(0, 60)}...)`],
      }),
    );
  }

  // Cyclonus front: connive + conditional convert
  if (types.includes("CONNIVE")) {
    out.push(
      buildOpp(fact, {
        suffix: "connive-for-convert",
        type: "STATE_MANIPULATION",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:combat damage → CONNIVE → conditional CONVERT at power>=5",
        exactScopes: { actor: "COMMANDER", face: g.face ?? "FRONT", event: "COMBAT_DAMAGE" },
        causalStatement: "Connive on combat damage to reach power 5+ for convert (nonland discard for +1/+1)",
        requiredStateOrAction: "Combat damage connive; nonland cards to discard for counters per Connive rules",
        expectedMechanicalEffect: "Transform when power threshold met after connive",
        causalProof: [
          "Front face connive-then-convert sequencing",
          "rulesDependency=COMMANDER_FACT+CANONICAL_KEYWORD_SEMANTICS:CONNIVE",
        ],
        prerequisites: ["Connive grants +1/+1 only when a nonland card is discarded"],
      }),
    );
    out[out.length - 1]!.evidence = {
      type: "DERIVED_CAUSAL_INFERENCE",
      oracleSpan: fact.evidenceSpan,
      rationale: "COMMANDER_FACT + CANONICAL_KEYWORD_SEMANTICS:CONNIVE",
    };
  }

  // Cyclonus back: convert + extra beginning phase
  if (types.includes("CONVERT") && types.includes("CONDITIONAL_EXTRA_PHASE")) {
    out.push(
      buildOpp(fact, {
        suffix: "convert-extra-phase",
        type: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:combat damage → CONVERT → extra beginning phase",
        exactScopes: { actor: "COMMANDER", face: g.face ?? "BACK", event: "COMBAT_DAMAGE" },
        causalStatement: "Combat damage converts Cyclonus to enable an additional beginning phase",
        requiredStateOrAction: "Combat damage on back face; convert resolves",
        expectedMechanicalEffect: "Additional untap/upkeep/draw steps after this phase",
        causalProof: ["Back face combat-damage trigger converts then grants extra beginning phase"],
      }),
    );
  }

  // Shaun & Rebecca animus tutor
  if (types.includes("SEARCH_ZONES") && JSON.stringify(g.actions).includes("THE_ANIMUS")) {
    out.push(
      buildOpp(fact, {
        suffix: "animus-tutor-on-entry",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:enters → search The Animus → battlefield",
        exactScopes: { actor: "CONTROLLER", object: "CARD_NAMED_THE_ANIMUS", toZone: "BATTLEFIELD" },
        causalStatement: "Ensure The Animus available for ETB tutor",
        requiredStateOrAction: "The Animus in library/graveyard/hand on entry",
        expectedMechanicalEffect: "The Animus on battlefield",
        causalProof: ["ETB searches for The Animus by name"],
      }),
    );
  }

  // Thrasios scry/land/draw covered by pay-mana-cost on {4} — no duplicate mana-sink record

  // Nita: cast spell you don't own
  if (triggerMatches(g, /YOU_CAST_SPELL_YOU_DO_NOT_OWN/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "cast-not-owned-spell",
        type: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:cast spell you don't own → +1/+1 on each creature you control",
        exactScopes: { actor: "CONTROLLER", object: "SPELL_YOU_DO_NOT_OWN" },
        causalStatement: "Cast spells you don't own to grow your creature board",
        requiredStateOrAction: "Spells you don't own (e.g. from opponent graveyard permission)",
        expectedMechanicalEffect: "+1/+1 counter on each creature you control per cast",
        causalProof: [`Trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Nita: opponent graveyard instant/sorcery theft — cast permission this turn only
  if (g.target?.includes("OPPONENT_GRAVEYARD") && types.includes("GRANT_CAST_PERMISSION")) {
    out.push(
      buildOpp(fact, {
        suffix: "opponent-graveyard-spell-theft",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "COST:sac creature → exile opponent instant/sorcery → cast this turn",
        exactScopes: {
          actor: "CONTROLLER",
          object: "INSTANT_OR_SORCERY",
          fromZone: "OPPONENT_GRAVEYARD",
          toZone: "EXILE",
          timing: "THIS_TURN_ONLY",
        },
        causalStatement: "Exile opponent instant/sorcery from graveyard for one-turn cast",
        requiredStateOrAction: "Sacrifice fodder; targets in opponent graveyards; mana any type",
        expectedMechanicalEffect: "Cast stolen spell this turn; exiled if would hit graveyard",
        causalProof: ["Graveyard theft with this-turn cast permission — not generic exile engine"],
      }),
    );
  }

  // Earth King: power 4+ attackers → ramp
  if (triggerMatches(g, /POWER_4_OR_GREATER_ATTACK/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "power4-attack-ramp",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:power>=4 attackers → search basic lands to battlefield",
        exactScopes: { actor: "CONTROLLER", object: "CREATURE_POWER_4_PLUS", event: "ATTACK" },
        causalStatement: "Attack with multiple power-4+ creatures to ramp",
        requiredStateOrAction: "Creatures with power 4 or greater attacking",
        expectedMechanicalEffect: "Basic lands to battlefield tapped up to attacker count",
        causalProof: [`Trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Elsha combat damage → monk tokens scaled via amplify-scaling-input only

  // Prowess on cast noncreature
  if (triggerMatches(g, /YOU_CAST_NONCREATURE/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "noncreature-spell-prowess",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:cast noncreature → +1/+1 until EOT",
        exactScopes: { actor: "CONTROLLER", object: "NONCREATURE_SPELL" },
        causalStatement: "Cast noncreature spells to grow prowess creature",
        requiredStateOrAction: "Noncreature spells cast",
        expectedMechanicalEffect: "+1/+1 until end of turn on prowess bearer",
        causalProof: [`Prowess trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Kain donation combat trigger
  if (triggerMatches(g, /KAIN_DEALS_COMBAT_DAMAGE/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "donation-combat-payoff",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:Kain combat damage → donation → conditional draw/treasure/life loss",
        exactScopes: { actor: "CONTROLLER", object: "KAIN", event: "COMBAT_DAMAGE" },
        causalStatement: "Connect Kain combat damage to trigger donation payoff sequence",
        requiredStateOrAction: "Kain dealing combat damage; control change occurring",
        expectedMechanicalEffect: "Draw, Treasure, and life loss scaled to damage if donated",
        causalProof: ["Donation trigger on combat damage"],
      }),
    );
    if (blobFrom(fact, g).includes("COMBAT_DAMAGE_DEALT")) {
      out.push(
        buildOpp(fact, {
          suffix: "combat-damage-quantity-scaling",
          type: "OUTPUT_EXPLOITATION",
          derivationClass: "DERIVED_AMPLIFICATION",
          confidence: "HIGH",
          semanticEdge: "QUANTITY:COMBAT_DAMAGE_DEALT → DRAW/TREASURE/LIFE_LOSS ('that many')",
          exactScopes: { actor: "CONTROLLER", object: "KAIN", event: "COMBAT_DAMAGE", quantity: "COMBAT_DAMAGE_DEALT" },
          causalStatement: "Increase combat damage dealt to scale draw, Treasure tokens, and life loss on donation",
          requiredStateOrAction: "Higher combat damage amount before donation resolves",
          expectedMechanicalEffect: "Draw that many cards, create that many Treasures, lose that much life",
          causalProof: ["Output quantity keyed to COMBAT_DAMAGE_DEALT in frozen fact"],
        }),
      );
    }
  }

  // Augustin — your spell cost reduction (white/blue only)
  if (types.includes("REDUCE_GENERIC_COST") && !String(g.subject ?? "").includes("OPPONENT")) {
    out.push(
      buildOpp(fact, {
        suffix: "static-spell-cost-reduction",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: `STATIC:reduce generic cost on ${g.subject ?? "spells you cast"}`,
        exactScopes: { actor: "CONTROLLER", object: String(g.subject ?? "SPELLS_YOU_CAST") },
        causalStatement: `Cast ${g.subject ?? "qualifying spells"} with generic mana that can be reduced`,
        requiredStateOrAction: "Qualifying colored spells you cast with reducible generic mana cost",
        expectedMechanicalEffect: "Reduced generic mana on qualifying casts",
        causalProof: [`Static cost reduction: ${g.evidenceSpan}`],
      }),
    );
  }

  // Augustin — opponent spell tax (ALL opponent spells)
  if (types.includes("INCREASE_GENERIC_COST") && String(g.subject ?? g.evidenceSpan).includes("OPPONENT")) {
    out.push(
      buildOpp(fact, {
        suffix: "opponent-spell-tax",
        type: "STATE_MANIPULATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "STATIC:all spells opponents cast cost {1} more",
        exactScopes: { actor: "OPPONENT", object: "ALL_SPELLS_CAST" },
        causalStatement: "Opponent spell tax slows all spells they cast (not only noncreature)",
        requiredStateOrAction: "Opponents casting any spells",
        expectedMechanicalEffect: "Each opponent spell costs {1} more",
        causalProof: [`Opponent tax static: ${g.evidenceSpan}`],
      }),
    );
  }

  // Orvar discard copy — opponent causes YOU to discard
  if (triggerMatches(g, /DISCARD_ORVAR|CAUSES_YOU_TO_DISCARD/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "opponent-discard-copy",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:opponent causes discard → copy target permanent",
        exactScopes: { actor: "CONTROLLER", object: "ORVAR", event: "YOU_DISCARD_ORVAR" },
        causalStatement: "When an opponent-controlled effect causes you to discard Orvar, copy a target permanent",
        requiredStateOrAction: "Opponent-controlled discard triggers; valuable copy targets",
        expectedMechanicalEffect: "Token copy of target permanent",
        causalProof: [`Discard trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Chainer nightmare static buff
  if (g.subject?.includes("ALL_NIGHTMARES") && types.includes("MODIFY_PT")) {
    out.push(
      buildOpp(fact, {
        suffix: "nightmare-static-buff",
        type: "STRUCTURAL_SUPPORT",
        derivationClass: "DERIVED_AMPLIFICATION",
        confidence: "MEDIUM",
        semanticEdge: "STATIC:All Nightmares +1/+1",
        exactScopes: { actor: "CONTROLLER", object: "ALL_NIGHTMARES" },
        causalStatement: "Create Nightmare creatures benefiting from static +1/+1",
        requiredStateOrAction: "Nightmare creature permanents on battlefield",
        expectedMechanicalEffect: "All Nightmares are larger",
        causalProof: ["Static buff applies to Nightmare creature type"],
      }),
    );
  }

  // Saga chapter copy enchantment (Terra)
  if (g.mechanismType === "SAGA_CHAPTER_ABILITY" && types.includes("CREATE_TOKEN_COPY")) {
    out.push(
      buildOpp(fact, {
        suffix: "copy-enchantment-token",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "SAGA chapter → copy target nonlegendary enchantment token",
        exactScopes: { actor: "CONTROLLER", object: "NONLEGENDARY_ENCHANTMENT_YOU_CONTROL" },
        causalStatement: "Maintain nonlegendary enchantments as copy targets for saga chapters",
        requiredStateOrAction: "Nonlegendary enchantments you control",
        expectedMechanicalEffect: "Temporary hasty copy token with saga counter setup",
        causalProof: [`Saga chapter copy: ${g.target ?? g.evidenceSpan.slice(0, 60)}`],
      }),
    );
  }

  // ETB create token (Earth King bear) — cross-fact covers ramp chain; no separate etb-token-output restatement

  // Living metal — vehicle becomes creature on your turn
  if (types.includes("IS_CREATURE") && g.condition?.includes("YOUR_TURN")) {
    out.push(
      buildOpp(fact, {
        suffix: "living-metal-combat-window",
        type: "STATE_MANIPULATION",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "MEDIUM",
        semanticEdge: "STATIC:during your turn Vehicle is creature",
        exactScopes: { actor: "CONTROLLER", timing: "YOUR_TURN", object: "VEHICLE" },
        causalStatement: "Attack with Vehicle during your turn when it becomes a creature",
        requiredStateOrAction: "Your turn combat step with Living Metal active",
        expectedMechanicalEffect: "Combat damage triggers on converted Vehicle",
        causalProof: ["Living metal enables combat triggers on back face"],
      }),
    );
  }

  // Cyclonus MTMTE alternative cast
  if (g.mechanismType === "ALTERNATIVE_CAST") {
    out.push(
      buildOpp(fact, {
        suffix: "converted-cast-entry",
        type: "ZONE_ENABLEMENT",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "MEDIUM",
        semanticEdge: "ALTERNATIVE_CAST:converted for alternative cost",
        exactScopes: { actor: "CONTROLLER", object: "COMMANDER", face: "CONVERTED" },
        causalStatement: "Cast converted face via More Than Meets the Eye cost",
        requiredStateOrAction: "Alternative cost mana available",
        expectedMechanicalEffect: "Enter on back face / converted state",
        causalProof: ["MTMTE alternative cast path"],
      }),
    );
  }

  // Zellix targeted mill — activation repetition + pay-mana only; no mill action restatement

  // Token entry triggers (Leonardo, etc.)
  if (triggerMatches(g, /TOKEN.*ENTERS/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "token-entry-trigger",
        type: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:token enters → optional counters/effect",
        exactScopes: { actor: "CONTROLLER", object: "TOKEN", event: "ENTERS_BATTLEFIELD", timing: String(fact.limit ?? "") },
        causalStatement: "Enable token entries on separate turns to trigger this once-per-turn ability",
        requiredStateOrAction: "Creature tokens entering under your control (once each turn maximum)",
        expectedMechanicalEffect: "Token-entry triggered effect resolves",
        causalProof: [`Trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Enters with counters (Reyhan ETB)
  if (types.includes("ENTERS_WITH_COUNTERS")) {
    out.push(
      buildOpp(fact, {
        suffix: "enters-with-counters",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "OUTPUT:enters with +1/+1 counters",
        exactScopes: { actor: "COMMANDER", object: "SELF", event: "ENTERS_BATTLEFIELD" },
        causalStatement: "Reyhan enters with three +1/+1 counters as a countered creature resource",
        requiredStateOrAction: "Reyhan on battlefield with three +1/+1 counters",
        expectedMechanicalEffect: "Reyhan can satisfy its own counter-transfer departure condition",
        causalProof: ["ETB counter initialization"],
      }),
    );
  }

  // Counter transfer on death/command zone (Reyhan)
  if (
    triggerMatches(g, /DIES|COMMAND_ZONE/i) &&
    (String(g.condition ?? "").includes("COUNTER") || String(fact.condition ?? "").includes("COUNTER"))
  ) {
    out.push(
      buildOpp(fact, {
        suffix: "counter-transfer-on-departure",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:creature with counters dies/leaves → transfer counters",
        exactScopes: {
          actor: "CONTROLLER",
          object: "CREATURE_WITH_COUNTERS",
          event: "DIES_OR_COMMAND_ZONE",
        },
        causalStatement: "Cause creatures with +1/+1 counters to die or go to command zone",
        requiredStateOrAction: "Creatures with counters departing under your control",
        expectedMechanicalEffect: "Counters moved to target creature",
        causalProof: [`Condition: ${String(g.condition ?? fact.condition)}`],
      }),
    );
  }

  // Team keyword grant activation (Leonardo)
  if (types.includes("GRANT_KEYWORDS") && String(g.subject ?? "").includes("CREATURES_YOU_CONTROL")) {
    out.push(
      buildOpp(fact, {
        suffix: "team-keyword-activation",
        type: "OUTPUT_EXPLOITATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "MEDIUM",
        semanticEdge: "COST:mana → GRANT_KEYWORDS to creatures you control",
        exactScopes: { actor: "CONTROLLER", object: "CREATURES_YOU_CONTROL", duration: "UNTIL_END_OF_TURN" },
        causalStatement: "Pay activation cost to grant team keywords for combat",
        requiredStateOrAction: "Mana for activation; creatures to benefit",
        expectedMechanicalEffect: "Team gains menace/trample/lifelink until EOT",
        causalProof: [`Grant keywords: ${g.evidenceSpan.slice(0, 60)}`],
      }),
    );
  }

  // Attack trigger with graveyard land target (Erinis)
  if (triggerMatches(g, /ATTACK/i) && g.target?.includes("LAND") && g.target.includes("GRAVEYARD")) {
    out.push(
      buildOpp(fact, {
        suffix: "attack-graveyard-land-recursion",
        type: "ZONE_ENABLEMENT",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:attacks → land card from graveyard to battlefield",
        exactScopes: {
          actor: "COMMANDER",
          object: "LAND_CARD",
          fromZone: "GRAVEYARD",
          toZone: "BATTLEFIELD",
          event: "ATTACK",
        },
        causalStatement: "Attack with Erinis to return a target land card from your graveyard",
        requiredStateOrAction: "Target land card in your graveyard; declare/perform an attack with Erinis",
        expectedMechanicalEffect: "Land onto battlefield on attack",
        causalProof: [`Target: ${g.target}`],
      }),
    );
  }

  // Granted activated: sacrifice artifact for counter+draw (Clan Crafter)
  if (
    g.mechanismType.includes("GRANTED") &&
    types.includes("DRAW_CARD") &&
    (hasCostPattern(g, /SACRIFICE.*ARTIFACT/i) || JSON.stringify(g.actions).includes("SACRIFICE"))
  ) {
    out.push(
      buildOpp(fact, {
        suffix: "granted-artifact-sac-value",
        type: "RESOURCE_CONVERSION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "GRANTED:{2},Sac artifact → +1/+1 counter + draw on commander creature",
        exactScopes: {
          actor: "CONTROLLER",
          object: "ARTIFACT",
          subject: String(g.subject ?? "COMMANDER_CREATURES_YOU_OWN"),
        },
        causalStatement: "Sacrifice artifacts on owned commander creatures for counters and card (granted ability is the outlet)",
        requiredStateOrAction: "Artifact fodder; owned commander creature on battlefield; {2} mana",
        expectedMechanicalEffect: "+1/+1 counter and card draw per activation",
        causalProof: [`Granted ability on ${g.subject}`],
      }),
    );
  }
  if (g.mechanismType.includes("GRANTED") && hasCostPattern(g, /\{2\}/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "pay-granted-activation-cost",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "NECESSARY_PREREQUISITE",
        confidence: "MEDIUM",
        semanticEdge: "COST:MANA → ACTION:granted activation",
        exactScopes: { actor: "CONTROLLER", resource: "MANA" },
        causalStatement: "Provide mana to pay {2} on granted commander activation",
        requiredStateOrAction: "Two generic mana available when sacrificing artifacts",
        expectedMechanicalEffect: "Granted activation resolves",
        causalProof: ["Granted activation includes {2} mana cost"],
      }),
    );
  }

  // Granted tap trigger untap+counter (Dionus elves)
  if (g.mechanismType.includes("GRANTED") && types.includes("UNTAP_SELF") && types.includes("PUT_COUNTER")) {
    out.push(
      buildOpp(fact, {
        suffix: "granted-tap-untap-counter",
        type: "ACTIVATION_REPETITION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "GRANTED:tap during your turn → untap + +1/+1 counter (once/turn)",
        exactScopes: {
          actor: "CONTROLLER",
          object: String(g.subject ?? "ELVES_YOU_CONTROL"),
          timing: String(fact.limit ?? "ONCE_EACH_TURN"),
        },
        causalStatement: "Tap elves during your turn to untap and grow counters",
        requiredStateOrAction: "Elves you control tapping during your turn",
        expectedMechanicalEffect: "Untap and +1/+1 counter per eligible tap",
        causalProof: [`Granted trigger on ${g.subject}`],
      }),
    );
  }

  // Player mills creature cards trigger (Zellix)
  if (triggerMatches(g, /MILLS.*CREATURE/i)) {
    out.push(
      buildOpp(fact, {
        suffix: "creature-mill-trigger",
        type: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: "TRIGGER:player mills creature card(s) → create Horror token",
        exactScopes: { actor: "ANY_PLAYER", object: "CREATURE_CARD", event: "MILL_TO_GRAVEYARD" },
        causalStatement: "Cause mill events that include creature cards",
        requiredStateOrAction: "Mill effects putting creature cards into graveyards",
        expectedMechanicalEffect: "Horror token creation per qualifying mill",
        causalProof: [`Trigger: ${String(g.trigger)}`],
      }),
    );
  }

  // Target player mill activation removed (duplicate of untap-repeat + action restatement)

  // Granted static cost reduction (Acolyte dragon)
  if (types.includes("GRANT_ABILITY") || /COSTS.*LESS|COST REDUCTION/i.test(g.evidenceSpan)) {
    out.push(
      buildOpp(fact, {
        suffix: "granted-cost-reduction",
        type: "INPUT_AMPLIFICATION",
        derivationClass: "DIRECT_MECHANICAL",
        confidence: "HIGH",
        semanticEdge: `GRANTED:cost reduction on ${g.subject ?? "matching spells"}`,
        exactScopes: { actor: "CONTROLLER", object: String(g.subject ?? "MATCHING_SPELLS") },
        causalStatement: "Cast spells matching granted cost-reduction constraint",
        requiredStateOrAction: "Spells meeting reduction criteria (e.g. first Dragon each turn)",
        expectedMechanicalEffect: "Reduced mana cost on qualifying casts",
        causalProof: [`Cost reduction grant: ${g.evidenceSpan.slice(0, 70)}`],
      }),
    );
  }

  // Replacement/static entry effect with counters
  if (g.mechanismType.includes("ENTRY") && types.includes("ENTERS_WITH_COUNTERS")) {
    /* covered above */
  }

  return dedupeOpportunities(out);
}

function dedupeOpportunities(opps: SemanticOpportunity[]): SemanticOpportunity[] {
  const seen = new Set<string>();
  const out: SemanticOpportunity[] = [];
  for (const o of opps) {
    const key = `${o.opportunityType}:${o.causalStatement}:${o.sourceFactIds.join("+")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

function inferNoActionable(fact: IndependentMechanismFact, g: FactSemanticGraph): NoActionableOpportunityRecord | null {
  if (isComposableKeywordFact(fact, g)) {
    return null;
  }
  if (isKeywordOnlyFact(g) || isChangelingOnly(g)) {
    const kw = String((fact as { keyword?: string }).keyword ?? g.evidenceSpan);
    return {
      factId: fact.mechanismId,
      status: "NO_ACTIONABLE_OPPORTUNITY",
      reason: `Keyword ${kw} alone does not imply deck-building leverage without additional engine context`,
      commanderMember: g.commanderMember,
    };
  }
  if (g.mechanismType === "ALTERNATIVE_CAST" && g.actions.length === 0) {
    return {
      factId: fact.mechanismId,
      status: "NO_ACTIONABLE_OPPORTUNITY",
      reason: "Alternative cast path only — covered by cast-entry opportunity on same fact when inferred",
      commanderMember: g.commanderMember,
    };
  }
  if (
    g.mechanismType === "STATIC_ABILITY" &&
    actionTypes(g).length === 1 &&
    actionTypes(g)[0] === "GRANT_KEYWORD"
  ) {
    const kw = String(g.actions[0]?.keyword ?? "keyword");
    return {
      factId: fact.mechanismId,
      status: "NO_ACTIONABLE_OPPORTUNITY",
      reason: `Commander-only ${kw} grant (${g.condition ?? "conditional"}) does not imply deck-building leverage beyond innate evasion timing`,
      commanderMember: g.commanderMember,
    };
  }
  return null;
}

function linkMutualRelevance(opportunities: SemanticOpportunity[]): void {
  const byFact = new Map<string, SemanticOpportunity[]>();
  for (const o of opportunities) {
    for (const fid of o.sourceFactIds) {
      const list = byFact.get(fid) ?? [];
      list.push(o);
      byFact.set(fid, list);
    }
  }
  for (const group of byFact.values()) {
    const ids = group.map((o) => o.opportunityId);
    for (const o of group) {
      o.mutuallyRelevantWith = ids.filter((id) => id !== o.opportunityId);
    }
  }
}

export type CaseOpportunityInferenceV3 = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  mechanismFactCount: number;
  opportunities: SemanticOpportunity[];
  noActionableOpportunities: NoActionableOpportunityRecord[];
  crossFactEdges: CrossFactEdge[];
  memberCoverage: Array<{ commanderMember?: string; factIds: string[]; opportunityCount: number }>;
  derivationSource: "phase6a1-commander-mechanism-facts-v4-implemented";
  adjudicationStatus: "DERIVED_FROM_FROZEN_FACTS_V3";
};

export function inferOpportunitiesForCaseV3(entry: ImplementedMechanismCatalogEntry): CaseOpportunityInferenceV3 {
  const opportunities: SemanticOpportunity[] = [];
  const noActionable: NoActionableOpportunityRecord[] = [];

  for (const fact of entry.independentMechanismFacts) {
    const g = extractFactSemanticGraph(fact);
    const opps = inferFromGraph(fact, g);
    if (opps.length === 0) {
      const none = inferNoActionable(fact, g);
      if (none) noActionable.push(none);
      else if (!isKeywordOnlyFact(g) && !isComposableKeywordFact(fact, g)) {
        noActionable.push({
          factId: fact.mechanismId,
          status: "NO_ACTIONABLE_OPPORTUNITY",
          reason: "No typed semantic edge matched — requires manual fact-family rule extension",
          commanderMember: g.commanderMember,
        });
      }
    } else {
      opportunities.push(...opps);
    }
  }

  const cross = discoverCrossFactComposition(entry.caseId, entry.independentMechanismFacts);
  opportunities.push(...cross.opportunities);
  linkMutualRelevance(opportunities);
  const deduped = dedupeOpportunities(opportunities);
  for (const o of deduped) {
    if (o.opportunityId.endsWith("--token-output-exploit")) {
      o.derivationClass = "OPTIONAL_EXPLOIT";
      o.opportunityConfidence = "LOW";
    }
  }

  const coveredFactIds = new Set(deduped.flatMap((o) => o.sourceFactIds));
  const filteredNoActionable = noActionable.filter((n) => !coveredFactIds.has(n.factId));

  const memberMap = new Map<string, string[]>();
  for (const fact of entry.independentMechanismFacts) {
    const member = typeof fact.commander === "string" ? fact.commander : entry.commanders[0] ?? "unknown";
    const list = memberMap.get(member) ?? [];
    list.push(fact.mechanismId);
    memberMap.set(member, list);
  }

  const memberCoverage = [...memberMap.entries()].map(([commanderMember, factIds]) => ({
    commanderMember,
    factIds,
    opportunityCount: deduped.filter((o) => factIds.some((id) => o.sourceFactIds.includes(id))).length,
  }));

  return {
    caseId: entry.caseId,
    commanders: entry.commanders,
    commandZoneConfiguration: entry.commandZoneConfiguration,
    mechanismFactCount: entry.independentMechanismFacts.length,
    opportunities: deduped,
    noActionableOpportunities: filteredNoActionable,
    crossFactEdges: cross.edges,
    memberCoverage,
    derivationSource: "phase6a1-commander-mechanism-facts-v4-implemented",
    adjudicationStatus: "DERIVED_FROM_FROZEN_FACTS_V3",
  };
}

export function countByType(opportunities: SemanticOpportunity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of opportunities) {
    counts[o.opportunityType] = (counts[o.opportunityType] ?? 0) + 1;
  }
  return counts;
}

export function countByDerivation(opportunities: SemanticOpportunity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of opportunities) {
    counts[o.derivationClass] = (counts[o.derivationClass] ?? 0) + 1;
  }
  return counts;
}
