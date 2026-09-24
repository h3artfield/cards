/**
 * Build parser-blind stratified ~1,000-card coverage sample from corrected v2 population.
 *
 * Run: cd web && npx tsx scripts/build-catalog-coverage-sample-v2.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogPopulationSnapshotV2 } from "./lib/firestore-catalog-population-snapshot-v2";
import type { CatalogComplexityBucket } from "./lib/catalog-complexity-bucket-v1";

const OUT_DIR = "data/milestones/catalog-shadow";
const POPULATION_PATH = "data/milestones/catalog-shadow/catalog-population-snapshot-firestore-v2.json";
const SAMPLING_ALGORITHM_VERSION = "catalog-coverage-sample-v2";
const RANDOM_SEED = "catalog-coverage-sample-seed-v2-20260811";

const TARGETS: Record<CatalogComplexityBucket, number> = {
  simple: 450,
  normal: 300,
  complex: 200,
  pathological: 50,
};

function seededShuffle<T>(items: T[], seed: string): T[] {
  let state = createHash("sha256").update(seed).digest();
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    state = createHash("sha256").update(state).digest();
    const r = state.readUInt32BE(0) / 0x1_0000_0000;
    const j = Math.floor(r * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${prefix}=`))?.split("=").slice(1).join("=");
}

function main() {
  const populationPath = argValue("--population") ?? POPULATION_PATH;
  const snapshot = JSON.parse(readFileSync(resolve(populationPath), "utf8")) as CatalogPopulationSnapshotV2;
  const eligible = snapshot.identities.filter((i) => i.studyPopulationEligible);

  const byBucket = new Map<CatalogComplexityBucket, typeof eligible>();
  for (const bucket of Object.keys(TARGETS) as CatalogComplexityBucket[]) {
    byBucket.set(
      bucket,
      eligible.filter((i) => i.complexityBucket === bucket),
    );
  }

  const selected: Array<{
    oracleId: string;
    oracleTextHash: string;
    cardStructureHash: string;
    canonicalName: string;
    layout?: string;
    populationCategory: string;
    complexityBucket: CatalogComplexityBucket;
    populationBucketSize: number;
    sampleBucketSize: number;
    inclusionProbability: number;
    surveyWeight: number;
    randomSeed: string;
  }> = [];

  for (const bucket of Object.keys(TARGETS) as CatalogComplexityBucket[]) {
    const pool = byBucket.get(bucket) ?? [];
    const target = TARGETS[bucket];
    const shuffled = seededShuffle(pool, `${RANDOM_SEED}:${bucket}`);
    const pick = shuffled.slice(0, Math.min(target, shuffled.length));
    const inclusionProbability = pool.length === 0 ? 0 : pick.length / pool.length;
    const surveyWeight = pick.length === 0 ? 0 : pool.length / pick.length;
    for (const row of pick) {
      selected.push({
        oracleId: row.oracleId,
        oracleTextHash: row.oracleTextHash,
        cardStructureHash: row.cardStructureHash,
        canonicalName: row.canonicalName,
        layout: row.layout,
        populationCategory: row.populationCategory,
        complexityBucket: bucket,
        populationBucketSize: pool.length,
        sampleBucketSize: pick.length,
        inclusionProbability,
        surveyWeight,
        randomSeed: RANDOM_SEED,
      });
    }
  }

  selected.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  const sampleIdentityHash = createHash("sha256")
    .update(
      selected.map((s) => `${s.oracleId}|${s.oracleTextHash}|${s.cardStructureHash}`).join("\n"),
    )
    .digest("hex");

  const artifact = {
    artifactType: "CatalogCoverageSample",
    version: "catalog-coverage-sample-v2",
    status: "IDENTITIES_SEALED",
    sealedAt: new Date().toISOString(),
    samplingAlgorithmVersion: SAMPLING_ALGORITHM_VERSION,
    randomSeed: RANDOM_SEED,
    populationSnapshotPath: populationPath.replace(/\\/g, "/"),
    populationHash: snapshot.populationHash,
    cardStructurePopulationHash: snapshot.cardStructurePopulationHash,
    populationEligibleCount: eligible.length,
    populationFrame: "card-structure-aware-v2",
    supersededSampleV1: {
      sampleIdentityHash: "e9e6cc4c4ddb2ff20c213c15dbdcbe0ab77b2a80dee1e6f4fdee313e9efec224",
      artifactPath: "data/milestones/catalog-shadow/catalog-coverage-sample-v1.json",
    },
    sampleCount: selected.length,
    sampleIdentityHash,
    stratifiedTargets: TARGETS,
    parserBlindSelection: true,
    selectionForbiddenInputs: [
      "parserOutput",
      "needs_review",
      "structuralInvalid",
      "parserDiagnostics",
      "parserActionCount",
      "shadowParseResults",
    ],
    goldCreationBlindRequirement:
      "Human adjudicators must not receive RC8 parser output, needs_review, diagnostics, or parser actions while authoring gold.",
    humanAnnotationStatus: "NOT STARTED — authorized only after this seal",
    cards: selected,
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(OUT_DIR, "catalog-coverage-sample-v2.json");
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outPath,
        sampleCount: selected.length,
        sampleIdentityHash,
        populationHash: snapshot.populationHash,
        cardStructurePopulationHash: snapshot.cardStructurePopulationHash,
        byBucket: Object.fromEntries(
          (Object.keys(TARGETS) as CatalogComplexityBucket[]).map((b) => [
            b,
            { population: byBucket.get(b)?.length ?? 0, sampled: selected.filter((s) => s.complexityBucket === b).length },
          ]),
        ),
        categoryCInSample: selected.filter((s) => s.populationCategory === "C").length,
      },
      null,
      2,
    ),
  );
}

main();
