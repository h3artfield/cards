import { buildGraphIndexes, type MechanicalGraph, type MechanicalGraphIndexes } from "./graph-indexes";
import { MinimalMultisetSet } from "./minimality";
import {
  addToMultiset,
  canonicalMultisetKey,
  emptyMultiset,
  mergeMultisets,
  multisetFromPairs,
  multisetQuantity,
  pairsFromMultiset,
  type Multiset,
} from "./multiset";
import type { ConcreteInteraction, InteractionProofNode, InteractionRecipe } from "./types";

export type CompositionEngineOptions = {
  cardLimit?: number;
  variantLimit?: number;
  maxDepth?: number;
  includePredictedEdges?: boolean;
  minPredictedConfidence?: number;
};

export type CycleRecord = {
  path: string[];
  cutAt: string;
};

export type CompositionStats = {
  candidatesConsidered: number;
  candidatesPruned: number;
  minimalVariantsRetained: number;
  cyclesEncountered: number;
  cyclesCut: number;
  maximumRecursionDepth: number;
  elapsedMs: number;
};

export type FeatureResolution = {
  featureId: string;
  variants: MinimalMultisetSet;
  proofs: Map<string, InteractionProofNode>;
};

const DEFAULT_OPTIONS: Required<CompositionEngineOptions> = {
  cardLimit: 6,
  variantLimit: 250,
  maxDepth: 12,
  includePredictedEdges: false,
  minPredictedConfidence: 0.85,
};

export class CompositionEngine {
  readonly indexes: MechanicalGraphIndexes;
  readonly stats: CompositionStats = {
    candidatesConsidered: 0,
    candidatesPruned: 0,
    minimalVariantsRetained: 0,
    cyclesEncountered: 0,
    cyclesCut: 0,
    maximumRecursionDepth: 0,
    elapsedMs: 0,
  };
  readonly cycles: CycleRecord[] = [];

  private readonly options: Required<CompositionEngineOptions>;
  private readonly featureCache = new Map<string, FeatureResolution>();
  private readonly recipeCache = new Map<string, FeatureResolution>();

  constructor(
    readonly graph: MechanicalGraph,
    options: CompositionEngineOptions = {},
  ) {
    this.indexes = buildGraphIndexes(graph);
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  resolveFeature(featureId: string): FeatureResolution {
    const started = Date.now();
    const result = this.resolveFeatureInner(featureId, [], 0);
    this.stats.elapsedMs += Date.now() - started;
    this.stats.minimalVariantsRetained = result.variants.size;
    return result;
  }

  resolveRecipe(recipeId: string): FeatureResolution {
    const started = Date.now();
    const result = this.resolveRecipeInner(recipeId, [], 0);
    this.stats.elapsedMs += Date.now() - started;
    this.stats.minimalVariantsRetained = result.variants.size;
    return result;
  }

  concreteInteractionsForRecipe(recipeId: string): ConcreteInteraction[] {
    const resolved = this.resolveRecipe(recipeId);
    return resolved.variants.keys().map((key) => {
      const ms = resolved.variants.get(key)!;
      const cards: Array<{ oracleId: string; quantity: number }> = [];
      const templates: Array<{ templateId: string; quantity: number }> = [];
      for (const { id, quantity } of pairsFromMultiset(ms)) {
        if (id.startsWith("template:")) templates.push({ templateId: id.slice("template:".length), quantity });
        else cards.push({ oracleId: id, quantity });
      }
      const recipe = this.graph.recipes.get(recipeId);
      return {
        id: `${recipeId}::${key}`,
        recipeId,
        cards,
        templates,
        producedFeatures: recipe?.producesFeatures.map((f) => f.featureId) ?? [],
        proof: resolved.proofs.get(key) ? [resolved.proofs.get(key)!] : [],
        minimal: true,
        source: "deterministic_reconstruction",
      };
    });
  }

  private resolveFeatureInner(featureId: string, stack: string[], depth: number): FeatureResolution {
    this.stats.maximumRecursionDepth = Math.max(this.stats.maximumRecursionDepth, depth);
    const cached = this.featureCache.get(featureId);
    if (cached) return cached;

    const nodeKey = `feature:${featureId}`;
    if (stack.includes(nodeKey)) {
      this.stats.cyclesEncountered += 1;
      this.stats.cyclesCut += 1;
      this.cycles.push({ path: [...stack, nodeKey], cutAt: nodeKey });
      return { featureId, variants: new MinimalMultisetSet(), proofs: new Map() };
    }
    if (depth >= this.options.maxDepth) {
      return { featureId, variants: new MinimalMultisetSet(), proofs: new Map() };
    }

    const variants = new MinimalMultisetSet();
    const proofs = new Map<string, InteractionProofNode>();
    const nextStack = [...stack, nodeKey];

    const cardEdges = (this.indexes.featureToCardProviders.get(featureId) ?? []).filter((edge) => {
      if (edge.provenance === "PREDICTED") {
        if (!this.options.includePredictedEdges) return false;
        if ((edge.confidence ?? 0) < this.options.minPredictedConfidence) return false;
      }
      return true;
    });

    for (const edge of cardEdges) {
      this.stats.candidatesConsidered += 1;
      const ms = emptyMultiset();
      addToMultiset(ms, edge.oracleId, edge.quantity);
      if (multisetQuantity(ms) > this.options.cardLimit) {
        this.stats.candidatesPruned += 1;
        continue;
      }
      const result = variants.insert(ms);
      if (result === "discarded_superset") this.stats.candidatesPruned += 1;
      const key = canonicalMultisetKey(ms);
      if (!proofs.has(key)) {
        const card = this.graph.cards.get(edge.oracleId);
        proofs.set(key, {
          nodeType: "card",
          id: edge.oracleId,
          name: card?.name,
          relation: "provides",
          provenance: edge.provenance,
          confidence: edge.confidence,
        });
      }
    }

    for (const recipe of this.indexes.featureToRecipeProviders.get(featureId) ?? []) {
      const child = this.resolveRecipeInner(recipe.id, nextStack, depth + 1);
      for (const ms of child.variants.values()) {
        this.stats.candidatesConsidered += 1;
        if (multisetQuantity(ms) > this.options.cardLimit) {
          this.stats.candidatesPruned += 1;
          continue;
        }
        const result = variants.insert(ms);
        if (result === "discarded_superset") this.stats.candidatesPruned += 1;
        const key = canonicalMultisetKey(ms);
        if (!proofs.has(key) && child.proofs.has(key)) {
          proofs.set(key, child.proofs.get(key)!);
        }
      }
      if (variants.size >= this.options.variantLimit) break;
    }

    const resolved = { featureId, variants, proofs };
    this.featureCache.set(featureId, resolved);
    return resolved;
  }

  private resolveRecipeInner(recipeId: string, stack: string[], depth: number): FeatureResolution {
    this.stats.maximumRecursionDepth = Math.max(this.stats.maximumRecursionDepth, depth);
    const cached = this.recipeCache.get(recipeId);
    if (cached) return cached;

    const recipe = this.graph.recipes.get(recipeId);
    if (!recipe) return { featureId: recipeId, variants: new MinimalMultisetSet(), proofs: new Map() };

    const nodeKey = `recipe:${recipeId}`;
    if (stack.includes(nodeKey)) {
      this.stats.cyclesEncountered += 1;
      this.stats.cyclesCut += 1;
      this.cycles.push({ path: [...stack, nodeKey], cutAt: nodeKey });
      return { featureId: recipeId, variants: new MinimalMultisetSet(), proofs: new Map() };
    }
    if (depth >= this.options.maxDepth) {
      return { featureId: recipeId, variants: new MinimalMultisetSet(), proofs: new Map() };
    }

    const nextStack = [...stack, nodeKey];
    const parts: FeatureResolution[] = [];

    const base = emptyMultiset();
    for (const use of recipe.uses) addToMultiset(base, use.oracleId, use.quantity);
    for (const req of recipe.requiresTemplates) {
      const template = this.graph.templates.get(req.templateId);
      if (template?.explicitOracleIds?.length) {
        parts.push(this.templateAsOr(template.id, template.explicitOracleIds, req.quantity));
      } else {
        addToMultiset(base, `template:${req.templateId}`, req.quantity);
      }
    }

    if (multisetQuantity(base) > 0) {
      const baseSet = new MinimalMultisetSet();
      baseSet.insert(base);
      const proofs = new Map<string, InteractionProofNode>();
      proofs.set(canonicalMultisetKey(base), this.recipeProof(recipe, canonicalMultisetKey(base), []));
      parts.unshift({ featureId: recipe.id, variants: baseSet, proofs });
    }

    for (const need of recipe.needsFeatures) {
      parts.push(this.resolveFeatureInner(need.featureId, nextStack, depth + 1));
    }

    const composed = this.andCompose(parts, recipe);
    this.recipeCache.set(recipeId, composed);
    return composed;
  }

  private templateAsOr(templateId: string, oracleIds: string[], quantity: number): FeatureResolution {
    const variants = new MinimalMultisetSet();
    const proofs = new Map<string, InteractionProofNode>();
    for (const oracleId of oracleIds) {
      const ms = emptyMultiset();
      addToMultiset(ms, oracleId, quantity);
      variants.insert(ms);
      proofs.set(canonicalMultisetKey(ms), {
        nodeType: "template",
        id: templateId,
        relation: "requires",
        provenance: "GROUNDED",
        children: [{ nodeType: "card", id: oracleId, relation: "provides", provenance: "GROUNDED" }],
      });
    }
    return { featureId: templateId, variants, proofs };
  }

  private andCompose(parts: FeatureResolution[], recipe: InteractionRecipe): FeatureResolution {
    let acc: Array<{ ms: Multiset; proofs: InteractionProofNode[] }> = [{ ms: emptyMultiset(), proofs: [] }];

    for (const part of parts) {
      const keys = part.variants.keys();
      if (keys.length === 0) {
        return { featureId: recipe.id, variants: new MinimalMultisetSet(), proofs: new Map() };
      }
      const next: typeof acc = [];
      for (const left of acc) {
        for (const key of keys) {
          this.stats.candidatesConsidered += 1;
          const right = part.variants.get(key)!;
          const merged = mergeMultisets(left.ms, right);
          if (multisetQuantity(merged) > this.options.cardLimit) {
            this.stats.candidatesPruned += 1;
            continue;
          }
          const childProof = part.proofs.get(key);
          next.push({
            ms: merged,
            proofs: childProof ? [...left.proofs, childProof] : left.proofs,
          });
          if (next.length >= this.options.variantLimit) break;
        }
        if (next.length >= this.options.variantLimit) break;
      }
      acc = next;
    }

    const variants = new MinimalMultisetSet();
    const proofs = new Map<string, InteractionProofNode>();
    for (const item of acc) {
      const result = variants.insert(item.ms);
      if (result === "discarded_superset") this.stats.candidatesPruned += 1;
      const key = canonicalMultisetKey(item.ms);
      if (!proofs.has(key)) proofs.set(key, this.recipeProof(recipe, key, item.proofs));
    }
    return { featureId: recipe.id, variants, proofs };
  }

  private recipeProof(recipe: InteractionRecipe, key: string, children: InteractionProofNode[]): InteractionProofNode {
    return {
      nodeType: "recipe",
      id: recipe.id,
      name: recipe.name,
      relation: "produces",
      provenance: "GROUNDED",
      children: [
        ...children,
        ...recipe.producesFeatures.map((f) => ({
          nodeType: "feature" as const,
          id: f.featureId,
          relation: "produces" as const,
          provenance: "GROUNDED" as const,
        })),
      ],
    };
  }
}

export function cardOnlyVariant(oracleId: string, quantity = 1): Multiset {
  return multisetFromPairs([{ id: oracleId, quantity }]);
}
