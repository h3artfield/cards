/**
 * Immutable RC3 v1.34 stabilization freeze manifest.
 * Run after commit: cd web && npx tsx scripts/freeze-rc3-stabilization-v134-manifest.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-transform";
import { DEFAULT_RC3_PROMOTED_FAMILIES } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitBlobSha(repoRoot: string, relPath: string): string {
  return execSync(`git hash-object ${relPath}`, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const commitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const transformBlob = gitBlobSha(repoRoot, "web/src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts");
  const clauseNativeBlob = gitBlobSha(repoRoot, "web/src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts");
  const matcherBlob = gitBlobSha(repoRoot, "web/scripts/oracle-action-semantic-matcher.ts");

  const gateReport = JSON.parse(
    readFileSync("data/milestones/rc3-development/rc3-checkpoint-v134-report.json", "utf8"),
  ) as {
    metrics: {
      combinedDevelopment: {
        accepted: { tp: number; fp: number; fn: number; precision: number; recall: number };
        semanticInvalidActionCount: number;
        semanticValidatorViolationCount: number;
        invariants: { permissionLeakage: number };
      };
      unrelatedCatalogPositiveSlice: { accepted: { tp: number; fp: number; fn: number; precision: number; recall: number } };
      policyGuardrails: { acceptedViolations: number; forbiddenActionsEmitted: number };
    };
  };

  const manifestBody = {
    freezeLabel: "rc3-stabilization-v134-checkpoint-1",
    frozenAt: new Date().toISOString(),
    immutableV133ParentCommit: "776093564921f6e6fb69564b3446d7befbdb7468",
    commitSha,
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserBlobs: {
      transform: transformBlob,
      clauseNative: clauseNativeBlob,
    },
    taxonomyVersion: "three-layer-v1.4",
    taxonomyV14Hash: sha256File("data/oracle-action-eval-development-v26-v14.json"),
    goldMigrationOverlay: {
      path: "data/milestones/rc3-development/persistent-permission-gold-migration-v135.json",
      hash: sha256File("data/milestones/rc3-development/persistent-permission-gold-migration-v135.json"),
    },
    caseScopeSchema: {
      path: "data/milestones/rc3-foundations/benchmark-case-scope-schema-v1.1.json",
      hash: sha256File("data/milestones/rc3-foundations/benchmark-case-scope-schema-v1.1.json"),
    },
    evaluator: {
      matcherScript: "web/scripts/oracle-action-semantic-matcher.ts",
      matcherBlobSha: matcherBlob,
      scoringPath: "live_full_semantic_matcher",
      scoringPathNote:
        "Authoritative development metrics use live reparse + semanticPrimitiveMatchesExpected — NOT frozen loose rescore",
    },
    DEFAULT_RC3_PROMOTED_FAMILIES,
    authoritativeDevelopment: {
      scoringPath: "live_full_semantic_matcher",
      tp: gateReport.metrics.combinedDevelopment.accepted.tp,
      fp: gateReport.metrics.combinedDevelopment.accepted.fp,
      fn: gateReport.metrics.combinedDevelopment.accepted.fn,
      precision: gateReport.metrics.combinedDevelopment.accepted.precision,
      recall: gateReport.metrics.combinedDevelopment.accepted.recall,
    },
    unrelatedCatalogPositive: gateReport.metrics.unrelatedCatalogPositiveSlice.accepted,
    policyGuardrails: {
      acceptedViolations: gateReport.metrics.policyGuardrails.acceptedViolations,
      forbiddenActionsEmitted: gateReport.metrics.policyGuardrails.forbiddenActionsEmitted,
      pass: gateReport.metrics.policyGuardrails.acceptedViolations === 0,
    },
    semanticInvalidActionCount: gateReport.metrics.combinedDevelopment.semanticInvalidActionCount,
    semanticValidatorViolationCount: gateReport.metrics.combinedDevelopment.semanticValidatorViolationCount,
    permissionLeakage: gateReport.metrics.combinedDevelopment.invariants.permissionLeakage,
    stabilizationAccounting: {
      originalV132ToV133ParserRegressionsRestored: "12/12",
      yawgmothPlayRegressions: 0,
    },
    staticPermissionInvariant:
      "StaticPermissionRecord.duration is continuous|while_condition|until_end_of_turn|this_turn only — one-shot resolution referents are Layer-2 cast/play, never persisted permissions",
    v13: {
      sealed: true,
      parserExecutionCount: 0,
    },
    artifactRefs: {
      devGateReport: "data/milestones/rc3-development/rc3-checkpoint-v134-report.json",
      checkpointReport: "data/milestones/rc3-development/rc3-stabilization-v134-checkpoint-report.json",
      frozenVsLiveReconciliation: "data/milestones/rc3-development/frozen-vs-live-reconciliation-v134.json",
    },
  };

  const serialized = `${JSON.stringify(manifestBody, null, 2)}\n`;
  const manifestHash = createHash("sha256").update(serialized).digest("hex");
  const manifest = { ...manifestBody, manifestContentHash: manifestHash };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "rc3-stabilization-v134-freeze-manifest.json");
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, manifestHash, commitSha, transformBlob, clauseNativeBlob }, null, 2));
}

main();
