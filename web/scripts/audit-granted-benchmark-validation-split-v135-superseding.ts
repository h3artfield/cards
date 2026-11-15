/**
 * Superseding audit: split catalogIdentity vs benchmarkTargetValidity for v135 expansion.
 * Does NOT modify granted-benchmark-identity-audit-v135-report.json (provenance preserved).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { auditBenchmarkValidationSplit } from "./lib/benchmark-identity";

loadEnvLocal();

const V135_VALID_TARGET_NAMES = new Set([
  "Darksteel Plate",
  "Fireshrieker",
  "Akroma's Will",
  "Archetype of Imagination",
  "Holy Avenger",
]);

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const expansion = (JSON.parse(
    readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v135.json"), "utf8"),
  ) as { cases: Array<Record<string, unknown>> }).cases;
  const negatives = (JSON.parse(
    readFileSync(resolve("data/oracle-action-eval-granted-negative-controls-v135.json"), "utf8"),
  ) as { cases: Array<Record<string, unknown>> }).cases;

  const expansionRows = expansion.map((c) =>
    auditBenchmarkValidationSplit(catalog, c as Parameters<typeof auditBenchmarkValidationSplit>[1]),
  );
  const negativeRows = negatives.map((c) =>
    auditBenchmarkValidationSplit(catalog, c as Parameters<typeof auditBenchmarkValidationSplit>[1]),
  );

  const expansionCatalogExact = expansionRows.filter((r) => r.catalogIdentity.catalogIdentityStatus === "exact").length;
  const expansionTargetValid = expansionRows.filter((r) => r.benchmarkTarget.benchmarkTargetStatus === "valid").length;

  const retired = expansionRows
    .filter((r) => r.benchmarkTarget.benchmarkTargetStatus !== "valid")
    .map((r) => ({
      caseId: r.catalogIdentity.caseId,
      intendedName: r.catalogIdentity.intendedName,
      oracleId: r.catalogIdentity.oracleId,
      catalogIdentityStatus: r.catalogIdentity.catalogIdentityStatus,
      benchmarkTargetStatus: r.benchmarkTarget.benchmarkTargetStatus,
      failureReasons: r.benchmarkTarget.failureReasons,
      targetSubstring: r.benchmarkTarget.targetSubstring,
      resolution: "RETIRED — benchmark intent invalid; do not train from. Replace with new v136 caseId/oracleId.",
    }));

  const regressionRetained = expansionRows
    .filter((r) => V135_VALID_TARGET_NAMES.has(r.catalogIdentity.intendedName))
    .map((r) => ({
      caseId: r.catalogIdentity.caseId,
      cardName: r.catalogIdentity.intendedName,
      oracleId: r.catalogIdentity.oracleId,
      note: "Preserved in granted-regression-v135-valid.json — not transfer evidence",
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "benchmark-validation-split-v135-superseding",
    supersedesInterpretationOf: "granted-benchmark-identity-audit-v135-report.json",
    note: "Original v135 audit artifact preserved. This report applies split taxonomy correction.",
    benchmarkValidationSplit: {
      catalogIdentity: {
        definition: "oracleId + canonical name + oracle text + hash (+ face if requested)",
        expansion: { exact: expansionCatalogExact, total: expansion.length },
        negatives: {
          exact: negativeRows.filter((r) => r.catalogIdentity.catalogIdentityStatus === "exact").length,
          total: negatives.length,
        },
      },
      benchmarkTargetValidity: {
        definition: "selectionRule/target span resolves in canonical oracle; machine-grounded spans when present",
        expansion: { valid: expansionTargetValid, total: expansion.length },
        negatives: {
          valid: negativeRows.filter((r) => r.benchmarkTarget.benchmarkTargetStatus === "valid").length,
          total: negatives.length,
        },
      },
    },
    v135Expansion: {
      catalogIdentityExact: expansionCatalogExact,
      benchmarkTargetValid: expansionTargetValid,
      benchmarkTargetInvalid: expansion.length - expansionTargetValid,
      retiredCaseList: retired,
      regressionRetained,
      spentArtifactNote: "oracle-action-eval-granted-classifier-expansion-v135.json is a spent development artifact",
    },
    perCase: [...expansionRows, ...negativeRows],
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-benchmark-validation-split-v135-superseding-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        expansionCatalogIdentity: `${expansionCatalogExact}/${expansion.length}`,
        expansionTargetValid: `${expansionTargetValid}/${expansion.length}`,
        retired: retired.length,
        negativesTargetValid: `${negativeRows.filter((r) => r.benchmarkTarget.benchmarkTargetStatus === "valid").length}/${negatives.length}`,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
