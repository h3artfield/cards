#!/usr/bin/env npx tsx
/** Leakage and integrity gates v8. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { runSnapshotSealGatesV8, validateDevRoleCoverage } from "./lib/phase6a1-closure-benchmark-gates-v8";
import {
  findIntraDirectoryDuplicates,
  findNormalizedDuplicates,
} from "./lib/phase6a1-closure-semantic-normalize-v8";
import { PROXY_ROLE_TAGS, type SemanticSnapshot } from "./lib/phase6a1-closure-semantic-inference-dev-template-v6";
import { ROLE_VOCAB_PATTERN } from "./lib/phase6a1-semantic-text-neutralize-v5";
import { RUNTIME_SCHEMA_V8 } from "./lib/phase6a1-semantic-fixture-builder-v8";

loadEnvLocal();
const OUT = resolve("data/milestones/deck-synthesis");
const WEB_SCRIPTS = resolve("scripts");
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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
const AUTHORITY_IMPORT = /benchmark-authority|holdout-v8-adjudication-decisions|holdout-v7-adjudication-decisions/;

function walk(obj: unknown, path = "", hits: string[] = []): string[] {
  if (typeof obj === "string") {
    if (TRIGGER_LABEL.test(obj) && !path.includes("adjudication")) hits.push(`${path}: trigger label ${obj}`);
    for (const stub of STUB_FACT_MARKERS) {
      if (obj.toLowerCase().includes(stub)) hits.push(`${path}: placeholder stub "${stub}"`);
    }
    if ((path.includes("thesis") || path.includes("strategyStatement")) && ROLE_VOCAB_PATTERN.test(obj)) {
      hits.push(`${path}: role vocabulary in thesis/strategy "${obj.slice(0, 80)}"`);
    }
    for (const proxy of PROXY_ROLE_TAGS) {
      if (obj === proxy) hits.push(`${path}: proxy role label ${proxy}`);
    }
    if (path.includes("packageRefId") || path.endsWith("packageRefId")) {
      if (ROLE_PACKAGE_ID.test(obj)) hits.push(`${path}: role-bearing package id ${obj}`);
      if (!OPAQUE_PACKAGE_ID.test(obj) && ROLE_VOCAB_PATTERN.test(obj)) hits.push(`${path}: role vocabulary in package id ${obj}`);
    }
    if (ANSWER_SCENARIO_LABEL.test(obj)) hits.push(`${path}: answer-bearing scenario label`);
    if (FOREIGN_COMMANDER.test(obj)) hits.push(`${path}: foreign-commander reference "${obj.slice(0, 80)}"`);
    return hits;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, `${path}[${i}]`, hits));
    return hits;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (PROHIBITED_FIELDS.includes(k) && !path.includes("adjudication")) hits.push(`prohibited field ${path}.${k}`);
      if (ANSWER_SCENARIO_LABEL.test(k)) hits.push(`answer-bearing key ${path}.${k}`);
      walk(v, path ? `${path}.${k}` : k, hits);
    }
  }
  return hits;
}

function scanImplementationSealV8(): string[] {
  const findings: string[] = [];
  const sealPath = resolve(WEB_SCRIPTS, "run-phase6a1-closure-semantic-benchmark-seal-v8.ts");
  const src = readFileSync(sealPath, "utf8");
  const body = src.split("\n").filter((l) => !l.includes("findings.push") && !l.includes(".test(")).join("\n");
  if (/spawnSync|execSync|import\s*\(?['"].*run-authority-seal/.test(body)) {
    findings.push("implementation seal invokes authority adjudication authoring");
  }
  return findings;
}

function scanWebScriptsForAuthorityImports(): string[] {
  const findings: string[] = [];
  for (const rel of [
    "run-phase6a1-build-benchmark-canonical-catalog-slice-v1.ts",
    "run-phase6a1-closure-semantic-benchmark-seal-v8.ts",
    "run-phase6a1-closure-semantic-benchmark-leakage-test-v8.ts",
  ]) {
    const src = readFileSync(resolve(WEB_SCRIPTS, rel), "utf8");
    if (/from\s+['"].*benchmark-authority|import\s*\(?['"].*benchmark-authority/.test(src)) {
      findings.push(`${rel}: imports benchmark-authority source`);
    }
  }
  return findings;
}

function scanRepoForAuthorityLeak(snapshotDir: string): string[] {
  const findings: string[] = [];
  for (const f of readdirSync(snapshotDir).filter((x) => x.endsWith(".json") && x !== "manifest.json")) {
    const raw = readFileSync(join(snapshotDir, f), "utf8");
    if (raw.includes("holdout-v8-adjudication-decisions") || raw.includes("blinded-adjudication-sealed-v8")) {
      findings.push(`${f}: contains authority adjudication reference`);
    }
  }
  return findings;
}

async function runCanonicalAndCoherenceGates(
  snapshotDir: string,
  label: string,
  opts: { strictHypothesisLinkage?: boolean } = {},
): Promise<{ pass: boolean; findings: string[] }> {
  const catalog = await loadGoldenCatalogIndex();
  const findings: string[] = [];
  for (const file of readdirSync(snapshotDir).filter((f) => f.endsWith(".json") && f !== "manifest.json")) {
    const snapshot = JSON.parse(readFileSync(join(snapshotDir, file), "utf8")) as SemanticSnapshot & { runtimeSchemaVersion?: string };
    if (snapshot.runtimeSchemaVersion !== RUNTIME_SCHEMA_V8) {
      findings.push(`${label}/${file}: runtimeSchemaVersion must be ${RUNTIME_SCHEMA_V8}`);
    }
    findings.push(...walk(snapshot, `${label}/${file}`, []));
    findings.push(...runSnapshotSealGatesV8(catalog, snapshot, opts).map((e) => `${label}/${file}: ${e}`));
  }
  return { pass: findings.length === 0, findings };
}

export function writeLeakageReportV8(results: Record<string, { pass: boolean; findings: string[] }>): string {
  const path = resolve(OUT, "phase6a1-professor-plan-semantic-closure-leakage-test-report-v8.json");
  writeFileSync(path, JSON.stringify({
    version: "phase6a1-professor-plan-semantic-closure-leakage-test-report-v8",
    generatedAt: new Date().toISOString(),
    gates: [
      "prohibited_runtime_fields", "trigger_label_strings", "placeholder_oracle_stubs",
      "proxy_role_label_detection", "role_bearing_package_ids", "role_vocabulary_in_theses",
      "foreign_commander_references", "canonical_oracle_verification", "oracle_clause_evidence",
      "commander_strategy_coherence", "unified_runtime_schema_v8",
      "commander_hypothesis_evidence_linkage", "hypothesis_package_linkage",
      "commander_strategy_coherence", "independent_lens_commander_dependencies",
      "semantic_template_dev_holdout_duplicates", "holdout_intra_population_duplicates",
      "dev_role_coverage", "implementation_authority_access_boundary",
      "publishArtifactAuthorityRefs", "no_web_to_authority_imports",
    ],
    overallPass: Object.values(results).every((r) => r.pass),
    results,
  }, null, 2));
  return path;
}

export async function runFullLeakageSuiteV8(): Promise<{ pass: boolean; reportPath: string; results: Record<string, { pass: boolean; findings: string[] }> }> {
  const devDir = resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-input-v8");
  const hoDir = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v8-semantic-closure-input-v8");
  const semanticDups = findNormalizedDuplicates(devDir, hoDir);
  const holdoutIntraDups = findIntraDirectoryDuplicates(hoDir);
  const devAdjPath = resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v8.json");
  const roleCoverageFindings = existsSync(devAdjPath) ? validateDevRoleCoverage(devAdjPath) : ["missing dev adjudication v8"];

  const results = {
    dev36V8: await runCanonicalAndCoherenceGates(devDir, "dev36-v8", { strictHypothesisLinkage: false }),
    holdoutProspectiveV8: await runCanonicalAndCoherenceGates(hoDir, "holdout-prospective-v8"),
    semanticTemplateDuplicates: {
      pass: semanticDups.length === 0,
      findings: semanticDups.map((d) => `semantic template duplicate: ${d.left} ↔ ${d.right}`),
    },
    holdoutIntraPopulationDuplicates: {
      pass: holdoutIntraDups.length === 0,
      findings: holdoutIntraDups.map((d) => `holdout intra duplicate: ${d.a} ↔ ${d.b}`),
    },
    devRoleCoverage: { pass: roleCoverageFindings.length === 0, findings: roleCoverageFindings },
    implementationSealBoundary: { pass: scanImplementationSealV8().length === 0, findings: scanImplementationSealV8() },
    publishArtifactAuthorityRefs: { pass: scanRepoForAuthorityLeak(hoDir).length === 0, findings: scanRepoForAuthorityLeak(hoDir) },
    authorityPrivateGitignore: {
      pass: readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf8").includes("benchmark-authority/**/private/"),
      findings: [],
    },
    authorityAccessBoundaryEvidence: {
      pass: existsSync(resolve(OUT, "phase6a1-benchmark-authority-access-boundary-evidence-v2.json")),
      findings: [],
    },
    noWebToAuthorityImports: {
      pass: scanWebScriptsForAuthorityImports().length === 0,
      findings: scanWebScriptsForAuthorityImports(),
    },
  };
  const reportPath = writeLeakageReportV8(results);
  return { pass: Object.values(results).every((r) => r.pass), reportPath, results };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("run-phase6a1-closure-semantic-benchmark-leakage-test-v8.ts")) {
  runFullLeakageSuiteV8().then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exit(1); });
}
