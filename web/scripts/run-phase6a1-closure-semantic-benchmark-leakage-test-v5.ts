#!/usr/bin/env npx tsx
/** Expanded leakage gates v5 for semantic closure benchmarks. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { COMMANDER_ORACLE_FACTS_V4 } from "./lib/phase6a1-closure-commander-oracle-facts-v4";
import { findNormalizedDuplicates } from "./lib/phase6a1-closure-semantic-normalize-v4";
import { ROLE_VOCAB_PATTERN } from "./lib/phase6a1-semantic-text-neutralize-v5";

const OUT = resolve("data/milestones/deck-synthesis");
const WEB_SCRIPTS = resolve("scripts");
const REPO_ROOT = resolve("..", "..");

const PROHIBITED_FIELDS = [
  "roleClaims", "expectedSatisfaction", "roleApplicability", "closureStatus", "repairTargets",
  "postGoldDefectClassTargets", "adjudicationStatus", "structuralRoleGaps", "advisoryRoleGaps",
];
const TRIGGER_LABEL = /^T_[A-Z_]+$/;
const STUB_FACT_MARKERS = ["oracle text stub", "relevant ability summary", "rules context stub"];
const ROLE_PACKAGE_ID = /^(dep|ind|harm)-/i;
const OPAQUE_PACKAGE_ID = /^pkg-[a-f0-9]{4}$/;
const ANSWER_SCENARIO_LABEL = /\b(conversion|partner_maint|finisher|harmony|evidence_insufficient)[_-]?(gap|closed|underdetermined)\b/i;
const FOREIGN_COMMANDER = /\bwithout\s+[A-Z][a-z]/;
const KNOWN_COMMANDER_NAMES = Object.keys(COMMANDER_ORACLE_FACTS_V4).flatMap((n) => n.split(" // ").map((p) => p.trim()));

function walk(obj: unknown, path = "", hits: string[] = [], caseCommanders: string[] = []): string[] {
  if (typeof obj === "string") {
    if (TRIGGER_LABEL.test(obj) && !path.includes("adjudication")) hits.push(`${path}: trigger label ${obj}`);
    for (const stub of STUB_FACT_MARKERS) {
      if (obj.toLowerCase().includes(stub)) hits.push(`${path}: placeholder stub "${stub}"`);
    }
    if ((path.includes("thesis") || path.includes("strategyStatement")) && ROLE_VOCAB_PATTERN.test(obj)) {
      hits.push(`${path}: role vocabulary in thesis/strategy "${obj.slice(0, 80)}"`);
    }
    if (path.includes("packageRefId") || path.endsWith("packageRefId")) {
      if (ROLE_PACKAGE_ID.test(obj)) hits.push(`${path}: role-bearing package id ${obj}`);
      if (!OPAQUE_PACKAGE_ID.test(obj) && ROLE_VOCAB_PATTERN.test(obj)) hits.push(`${path}: role vocabulary in package id ${obj}`);
    }
    if (ANSWER_SCENARIO_LABEL.test(obj)) hits.push(`${path}: answer-bearing scenario label`);
    if (FOREIGN_COMMANDER.test(obj)) hits.push(`${path}: foreign-commander reference "${obj.slice(0, 80)}"`);
    for (const name of KNOWN_COMMANDER_NAMES) {
      if (obj.includes(name) && !caseCommanders.some((c) => c.includes(name) || name.includes(c.split(",")[0] ?? c))) {
        hits.push(`${path}: references other commander "${name}"`);
      }
    }
    return hits;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, `${path}[${i}]`, hits, caseCommanders));
    return hits;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (PROHIBITED_FIELDS.includes(k) && !path.includes("adjudication")) hits.push(`prohibited field ${path}.${k}`);
      if (ANSWER_SCENARIO_LABEL.test(k)) hits.push(`answer-bearing key ${path}.${k}`);
      walk(v, path ? `${path}.${k}` : k, hits, caseCommanders);
    }
  }
  return hits;
}

function scanImplementationSealV5(): string[] {
  const findings: string[] = [];
  const sealPath = resolve(WEB_SCRIPTS, "run-phase6a1-closure-semantic-benchmark-seal-v5.ts");
  const src = readFileSync(sealPath, "utf8");
  const body = src.split("\n").filter((l) => !l.includes("findings.push") && !l.includes(".test(")).join("\n");
  if (/spawnSync|execSync|run-authority-seal|run-holdout-prospective-v4-authority/.test(body)) {
    findings.push("implementation seal invokes or references external authority authoring");
  }
  if (/const\s+HOLDOUT[\w-]*SCENARIOS\s*[:=]/.test(body)) findings.push("implementation seal declares holdout scenario array");
  return findings;
}

function scanRepoForAuthorityLeak(snapshotDir: string): string[] {
  const findings: string[] = [];
  const holdoutFiles = readdirSync(snapshotDir).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  for (const f of holdoutFiles) {
    const raw = readFileSync(join(snapshotDir, f), "utf8");
    if (raw.includes("benchmark-authority") || raw.includes("_benchmark-authority")) {
      findings.push(`${f}: contains authority path reference`);
    }
  }
  return findings;
}

export function runLeakageTestsV5(
  snapshotDir: string,
  opts: { compareAgainstDir?: string; label: string },
): { pass: boolean; findings: string[] } {
  const findings: string[] = [];
  const files = readdirSync(snapshotDir).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(snapshotDir, file), "utf8")) as { commanders?: string[] };
    findings.push(...walk(parsed, `${opts.label}/${file}`, [], parsed.commanders ?? []));
  }
  if (opts.compareAgainstDir) {
    for (const d of findNormalizedDuplicates(opts.compareAgainstDir, snapshotDir)) {
      findings.push(`normalized duplicate: ${d.left} ↔ ${d.right}`);
    }
  }
  return { pass: findings.length === 0, findings };
}

export function writeLeakageReportV5(results: Record<string, { pass: boolean; findings: string[] }>): string {
  const path = resolve(OUT, "phase6a1-professor-plan-semantic-closure-leakage-test-report-v5.json");
  writeFileSync(path, JSON.stringify({
    version: "phase6a1-professor-plan-semantic-closure-leakage-test-report-v5",
    generatedAt: new Date().toISOString(),
    gates: [
      "prohibited_runtime_fields", "trigger_label_strings", "placeholder_oracle_stubs",
      "role_bearing_package_ids", "role_vocabulary_in_theses", "foreign_commander_references",
      "commander_strategy_coherence", "answer_bearing_scenario_labels", "dev_holdout_duplicates",
      "implementation_authority_access_boundary", "authority_path_in_publish_artifacts",
    ],
    overallPass: Object.values(results).every((r) => r.pass),
    results,
  }, null, 2));
  return path;
}

export function runFullLeakageSuiteV5(): { pass: boolean; reportPath: string; results: Record<string, { pass: boolean; findings: string[] }> } {
  const devDir = resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-input-v4");
  const hoDir = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v5-semantic-closure-input-v5");
  const results = {
    dev36V4: runLeakageTestsV5(devDir, { label: "dev36-v4" }),
    holdoutProspectiveV5: runLeakageTestsV5(hoDir, { compareAgainstDir: devDir, label: "holdout-prospective-v5" }),
    implementationSealBoundary: { pass: scanImplementationSealV5().length === 0, findings: scanImplementationSealV5() },
    publishArtifactAuthorityRefs: { pass: scanRepoForAuthorityLeak(hoDir).length === 0, findings: scanRepoForAuthorityLeak(hoDir) },
  };
  const reportPath = writeLeakageReportV5(results);
  return { pass: Object.values(results).every((r) => r.pass), reportPath, results };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("run-phase6a1-closure-semantic-benchmark-leakage-test-v5.ts")) {
  console.log(JSON.stringify(runFullLeakageSuiteV5(), null, 2));
}
