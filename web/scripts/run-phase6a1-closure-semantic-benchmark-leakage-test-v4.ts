#!/usr/bin/env npx tsx
/** Expanded leakage and integrity gates for semantic closure benchmarks v4. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findNormalizedDuplicates } from "./lib/phase6a1-closure-semantic-normalize-v4";

const OUT = resolve("data/milestones/deck-synthesis");
const WEB_SCRIPTS = resolve("scripts");

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
const STUB_FACT_MARKERS = ["oracle text stub", "relevant ability summary", "rules context stub"];
const ROLE_PACKAGE_ID = /^(dep|ind|harm)-/i;
const OPAQUE_PACKAGE_ID = /^pkg-[a-f0-9]{4}$/;
const ROLE_VOCAB_IN_ID =
  /\b(engine|enabler|fuel|fodder|payoff|conversion|protection|recovery|finisher|bridge|maint|harm-bridge)\b/i;
const ANSWER_SCENARIO_LABEL = /\b(conversion|partner_maint|finisher|harmony|evidence_insufficient)[_-]?(gap|closed|underdetermined)\b/i;
const HOLDOUT_SCENARIO_ARRAY = /HOLDOUT.*SCENARIOS|holdout.*scenario.*assignment/i;

function walk(obj: unknown, path = "", hits: string[] = []): string[] {
  if (typeof obj === "string") {
    if (TRIGGER_LABEL.test(obj) && !path.includes("design") && !path.includes("adjudication")) {
      hits.push(`${path}: trigger label ${obj}`);
    }
    for (const stub of STUB_FACT_MARKERS) {
      if (obj.toLowerCase().includes(stub)) hits.push(`${path}: placeholder stub "${stub}"`);
    }
    if (path.includes("packageRefId") || path.endsWith("packageRefId")) {
      if (ROLE_PACKAGE_ID.test(obj)) hits.push(`${path}: role-bearing package id ${obj}`);
      if (!OPAQUE_PACKAGE_ID.test(obj) && ROLE_VOCAB_IN_ID.test(obj)) {
        hits.push(`${path}: functional role vocabulary in package id ${obj}`);
      }
    }
    if (ANSWER_SCENARIO_LABEL.test(obj) && !path.includes("_benchmark-authority")) {
      hits.push(`${path}: answer-bearing scenario label in value`);
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
      if (ANSWER_SCENARIO_LABEL.test(k) && !path.includes("_benchmark-authority")) {
        hits.push(`answer-bearing key ${path}.${k}`);
      }
      walk(v, path ? `${path}.${k}` : k, hits);
    }
  }
  return hits;
}

function scanImplementationVisibleSources(): string[] {
  const findings: string[] = [];
  const sealV3 = readFileSync(resolve(WEB_SCRIPTS, "run-phase6a1-closure-semantic-benchmark-seal-v3.ts"), "utf8");
  if (/const\s+HOLDOUT[\w-]*SCENARIOS\s*[:=]/.test(sealV3)) {
    findings.push("v3 seal script exposes holdout scenario assignment (expected — v3 compromised)");
  }
  const sealV4 = readFileSync(resolve(WEB_SCRIPTS, "run-phase6a1-closure-semantic-benchmark-seal-v4.ts"), "utf8");
  if (/const\s+HOLDOUT[\w-]*SCENARIOS\s*[:=]/.test(sealV4)) findings.push("v4 seal script declares holdout scenario array");
  if (/const\s+HOLDOUT24_V3_SCENARIOS\s*=/.test(sealV4)) findings.push("v4 seal script references compromised v3 holdout scenarios");
  return findings.filter((f) => !f.includes("expected"));
}

export function runLeakageTestsV4(
  snapshotDir: string,
  opts: { compareAgainstDir?: string; label: string },
): { pass: boolean; findings: string[] } {
  const findings: string[] = [];
  const files = readdirSync(snapshotDir).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(snapshotDir, file), "utf8"));
    findings.push(...walk(parsed, `${opts.label}/${file}`));
  }
  if (opts.compareAgainstDir) {
    const dups = findNormalizedDuplicates(opts.compareAgainstDir, snapshotDir);
    for (const d of dups) findings.push(`normalized duplicate: ${d.left} ↔ ${d.right}`);
  }
  return { pass: findings.length === 0, findings };
}

export function writeLeakageReportV4(results: Record<string, { pass: boolean; findings: string[] }>): string {
  const path = resolve(OUT, "phase6a1-professor-plan-semantic-closure-leakage-test-report-v4.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-semantic-closure-leakage-test-report-v4",
        generatedAt: new Date().toISOString(),
        gates: [
          "prohibited_runtime_fields",
          "trigger_label_strings",
          "placeholder_oracle_stubs",
          "role_bearing_package_ids",
          "functional_role_vocabulary_in_package_ids",
          "answer_bearing_scenario_labels_in_snapshots",
          "dev_holdout_normalized_duplicate_detection",
          "implementation_visible_holdout_scenario_exposure",
        ],
        overallPass: Object.values(results).every((r) => r.pass),
        results,
      },
      null,
      2,
    ),
  );
  return path;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("run-phase6a1-closure-semantic-benchmark-leakage-test-v4.ts")) {
  const devDir = resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-input-v4");
  const hoDir = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v4-semantic-closure-input-v4");
  const dev = runLeakageTestsV4(devDir, { label: "dev36-v4" });
  const ho = runLeakageTestsV4(hoDir, { compareAgainstDir: devDir, label: "holdout-prospective-v4" });
  const source = { implementationVisibleSources: { pass: scanImplementationVisibleSources().length === 0, findings: scanImplementationVisibleSources() } };
  console.log(JSON.stringify(writeLeakageReportV4({ dev36V4: dev, holdoutProspectiveV4: ho, ...source }), null, 2));
}
