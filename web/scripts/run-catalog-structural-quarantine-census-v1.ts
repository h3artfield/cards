/**
 * Structural-invalid quarantine census — prove fail-closed publishability.
 *
 * Run: cd web && npx tsx scripts/run-catalog-structural-quarantine-census-v1.ts --manifest=...
 */
import { createGunzip } from "node:zlib";
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";
import type { CatalogShadowParseRecord } from "./lib/catalog-shadow-parse-record-v1";

type Manifest = { artifactPath: string; frame?: string };

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${prefix}=`))?.split("=").slice(1).join("=");
}

async function readShadowRecords(path: string): Promise<CatalogShadowParseRecord[]> {
  const artifactPath = resolve(path);
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
  const manifestPath = argValue("--manifest");
  if (!manifestPath) throw new Error("--manifest required");
  const outPath = argValue("--out");
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8")) as Manifest;
  const records = await readShadowRecords(manifest.artifactPath);

  const invalid = records.filter((r) => r.structuralInvalid ?? r.semanticInvalid);
  const leakageRows = invalid.filter(
    (r) =>
      (r.publishable === true || r.deterministicReasoningEligible === true) &&
      (r.structuralInvalid || r.idInvalid || r.provenanceInvalid),
  );
  const acceptedOnInvalid = invalid.filter((r) => r.acceptedActions.length > 0);

  const byFailure = new Map<string, number>();
  for (const row of invalid) {
    const key = row.primaryStructuralFailure ?? "unknown";
    byFailure.set(key, (byFailure.get(key) ?? 0) + 1);
  }

  const report = {
    artifactType: "CatalogStructuralQuarantineCensus",
    version: "catalog-structural-quarantine-census-v1",
    generatedAt: new Date().toISOString(),
    sourceManifest: manifestPath.replace(/\\/g, "/"),
    frame: manifest.frame ?? "unknown",
    totals: {
      oracleCards: records.length,
      structuralInvalidCards: invalid.length,
      structuralInvalidWithAcceptedActions: acceptedOnInvalid.length,
      structuralInvalidWithNeedsReview: invalid.filter((r) => r.needsReviewActions.length > 0).length,
      publishabilityLeakageCount: leakageRows.length,
    },
    failClosedRule: {
      structuralInvalidOrIdInvalidOrProvenanceInvalid: "publishable=false AND deterministicReasoningEligible=false",
      productionBlockerIfLeakage: "Any accepted semantic fact from quarantined card reaching deterministic reasoning",
    },
    pass: leakageRows.length === 0,
    primaryStructuralFailureCounts: Object.fromEntries([...byFailure.entries()].sort((a, b) => b[1] - a[1])),
    structuralInvalidCards: invalid.map((r) => ({
      oracleId: r.oracleId,
      canonicalName: r.canonicalName,
      complexityBucket: r.complexityBucket,
      primaryStructuralFailure: r.primaryStructuralFailure,
      idViolationCount: r.idViolations.length,
      provenanceViolationCount: r.provenanceViolations.length,
      acceptedActionCount: r.acceptedActions.length,
      needsReviewActionCount: r.needsReviewActions.length,
      publishable: r.publishable,
      deterministicReasoningEligible: r.deterministicReasoningEligible,
    })),
    publishabilityLeakage: leakageRows.map((r) => ({
      oracleId: r.oracleId,
      canonicalName: r.canonicalName,
      publishable: r.publishable,
      deterministicReasoningEligible: r.deterministicReasoningEligible,
    })),
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outPath) {
    mkdirSync(resolve(outPath, ".."), { recursive: true });
    writeFileSync(resolve(outPath), json);
  }
  console.log(json);
  if (!report.pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
