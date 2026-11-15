#!/usr/bin/env npx tsx
/** Leakage and integrity gates for semantic closure benchmarks v3. */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const OUT = resolve("data/milestones/deck-synthesis");

const PROHIBITED_FIELDS = [
  "roleClaims",
  "expectedSatisfaction",
  "roleApplicability",
  "closureStatus",
  "repairTargets",
  "postGoldDefectClassTargets",
  "adjudicationStatus",
  "structuralRoleGaps",
  "advisoryRoleGaps",
];

const TRIGGER_LABEL = /^T_[A-Z_]+$/;

function walk(obj: unknown, path = "", hits: string[] = []): string[] {
  if (typeof obj === "string") {
    if (TRIGGER_LABEL.test(obj) && !path.includes("design") && !path.includes("adjudication")) {
      hits.push(`${path}: ${obj}`);
    }
    return hits;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, `${path}[${i}]`, hits));
    return hits;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (PROHIBITED_FIELDS.includes(k) && !path.includes("adjudication")) hits.push(`prohibited field ${path}.${k}`);
      walk(v, path ? `${path}.${k}` : k, hits);
    }
  }
  return hits;
}

export function runLeakageTests(snapshotDir: string): { pass: boolean; findings: string[] } {
  const findings: string[] = [];
  const files = readdirSync(snapshotDir).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(snapshotDir, file), "utf8"));
    findings.push(...walk(parsed, file));
  }
  return { pass: findings.length === 0, findings };
}

export function writeLeakageReport(results: Record<string, { pass: boolean; findings: string[] }>): string {
  const path = resolve(OUT, "phase6a1-professor-plan-semantic-closure-leakage-test-report-v3.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-semantic-closure-leakage-test-report-v3",
        generatedAt: new Date().toISOString(),
        overallPass: Object.values(results).every((r) => r.pass),
        results,
      },
      null,
      2,
    ),
  );
  return path;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("run-phase6a1-closure-semantic-benchmark-leakage-test-v3.ts")) {
  const dev = runLeakageTests(resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-input-v3"));
  const ho = runLeakageTests(resolve(OUT, "phase6a1-professor-plan-holdout24-v3-semantic-closure-input-v3"));
  console.log(JSON.stringify(writeLeakageReport({ dev36: dev, holdout24v3: ho }), null, 2));
}
