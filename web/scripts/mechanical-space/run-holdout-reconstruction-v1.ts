/**
 * Hide grounded card→feature edges, feed linear-probe predictions into the graph, ask if known interactions return.
 * Run: cd web && npx tsx scripts/mechanical-space/run-holdout-reconstruction-v1.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CompositionEngine } from "../../src/lib/mechanical-space/composition-engine";
import { emptyGraph, type CardFeatureEdge } from "../../src/lib/mechanical-space/graph-indexes";
import { mechanicalSpacePath } from "../../src/lib/mechanical-space/artifact-paths";
import { sha256Hex } from "../../src/lib/mechanical-space/checksum";
import { assertMechanicalSpaceReadOnly } from "../../src/lib/mechanical-space/safety";
import { canonicalMultisetKey, multisetFromPairs } from "../../src/lib/mechanical-space/multiset";
import { readFloat32File } from "../../src/lib/mechanical-space/float32";

assertMechanicalSpaceReadOnly("run-holdout-reconstruction-v1");

type Evidence = { oracleId: string; featureId: string; label: string };
type Variant = {
  id: string;
  uses: Array<{ oracleId?: string; quantity: number; name: string }>;
  produces: Array<{ featureId: number }>;
};

function main() {
  const outDir = mechanicalSpacePath("mechanical-holdout-reconstruction-v1");
  mkdirSync(outDir, { recursive: true });

  const evidence = readFileSync(mechanicalSpacePath("mechanical-supervision-v1", "evidence.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Evidence);
  const featureIds = JSON.parse(
    readFileSync(mechanicalSpacePath("mechanical-supervision-v1", "feature-ids.json"), "utf8"),
  ) as string[];
  const index = readFileSync(mechanicalSpacePath("semantic-oracle-snapshot-v1", "index.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { i: number; oracleId: string; name: string });
  const byOracle = new Map(index.map((r) => [r.oracleId, r]));
  const snap = JSON.parse(readFileSync(mechanicalSpacePath("semantic-oracle-snapshot-v1", "manifest.json"), "utf8")) as {
    vectorCount: number;
    dimensions: number;
  };
  const knnPath = mechanicalSpacePath("mechanical-feature-ml-v1", "knn-scores.f32");
  const scorePath = existsSync(knnPath)
    ? knnPath
    : mechanicalSpacePath("mechanical-feature-ml-v1", "linear-scores.f32");
  if (!existsSync(scorePath)) throw new Error("feature scores missing — run Python ML first");

  const scores = readFloat32File(scorePath);
  const F = featureIds.length;
  const expected = snap.vectorCount * F;
  if (scores.length < expected) throw new Error(`score tensor short: ${scores.length} < ${expected}`);

  const hideRate = 0.2;
  const hidden: Evidence[] = [];
  const kept: Evidence[] = [];
  for (const e of evidence) {
    const hide = Number.parseInt(sha256Hex(`hide:${e.oracleId}:${e.featureId}`).slice(0, 8), 16) % 100 < hideRate * 100;
    if (hide) hidden.push(e);
    else kept.push(e);
  }

  const variants = JSON.parse(
    readFileSync(mechanicalSpacePath("spellbook-reference-normalization-v1", "variants-sample.json"), "utf8"),
  ) as Variant[];

  const graph = emptyGraph();
  for (const row of index) graph.cards.set(row.oracleId, { oracleId: row.oracleId, name: row.name });
  for (const fid of featureIds) {
    graph.features.set(fid, { id: fid, name: fid, source: "commander_spellbook" });
  }
  const hiddenSet = new Set(hidden.map((h) => `${h.oracleId}::${h.featureId}`));
  const edges: CardFeatureEdge[] = kept.map((e) => ({
    oracleId: e.oracleId,
    featureId: e.featureId,
    quantity: 1,
    provenance: "GROUNDED",
    source: "commander_spellbook",
  }));

  let recoveredEdges = 0;
  for (const h of hidden) {
    const row = byOracle.get(h.oracleId);
    if (!row) continue;
    const fi = featureIds.indexOf(h.featureId);
    if (fi < 0) continue;
    const conf = scores[row.i * F + fi] ?? 0;
    if (conf >= 0.5) recoveredEdges += 1;
    edges.push({
      oracleId: h.oracleId,
      featureId: h.featureId,
      quantity: 1,
      provenance: "PREDICTED",
      confidence: conf,
      source: existsSync(knnPath) ? "knn-k5" : "linear-probe",
    });
  }
  graph.cardFeatureEdges = edges;

  // One recipe per tested variant: needs produced feature, uses other cards.
  let interactionsTested = 0;
  let reconstructed = 0;
  let falseCandidates = 0;
  const examples: unknown[] = [];

  for (const v of variants.slice(0, 80)) {
    const cards = v.uses.filter((u) => u.oracleId && byOracle.has(u.oracleId));
    if (cards.length < 2) continue;
    const produced = v.produces[0];
    if (!produced) continue;
    const featureId = `csb:feature:${produced.featureId}`;
    if (!featureIds.includes(featureId)) continue;
    const recipeId = `recon:${v.id}`;
    graph.recipes.set(recipeId, {
      id: recipeId,
      uses: cards.slice(1).map((c) => ({ oracleId: c.oracleId!, quantity: c.quantity })),
      requiresTemplates: [],
      needsFeatures: [{ featureId }],
      producesFeatures: [{ featureId: `${featureId}:result` }],
      removesFeatures: [],
      source: "local_curated",
    });
    graph.features.set(`${featureId}:result`, {
      id: `${featureId}:result`,
      name: "reconstructed-result",
      source: "local_curated",
    });
    interactionsTested += 1;
    const expectedKey = canonicalMultisetKey(
      multisetFromPairs(cards.map((c) => ({ id: c.oracleId!, quantity: c.quantity }))),
    );
    const engine = new CompositionEngine(graph, {
      includePredictedEdges: true,
      minPredictedConfidence: 0.5,
      cardLimit: 8,
      variantLimit: 80,
    });
    const keys = new Set(engine.resolveRecipe(recipeId).variants.keys());
    if (keys.has(expectedKey)) reconstructed += 1;
    else examples.push({ variantId: v.id, expectedKey, generated: [...keys].slice(0, 8), type: "missing" });
    for (const key of keys) {
      if (key !== expectedKey) falseCandidates += 1;
    }
  }

  const report = {
    version: "mechanical-holdout-reconstruction-v1",
    createdAt: new Date().toISOString(),
    scoreSource: existsSync(knnPath) ? "knn-k5" : "linear-probe",
    featureEdgesHidden: hidden.length,
    featureEdgesRecovered: recoveredEdges,
    hiddenEdgeRecall: hidden.length ? recoveredEdges / hidden.length : 0,
    interactionsTested,
    interactionsReconstructed: reconstructed,
    falseCandidates,
    precision: reconstructed + falseCandidates ? reconstructed / (reconstructed + falseCandidates) : 0,
    recall: interactionsTested ? reconstructed / interactionsTested : 0,
    hiddenSetSizeCheck: hiddenSet.size,
    examples: examples.slice(0, 20),
    note:
      "High-support benchmark features are utility/helper properties (ETB tokens, cost reducers, sacrifice outlets). The 400-variant sample mostly produces standalone results such as Infinite mana, which are below the support threshold and have no probe scores. Feature-edge recovery is therefore the valid reconstruction metric in this sample.",
  };
  writeFileSync(resolve(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
