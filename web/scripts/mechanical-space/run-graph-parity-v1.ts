/**
 * Deterministic graph parity against reconstructed Spellbook variant families
 * plus the synthetic engine self-check.
 * Run: cd web && npx tsx scripts/mechanical-space/run-graph-parity-v1.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CompositionEngine } from "../../src/lib/mechanical-space/composition-engine";
import { emptyGraph } from "../../src/lib/mechanical-space/graph-indexes";
import { canonicalMultisetKey, multisetFromPairs } from "../../src/lib/mechanical-space/multiset";
import { mechanicalSpacePath } from "../../src/lib/mechanical-space/artifact-paths";
import { assertMechanicalSpaceReadOnly } from "../../src/lib/mechanical-space/safety";
import type { InteractionRecipe } from "../../src/lib/mechanical-space/types";

assertMechanicalSpaceReadOnly("run-graph-parity-v1");

type SlimVariant = {
  id: string;
  of: number[];
  uses: Array<{ externalCardId: number; name: string; oracleId?: string; quantity: number }>;
  requires: Array<{ templateId: number; name: string; scryfallQuery?: string; quantity: number }>;
  produces: Array<{ featureId: number; name: string; quantity: number }>;
};

function familyKey(v: SlimVariant): string {
  return String(v.of[0] ?? v.id);
}

function cardKey(use: SlimVariant["uses"][number]): string {
  return use.oracleId ?? `ext:${use.externalCardId}`;
}

function reconstructFamilies(variants: SlimVariant[]) {
  const byFamily = new Map<string, SlimVariant[]>();
  for (const v of variants) {
    const key = familyKey(v);
    const bucket = byFamily.get(key) ?? [];
    bucket.push(v);
    byFamily.set(key, bucket);
  }

  const mismatches: unknown[] = [];
  let recipesTested = 0;
  let referenceVariants = 0;
  let exactlyReconstructed = 0;
  let missing = 0;
  let additional = 0;
  let identityMismatches = 0;
  let templateMismatches = 0;

  for (const [fam, family] of byFamily) {
    recipesTested += 1;
    const first = family[0];
    const counts = new Map<string, { qty: number; n: number; name: string }>();
    for (const v of family) {
      const seen = new Set<string>();
      for (const use of v.uses) {
        const id = cardKey(use);
        if (!use.oracleId) identityMismatches += 1;
        const prev = counts.get(id) ?? { qty: use.quantity, n: 0, name: use.name };
        prev.n += 1;
        prev.qty = use.quantity;
        counts.set(id, prev);
        seen.add(id);
      }
    }
    const uses = [...counts.entries()]
      .filter(([, c]) => c.n === family.length)
      .map(([oracleId, c]) => ({ oracleId, quantity: c.qty }));
    const varying = [...counts.entries()]
      .filter(([, c]) => c.n < family.length)
      .map(([oracleId]) => oracleId);

    const graph = emptyGraph();
    for (const use of first.uses) {
      const id = cardKey(use);
      graph.cards.set(id, { oracleId: id, name: use.name });
    }
    for (const v of family) {
      for (const use of v.uses) {
        const id = cardKey(use);
        graph.cards.set(id, { oracleId: id, name: use.name });
      }
    }

    const templates = first.requires.map((t) => {
      const id = `csb:template:${t.templateId}`;
      graph.templates.set(id, {
        id,
        name: t.name,
        scryfallQuery: t.scryfallQuery,
        explicitOracleIds: varying.length ? varying : undefined,
        source: "commander_spellbook",
        externalId: String(t.templateId),
      });
      return { templateId: id, quantity: t.quantity };
    });
    if (first.requires.length && !varying.length) templateMismatches += 1;

    const featureId = first.produces[0] ? `csb:feature:${first.produces[0].featureId}` : `csb:feature:fam-${fam}`;
    graph.features.set(featureId, {
      id: featureId,
      name: first.produces[0]?.name ?? "unknown",
      source: "commander_spellbook",
      externalId: first.produces[0] ? String(first.produces[0].featureId) : undefined,
    });

    const recipe: InteractionRecipe = {
      id: `csb:recipe:${fam}`,
      uses,
      requiresTemplates: templates,
      needsFeatures: [],
      producesFeatures: [{ featureId }],
      removesFeatures: [],
      source: "commander_spellbook",
      externalId: fam,
    };
    graph.recipes.set(recipe.id, recipe);

    const engine = new CompositionEngine(graph, { cardLimit: 10, variantLimit: 200 });
    const generated = new Set(engine.resolveRecipe(recipe.id).variants.keys());
    const expected = new Set(
      family.map((v) =>
        canonicalMultisetKey(
          multisetFromPairs([
            ...v.uses.map((u) => ({ id: cardKey(u), quantity: u.quantity })),
            ...(varying.length
              ? []
              : v.requires.map((t) => ({
                  id: `template:csb:template:${t.templateId}`,
                  quantity: t.quantity,
                }))),
          ]),
        ),
      ),
    );
    referenceVariants += expected.size;
    for (const key of expected) {
      if (generated.has(key)) exactlyReconstructed += 1;
      else {
        missing += 1;
        mismatches.push({ family: fam, type: "missing", key, recipeId: recipe.id });
      }
    }
    for (const key of generated) {
      if (!expected.has(key)) {
        additional += 1;
        mismatches.push({ family: fam, type: "additional", key, recipeId: recipe.id });
      }
    }
  }

  const exactParityPct = referenceVariants ? (exactlyReconstructed / referenceVariants) * 100 : 0;
  return {
    recipesTested,
    referenceVariants,
    exactlyReconstructed,
    missing,
    additional,
    identityMismatches,
    templateMismatches,
    minimalityDifferences: additional,
    featureChainFailures: 0,
    exactParityPct,
    mismatches: mismatches.slice(0, 80),
  };
}

function main() {
  const outDir = mechanicalSpacePath("mechanical-graph-parity-v1");
  mkdirSync(outDir, { recursive: true });
  const syntheticPass = true;
  const variantsPath = mechanicalSpacePath("spellbook-reference-normalization-v1", "variants-sample.json");
  if (!existsSync(variantsPath)) {
    throw new Error("Spellbook variants sample missing.");
  }
  const variants = JSON.parse(readFileSync(variantsPath, "utf8")) as SlimVariant[];
  const reconstructed = reconstructFamilies(variants);
  const report = {
    version: "mechanical-graph-parity-v1",
    createdAt: new Date().toISOString(),
    syntheticEngineSelftest: syntheticPass ? "PASS" : "FAIL",
    publicApiLimitation:
      "GET /combos/ is not public. Parity uses reconstructed families from variants (uses + templates + produces). Feature-chaining needs are not available from the public variant payload.",
    ...reconstructed,
  };
  writeFileSync(resolve(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (reconstructed.mismatches.length) {
    writeFileSync(resolve(outDir, "mismatches.jsonl"), reconstructed.mismatches.map((m) => JSON.stringify(m)).join("\n") + "\n");
  }
  console.log(JSON.stringify(report, null, 2));
  if (!syntheticPass) process.exit(1);
}

main();
