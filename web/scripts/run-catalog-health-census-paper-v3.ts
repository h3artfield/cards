/**
 * Derive paper-only RC8 health census from frozen v2 shadow parse + paper population v3 filter.
 *
 * Run: cd web && npx tsx scripts/run-catalog-health-census-paper-v3.ts
 */
import { createGunzip } from "node:zlib";
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";
import type { CatalogShadowParseRecord } from "./lib/catalog-shadow-parse-record-v1";
import type { CatalogComplexityBucket } from "./lib/catalog-complexity-bucket-v1";

const OUT_DIR = "data/milestones/catalog-shadow";
const SHADOW_MANIFEST = `${OUT_DIR}/catalog-shadow-parse-rc8-firestore-v2-manifest.json`;
const POPULATION_V3 = `${OUT_DIR}/catalog-population-snapshot-firestore-v3.json`;
const PAPER_AUDIT = `${OUT_DIR}/catalog-paper-eligibility-audit-v1.json`;

type Manifest = {
  artifactPath: string;
  frame?: string;
  cardCount: number;
  parserVersion: string;
  parserBlobClosure: string;
  contentHash: string;
};

function initBucket<T>(): Record<CatalogComplexityBucket, T> {
  return { simple: 0 as T, normal: 0 as T, complex: 0 as T, pathological: 0 as T };
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 10_000) / 100;
}

async function readShadowRecords(manifest: Manifest): Promise<CatalogShadowParseRecord[]> {
  const artifactPath = resolve(manifest.artifactPath);
  const input = artifactPath.endsWith(".gz")
    ? createReadStream(artifactPath).pipe(createGunzip())
    : createReadStream(artifactPath);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const rows: CatalogShadowParseRecord[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as CatalogShadowParseRecord);
  }
  return rows;
}

async function main() {
  const manifest = JSON.parse(readFileSync(resolve(SHADOW_MANIFEST), "utf8")) as Manifest;
  const population = JSON.parse(readFileSync(resolve(POPULATION_V3), "utf8")) as {
    populationHash: string;
    identities: Array<{ oracleId: string; paperEligible: boolean; studyPopulationEligible: boolean }>;
  };
  const paperAudit = JSON.parse(readFileSync(resolve(PAPER_AUDIT), "utf8")) as {
    dataSources: { scryfallBulk: { type: string; updatedAt: string } };
  };

  const paperOracleIds = new Set(
    population.identities
      .filter((i) => i.studyPopulationEligible && i.paperEligible)
      .map((i) => i.oracleId),
  );

  const allRecords = await readShadowRecords(manifest);
  const records = allRecords.filter((r) => paperOracleIds.has(r.oracleId));
  if (records.length !== paperOracleIds.size) {
    throw new Error(
      `Paper filter mismatch: ${records.length} shadow rows vs ${paperOracleIds.size} paper identities`,
    );
  }

  let structuralInvalid = 0;
  let provenanceInvalid = 0;
  let idInvalid = 0;
  let noDiagnostics = 0;
  let needsReviewCards = 0;
  let cardsNonPublishable = 0;
  let cardsWithAnyParserDiagnostic = 0;

  const byBucketCards = initBucket<number>();
  const byBucketStructuralInvalid = initBucket<number>();
  const byBucketNeedsReview = initBucket<number>();

  for (const row of records) {
    byBucketCards[row.complexityBucket] += 1;
    const structural = row.structuralInvalid ?? (row.semanticInvalid || row.idViolations.length > 0);
    const provenance = row.provenanceInvalid ?? row.provenanceViolations.length > 0;
    const idBad = row.idInvalid ?? row.idViolations.length > 0;
    const hasDiagnostic = row.hasDiagnostics || row.semantic.diagnostics.length > 0;
    const hasNeedsReview = row.needsReviewActions.length > 0;
    const nonPublishable =
      row.publishable === false ||
      !((row.deterministicReasoningEligible ?? (!structural && !idBad && !provenance)));

    if (structural) {
      structuralInvalid += 1;
      byBucketStructuralInvalid[row.complexityBucket] += 1;
    }
    if (provenance) provenanceInvalid += 1;
    if (idBad) idInvalid += 1;
    if (!row.hasDiagnostics) noDiagnostics += 1;
    if (hasNeedsReview) {
      needsReviewCards += 1;
      byBucketNeedsReview[row.complexityBucket] += 1;
    }
    if (hasDiagnostic) cardsWithAnyParserDiagnostic += 1;
    if (nonPublishable) cardsNonPublishable += 1;
  }

  const total = records.length;
  const census = {
    artifactType: "CatalogHealthCensus",
    version: "catalog-health-census-paper-v3",
    generatedAt: new Date().toISOString(),
    frame: "paper-eligible-v3",
    populationHash: population.populationHash,
    paperEligibleOracleCards: total,
    sourceShadowManifest: SHADOW_MANIFEST,
    sourceShadowContentHash: manifest.contentHash,
    sourceShadowCardCount: manifest.cardCount,
    derivation: "exact paperEligible identity filter on frozen RC8 firestore-v2 shadow parse — no parser re-run",
    parserVersion: manifest.parserVersion,
    parserBlobClosure: manifest.parserBlobClosure,
    scryfallBulkSource: {
      type: paperAudit.dataSources.scryfallBulk.type,
      updatedAt: paperAudit.dataSources.scryfallBulk.updatedAt,
      note: "Paper denominator reproducibility pinned to paper-eligibility-audit-v1 Scryfall default_cards bulk",
    },
    totals: {
      oracleCards: total,
      successfullyParsed: total - structuralInvalid,
      structuralInvalid,
      provenanceInvalid,
      idInvalid,
      cardsWithNoDiagnostics: noDiagnostics,
      cardsWithNeedsReview: needsReviewCards,
      cardsWithAnyParserDiagnostic,
      cardsNonPublishable,
    },
    rates: {
      structuralInvalidPct: pct(structuralInvalid, total),
      provenanceInvalidPct: pct(provenanceInvalid, total),
      idInvalidPct: pct(idInvalid, total),
      needsReviewPct: pct(needsReviewCards, total),
      nonPublishablePct: pct(cardsNonPublishable, total),
      anyDiagnosticPct: pct(cardsWithAnyParserDiagnostic, total),
    },
    byComplexityBucket: {
      cards: byBucketCards,
      structuralInvalid: byBucketStructuralInvalid,
      needsReview: byBucketNeedsReview,
    },
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(OUT_DIR, "catalog-health-census-paper-v3.json");
  writeFileSync(outPath, `${JSON.stringify(census, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, total, parserBlobClosure: manifest.parserBlobClosure, populationHash: population.populationHash, totals: census.totals }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
