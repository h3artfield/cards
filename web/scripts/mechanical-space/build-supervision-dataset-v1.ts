/**
 * Join snapshot vectors + Spellbook grounded positives into a PU supervision set.
 * Missing labels remain UNKNOWN. No false negatives.
 *
 * Run: cd web && npx tsx scripts/mechanical-space/build-supervision-dataset-v1.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { mechanicalSpacePath } from "../../src/lib/mechanical-space/artifact-paths";
import { sha256Hex } from "../../src/lib/mechanical-space/checksum";
import { assertMechanicalSpaceReadOnly } from "../../src/lib/mechanical-space/safety";
import { createLabelMatrix, countLabelStates, setLabel } from "../../src/lib/mechanical-space/labels";

assertMechanicalSpaceReadOnly("build-supervision-dataset-v1");

const MIN_SUPPORT = 25;

type SnapshotRow = { i: number; oracleId: string; name: string };
type SpellbookCard = {
  id: number;
  name: string;
  oracleId?: string;
  features: Array<{ featureId: number; featureName: string; quantity: number }>;
};
type SpellbookFeature = { id: number; name: string; status: string; uncountable: boolean };

function hashSeed(input: string): number {
  const hex = sha256Hex(input).slice(0, 8);
  return Number.parseInt(hex, 16);
}

function assignSplit(oracleId: string): "train" | "validation" | "holdout" {
  const n = hashSeed(`evalA:${oracleId}`) % 100;
  if (n < 70) return "train";
  if (n < 85) return "validation";
  return "holdout";
}

function main() {
  const outDir = mechanicalSpacePath("mechanical-supervision-v1");
  mkdirSync(outDir, { recursive: true });

  const snapshotManifest = JSON.parse(
    readFileSync(mechanicalSpacePath("semantic-oracle-snapshot-v1", "manifest.json"), "utf8"),
  ) as { checksum: string; dimensions: number; model: string; vectorCount: number };
  const index = readFileSync(mechanicalSpacePath("semantic-oracle-snapshot-v1", "index.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SnapshotRow);
  const byOracle = new Map(index.map((r) => [r.oracleId, r]));

  const mappings = existsSync(mechanicalSpacePath("oracle-identity-mapping-v1", "mappings.jsonl"))
    ? readFileSync(mechanicalSpacePath("oracle-identity-mapping-v1", "mappings.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { externalId: string; oracleId?: string; classification: string })
    : [];
  const mapped = new Map(mappings.filter((m) => m.oracleId).map((m) => [m.externalId, m.oracleId!]));

  const cards = JSON.parse(
    readFileSync(mechanicalSpacePath("spellbook-reference-normalization-v1", "cards-slim.json"), "utf8"),
  ) as SpellbookCard[];
  const features = JSON.parse(
    readFileSync(mechanicalSpacePath("spellbook-reference-normalization-v1", "features.json"), "utf8"),
  ) as SpellbookFeature[];

  const support = new Map<string, number>();
  const positives: Array<{ oracleId: string; featureId: string; featureName: string; externalCardId: number }> = [];
  for (const card of cards) {
    const oracleId = card.oracleId && byOracle.has(card.oracleId) ? card.oracleId : mapped.get(String(card.id));
    if (!oracleId || !byOracle.has(oracleId)) continue;
    for (const f of card.features ?? []) {
      const featureId = `csb:feature:${f.featureId}`;
      support.set(featureId, (support.get(featureId) ?? 0) + 1);
      positives.push({ oracleId, featureId, featureName: f.featureName, externalCardId: card.id });
    }
  }

  const benchmarkFeatures = [...support.entries()]
    .filter(([, n]) => n >= MIN_SUPPORT)
    .sort((a, b) => b[1] - a[1])
    .map(([featureId, n]) => {
      const numeric = Number(featureId.slice("csb:feature:".length));
      const meta = features.find((f) => f.id === numeric);
      return {
        featureId,
        name: meta?.name ?? positives.find((p) => p.featureId === featureId)?.featureName ?? featureId,
        positiveExamples: n,
        knownNegatives: 0,
        unknown: snapshotManifest.vectorCount - n,
        prevalence: n / snapshotManifest.vectorCount,
        status: meta?.status,
      };
    });

  const labeledOracleIds = [...new Set(positives.map((p) => p.oracleId))].sort();
  const featureIds = benchmarkFeatures.map((f) => f.featureId);
  const matrix = createLabelMatrix(labeledOracleIds, featureIds);
  const evidence: Array<Record<string, unknown>> = [];
  for (const pos of positives) {
    if (!featureIds.includes(pos.featureId)) continue;
    setLabel(matrix, pos.oracleId, pos.featureId, "POSITIVE");
    evidence.push({
      oracleId: pos.oracleId,
      featureId: pos.featureId,
      source: "commander_spellbook",
      externalSourceId: String(pos.externalCardId),
      confidence: 1,
      evidencePath: "card.features",
      label: "POSITIVE",
    });
  }

  const splits = {
    train: [] as string[],
    validation: [] as string[],
    holdout: [] as string[],
  };
  for (const oracleId of labeledOracleIds) {
    splits[assignSplit(oracleId)].push(oracleId);
  }

  const counts = countLabelStates(matrix);
  const labelsPath = resolve(outDir, "labels.i8");
  writeFileSync(labelsPath, Buffer.from(matrix.states.buffer, matrix.states.byteOffset, matrix.states.byteLength));
  writeFileSync(resolve(outDir, "oracle-ids.json"), `${JSON.stringify(labeledOracleIds)}\n`);
  writeFileSync(resolve(outDir, "feature-ids.json"), `${JSON.stringify(featureIds)}\n`);
  writeFileSync(resolve(outDir, "splits-eval-a-random.json"), `${JSON.stringify(splits, null, 2)}\n`);
  writeFileSync(resolve(outDir, "benchmark-features.json"), `${JSON.stringify(benchmarkFeatures, null, 2)}\n`);
  writeFileSync(resolve(outDir, "evidence.jsonl"), evidence.map((e) => JSON.stringify(e)).join("\n") + "\n");

  const report = {
    version: "mechanical-supervision-v1",
    createdAt: new Date().toISOString(),
    embeddingChecksum: snapshotManifest.checksum,
    embeddingModel: snapshotManifest.model,
    embeddingDimensions: snapshotManifest.dimensions,
    cardsWithPositiveLabels: labeledOracleIds.length,
    featuresTotalInReference: features.length,
    benchmarkFeatures: featureIds.length,
    minSupport: MIN_SUPPORT,
    positiveEdges: counts.positive,
    knownNegativeEdges: counts.negative,
    unknownEdges: counts.unknown,
    training: splits.train.length,
    validation: splits.validation.length,
    holdout: splits.holdout.length,
    leakageProtections: {
      evalA: "deterministic hash split by oracleId 70/15/15 — baseline only",
      evalB: "interaction-family holdout computed in ML script from variant.of groups",
      evalC: "nearest-train cosine recorded for every holdout item; semantic neighbors must not be treated as independent",
      unknownSemantics: "absent Spellbook edges remain UNKNOWN; never converted to NEGATIVE",
      holdoutSpent: false,
    },
    datasetChecksum: createHash("sha256").update(Buffer.from(matrix.states.buffer)).digest("hex"),
    ontologyChecksum: sha256Hex(JSON.stringify(featureIds)),
    labelSemantics: "POSITIVE / NEGATIVE / UNKNOWN — PU learning. UNKNOWN is not 0.",
  };
  writeFileSync(resolve(outDir, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
