/**
 * Phase 2 — catalog health census from a shadow parse artifact.
 *
 * Run: cd web && npx tsx scripts/run-catalog-health-census-v1.ts --manifest=data/milestones/catalog-shadow/<manifest>.json
 */
import { createGunzip } from "node:zlib";
import { createReadStream, readFileSync } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";
import type { CatalogShadowParseRecord } from "./lib/catalog-shadow-parse-record-v1";
import type { CatalogComplexityBucket } from "./lib/catalog-complexity-bucket-v1";

type Manifest = {
  artifactPath: string;
  frame?: string;
  cardCount: number;
  parserVersion: string;
  parserBlobClosure: string;
  contentHash: string;
  healthMetricDefinitions?: Record<string, string>;
};

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${prefix}=`))?.split("=").slice(1).join("=");
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

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 10_000) / 100;
}

function initBucket<T>(): Record<CatalogComplexityBucket, T> {
  return { simple: 0 as T, normal: 0 as T, complex: 0 as T, pathological: 0 as T };
}

async function main() {
  const manifestPath = argValue("--manifest");
  if (!manifestPath) throw new Error("--manifest=<path> required");
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8")) as Manifest;
  const records = await readShadowRecords(manifest);

  let structuralInvalid = 0;
  let provenanceInvalid = 0;
  let idInvalid = 0;
  let noDiagnostics = 0;
  let needsReviewCards = 0;
  let abstentionCards = 0;
  let unsupportedCards = 0;

  let cardsWithAnyIntegrityIssue = 0;
  let cardsWithAnyParserDiagnostic = 0;
  let cardsWithAnyNeedsReview = 0;
  let cardsNonPublishable = 0;

  let totalAbilities = 0;
  let totalAcceptedL2 = 0;
  let totalNeedsReviewActions = 0;
  let totalGrantedAbilities = 0;
  let totalReplacementEffects = 0;
  let totalModalOptions = 0;

  const byBucketCards = initBucket<number>();
  const byBucketStructuralInvalid = initBucket<number>();
  const byBucketNeedsReview = initBucket<number>();

  for (const row of records) {
    byBucketCards[row.complexityBucket] += 1;
    totalAbilities += row.semantic.abilities.length;
    totalAcceptedL2 += row.acceptedActions.length;
    totalNeedsReviewActions += row.needsReviewActions.length;
    totalGrantedAbilities += row.semantic.abilities.filter((a) => /granted/i.test(a.abilityId)).length;
    totalReplacementEffects += row.semantic.diagnostics.filter((d) => /replacement/i.test(d.code)).length;
    totalModalOptions += row.semantic.abilities.reduce(
      (sum, a) => sum + (a.options?.length ?? 0),
      0,
    );

    const structural = row.structuralInvalid ?? (row.semanticInvalid || row.idViolations.length > 0);
    const provenance = row.provenanceInvalid ?? row.provenanceViolations.length > 0;
    const idBad = row.idInvalid ?? row.idViolations.length > 0;
    const hasIntegrityIssue =
      structural ||
      idBad ||
      provenance ||
      row.acceptedActionOutsideOwnerSpanCount > 0 ||
      row.forbiddenEmissionCount > 0;
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
    if (row.needsReviewActions.length > 0) {
      needsReviewCards += 1;
      byBucketNeedsReview[row.complexityBucket] += 1;
    }
    if (row.abstentions.length > 0) abstentionCards += 1;
    if (row.unsupportedConstructCount > 0) unsupportedCards += 1;
    if (hasIntegrityIssue) cardsWithAnyIntegrityIssue += 1;
    if (hasDiagnostic) cardsWithAnyParserDiagnostic += 1;
    if (hasNeedsReview) cardsWithAnyNeedsReview += 1;
    if (nonPublishable) cardsNonPublishable += 1;
  }

  const metricDefinitions = manifest.healthMetricDefinitions ?? {
    cardsWithAnyIntegrityIssue:
      "structuralInvalid OR idInvalid OR provenanceInvalid OR acceptedActionOutsideOwnerSpanCount > 0 OR forbiddenEmissionCount > 0",
    cardsWithAnyParserDiagnostic: "semantic.diagnostics.length > 0",
    cardsWithAnyNeedsReview: "needsReviewActions.length > 0",
    cardsNonPublishable: "publishable === false",
    cardsWithNoDiagnostics: "semantic.diagnostics.length === 0 (not a correctness metric)",
  };

  const total = records.length;
  const census = {
    artifactType: "CatalogHealthCensus",
    version: "catalog-health-census-v1",
    generatedAt: new Date().toISOString(),
    sourceManifest: manifestPath.replace(/\\/g, "/"),
    frame: manifest.frame ?? "unknown",
    parserVersion: manifest.parserVersion,
    parserBlobClosure: manifest.parserBlobClosure,
    healthMetricDefinitions: metricDefinitions,
    totals: {
      oracleCards: total,
      successfullyParsed: total - structuralInvalid,
      structuralInvalid,
      provenanceInvalid,
      idInvalid,
      cardsWithNoDiagnostics: noDiagnostics,
      cardsWithNeedsReview: needsReviewCards,
      cardsWithAbstention: abstentionCards,
      cardsWithUnsupportedConstructs: unsupportedCards,
      cardsWithAnyIntegrityIssue,
      cardsWithAnyParserDiagnostic,
      cardsWithAnyNeedsReview,
      cardsNonPublishable,
      totalAbilities,
      totalAcceptedL2Actions: totalAcceptedL2,
      totalNeedsReviewActions,
      totalGrantedAbilities,
      totalReplacementEffects,
      totalModalOptions,
    },
    percentages: {
      successfullyParsed: pct(total - structuralInvalid, total),
      structuralInvalid: pct(structuralInvalid, total),
      provenanceInvalid: pct(provenanceInvalid, total),
      idInvalid: pct(idInvalid, total),
      cardsWithNoDiagnostics: pct(noDiagnostics, total),
      cardsWithNeedsReview: pct(needsReviewCards, total),
      cardsWithAbstention: pct(abstentionCards, total),
      cardsWithUnsupportedConstructs: pct(unsupportedCards, total),
      cardsWithAnyIntegrityIssue: pct(cardsWithAnyIntegrityIssue, total),
      cardsWithAnyParserDiagnostic: pct(cardsWithAnyParserDiagnostic, total),
      cardsWithAnyNeedsReview: pct(cardsWithAnyNeedsReview, total),
      cardsNonPublishable: pct(cardsNonPublishable, total),
    },
    perCardAverages: {
      acceptedL2Actions: total === 0 ? 0 : Math.round((totalAcceptedL2 / total) * 100) / 100,
      abilities: total === 0 ? 0 : Math.round((totalAbilities / total) * 100) / 100,
      needsReviewActions: total === 0 ? 0 : Math.round((totalNeedsReviewActions / total) * 100) / 100,
      diagnostics: total === 0
        ? 0
        : Math.round((records.reduce((s, r) => s + r.semantic.diagnostics.length, 0) / total) * 100) / 100,
    },
    complexityBuckets: {
      definitionVersion: "catalog-complexity-bucket-v1",
      cardCounts: byBucketCards,
      structuralInvalidByBucket: byBucketStructuralInvalid,
      needsReviewCardsByBucket: byBucketNeedsReview,
      parserHealthByBucket: Object.fromEntries(
        (Object.keys(byBucketCards) as CatalogComplexityBucket[]).map((bucket) => {
          const cards = byBucketCards[bucket];
          return [
            bucket,
            {
              cards,
              structuralInvalidRate: pct(byBucketStructuralInvalid[bucket], cards),
              needsReviewRate: pct(byBucketNeedsReview[bucket], cards),
              avgAcceptedL2Actions:
                cards === 0
                  ? 0
                  : Math.round(
                      (records
                        .filter((r) => r.complexityBucket === bucket)
                        .reduce((s, r) => s + r.acceptedActions.length, 0) /
                        cards) *
                        100,
                    ) / 100,
            },
          ];
        }),
      ),
    },
  };

  const outPath = argValue("--out");
  const json = `${JSON.stringify(census, null, 2)}\n`;
  if (outPath) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(resolve(outPath, ".."), { recursive: true });
    writeFileSync(resolve(outPath), json);
  }
  console.log(json);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
