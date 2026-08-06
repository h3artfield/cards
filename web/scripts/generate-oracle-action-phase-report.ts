/**
 * Generate phase-3 operational report: deployment identity, rulings tests,
 * atomic promotion, parser v1 eval, and pilot status.
 * Run: npx tsx scripts/generate-oracle-action-phase-report.ts
 */
import { execSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function git(cmd: string): string {
  try {
    return execSync(cmd, { cwd: resolve(process.cwd(), ".."), encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  const reportPath = resolve(process.cwd(), "reports", "oracle-action-phase-report.json");
  const evalPath = resolve(process.cwd(), "reports", "oracle-action-extraction-eval-v2.json");
  const lockPath = resolve(process.cwd(), "scripts", ".staging-deployment-lock.json");

  let deploymentLock: Record<string, unknown> = {};
  try {
    deploymentLock = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    /* not deployed yet */
  }

  let evalReport: Record<string, unknown> = {};
  try {
    evalReport = JSON.parse(readFileSync(evalPath, "utf8"));
  } catch {
    /* run eval first */
  }

  const evalCases = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-cases.json"), "utf8"),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    deployment: {
      gitCommitSha: deploymentLock.gitCommitSha ?? git("git rev-parse HEAD"),
      gitTreeState: git("git status --porcelain") ? "dirty" : "clean",
      imageDigest: deploymentLock.imageDigest ?? "pending-deploy",
      cloudRunRevision: deploymentLock.cloudRunRevision ?? "pending-deploy",
      rulingsImporterVersion: "scryfall-rulings-bulk-v1",
      activeRulingsDatasetVersion: deploymentLock.activeRulingsDatasetVersion ?? "from-firestore-global",
    },
    rulingsConcurrencyTests: {
      script: "scripts/test-rulings-concurrency.ts",
      scenarios: [
        "second import during active import",
        "reset during import",
        "reconciliation during import",
        "stale lock expiry",
        "non-stale lock preserved",
        "failed reconciliation blocks promotion",
        "successful atomic promotion with rollback version",
        "readers never see partial version",
      ],
    },
    atomicPromotion: {
      structure: "catalogRulingsVersions/{versionId}/rulings/{rulingId}",
      activePointer: "catalogSyncState/global.activeRulingsVersionId",
      rollbackField: "catalogSyncState/global.previousRulingsVersionId",
      behavior: "Import builds complete version; pointer updated in single transaction",
    },
    oracleActionParserV1: {
      parserVersion: "oracle-action-v1-deterministic",
      pipeline: [
        "oracle_card",
        "card_faces",
        "ability_paragraph_segmentation",
        "ability_type_classification",
        "trigger_cost_effect_extraction",
        "evidence_span_validation",
        "structured_actions",
        "derived_roles",
      ],
      modelAssistance: "reserved for unresolved clauses only — not yet enabled",
      actionsSeparateFromRoles: true,
    },
    evaluationSet: {
      caseCount: evalCases.caseCount,
      path: "data/oracle-action-eval-cases.json",
      productionGates: evalReport.productionGates ?? null,
      fieldMetrics: evalReport.fieldMetrics ?? null,
      abstentionRate: evalReport.abstentionRate ?? null,
      unsupportedEffectCount: evalReport.unsupportedEffectCount ?? null,
      evidenceSpanValidationRate: evalReport.evidenceSpanValidationRate ?? null,
      gatesPassed: evalReport.allProductionGatesPass ?? false,
    },
    pilot500: {
      status: evalReport.allProductionGatesPass ? "ready_to_run" : "blocked_until_eval_gates_pass",
      script: "scripts/oracle-action-pilot-design.ts",
    },
    unresolvedInventory: {
      note: "Fail-closed — excluded from action parser failure counts",
      categories: ["oracle_only_listings", "composite_products", "token_products"],
    },
    evalReport,
  };

  mkdirSync(resolve(reportPath, ".."), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
