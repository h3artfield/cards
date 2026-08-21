/**
 * Propose candidate interactions from predicted features. Candidates, not claimed combos.
 * Run: cd web && npx tsx scripts/mechanical-space/run-candidate-generation-v1.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CompositionEngine } from "../../src/lib/mechanical-space/composition-engine";
import { emptyGraph } from "../../src/lib/mechanical-space/graph-indexes";
import { mechanicalSpacePath } from "../../src/lib/mechanical-space/artifact-paths";
import { DeterministicGraphVerifier } from "../../src/lib/mechanical-space/verifier";
import { assertMechanicalSpaceReadOnly } from "../../src/lib/mechanical-space/safety";
import { readFloat32File } from "../../src/lib/mechanical-space/float32";

assertMechanicalSpaceReadOnly("run-candidate-generation-v1");

type IndexRow = { i: number; oracleId: string; name: string; typeLine?: string };
type KnownVariant = {
  id: string;
  uses: Array<{ oracleId?: string; quantity: number }>;
  produces: Array<{ featureId: number; name: string }>;
};

function main() {
  const outDir = mechanicalSpacePath("mechanical-novel-candidates-v1");
  mkdirSync(outDir, { recursive: true });
  const reviewsDir = mechanicalSpacePath("local-reviews");
  mkdirSync(reviewsDir, { recursive: true });

  const featureIds = JSON.parse(
    readFileSync(mechanicalSpacePath("mechanical-supervision-v1", "feature-ids.json"), "utf8"),
  ) as string[];
  const bench = JSON.parse(
    readFileSync(mechanicalSpacePath("mechanical-supervision-v1", "benchmark-features.json"), "utf8"),
  ) as Array<{ featureId: string; name: string }>;
  const nameByFeature = new Map(bench.map((b) => [b.featureId, b.name]));
  const index = readFileSync(mechanicalSpacePath("semantic-oracle-snapshot-v1", "index.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as IndexRow);
  const snap = JSON.parse(readFileSync(mechanicalSpacePath("semantic-oracle-snapshot-v1", "manifest.json"), "utf8")) as {
    vectorCount: number;
  };
  const knnPath = mechanicalSpacePath("mechanical-feature-ml-v1", "knn-scores.f32");
  const scorePath = existsSync(knnPath)
    ? knnPath
    : mechanicalSpacePath("mechanical-feature-ml-v1", "linear-scores.f32");
  if (!existsSync(scorePath)) throw new Error("Need ML scores first");
  const scores = readFloat32File(scorePath);
  const F = featureIds.length;

  const evidence = new Set(
    readFileSync(mechanicalSpacePath("mechanical-supervision-v1", "evidence.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const e = JSON.parse(l) as { oracleId: string; featureId: string };
        return `${e.oracleId}::${e.featureId}`;
      }),
  );

  const variants = JSON.parse(
    readFileSync(mechanicalSpacePath("spellbook-reference-normalization-v1", "variants-sample.json"), "utf8"),
  ) as KnownVariant[];
  const knownKeys = new Set(
    variants.map((v) =>
      v.uses
        .map((u) => u.oracleId)
        .filter(Boolean)
        .sort()
        .join("|"),
    ),
  );

  const graph = emptyGraph();
  for (const row of index) graph.cards.set(row.oracleId, { oracleId: row.oracleId, name: row.name });
  for (const fid of featureIds) {
    graph.features.set(fid, { id: fid, name: nameByFeature.get(fid) ?? fid, source: "commander_spellbook" });
  }

  // Grounded positives
  for (const key of evidence) {
    const [oracleId, featureId] = key.split("::");
    graph.cardFeatureEdges.push({
      oracleId,
      featureId,
      quantity: 1,
      provenance: "GROUNDED",
      source: "commander_spellbook",
    });
  }

  // High-confidence predicted unseen edges
  const predictedUnseen: Array<{ oracleId: string; featureId: string; confidence: number }> = [];
  for (const row of index) {
    for (let fi = 0; fi < F; fi++) {
      const featureId = featureIds[fi];
      const key = `${row.oracleId}::${featureId}`;
      if (evidence.has(key)) continue;
      const conf = scores[row.i * F + fi] ?? 0;
      if (conf >= 0.9) {
        predictedUnseen.push({ oracleId: row.oracleId, featureId, confidence: conf });
        graph.cardFeatureEdges.push({
          oracleId: row.oracleId,
          featureId,
          quantity: 1,
          provenance: "PREDICTED",
          confidence: conf,
          source: "linear-probe",
        });
      }
    }
  }

  // Simple two-feature recipes from top standalone-ish features: need F + a second card producing G
  const topFeatures = bench.slice(0, 12).map((b) => b.featureId);
  for (let i = 0; i < topFeatures.length; i++) {
    for (let j = i + 1; j < Math.min(topFeatures.length, i + 4); j++) {
      const a = topFeatures[i];
      const b = topFeatures[j];
      const id = `cand:${a}+${b}`;
      graph.recipes.set(id, {
        id,
        uses: [],
        requiresTemplates: [],
        needsFeatures: [{ featureId: a }, { featureId: b }],
        producesFeatures: [{ featureId: `pair:${a}+${b}` }],
        removesFeatures: [],
        source: "semantic_predicted",
      });
      graph.features.set(`pair:${a}+${b}`, {
        id: `pair:${a}+${b}`,
        name: `${nameByFeature.get(a)} + ${nameByFeature.get(b)}`,
        source: "semantic_predicted",
      });
    }
  }

  const engine = new CompositionEngine(graph, {
    includePredictedEdges: true,
    minPredictedConfidence: 0.9,
    cardLimit: 3,
    variantLimit: 40,
    maxDepth: 4,
  });
  const verifier = new DeterministicGraphVerifier(graph);
  const candidates: Array<Record<string, unknown>> = [];

  for (const recipe of graph.recipes.values()) {
    if (!recipe.id.startsWith("cand:")) continue;
    const concretes = engine.concreteInteractionsForRecipe(recipe.id);
    for (const c of concretes.slice(0, 8)) {
      const key = c.cards
        .map((x) => x.oracleId)
        .sort()
        .join("|");
      const predicted = c.proof.some((p) => JSON.stringify(p).includes("PREDICTED"));
      let cls: string = "POSSIBLE_NOVEL";
      if (knownKeys.has(key)) cls = predicted ? "REDISCOVERED_REFERENCE" : "KNOWN_REFERENCE";
      const v = verifier.verify(c);
      if (!v.ok) cls = "INVALID";
      const minConf = c.cards.reduce((m, card) => {
        const edge = graph.cardFeatureEdges.find((e) => e.oracleId === card.oracleId && e.provenance === "PREDICTED");
        return Math.min(m, edge?.confidence ?? 1);
      }, 1);
      if (minConf < 0.9 && predicted) cls = "UNCERTAIN";
      candidates.push({
        id: c.id,
        classification: cls,
        cards: c.cards.map((card) => ({
          oracleId: card.oracleId,
          name: graph.cards.get(card.oracleId)?.name,
          quantity: card.quantity,
        })),
        recipeId: c.recipeId,
        proof: c.proof,
        predicted,
        confidence: minConf,
        known: knownKeys.has(key),
        verifier: v,
      });
    }
  }

  const byClass = {
    highConfidence: candidates.filter((c) => c.classification === "POSSIBLE_NOVEL" && (c.confidence as number) >= 0.95).slice(0, 15),
    mediumConfidence: candidates.filter((c) => c.classification === "UNCERTAIN").slice(0, 15),
    rediscovered: candidates.filter((c) => c.classification === "REDISCOVERED_REFERENCE").slice(0, 10),
    invalid: candidates.filter((c) => c.classification === "INVALID").slice(0, 10),
  };

  const report = {
    version: "mechanical-novel-candidates-v1",
    createdAt: new Date().toISOString(),
    disclaimer: "Candidates are not verified combos. Do not present as factual interactions.",
    predictedUnseenEdges: predictedUnseen.length,
    candidatesGenerated: candidates.length,
    graphStats: engine.stats,
    cycles: engine.cycles.slice(0, 20),
    snapshotCards: snap.vectorCount,
    byClassCounts: {
      KNOWN_REFERENCE: candidates.filter((c) => c.classification === "KNOWN_REFERENCE").length,
      REDISCOVERED_REFERENCE: candidates.filter((c) => c.classification === "REDISCOVERED_REFERENCE").length,
      POSSIBLE_NOVEL: candidates.filter((c) => c.classification === "POSSIBLE_NOVEL").length,
      INVALID: candidates.filter((c) => c.classification === "INVALID").length,
      UNCERTAIN: candidates.filter((c) => c.classification === "UNCERTAIN").length,
    },
    examples: byClass,
  };
  writeFileSync(resolve(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(outDir, "candidates.jsonl"), candidates.map((c) => JSON.stringify(c)).join("\n") + "\n");
  writeFileSync(
    resolve(reviewsDir, "queue.json"),
    `${JSON.stringify({ version: "local-review-queue-v1", productionWrites: false, items: candidates.slice(0, 50) }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ ...report, examples: undefined }, null, 2));
}

main();
