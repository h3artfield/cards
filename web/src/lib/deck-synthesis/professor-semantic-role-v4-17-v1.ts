/**
 * Professor v4.17 — semantic role actor/object/target truth for requirement eligibility.
 */
import type {
  BrewRequirementV417,
  RequirementFunctionV417,
  RoleMatchPrecisionV417,
  SemanticRoleAssertionV417,
} from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_SEMANTIC_ROLE_V4_17_V1_VERSION = "professor-semantic-role-v4-17-v1";

export function deriveRoleAssertionsForRequirement(requirement: BrewRequirementV417): SemanticRoleAssertionV417[] {
  const fn = requirement.requiredFunctions[0] ?? requirement.family;
  if (fn === "PROTECTION" || requirement.family === "PROTECTION") {
    return [
      {
        function: "PROTECTION",
        actor: "CONTROLLER",
        affectedObject: requirement.purpose.toLowerCase().includes("commander") ? "COMMANDER" : "ENGINE_PERMANENT",
        targetClass: "own_permanent_or_creature",
        direction: "GRANTS",
        scope: "BATTLEFIELD",
        evidence: ["requirement:protects_own_object"],
      },
    ];
  }
  if (fn === "INTERACTION" || requirement.family === "INTERACTION") {
    const premium = requirement.bracketQualityContract.minimumManaEfficiency === "high";
    return [
      {
        function: "INTERACTION",
        actor: "CONTROLLER",
        affectedObject: "ANY",
        targetClass: premium ? "premium_instant_answer" : "efficient_answer",
        direction: "PREVENTS",
        scope: requirement.requiredMechanics.includes("COUNTER_SPELL") ? "STACK" : "ANY",
        evidence: [premium ? "requirement:b4_premium_interaction" : "requirement:interaction"],
      },
    ];
  }
  return [
    {
      function: fn as RequirementFunctionV417,
      actor: "CONTROLLER",
      affectedObject: "ANY",
      targetClass: requirement.family.toLowerCase(),
      direction: "GRANTS",
      scope: "ANY",
      evidence: [`requirement:${requirement.family}`],
    },
  ];
}

export function evaluateSemanticRolePrecision(args: {
  requirement: BrewRequirementV417;
  oracleText: string;
  typeLine: string;
  cardName: string;
}): RoleMatchPrecisionV417 {
  const text = args.oracleText.toLowerCase();
  const type = args.typeLine.toLowerCase();
  const name = args.cardName.toLowerCase();
  const fn = args.requirement.requiredFunctions[0] ?? args.requirement.family;

  if (fn === "PROTECTION" || args.requirement.family === "PROTECTION") {
    if (/target permanent loses hexproof|can't have or gain hexproof|remove hexproof|loses hexproof/i.test(text)) {
      return "FALSE_POSITIVE";
    }
    if (/creatures your opponents control lose hexproof/i.test(text) || /target player loses hexproof/i.test(text)) {
      return "FALSE_POSITIVE";
    }
    if (
      /^(darksteel relic|arcane lighthouse|darksteel axe)$/i.test(args.cardName) ||
      (name.includes("lighthouse") && /hexproof/i.test(text) && /lose|loses|remove/i.test(text))
    ) {
      return "FALSE_POSITIVE";
    }
    if (/indestructible|hexproof|shroud|ward|protection from/i.test(text)) {
      if (/target (creature|permanent).*gain(s)? (hexproof|indestructible|shroud|ward)/i.test(text)) {
        return "TRUE_ROLE_MATCH";
      }
      if (/equipped creature gains|enchanted creature gains|enchanted permanent gains|other permanents you control gain|creatures you control gain/i.test(text)) {
        return "TRUE_ROLE_MATCH";
      }
      if (/counter target spell|counter target activated|counter target triggered/i.test(text)) {
        return "PARTIAL_ROLE_MATCH";
      }
      if (/artifact|equipment|relic|axe/i.test(type) && !/target|equipped|enchant|attach|other.*gain/i.test(text)) {
        return "FALSE_POSITIVE";
      }
      return "PARTIAL_ROLE_MATCH";
    }
    return "FALSE_POSITIVE";
  }

  if (fn === "INTERACTION" || args.requirement.family === "INTERACTION") {
    if (/destroy target|exile target|counter target|damage to target/i.test(text)) {
      const premium = args.requirement.bracketQualityContract.minimumManaEfficiency === "high";
      if (premium) {
        if (/instant/i.test(type) && (args.requirement.purpose.includes("stack") || /counter target spell/i.test(text))) {
          if (/additional cost| sacrifice a creature| sacrifice an artifact| tap ,| as an additional cost/i.test(text)) {
            return "PARTIAL_ROLE_MATCH";
          }
          return "TRUE_ROLE_MATCH";
        }
        if (/sorcery/i.test(type)) return "PARTIAL_ROLE_MATCH";
      }
      return "TRUE_ROLE_MATCH";
    }
    return "FALSE_POSITIVE";
  }

  return "PARTIAL_ROLE_MATCH";
}

export function precisionScore(precision: RoleMatchPrecisionV417): number {
  if (precision === "TRUE_ROLE_MATCH") return 1;
  if (precision === "PARTIAL_ROLE_MATCH") return 0.5;
  return 0;
}
