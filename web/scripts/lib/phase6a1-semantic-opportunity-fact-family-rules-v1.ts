/**
 * Generic deterministic semantic-opportunity derivation from mechanism fact families.
 * No commander-name special cases — classification is structural only.
 */
import type { IndependentMechanismFact } from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import type { SemanticOpportunity } from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import type { CrossFactEdge, NoActionableOpportunityRecord } from "./phase6a1-semantic-opportunity-inference-v3";

export const SEMANTIC_OPPORTUNITY_FACT_FAMILY_RULES_V1_VERSION =
  "phase6a1-semantic-opportunity-fact-family-rules-v1";

export type SemanticOpportunityFactFamily =
  | "PLAY_OR_CAST_FROM_GRAVEYARD_PERMISSION"
  | "LAND_ENTERS_CREATES_TYPED_CREATURE_TOKEN"
  | "CONTROLLED_TYPED_CREATURE_DIES_TO_DAMAGE"
  | "CAST_X_SPELL_CREATES_X_SCALED_TOKEN"
  | "ACTIVATED_ABILITY_TAP_REPEAT";

export type DerivedOpportunityCase = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  mechanismFactCount: number;
  opportunities: SemanticOpportunity[];
  noActionableOpportunities: NoActionableOpportunityRecord[];
  crossFactEdges: CrossFactEdge[];
};

function actionList(fact: IndependentMechanismFact): Array<Record<string, unknown>> {
  return Array.isArray(fact.actions) ? (fact.actions as Array<Record<string, unknown>>) : [];
}

function hasActionType(fact: IndependentMechanismFact, type: string): boolean {
  return actionList(fact).some((a) => a.type === type);
}

function findAction(fact: IndependentMechanismFact, type: string): Record<string, unknown> | undefined {
  return actionList(fact).find((a) => a.type === type);
}

function deriveControlledCreatureType(fact: IndependentMechanismFact): string | null {
  const trigger = String(fact.trigger ?? "");
  const orTyped = trigger.match(/OR_([A-Z][A-Z0-9_]*)_YOU_CONTROL_DIES/);
  if (orTyped?.[1]) return orTyped[1].replace(/_/g, " ");
  const controlledTyped = trigger.match(/CONTROLLED_([A-Z][A-Z0-9_]*)_DIES/);
  if (controlledTyped?.[1]) return controlledTyped[1].replace(/_/g, " ");
  const target = fact.target ? String(fact.target) : "";
  if (target) return target.replace(/_/g, " ");
  return null;
}

function deriveTokenDescriptor(action: Record<string, unknown> | undefined): string | null {
  if (!action?.token) return null;
  const token = String(action.token).trim();
  if (!token || token === "CREATURE_TOKEN") return null;
  return token;
}

function deriveCounterAction(fact: IndependentMechanismFact): Record<string, unknown> | undefined {
  return actionList(fact).find(
    (a) =>
      a.type === "PUT_COUNTER" &&
      String(a.quantity ?? "") === "X_FROM_SPELL_MANA_COST" &&
      Boolean(a.recipient),
  );
}

export function classifyMechanismFactFamily(fact: IndependentMechanismFact): SemanticOpportunityFactFamily | null {
  if (fact.mechanismType === "PLAY_PERMISSION") {
    if (hasActionType(fact, "PLAY_FROM_GRAVEYARD") || hasActionType(fact, "CAST_FROM_GRAVEYARD")) {
      return "PLAY_OR_CAST_FROM_GRAVEYARD_PERMISSION";
    }
  }

  if (fact.mechanismType === "TRIGGERED_ABILITY") {
    if (fact.trigger === "LANDFALL") {
      const tokenAction = findAction(fact, "CREATE_TOKEN");
      if (deriveTokenDescriptor(tokenAction)) {
        return "LAND_ENTERS_CREATES_TYPED_CREATURE_TOKEN";
      }
    }
    if (
      (fact.trigger === "YOU_CAST_SPELL_WITH_X_IN_MANA_COST" ||
        String(fact.trigger ?? "").includes("X_IN_MANA_COST")) &&
      hasActionType(fact, "CREATE_TOKEN")
    ) {
      return "CAST_X_SPELL_CREATES_X_SCALED_TOKEN";
    }
    if (String(fact.trigger ?? "").includes("DIES") && hasActionType(fact, "DEAL_DAMAGE")) {
      if (deriveControlledCreatureType(fact)) {
        return "CONTROLLED_TYPED_CREATURE_DIES_TO_DAMAGE";
      }
    }
  }

  if (fact.mechanismType === "ACTIVATED_ABILITY") {
    const costs = Array.isArray(fact.cost) ? fact.cost.map(String) : [];
    if (costs.includes("TAP_SELF") && hasActionType(fact, "ADD_MANA")) {
      return "ACTIVATED_ABILITY_TAP_REPEAT";
    }
  }

  if (fact.mechanismType === "KEYWORD" && fact.keyword === "DEATHTOUCH") {
    return null;
  }

  return null;
}

function baseOpportunity(args: {
  opportunityId: string;
  sourceFactId: string;
  opportunityType: SemanticOpportunity["opportunityType"];
  derivationClass: SemanticOpportunity["derivationClass"];
  opportunityConfidence: SemanticOpportunity["opportunityConfidence"];
  causalStatement: string;
  requiredStateOrAction: string;
  expectedMechanicalEffect: string;
  causalProof: string[];
  evidenceSpan: string;
  exactScopes: Record<string, string | string[]>;
  semanticEdge: string;
}): SemanticOpportunity {
  return {
    opportunityId: args.opportunityId,
    sourceMechanismFactIds: [args.sourceFactId],
    sourceFactIds: [args.sourceFactId],
    opportunityType: args.opportunityType,
    derivationClass: args.derivationClass,
    opportunityConfidence: args.opportunityConfidence,
    causalStatement: args.causalStatement,
    requiredStateOrAction: args.requiredStateOrAction,
    expectedMechanicalEffect: args.expectedMechanicalEffect,
    causalProof: args.causalProof,
    prerequisites: [],
    mutuallyRelevantWith: [],
    evidence: { type: "COMMANDER_ORACLE", oracleSpan: args.evidenceSpan },
    exactScopes: args.exactScopes,
    semanticEdge: args.semanticEdge,
    recordKind: "OPPORTUNITY",
  };
}

export function deriveOpportunitiesForMechanismFact(fact: IndependentMechanismFact): {
  family: SemanticOpportunityFactFamily | null;
  opportunities: SemanticOpportunity[];
  noActionable: NoActionableOpportunityRecord | null;
} {
  const family = classifyMechanismFactFamily(fact);
  if (!family) {
    if (fact.mechanismType === "KEYWORD" && fact.keyword === "DEATHTOUCH") {
      return {
        family: null,
        opportunities: [],
        noActionable: {
          factId: fact.mechanismId,
          status: "NO_ACTIONABLE_OPPORTUNITY",
          reason:
            "Keyword DEATHTOUCH alone does not imply deck-building leverage without additional engine context",
        },
      };
    }
    return {
      family: null,
      opportunities: [],
      noActionable: {
        factId: fact.mechanismId,
        status: "NO_ACTIONABLE_OPPORTUNITY",
        reason: "No matching generic fact-family rule",
      },
    };
  }

  const actions = actionList(fact);
  const opportunities: SemanticOpportunity[] = [];
  const timing = String(fact.trigger ?? "DURING_EACH_OF_YOUR_TURNS");

  if (family === "PLAY_OR_CAST_FROM_GRAVEYARD_PERMISSION") {
    const landPlay = actions.find((a) => a.type === "PLAY_FROM_GRAVEYARD");
    const permanentCast = actions.find((a) => a.type === "CAST_FROM_GRAVEYARD");
    if (landPlay) {
      opportunities.push(
        baseOpportunity({
          opportunityId: `${fact.mechanismId}--graveyard-land-zone-enablement`,
          sourceFactId: fact.mechanismId,
          opportunityType: "ZONE_ENABLEMENT",
          derivationClass: "DIRECT_MECHANICAL",
          opportunityConfidence: "HIGH",
          causalStatement:
            "During each of your turns, play a land from your graveyard using graveyard zone permission, subject to normal land-play limits",
          requiredStateOrAction: "Land cards present in your graveyard; your turn active",
          expectedMechanicalEffect:
            "Legal land play from graveyard under PLAY_FROM_GRAVEYARD permission and normal land-play limits",
          causalProof: [
            `${fact.mechanismId} PLAY_FROM_GRAVEYARD zone=${String(landPlay.zone ?? "GRAVEYARD")} object=${String(landPlay.object ?? "LAND_CARD")}`,
            `trigger=${timing}`,
          ],
          evidenceSpan: fact.evidenceSpan,
          exactScopes: {
            actor: "CONTROLLER",
            zone: String(landPlay.zone ?? "GRAVEYARD"),
            object: String(landPlay.object ?? "LAND_CARD"),
            timing,
            landPlayLimit: "NORMAL_LAND_PLAY_LIMITS",
          },
          semanticEdge: "PERMISSION:PLAY_FROM_GRAVEYARD → ZONE:GRAVEYARD land enablement",
        }),
        baseOpportunity({
          opportunityId: `${fact.mechanismId}--graveyard-land-structural-support`,
          sourceFactId: fact.mechanismId,
          opportunityType: "STRUCTURAL_SUPPORT",
          derivationClass: "NECESSARY_PREREQUISITE",
          opportunityConfidence: "HIGH",
          causalStatement: "Maintain graveyard land access as a structural enabler for the permission",
          requiredStateOrAction: "Preserve graveyard land sources and turn sequence for permission use",
          expectedMechanicalEffect: "Graveyard land play remains available on eligible turns",
          causalProof: [`${fact.mechanismId} structural dependency on graveyard land permission`],
          evidenceSpan: fact.evidenceSpan,
          exactScopes: {
            actor: "CONTROLLER",
            zone: String(landPlay.zone ?? "GRAVEYARD"),
            object: String(landPlay.object ?? "LAND_CARD"),
            timing,
          },
          semanticEdge: "PERMISSION:PLAY_FROM_GRAVEYARD → STRUCTURAL:graveyard land access",
        }),
      );
    }
    if (permanentCast) {
      opportunities.push(
        baseOpportunity({
          opportunityId: `${fact.mechanismId}--graveyard-permanent-cast-zone-enablement`,
          sourceFactId: fact.mechanismId,
          opportunityType: "ZONE_ENABLEMENT",
          derivationClass: "DIRECT_MECHANICAL",
          opportunityConfidence: "HIGH",
          causalStatement:
            "During each of your turns, cast one permanent spell of each permanent type from your graveyard",
          requiredStateOrAction:
            "Permanent spells in graveyard; respect one spell per permanent type per turn",
          expectedMechanicalEffect: "Legal permanent spell cast from graveyard under type-per-turn constraint",
          causalProof: [
            `${fact.mechanismId} CAST_FROM_GRAVEYARD zone=${String(permanentCast.zone ?? "GRAVEYARD")} object=${String(permanentCast.object ?? "PERMANENT_SPELL")}`,
            `constraint=${String(permanentCast.constraint ?? "ONE_SPELL_OF_EACH_PERMANENT_TYPE")}`,
          ],
          evidenceSpan: fact.evidenceSpan,
          exactScopes: {
            actor: "CONTROLLER",
            zone: String(permanentCast.zone ?? "GRAVEYARD"),
            object: String(permanentCast.object ?? "PERMANENT_SPELL"),
            timing,
            perTurnLimit: String(permanentCast.constraint ?? "ONE_SPELL_OF_EACH_PERMANENT_TYPE"),
          },
          semanticEdge: "PERMISSION:CAST_FROM_GRAVEYARD → ZONE:GRAVEYARD permanent cast enablement",
        }),
        baseOpportunity({
          opportunityId: `${fact.mechanismId}--graveyard-permanent-type-structural-support`,
          sourceFactId: fact.mechanismId,
          opportunityType: "STRUCTURAL_SUPPORT",
          derivationClass: "NECESSARY_PREREQUISITE",
          opportunityConfidence: "HIGH",
          causalStatement:
            "Maintain diverse permanent types in graveyard to use each type once per turn",
          requiredStateOrAction: "Stock graveyard with permanent spells across permanent types",
          expectedMechanicalEffect: "Each permanent type remains castable once per turn from graveyard",
          causalProof: [`${fact.mechanismId} ${String(permanentCast.constraint ?? "ONE_SPELL_OF_EACH_PERMANENT_TYPE")} preserved`],
          evidenceSpan: fact.evidenceSpan,
          exactScopes: {
            actor: "CONTROLLER",
            zone: String(permanentCast.zone ?? "GRAVEYARD"),
            object: String(permanentCast.object ?? "PERMANENT_SPELL"),
            timing,
            perTurnLimit: String(permanentCast.constraint ?? "ONE_SPELL_OF_EACH_PERMANENT_TYPE"),
          },
          semanticEdge: "PERMISSION:CAST_FROM_GRAVEYARD → STRUCTURAL:per-type graveyard suite",
        }),
      );
    }
  }

  if (family === "LAND_ENTERS_CREATES_TYPED_CREATURE_TOKEN") {
    const tokenAction = actions.find((a) => a.type === "CREATE_TOKEN");
    const tokenDescriptor = deriveTokenDescriptor(tokenAction) ?? "typed creature token";
    opportunities.push(
      baseOpportunity({
        opportunityId: `${fact.mechanismId}--landfall-trigger-frequency`,
        sourceFactId: fact.mechanismId,
        opportunityType: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        opportunityConfidence: "HIGH",
        causalStatement: "Increase land-enter-the-battlefield events you control to trigger landfall",
        requiredStateOrAction: "Land-enter-the-battlefield events under your control",
        expectedMechanicalEffect: "Landfall trigger resolves more often",
        causalProof: [`${fact.mechanismId} trigger=LANDFALL`, "semanticEdge=TRIGGER:land enters → ACTION:CREATE_TOKEN"],
        evidenceSpan: fact.evidenceSpan,
        exactScopes: {
          actor: "CONTROLLER",
          trigger: "LANDFALL",
          object: "LAND",
          timing: "WHENEVER_LAND_YOU_CONTROL_ENTERS",
        },
        semanticEdge: "TRIGGER:land enters → ACTION:create typed creature token",
      }),
      baseOpportunity({
        opportunityId: `${fact.mechanismId}--landfall-token-output-exploitation`,
        sourceFactId: fact.mechanismId,
        opportunityType: "OUTPUT_EXPLOITATION",
        derivationClass: "DERIVED_AMPLIFICATION",
        opportunityConfidence: "HIGH",
        causalStatement: `Exploit ${tokenDescriptor} output from landfall`,
        requiredStateOrAction: `Convert created ${tokenDescriptor} output into downstream value`,
        expectedMechanicalEffect: "Token output from landfall is leveraged by other effects",
        causalProof: [`${fact.mechanismId} CREATE_TOKEN token=${tokenDescriptor}`],
        evidenceSpan: fact.evidenceSpan,
        exactScopes: {
          actor: "CONTROLLER",
          trigger: "LANDFALL",
          output: tokenDescriptor,
        },
        semanticEdge: "OUTPUT:landfall token → EXPLOIT:downstream value",
      }),
    );
  }

  if (family === "CONTROLLED_TYPED_CREATURE_DIES_TO_DAMAGE") {
    const damage = actions.find((a) => a.type === "DEAL_DAMAGE");
    const creatureType = deriveControlledCreatureType(fact);
    if (!creatureType || !damage) {
      return { family, opportunities, noActionable: null };
    }
    const damageAmount = String(damage.quantity ?? "");
    const damageTarget = String(damage.target ?? "ANY_TARGET");
    const triggerLabel = String(fact.trigger ?? "");
    opportunities.push(
      baseOpportunity({
        opportunityId: `${fact.mechanismId}--typed-death-resource-conversion`,
        sourceFactId: fact.mechanismId,
        opportunityType: "RESOURCE_CONVERSION",
        derivationClass: "DIRECT_MECHANICAL",
        opportunityConfidence: "HIGH",
        causalStatement: `Convert controlled ${creatureType} death events into damage output`,
        requiredStateOrAction: `${creatureType} you control dies; valid damage target available`,
        expectedMechanicalEffect: `${damageAmount} damage to ${damageTarget}`,
        causalProof: [
          `${fact.mechanismId} trigger=${triggerLabel}`,
          `DEAL_DAMAGE quantity=${damageAmount} target=${damageTarget}`,
        ],
        evidenceSpan: fact.evidenceSpan,
        exactScopes: {
          actor: "CONTROLLER",
          trigger: triggerLabel,
          object: creatureType.toUpperCase().replace(/\s+/g, "_"),
          target: damageTarget,
          amount: damageAmount,
        },
        semanticEdge: `TRIGGER:${creatureType} dies → OUTPUT:damage`,
      }),
      baseOpportunity({
        opportunityId: `${fact.mechanismId}--typed-death-damage-output-exploitation`,
        sourceFactId: fact.mechanismId,
        opportunityType: "OUTPUT_EXPLOITATION",
        derivationClass: "DERIVED_AMPLIFICATION",
        opportunityConfidence: "MEDIUM",
        causalStatement: "Exploit repeatable death-triggered damage as an output line",
        requiredStateOrAction: `Generate and lose ${creatureType} creatures you control`,
        expectedMechanicalEffect: `Damage output scales with ${creatureType} death frequency`,
        causalProof: [`${fact.mechanismId} death-triggered DEAL_DAMAGE output`],
        evidenceSpan: fact.evidenceSpan,
        exactScopes: {
          actor: "CONTROLLER",
          trigger: triggerLabel,
          output: "DAMAGE",
          object: creatureType.toUpperCase().replace(/\s+/g, "_"),
        },
        semanticEdge: "OUTPUT:death damage → EXPLOIT:repeatable burn line",
      }),
    );
  }

  if (family === "CAST_X_SPELL_CREATES_X_SCALED_TOKEN") {
    const tokenAction = actions.find((a) => a.type === "CREATE_TOKEN");
    const tokenDescriptor = deriveTokenDescriptor(tokenAction) ?? String(tokenAction?.token ?? "token");
    opportunities.push(
      baseOpportunity({
        opportunityId: `${fact.mechanismId}--x-spell-trigger-frequency`,
        sourceFactId: fact.mechanismId,
        opportunityType: "TRIGGER_FREQUENCY",
        derivationClass: "DIRECT_MECHANICAL",
        opportunityConfidence: "HIGH",
        causalStatement: "Cast more spells with {X} in their mana cost to trigger the ability",
        requiredStateOrAction: "Cast spells with variable mana cost containing X",
        expectedMechanicalEffect: `Triggered ${tokenDescriptor} creation resolves more often`,
        causalProof: [`${fact.mechanismId} trigger=YOU_CAST_SPELL_WITH_X_IN_MANA_COST`, "ACTION:CREATE_TOKEN"],
        evidenceSpan: fact.evidenceSpan,
        exactScopes: {
          actor: "CONTROLLER",
          trigger: "YOU_CAST_SPELL_WITH_X_IN_MANA_COST",
          output: tokenDescriptor,
        },
        semanticEdge: "TRIGGER:cast X spell → ACTION:CREATE_TOKEN",
      }),
    );

    const counterAction = deriveCounterAction(fact);
    if (counterAction) {
      opportunities.push(
        baseOpportunity({
          opportunityId: `${fact.mechanismId}--x-counter-input-amplification`,
          sourceFactId: fact.mechanismId,
          opportunityType: "INPUT_AMPLIFICATION",
          derivationClass: "DERIVED_AMPLIFICATION",
          opportunityConfidence: "HIGH",
          causalStatement: `Increase X values on cast spells to scale ${String(counterAction.counterType ?? "counters")} on ${String(counterAction.recipient ?? "THAT_TOKEN")}`,
          requiredStateOrAction: "Pay higher X costs on eligible spells",
          expectedMechanicalEffect: `${String(counterAction.recipient ?? "THAT_TOKEN")} receives ${String(counterAction.quantity ?? "X_FROM_SPELL_MANA_COST")} ${String(counterAction.counterType ?? "counters")}`,
          causalProof: [
            `${fact.mechanismId} PUT_COUNTER quantity=${String(counterAction.quantity ?? "X_FROM_SPELL_MANA_COST")} recipient=${String(counterAction.recipient ?? "THAT_TOKEN")}`,
          ],
          evidenceSpan: fact.evidenceSpan,
          exactScopes: {
            actor: "CONTROLLER",
            scaling: String(counterAction.quantity ?? "X_FROM_SPELL_MANA_COST"),
            counterType: String(counterAction.counterType ?? ""),
            recipient: String(counterAction.recipient ?? "THAT_TOKEN"),
          },
          semanticEdge: "INPUT:X mana cost → OUTPUT:scaled counters",
        }),
      );
    }
  }

  if (family === "ACTIVATED_ABILITY_TAP_REPEAT") {
    opportunities.push(
      baseOpportunity({
        opportunityId: `${fact.mechanismId}--untap-repeat-activation`,
        sourceFactId: fact.mechanismId,
        opportunityType: "ACTIVATION_REPETITION",
        derivationClass: "DIRECT_MECHANICAL",
        opportunityConfidence: "HIGH",
        causalStatement: "Enable additional activations of this tapped ability",
        requiredStateOrAction: "UNTAP_THIS_PERMANENT or grant additional activations per turn",
        expectedMechanicalEffect: "Ability resolves more times per turn cycle",
        causalProof: [
          `${fact.mechanismId} activation cost includes TAP_SELF`,
          "semanticEdge=COST:TAP_SELF → ACTION:additional activations",
        ],
        evidenceSpan: fact.evidenceSpan,
        exactScopes: {
          actor: "COMMANDER",
          timing: "SAME_TURN",
        },
        semanticEdge: "COST:TAP_SELF → ACTION:additional activations",
      }),
    );
  }

  return { family, opportunities, noActionable: null };
}

export function deriveCrossFactEdgesForCase(args: {
  caseId: string;
  facts: IndependentMechanismFact[];
  opportunities: SemanticOpportunity[];
}): CrossFactEdge[] {
  const landfall = args.facts.find((f) => classifyMechanismFactFamily(f) === "LAND_ENTERS_CREATES_TYPED_CREATURE_TOKEN");
  const deathDamage = args.facts.find(
    (f) => classifyMechanismFactFamily(f) === "CONTROLLED_TYPED_CREATURE_DIES_TO_DAMAGE",
  );
  if (!landfall || !deathDamage) return [];

  const tokenDescriptor =
    deriveTokenDescriptor(findAction(landfall, "CREATE_TOKEN")) ?? "typed creature token";
  const creatureType = deriveControlledCreatureType(deathDamage) ?? "typed creature";

  return [
    {
      edgeId: `${args.caseId}--cross-${landfall.mechanismId}-to-${deathDamage.mechanismId}-landfall-death-damage-chain`,
      producerFactIds: [landfall.mechanismId],
      consumerFactIds: [deathDamage.mechanismId],
      relationship: "PRODUCER_TO_CONSUMER",
      causalStatement: `Landfall creates ${tokenDescriptor}; when that ${creatureType} dies, the death trigger converts the token resource into damage output`,
    },
  ];
}

export function deriveOpportunitiesForMechanismFacts(args: {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  facts: IndependentMechanismFact[];
}): DerivedOpportunityCase {
  const opportunities: SemanticOpportunity[] = [];
  const noActionableOpportunities: NoActionableOpportunityRecord[] = [];

  for (const fact of args.facts) {
    const derived = deriveOpportunitiesForMechanismFact(fact);
    opportunities.push(...derived.opportunities);
    if (derived.noActionable) noActionableOpportunities.push(derived.noActionable);
  }

  const crossFactEdges = deriveCrossFactEdgesForCase({
    caseId: args.caseId,
    facts: args.facts,
    opportunities,
  });

  return {
    caseId: args.caseId,
    commanders: args.commanders,
    commandZoneConfiguration: args.commandZoneConfiguration,
    mechanismFactCount: args.facts.length,
    opportunities,
    noActionableOpportunities,
    crossFactEdges,
  };
}
