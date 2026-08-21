import type { CardTemplate, InteractionRecipe, MechanicalFeature, OracleCardRef } from "./types";

export type CardFeatureEdge = {
  oracleId: string;
  featureId: string;
  quantity: number;
  provenance: "GROUNDED" | "PREDICTED" | "RULE_DERIVED";
  confidence?: number;
  source: string;
  externalId?: string;
};

export type MechanicalGraph = {
  features: Map<string, MechanicalFeature>;
  cards: Map<string, OracleCardRef>;
  templates: Map<string, CardTemplate>;
  recipes: Map<string, InteractionRecipe>;
  cardFeatureEdges: CardFeatureEdge[];
};

export type MechanicalGraphIndexes = {
  featureToCardProviders: Map<string, CardFeatureEdge[]>;
  featureToRecipeProviders: Map<string, InteractionRecipe[]>;
  featureToRecipeConsumers: Map<string, InteractionRecipe[]>;
  cardToRecipes: Map<string, InteractionRecipe[]>;
  templateToRecipes: Map<string, InteractionRecipe[]>;
  recipeProducedFeatures: Map<string, string[]>;
  recipeNeededFeatures: Map<string, string[]>;
};

function pushMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

export function buildGraphIndexes(graph: MechanicalGraph): MechanicalGraphIndexes {
  const featureToCardProviders = new Map<string, CardFeatureEdge[]>();
  const featureToRecipeProviders = new Map<string, InteractionRecipe[]>();
  const featureToRecipeConsumers = new Map<string, InteractionRecipe[]>();
  const cardToRecipes = new Map<string, InteractionRecipe[]>();
  const templateToRecipes = new Map<string, InteractionRecipe[]>();
  const recipeProducedFeatures = new Map<string, string[]>();
  const recipeNeededFeatures = new Map<string, string[]>();

  for (const edge of graph.cardFeatureEdges) {
    pushMap(featureToCardProviders, edge.featureId, edge);
  }

  for (const recipe of graph.recipes.values()) {
    const produced = recipe.producesFeatures.map((f) => f.featureId);
    const needed = recipe.needsFeatures.map((f) => f.featureId);
    recipeProducedFeatures.set(recipe.id, produced);
    recipeNeededFeatures.set(recipe.id, needed);
    for (const featureId of produced) pushMap(featureToRecipeProviders, featureId, recipe);
    for (const featureId of needed) pushMap(featureToRecipeConsumers, featureId, recipe);
    for (const use of recipe.uses) pushMap(cardToRecipes, use.oracleId, recipe);
    for (const req of recipe.requiresTemplates) pushMap(templateToRecipes, req.templateId, recipe);
  }

  return {
    featureToCardProviders,
    featureToRecipeProviders,
    featureToRecipeConsumers,
    cardToRecipes,
    templateToRecipes,
    recipeProducedFeatures,
    recipeNeededFeatures,
  };
}

export function emptyGraph(): MechanicalGraph {
  return {
    features: new Map(),
    cards: new Map(),
    templates: new Map(),
    recipes: new Map(),
    cardFeatureEdges: [],
  };
}
