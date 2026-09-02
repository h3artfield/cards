import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type {
  CardInteractionProfile,
  InteractionDimensionEvidence,
  MechanicalPressureRelation,
  ScoredInteractionDimension,
} from "./types";
import { CARD_INTERACTION_PROFILE_VERSION } from "./types";
import { PAPER_POPULATION_HASH, RC8_PARSER_BLOB_CLOSURE } from "./semantic-universe-v1";

function hasAction(actions: SemanticAction[], ...types: string[]): boolean {
  return actions.some((a) => types.includes(a.actionType));
}

function hasAbilityType(abilities: SemanticAbility[], type: string): boolean {
  return abilities.some((a) => a.abilityType === type);
}

function upsertDimension(
  dims: ScoredInteractionDimension[],
  dimension: string,
  scoreDelta: number,
  evidence: InteractionDimensionEvidence,
): void {
  let row = dims.find((d) => d.dimension === dimension);
  if (!row) {
    row = { dimension, score: 0, evidence: [] };
    dims.push(row);
  }
  row.score = Math.min(1, Math.max(row.score, row.score + scoreDelta));
  if (!row.evidence.some((e) => JSON.stringify(e) === JSON.stringify(evidence))) {
    row.evidence.push(evidence);
  }
}

function evidenceFromAction(
  oracleId: string,
  action: SemanticAction,
  primitive?: string,
): InteractionDimensionEvidence {
  return {
    oracleId,
    primitive: primitive ?? action.actionType,
    sourceZone: action.arguments.sourceZone?.[0],
    destinationZone: action.arguments.destinationZone?.[0],
    targetClass: action.arguments.objectTypes?.[0],
  };
}

export function buildCardInteractionProfile(input: {
  oracleId: string;
  card: GoldenCatalogOracleCard;
  actions: SemanticAction[];
  abilities: SemanticAbility[];
  semanticVersion: string;
  parserVersion: string;
  parserBlobClosure?: string;
}): CardInteractionProfile {
  const { oracleId, card, actions, abilities, semanticVersion, parserVersion } = input;
  const answerCapabilities: ScoredInteractionDimension[] = [];
  const threatCapabilities: ScoredInteractionDimension[] = [];
  const resourceGeneration: ScoredInteractionDimension[] = [];
  const dependencies: ScoredInteractionDimension[] = [];
  const vulnerabilities: ScoredInteractionDimension[] = [];
  const zonesUsed: Record<string, number> = {};
  const objectsAffected: Record<string, number> = {};
  const timingProfile: Record<string, number> = {};
  const targetPredicates: Record<string, number> = {};

  for (const action of actions) {
    for (const z of action.arguments.sourceZone ?? []) zonesUsed[z] = (zonesUsed[z] ?? 0) + 0.25;
    for (const z of action.arguments.destinationZone ?? []) zonesUsed[z] = (zonesUsed[z] ?? 0) + 0.25;
    for (const obj of action.arguments.objectTypes ?? []) objectsAffected[obj] = (objectsAffected[obj] ?? 0) + 0.25;
    if (action.executionContext === "immediate") timingProfile.immediate = (timingProfile.immediate ?? 0) + 0.5;
    if (action.executionContext === "delayed") timingProfile.delayed = (timingProfile.delayed ?? 0) + 0.5;
    if (action.targetPredicate) targetPredicates[action.targetPredicate] = (targetPredicates[action.targetPredicate] ?? 0) + 0.5;
  }

  for (const action of actions) {
    const ev = evidenceFromAction(oracleId, action);
    if (hasAction([action], "destroy", "sacrifice")) {
      upsertDimension(answerCapabilities, "creature_removal", 0.35, ev);
      upsertDimension(answerCapabilities, "destruction", 0.3, ev);
    }
    if (hasAction([action], "exile")) {
      upsertDimension(answerCapabilities, "exile_removal", 0.4, ev);
      upsertDimension(answerCapabilities, "graveyard_denial", 0.35, { ...ev, sourceZone: "graveyard" });
    }
    if (hasAction([action], "return_to_hand", "return_to_library")) {
      upsertDimension(answerCapabilities, "bounce", 0.35, ev);
    }
    if (hasAction([action], "counter")) {
      upsertDimension(answerCapabilities, "counterspell", 0.45, ev);
      upsertDimension(threatCapabilities, "stack_pressure", 0.3, ev);
    }
    if (hasAction([action], "mill", "discard")) {
      upsertDimension(answerCapabilities, "graveyard_disruption", 0.25, ev);
    }
    if (hasAction([action], "destroy") && (action.arguments.objectTypes ?? []).includes("artifact")) {
      upsertDimension(answerCapabilities, "artifact_interaction", 0.4, ev);
    }
    if (hasAction([action], "destroy") && (action.arguments.objectTypes ?? []).includes("enchantment")) {
      upsertDimension(answerCapabilities, "enchantment_interaction", 0.4, ev);
    }
    if (hasAction([action], "destroy") && (action.arguments.objectTypes ?? []).includes("land")) {
      upsertDimension(answerCapabilities, "resource_denial", 0.4, ev);
    }
    if (hasAction([action], "destroy") && (action.arguments.objectTypes ?? []).includes("all_permanents")) {
      upsertDimension(answerCapabilities, "board_reset", 0.45, ev);
    }
    if (hasAction([action], "sacrifice")) {
      upsertDimension(answerCapabilities, "sacrifice_forcing", 0.35, ev);
    }
    if (hasAction([action], "prevent", "restrict")) {
      upsertDimension(answerCapabilities, "ability_denial", 0.3, ev);
    }
    if (hasAction([action], "draw")) {
      upsertDimension(resourceGeneration, "card_advantage", 0.35, ev);
      upsertDimension(threatCapabilities, "card_engine", 0.25, ev);
    }
    if (hasAction([action], "add_mana", "produce_mana")) {
      upsertDimension(resourceGeneration, "mana", 0.35, ev);
    }
    if (hasAction([action], "search")) {
      upsertDimension(resourceGeneration, "tutoring", 0.35, ev);
      upsertDimension(dependencies, "library_search_dependent", 0.25, ev);
    }
    if (hasAction([action], "return_from_graveyard", "reanimate")) {
      upsertDimension(threatCapabilities, "recursion", 0.35, ev);
      upsertDimension(dependencies, "graveyard_dependent", 0.3, ev);
    }
    if (hasAction([action], "create_token")) {
      upsertDimension(threatCapabilities, "token_production", 0.35, ev);
    }
    if (hasAction([action], "deal_damage", "lose_life")) {
      upsertDimension(threatCapabilities, "direct_damage", 0.3, ev);
    }
  }

  if (card.typeLine?.includes("Artifact")) {
    upsertDimension(dependencies, "artifact_dependent", 0.2, { oracleId, note: card.typeLine });
  }
  if (card.typeLine?.includes("Enchantment")) {
    upsertDimension(dependencies, "enchantment_dependent", 0.2, { oracleId, note: card.typeLine });
  }
  if (card.typeLine?.includes("Creature")) {
    upsertDimension(dependencies, "creature_dependent", 0.2, { oracleId, note: card.typeLine });
  }
  for (const ability of abilities) {
    if (ability.abilityType === "activated") {
      upsertDimension(dependencies, "activated_ability_dependent", 0.25, {
        oracleId,
        abilityType: ability.abilityType,
      });
    }
    if (ability.abilityType === "triggered") {
      upsertDimension(dependencies, "triggered_ability_dependent", 0.25, {
        oracleId,
        abilityType: ability.abilityType,
      });
    }
  }

  for (const dep of dependencies) {
    if (dep.score >= 0.25) {
      upsertDimension(vulnerabilities, dep.dimension.replace("_dependent", "_vulnerable"), dep.score, dep.evidence[0] ?? { oracleId });
    }
  }

  const mechanicalRelations: Partial<Record<MechanicalPressureRelation, string[]>> = {
    canDisrupt: [],
    canExploit: [],
    canProtectAgainst: [],
    canAnswer: [],
    attacksDependency: [],
    bypassesDefense: [],
  };

  if (answerCapabilities.some((d) => d.dimension === "graveyard_disruption" && d.score > 0)) {
    mechanicalRelations.canDisrupt?.push("graveyard_dependent");
    mechanicalRelations.attacksDependency?.push("graveyard_dependent");
  }
  if (answerCapabilities.some((d) => d.dimension === "counterspell" && d.score > 0)) {
    mechanicalRelations.canDisrupt?.push("spell_chain_dependent");
    mechanicalRelations.bypassesDefense?.push("counterspell");
  }
  if (answerCapabilities.some((d) => d.dimension === "board_reset" && d.score > 0)) {
    mechanicalRelations.canAnswer?.push("battlefield_dependent");
  }
  if (answerCapabilities.some((d) => d.dimension === "artifact_interaction" && d.score > 0)) {
    mechanicalRelations.canExploit?.push("artifact_dependent");
  }

  return {
    oracleId,
    profileVersion: CARD_INTERACTION_PROFILE_VERSION,
    semanticVersion,
    parserVersion,
    parserBlobClosure: input.parserBlobClosure ?? RC8_PARSER_BLOB_CLOSURE,
    paperPopulationHash: PAPER_POPULATION_HASH,
    generatedAt: new Date().toISOString(),
    threatCapabilities,
    answerCapabilities,
    resourceGeneration,
    dependencies,
    vulnerabilities,
    zonesUsed,
    objectsAffected,
    timingProfile,
    targetPredicates,
    mechanicalRelations,
  };
}

function dimensionScore(dims: ScoredInteractionDimension[], key: string): number {
  return dims.find((d) => d.dimension === key)?.score ?? 0;
}

/** Mechanical pressure(A→B) — NOT "A beats B". */
export function computeMechanicalPressure(
  attacker: Pick<CardInteractionProfile, "answerCapabilities">,
  defender: Pick<CardInteractionProfile, "dependencies" | "vulnerabilities">,
): number {
  const pairs: Array<[string, string]> = [
    ["graveyard_disruption", "graveyard_dependent"],
    ["counterspell", "spell_chain_dependent"],
    ["board_reset", "battlefield_dependent"],
    ["artifact_interaction", "artifact_dependent"],
    ["creature_removal", "creature_dependent"],
    ["resource_denial", "library_search_dependent"],
  ];
  let score = 0;
  for (const [answerKey, depKey] of pairs) {
    score +=
      dimensionScore(attacker.answerCapabilities, answerKey) *
      Math.max(
        dimensionScore(defender.dependencies, depKey),
        dimensionScore(defender.vulnerabilities, depKey.replace("_dependent", "_vulnerable")),
      );
  }
  return score;
}

export function scoredDimensionsToVector(dims: ScoredInteractionDimension[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of dims) out[d.dimension] = d.score;
  return out;
}
