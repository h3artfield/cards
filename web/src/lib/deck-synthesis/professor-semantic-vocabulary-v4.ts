/**
 * Semantic research vocabulary v4 — generic relation/query concepts, not an exhaustive ontology.
 */
export const PROFESSOR_SEMANTIC_VOCABULARY_V4_VERSION = "professor-semantic-vocabulary-v4";

export const SEMANTIC_RELATION_V4 = [
  "PRODUCES",
  "CONSUMES",
  "REQUIRES",
  "TRIGGERS_ON",
  "AMPLIFIES",
  "CONVERTS",
  "RESETS",
  "MOVES_ZONE",
  "ENTERS_ZONE",
  "LEAVES_ZONE",
  "CREATES_TOKEN",
  "MODIFIES_TOKEN_CREATION",
  "SACRIFICES",
  "DIES",
  "ADDS_COUNTER",
  "REMOVES_COUNTER",
  "GENERATES_MANA",
  "DRAWS",
  "DISCARDS",
  "MILLS",
  "EXILES",
  "RETURNS_FROM",
  "CASTS_FROM",
  "COPIES",
  "REDUCES_COST",
] as const;

export type SemanticRelationV4 = (typeof SEMANTIC_RELATION_V4)[number];

export type SemanticQueryV4 = {
  relation: SemanticRelationV4;
  subject?: string;
  object?: string;
  context?: string;
};

export type SemanticQueryResultV4 = {
  query: SemanticQueryV4;
  matches: string[];
  mechanicalBasis: string;
};

/** Demonstration queries — producer→consumer, event→payoff, zone transition→beneficiary, etc. */
export const DEMONSTRATION_SEMANTIC_QUERIES_V4: SemanticQueryV4[] = [
  { relation: "PRODUCES", subject: "creature_dies", object: "experience_counter" },
  { relation: "CONSUMES", subject: "recursion_effect", object: "graveyard_creature" },
  { relation: "TRIGGERS_ON", subject: "end_step", object: "experience_threshold" },
  { relation: "CREATES_TOKEN", subject: "token_event", object: "creature_token" },
  { relation: "MODIFIES_TOKEN_CREATION", subject: "replacement_effect", object: "additional_resource" },
  { relation: "MOVES_ZONE", subject: "creature", object: "graveyard_to_battlefield" },
  { relation: "SACRIFICES", subject: "outlet", object: "creature_token" },
  { relation: "CONVERTS", subject: "death_resource", object: "mana_or_draw" },
];

export function relationLabelV4(relation: SemanticRelationV4): string {
  return relation.replace(/_/g, " ").toLowerCase();
}
