/**
 * Mechanical-space deterministic + label-semantics acceptance.
 * Run: cd web && npx tsx src/lib/mechanical-space/mechanical-space.selftest.ts
 */
import assert from "node:assert/strict";
import { checksumOracleVectors, assertFiniteVector } from "./checksum";
import { CompositionEngine } from "./composition-engine";
import { emptyGraph } from "./graph-indexes";
import {
  buildOracleIdentityIndex,
  mapExternalCard,
  normalizeCardName,
} from "./identity-mapping";
import {
  countLabelStates,
  createLabelMatrix,
  getLabel,
  maskedRegressionTarget,
  setLabel,
} from "./labels";
import { MinimalMultisetSet } from "./minimality";
import {
  canonicalMultisetKey,
  isSubmultiset,
  mergeMultisets,
  multisetFromPairs,
  parseCanonicalMultisetKey,
} from "./multiset";
import { DeterministicGraphVerifier } from "./verifier";
import type { InteractionRecipe, MechanicalFeature } from "./types";

function feature(id: string, name: string): MechanicalFeature {
  return { id, name, source: "local_curated" };
}

function recipe(partial: InteractionRecipe): InteractionRecipe {
  return partial;
}

function graphFixture() {
  const graph = emptyGraph();
  graph.cards.set("A", { oracleId: "A", name: "Card A" });
  graph.cards.set("B", { oracleId: "B", name: "Card B" });
  graph.cards.set("C", { oracleId: "C", name: "Card C" });
  graph.cards.set("D", { oracleId: "D", name: "Card D" });
  graph.features.set("F1", feature("F1", "Feature 1"));
  graph.features.set("F2", feature("F2", "Feature 2"));
  graph.features.set("INF", feature("INF", "Infinite Mana"));
  graph.templates.set("T1", {
    id: "T1",
    name: "Any mana rock",
    explicitOracleIds: ["B", "D"],
    source: "local_curated",
  });
  graph.cardFeatureEdges.push(
    { oracleId: "A", featureId: "F1", quantity: 1, provenance: "GROUNDED", source: "local" },
    { oracleId: "B", featureId: "F1", quantity: 1, provenance: "GROUNDED", source: "local" },
  );
  graph.recipes.set(
    "R1",
    recipe({
      id: "R1",
      name: "A or B plus C → F2",
      uses: [{ oracleId: "C", quantity: 1 }],
      requiresTemplates: [],
      needsFeatures: [{ featureId: "F1", quantity: 1 }],
      producesFeatures: [{ featureId: "F2", quantity: 1 }],
      removesFeatures: [],
      source: "local_curated",
    }),
  );
  graph.recipes.set(
    "R2",
    recipe({
      id: "R2",
      name: "F2 + C? wait F2 + extra C already in R1. Use D",
      uses: [{ oracleId: "D", quantity: 1 }],
      requiresTemplates: [],
      needsFeatures: [{ featureId: "F2", quantity: 1 }],
      producesFeatures: [{ featureId: "INF", quantity: 1 }],
      removesFeatures: [],
      source: "local_curated",
    }),
  );
  return graph;
}

function testMultisets(): void {
  const a = multisetFromPairs([
    { id: "oracleB", quantity: 1 },
    { id: "oracleA", quantity: 2 },
  ]);
  assert.equal(canonicalMultisetKey(a), "oracleA:2|oracleB:1");
  assert.deepEqual(canonicalMultisetKey(parseCanonicalMultisetKey("oracleA:2|oracleB:1")), "oracleA:2|oracleB:1");
  const aa = multisetFromPairs([
    { id: "A", quantity: 2 },
    { id: "B", quantity: 1 },
  ]);
  const ab = multisetFromPairs([
    { id: "A", quantity: 1 },
    { id: "B", quantity: 1 },
  ]);
  assert.equal(canonicalMultisetKey(aa) === canonicalMultisetKey(ab), false);
  assert.equal(isSubmultiset(ab, aa), true);
  assert.equal(isSubmultiset(aa, ab), false);
  const merged = mergeMultisets(aa, multisetFromPairs([{ id: "A", quantity: 1 }]));
  assert.equal(canonicalMultisetKey(merged), "A:3|B:1");
}

function testMinimality(): void {
  const msm = new MinimalMultisetSet();
  assert.equal(msm.insert(multisetFromPairs([{ id: "A", quantity: 1 }, { id: "B", quantity: 1 }])), "inserted");
  assert.equal(msm.insert(multisetFromPairs([{ id: "A", quantity: 1 }, { id: "B", quantity: 1 }, { id: "C", quantity: 1 }])), "discarded_superset");
  assert.equal(msm.size, 1);
  assert.equal(msm.insert(multisetFromPairs([{ id: "A", quantity: 1 }])), "replaced_supersets");
  assert.equal(msm.size, 1);
  assert.equal(msm.keys()[0], "A:1");
}

function testIdentity(): void {
  const index = buildOracleIdentityIndex([
    { oracleId: "oid-a", name: "Lightning Bolt" },
    { oracleId: "oid-b", name: "Giant Growth" },
    { oracleId: "oid-c1", name: "Fire // Ice" },
    { oracleId: "oid-c2", name: "Fire // Ice" },
  ]);
  const exactId = mapExternalCard({ externalId: "1", name: "Bolt", oracleId: "oid-a" }, index);
  assert.equal(exactId.classification, "EXACT_ID");
  assert.equal(exactId.oracleId, "oid-a");

  const exactName = mapExternalCard({ externalId: "2", name: "Giant Growth" }, index);
  assert.equal(exactName.classification, "EXACT_NAME_UNAMBIGUOUS");

  const normalized = mapExternalCard({ externalId: "3", name: "giant  growth" }, index);
  assert.equal(normalized.classification, "NORMALIZED_NAME_UNAMBIGUOUS");
  assert.equal(normalizeCardName("Giant Growth"), "giant growth");

  const ambiguous = mapExternalCard({ externalId: "4", name: "Fire // Ice" }, index);
  assert.equal(ambiguous.classification, "AMBIGUOUS");
  assert.equal(ambiguous.oracleId, undefined);

  const unresolved = mapExternalCard({ externalId: "5", name: "Not A Real Card" }, index);
  assert.equal(unresolved.classification, "UNRESOLVED");

  const missingId = mapExternalCard({ externalId: "6", name: "Ghost", oracleId: "missing" }, index);
  assert.equal(missingId.classification, "UNRESOLVED");
}

function testOrAndRecursionProof(): void {
  const engine = new CompositionEngine(graphFixture());
  const f1 = engine.resolveFeature("F1");
  const f1Keys = f1.variants.keys();
  assert.deepEqual(f1Keys.sort(), ["A:1", "B:1"]);

  const r1 = engine.resolveRecipe("R1");
  const r1Keys = r1.variants.keys().sort();
  assert.deepEqual(r1Keys, ["A:1|C:1", "B:1|C:1"]);

  const inf = engine.resolveFeature("INF");
  const infKeys = inf.variants.keys().sort();
  assert.deepEqual(infKeys, ["A:1|C:1|D:1", "B:1|C:1|D:1"]);

  const concrete = engine.concreteInteractionsForRecipe("R2");
  assert.equal(concrete.length, 2);
  assert.ok(concrete[0].proof.length > 0);
  assert.equal(concrete[0].proof[0].nodeType, "recipe");
}

function testTemplates(): void {
  const graph = graphFixture();
  graph.recipes.set(
    "RT",
    recipe({
      id: "RT",
      uses: [{ oracleId: "A", quantity: 1 }],
      requiresTemplates: [{ templateId: "T1", quantity: 1 }],
      needsFeatures: [],
      producesFeatures: [{ featureId: "F2" }],
      removesFeatures: [],
      source: "local_curated",
    }),
  );
  const engine = new CompositionEngine(graph);
  const keys = engine.resolveRecipe("RT").variants.keys().sort();
  assert.deepEqual(keys, ["A:1|B:1", "A:1|D:1"]);
}

function testCycles(): void {
  const graph = emptyGraph();
  graph.features.set("FX", feature("FX", "X"));
  graph.features.set("FY", feature("FY", "Y"));
  graph.recipes.set(
    "RX",
    recipe({
      id: "RX",
      uses: [],
      requiresTemplates: [],
      needsFeatures: [{ featureId: "FY" }],
      producesFeatures: [{ featureId: "FX" }],
      removesFeatures: [],
      source: "local_curated",
    }),
  );
  graph.recipes.set(
    "RY",
    recipe({
      id: "RY",
      uses: [],
      requiresTemplates: [],
      needsFeatures: [{ featureId: "FX" }],
      producesFeatures: [{ featureId: "FY" }],
      removesFeatures: [],
      source: "local_curated",
    }),
  );
  const engine = new CompositionEngine(graph);
  const resolved = engine.resolveFeature("FX");
  assert.equal(resolved.variants.size, 0);
  assert.ok(engine.stats.cyclesEncountered >= 1);
  assert.ok(engine.stats.cyclesCut >= 1);
}

function testDeterminism(): void {
  const a = new CompositionEngine(graphFixture()).resolveFeature("INF").variants.keys();
  const b = new CompositionEngine(graphFixture()).resolveFeature("INF").variants.keys();
  assert.deepEqual(a, b);
}

function testSemanticValidation(): void {
  const ok = assertFiniteVector([0.1, 0, 2], "x");
  assert.equal(ok.ok, true);
  assert.equal(assertFiniteVector([0, 0, 0], "z").ok, false);
  assert.equal(assertFiniteVector([1, Number.NaN], "n").ok, false);
  assert.equal(assertFiniteVector([1, Number.POSITIVE_INFINITY], "i").ok, false);
  const rows = [
    { oracleId: "b", vector: [1, 2] },
    { oracleId: "a", vector: [3, 4] },
  ];
  const c1 = checksumOracleVectors(rows);
  const c2 = checksumOracleVectors([...rows].reverse());
  assert.equal(c1, c2);
}

function testLabels(): void {
  const matrix = createLabelMatrix(["c1", "c2"], ["f1", "f2"]);
  setLabel(matrix, "c1", "f1", "POSITIVE");
  assert.equal(getLabel(matrix, 0, 0), "POSITIVE");
  assert.equal(getLabel(matrix, 0, 1), "UNKNOWN");
  assert.equal(getLabel(matrix, 1, 0), "UNKNOWN");
  assert.ok(Number.isNaN(maskedRegressionTarget("UNKNOWN")));
  assert.equal(maskedRegressionTarget("POSITIVE"), 1);
  assert.equal(maskedRegressionTarget("NEGATIVE"), 0);
  const counts = countLabelStates(matrix);
  assert.equal(counts.positive, 1);
  assert.equal(counts.negative, 0);
  assert.equal(counts.unknown, 3);
}

function testVerifier(): void {
  const graph = graphFixture();
  const engine = new CompositionEngine(graph);
  const [candidate] = engine.concreteInteractionsForRecipe("R1");
  const verifier = new DeterministicGraphVerifier(graph);
  assert.equal(verifier.verify(candidate).ok, true);
  assert.equal(verifier.verify({ ...candidate, proof: [], cards: [] }).ok, false);
}

function main(): void {
  testMultisets();
  testMinimality();
  testIdentity();
  testOrAndRecursionProof();
  testTemplates();
  testCycles();
  testDeterminism();
  testSemanticValidation();
  testLabels();
  testVerifier();
  console.log("mechanical-space.selftest: PASS");
}

main();
