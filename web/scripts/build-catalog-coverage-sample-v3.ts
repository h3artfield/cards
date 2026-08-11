/**
 * Build parser-blind stratified ~1,000-card coverage sample from paper population v3.
 *
 * Run: cd web && npx tsx scripts/build-catalog-coverage-sample-v3.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogComplexityBucket } from "./lib/catalog-complexity-bucket-v1";

const OUT_DIR = "data/milestones/catalog-shadow";
const POPULATION_PATH = `${OUT_DIR}/catalog-population-snapshot-firestore-v3.json`;
const SAMPLING_ALGORITHM_VERSION = "catalog-coverage-sample-v3";
const RANDOM_SEED = "catalog-coverage-sample-seed-v3-20260811";

const TARGETS: Record<CatalogComplexityBucket, number> = {
  simple: 450,
  normal: 300,
  complex: 200,
  pathological: 50,
};

type PopulationIdentity = {
  oracleId: string;
  canonicalName: string;
  oracleTextHash: string;
  cardStructureHash: string;
  layout?: string;
  populationCategory: string;
  complexityBucket?: CatalogComplexityBucket;
  studyPopulationEligible: boolean;
  paperEligible: boolean;
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

function main() {
  const snapshot = JSON.parse(readFileSync(resolve(POPULATION_PATH), "utf8")) as {
    populationHash: string;
    cardStructurePopulationHash: string;
    identities: PopulationIdentity[];
  };
  const eligible = snapshot.identities.filter((i) => i.studyPopulationEligible && i.paperEligible);

  const byBucket = new Map<CatalogComplexityBucket, PopulationIdentity[]>();
  for (const bucket of Object.keys(TARGETS) as CatalogComplexityBucket[]) {
    byBucket.set(bucket, eligible.filter((i) => i.complexityBucket === bucket));
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
    .update(selected.map((s) => `${s.oracleId}|${s.oracleTextHash}|${s.cardStructureHash}`).join("\n"))
    .digest("hex");

  const artifact = {
    artifactType: "CatalogCoverageSample",
    version: "catalog-coverage-sample-v3",
    status: "IDENTITIES_SEALED",
    sealedAt: new Date().toISOString(),
    samplingAlgorithmVersion: SAMPLING_ALGORITHM_VERSION,
    randomSeed: RANDOM_SEED,
    populationSnapshotPath: POPULATION_PATH.replace(/\\/g, "/"),
    populationHash: snapshot.populationHash,
    cardStructurePopulationHash: snapshot.cardStructurePopulationHash,
    populationEligibleCount: eligible.length,
    populationFrame: "paper-eligible-v3",
    supersededSampleV2: {
      sampleIdentityHash: "8cc44c119302ad8ffb331f5ca8f6761fc0b52fb81bb799ec3f2762276d1931bb",
      artifactPath: "data/milestones/catalog-shadow/catalog-coverage-sample-v2.json",
      digitalOnlyInSample: 38,
      status: "SUPERSEDED",
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
    humanAnnotationStatus: "NOT STARTED — pending new calibration after paper frame correction",
    cards: selected,
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(OUT_DIR, "catalog-coverage-sample-v3.json");
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, sampleCount: selected.length, sampleIdentityHash, populationHash: snapshot.populationHash }, null, 2));
}

main();
