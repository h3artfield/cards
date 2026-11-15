/**
 * Mirrors semantic-candidate-retrieval-v1 bucket assignment for reconciliation.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { DerivedRoleName } from "../../src/lib/deck-synthesis/catalog-role-index";

export const RETRIEVAL_BUCKET_MAP_V1_VERSION = "phase6a1-retrieval-bucket-map-v1";

const ROLE_ALIASES: Record<string, DerivedRoleName> = {
  ramp: "ramp",
  mana: "ramp",
  mana_ramp: "ramp",
  card_draw: "card_draw",
  draw: "card_draw",
  card_advantage: "card_advantage",
  removal: "removal",
  countermagic: "countermagic",
  counter: "countermagic",
  tutor: "tutor",
  recursion: "recursion",
  reanimation: "reanimation",
  token_generation: "token_generation",
  tokens: "token_generation",
  sacrifice: "sacrifice_outlet",
  sacrifice_outlet: "sacrifice_outlet",
  sacrifice_payoff: "sacrifice_payoff",
  protection: "protection",
  board_wipe: "board_wipe",
  combat_payoff: "combat_payoff",
  graveyard_setup: "graveyard_setup",
  mill: "mill",
  opponent_mill_amplification: "mill",
  play_card_from_exile: "card_advantage",
  land_ramp: "ramp",
  graveyard_to_library_top: "recursion",
  unearth: "recursion",
  enchantment_recursion: "recursion",
  saga_token_copy: "token_generation",
  creature_from_library_top: "tutor",
  targeted_cantrip: "ENABLERS",
  spell_cost_reduction: "cost_reduction",
  opponent_spell_tax: "cost_reduction",
  mana_doubling: "ramp",
};

const FUNCTION_TO_BUCKET: Record<string, RetrievalBucketId> = {
  ramp: "MANA_SUPPORT",
  mana_generation: "MANA_SUPPORT",
  card_draw: "CARD_ADVANTAGE",
  card_advantage: "CARD_ADVANTAGE",
  removal: "INTERACTION",
  countermagic: "INTERACTION",
  board_wipe: "INTERACTION",
  tutor: "ENABLERS",
  recursion: "RECURSION",
  reanimation: "RECURSION",
  token_generation: "ENGINE_PIECES",
  sacrifice_outlet: "RESOURCE_CONSUMERS",
  sacrifice_payoff: "PAYOFFS",
  protection: "PROTECTION",
  combat_payoff: "PAYOFFS",
  graveyard_setup: "STATE_BUILDERS",
  blink_flicker: "ENABLERS",
  cost_reduction: "MANA_SUPPORT",
  combat_manipulation: "INTERACTION",
  mill: "STRUCTURAL_SUPPORT",
  opponent_mill_amplification: "STRUCTURAL_SUPPORT",
  play_card_from_exile: "CARD_ADVANTAGE",
  land_ramp: "MANA_SUPPORT",
  graveyard_to_library_top: "RECURSION",
  unearth: "RECURSION",
  enchantment_recursion: "RECURSION",
  saga_token_copy: "ENGINE_PIECES",
  creature_from_library_top: "ENABLERS",
  targeted_cantrip: "ENABLERS",
  spell_cost_reduction: "MANA_SUPPORT",
  opponent_spell_tax: "STRUCTURAL_SUPPORT",
  mana_doubling: "MANA_SUPPORT",
  cost_reduction: "MANA_SUPPORT",
};

function resolveRole(fn: string): DerivedRoleName | null {
  if (fn in ROLE_ALIASES) return ROLE_ALIASES[fn]!;
  return null;
}

function bucketForFunction(fn: string): RetrievalBucketId {
  const role = resolveRole(fn);
  if (role && FUNCTION_TO_BUCKET[role]) return FUNCTION_TO_BUCKET[role]!;
  if (fn.includes("ramp") || fn.includes("mana")) return "MANA_SUPPORT";
  if (fn.includes("draw")) return "CARD_ADVANTAGE";
  if (fn.includes("mill")) return "STRUCTURAL_SUPPORT";
  if (fn.includes("death_trigger") || fn.includes("death_trigger_multiplication")) return "PAYOFFS";
  if (fn.includes("spell_cost") || fn.includes("cost_reduction")) return "MANA_SUPPORT";
  if (fn.includes("spell_tax") || fn.includes("opponent_spell")) return "STRUCTURAL_SUPPORT";
  if (fn.includes("unearth")) return "RECURSION";
  if (fn.includes("enchantment")) return "RECURSION";
  if (fn.includes("land_ramp") || fn.includes("library_top")) return "MANA_SUPPORT";
  if (fn.includes("sacrifice")) return "RESOURCE_CONSUMERS";
  if (fn.includes("token")) return "ENGINE_PIECES";
  if (fn.includes("recursion") || fn.includes("graveyard")) return "RECURSION";
  if (fn.includes("payoff") || fn.includes("damage")) return "PAYOFFS";
  if (fn.includes("tutor")) return "ENABLERS";
  return "STRUCTURAL_SUPPORT";
}

export type LinkedFieldBucketPrediction = {
  linkedSpecField: string;
  sourceSpecField: keyof RetrievalSpecification;
  sourceSpecValue: string;
  predictedBucket: RetrievalBucketId | "NON_BUCKET_CONTEXT";
  drivesRetrievalQuery: boolean;
};

export function predictBucketForLinkedField(
  linkedSpecField: string,
  spec: RetrievalSpecification,
): LinkedFieldBucketPrediction {
  const [rawField, value] = linkedSpecField.split(":");
  const sourceSpecField = rawField as keyof RetrievalSpecification;
  if (!value) {
    return {
      linkedSpecField,
      sourceSpecField,
      sourceSpecValue: "",
      predictedBucket: "NON_BUCKET_CONTEXT",
      drivesRetrievalQuery: false,
    };
  }

  if (sourceSpecField === "requiredFunctions" || sourceSpecField === "desiredFunctions") {
    const role = resolveRole(value);
    return {
      linkedSpecField,
      sourceSpecField,
      sourceSpecValue: value,
      predictedBucket: role ? bucketForFunction(value) : bucketForFunction(value),
      drivesRetrievalQuery: Boolean(role),
    };
  }

  if (sourceSpecField === "requiredInputs") {
    const role = resolveRole(value);
    if (value.includes("mill") || value.includes("opponent_mill")) {
      return {
        linkedSpecField,
        sourceSpecField,
        sourceSpecValue: value,
        predictedBucket: "STRUCTURAL_SUPPORT",
        drivesRetrievalQuery: true,
      };
    }
    if (value.includes("death") || value.includes("sacrifice") || value.includes("dies")) {
      return {
        linkedSpecField,
        sourceSpecField,
        sourceSpecValue: value,
        predictedBucket: "STATE_BUILDERS",
        drivesRetrievalQuery: true,
      };
    }
    return {
      linkedSpecField,
      sourceSpecField,
      sourceSpecValue: value,
      predictedBucket: role ? "STATE_BUILDERS" : "NON_BUCKET_CONTEXT",
      drivesRetrievalQuery: Boolean(role) || value.includes("_"),
    };
  }

  if (sourceSpecField === "outputsToExploit") {
    const role = resolveRole(value);
    return {
      linkedSpecField,
      sourceSpecField,
      sourceSpecValue: value,
      predictedBucket: role ? "PAYOFFS" : "NON_BUCKET_CONTEXT",
      drivesRetrievalQuery: Boolean(role),
    };
  }

  if (sourceSpecField === "relevantZones" && value.includes("graveyard")) {
    return {
      linkedSpecField,
      sourceSpecField,
      sourceSpecValue: value,
      predictedBucket: "RECURSION",
      drivesRetrievalQuery: true,
    };
  }

  if (sourceSpecField === "constructionConstraints" && value.includes("ramp")) {
    return {
      linkedSpecField,
      sourceSpecField,
      sourceSpecValue: value,
      predictedBucket: "CONSTRUCTION_CONSTRAINT_SUPPORT",
      drivesRetrievalQuery: true,
    };
  }

  return {
    linkedSpecField,
    sourceSpecField,
    sourceSpecValue: value,
    predictedBucket: "NON_BUCKET_CONTEXT",
    drivesRetrievalQuery: false,
  };
}

export function predictRetrievalDrivingFields(spec: RetrievalSpecification): LinkedFieldBucketPrediction[] {
  const out: LinkedFieldBucketPrediction[] = [];
  for (const fn of [...spec.requiredFunctions, ...spec.desiredFunctions]) {
    out.push(predictBucketForLinkedField(`requiredFunctions:${fn}`, spec));
    out.push(predictBucketForLinkedField(`desiredFunctions:${fn}`, spec));
  }
  for (const input of spec.requiredInputs) {
    out.push(predictBucketForLinkedField(`requiredInputs:${input}`, spec));
  }
  for (const output of spec.outputsToExploit) {
    out.push(predictBucketForLinkedField(`outputsToExploit:${output}`, spec));
  }
  for (const zone of spec.relevantZones) {
    out.push(predictBucketForLinkedField(`relevantZones:${zone}`, spec));
  }
  for (const cc of spec.constructionConstraints) {
    out.push(predictBucketForLinkedField(`constructionConstraints:${cc}`, spec));
  }
  const seen = new Set<string>();
  return out.filter((p) => {
    const arr = spec[p.sourceSpecField] as string[] | undefined;
    if (!arr?.includes(p.sourceSpecValue)) return false;
    if (seen.has(p.linkedSpecField)) return false;
    seen.add(p.linkedSpecField);
    return true;
  });
}
