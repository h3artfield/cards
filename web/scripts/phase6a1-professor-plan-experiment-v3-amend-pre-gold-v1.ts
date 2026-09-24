#!/usr/bin/env npx tsx
/**
 * Pre-gold amendment pipeline for Professor v3:
 * 1) Archive spent v3 diagnostic population
 * 2) Seed amended population from v3 cases
 * 3) Recompute three-lens portfolios for all 28 cases (no GPT)
 * 4) Rerun bracket-conflict cases with corrected prompt constraint
 * 5) Write amended manifest/seal/report and WAIT for re-audit
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { formatBracketDevelopmentConstraint } from "./lib/phase6a1-bracket-constraint-v1";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import { loadFrozenSemanticOpportunityModelV322 } from "./lib/phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import {
  runProfessorPlanCaseV2,
  type ProfessorCaseExperimentRecordV2,
} from "./lib/phase6a1-professor-plan-agent-v2";
import { buildProfessorPlanningContextV2 } from "./lib/phase6a1-professor-plan-context-builder-v2";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import {
  hasUnexplainedThreeLensCollapseV3,
  selectThreeLensPortfoliosV3,
  THREE_LENS_PORTFOLIO_SELECTOR_V3_VERSION,
} from "./lib/phase6a1-three-lens-portfolio-selector-v3";
import { assertMtgRagRetrievalSemanticFreezeV1 } from "./lib/phase6a1-mtg-rag-retrieval-semantic-freeze-v1";
import type { SemanticPackage } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";

const SPENT_V3_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-spent-diagnostic");
const SOURCE_V3_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3");
const AMENDED_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended");
const AMENDED_CASES_DIR = resolve(AMENDED_DIR, "cases");

const BRACKET_RERUN_CASES = [
  "hybrid-kinnan",
  "multi-kenrith",
  "multi-korvold",
  "partner-thrasios-tymna",
  "yuriko-ninja",
] as const;

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashCaseSet(casePaths: string[]): string {
  const parts = casePaths
    .map((p) => hashFile(p))
    .sort()
    .join("\n");
  return createHash("sha256").update(parts).digest("hex");
}

function recomputeThreeLens(casePath: string): void {
  const record = JSON.parse(readFileSync(casePath, "utf8")) as Record<string, unknown> & {
    finalValidatedPackages: SemanticPackage[];
    caseId: string;
  };
  const selection = selectThreeLensPortfoliosV3(record.caseId, record.finalValidatedPackages);
  record.finalValidatedPackages = selection.enrichedPackages;
  record.threeLensPortfolios = {
    caseId: selection.caseId,
    availablePackageIds: selection.availablePackageIds,
    dependent: selection.dependent,
    independent: selection.independent,
    harmony: selection.harmony,
    sharedPackageIds: selection.sharedPackageIds,
    convergenceMode: selection.convergenceMode,
    convergenceJustification: selection.convergenceJustification,
  };
  record.threeLensSelectorVersion = THREE_LENS_PORTFOLIO_SELECTOR_V3_VERSION;
  record.threeLensPairwiseEquivalences = selection.pairwiseEquivalences;
  record.threeLensCollapseUnexplained = hasUnexplainedThreeLensCollapseV3(selection);
  record.preGoldAmendment = {
    version: "phase6a1-professor-plan-experiment-v3-amended-pre-gold-v1",
    amendedAt: new Date().toISOString(),
    threeLensRecomputed: true,
  };
  if (record.threeLensCollapseUnexplained) {
    record.caseStatus = "SEALED_FAILURE";
  } else if ((record.finalValidatedPackages as SemanticPackage[]).length === 0) {
    record.caseStatus = "SEALED_FAILURE";
  } else {
    record.caseStatus = "SEALED_SUCCESS";
  }
  writeFileSync(casePath, JSON.stringify(record, null, 2));
}

async function rerunBracketCase(caseId: string, stackFreezeSha: string): Promise<string> {
  const catalog = getImplementedMechanismCatalog();
  const entry = catalog.find((c) => c.caseId === caseId);
  if (!entry) throw new Error(`Missing catalog entry ${caseId}`);
  const model = loadFrozenSemanticOpportunityModelV322();
  const oppCase = model.cases.find((c) => c.caseId === caseId);
  if (!oppCase) throw new Error(`Missing opportunities for ${caseId}`);

  const ctx = await buildProfessorPlanningContextV2(entry, oppCase);
  const expectedConstraint = formatBracketDevelopmentConstraint(entry.bracket);
  if (!ctx.userConstraints.includes(expectedConstraint)) {
    throw new Error(`Bracket constraint mismatch for ${caseId}: expected ${expectedConstraint}`);
  }

  const record = await runProfessorPlanCaseV2(ctx, {
    experimentPurpose: "FORMAL_EXPERIMENT",
    stackFreezeManifestSha256: stackFreezeSha,
  });
  (record as Record<string, unknown>).preGoldAmendment = {
    version: "phase6a1-professor-plan-experiment-v3-amended-pre-gold-v1",
    amendedAt: new Date().toISOString(),
    bracketPromptRerun: true,
    structuredBracket: entry.bracket,
    bracketConstraint: expectedConstraint,
  };

  const casePath = resolve(AMENDED_CASES_DIR, `${caseId}.json`);
  writeFileSync(casePath, JSON.stringify(record, null, 2));
  return casePath;
}

async function main() {
  loadProjectEnvLocal();
  process.env.MTG_RAG_ENABLED = "true";
  assertMtgRagRetrievalSemanticFreezeV1();

  const skipBracketRerun = process.env.PROFESSOR_V3_AMEND_SKIP_BRACKET_RERUN === "1";
  const skipArchive = process.env.PROFESSOR_V3_AMEND_SKIP_ARCHIVE === "1";

  mkdirSync(AMENDED_CASES_DIR, { recursive: true });

  if (!skipArchive) {
    mkdirSync(SPENT_V3_DIR, { recursive: true });
    for (const name of [
      "phase6a1-professor-plan-experiment-manifest-v3.json",
      "phase6a1-professor-plan-experiment-sealed-v3.json",
      "phase6a1-professor-plan-experiment-report-v3.json",
      "phase6a1-professor-plan-experiment-v3-completion-v1.json",
    ]) {
      const src = resolve(SOURCE_V3_DIR, name);
      if (existsSync(src)) copyFileSync(src, resolve(SPENT_V3_DIR, name));
    }
    mkdirSync(resolve(SPENT_V3_DIR, "cases"), { recursive: true });
    for (const file of readdirSync(resolve(SOURCE_V3_DIR, "cases")).filter((f) => f.endsWith(".json"))) {
      copyFileSync(resolve(SOURCE_V3_DIR, "cases", file), resolve(SPENT_V3_DIR, "cases", file));
    }
  }

  for (const file of readdirSync(resolve(SOURCE_V3_DIR, "cases")).filter((f) => f.endsWith(".json"))) {
    const dest = resolve(AMENDED_CASES_DIR, file);
    if (!existsSync(dest)) {
      copyFileSync(resolve(SOURCE_V3_DIR, "cases", file), dest);
    }
  }

  for (const file of readdirSync(AMENDED_CASES_DIR).filter((f) => f.endsWith(".json"))) {
    recomputeThreeLens(resolve(AMENDED_CASES_DIR, file));
  }

  const stackFreezeSha = JSON.parse(
    readFileSync(
      resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v2-stack-freeze-v1.json"),
      "utf8",
    ),
  ).manifestSha256 as string;

  if (!skipBracketRerun) {
    for (const caseId of BRACKET_RERUN_CASES) {
      console.log(`Rerunning bracket-amended case ${caseId}`);
      await rerunBracketCase(caseId, stackFreezeSha);
      recomputeThreeLens(resolve(AMENDED_CASES_DIR, `${caseId}.json`));
    }
  }

  const caseFiles = readdirSync(AMENDED_CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const casePaths = caseFiles.map((f) => resolve(AMENDED_CASES_DIR, f));
  const caseRecords = casePaths.map((p) => JSON.parse(readFileSync(p, "utf8")) as ProfessorCaseExperimentRecordV2);

  const manifest = {
    version: "phase6a1-professor-plan-experiment-manifest-v3-amended",
    generatedAt: new Date().toISOString(),
    sourceSpentDiagnostic: "phase6a1-professor-plan-experiment-v3-spent-diagnostic",
    preGoldAuditReference: "phase6a1-professor-plan-experiment-v3-pre-gold-audit-gpt56sol-v1.json",
    amendment: {
      version: "phase6a1-professor-plan-experiment-v3-amended-pre-gold-v1",
      bracketPromptRepair: true,
      threeLensSelectorVersion: THREE_LENS_PORTFOLIO_SELECTOR_V3_VERSION,
      bracketRerunCases: [...BRACKET_RERUN_CASES],
    },
    authorization: {
      semanticRetrievalFreeze: "FROZEN",
      professorV3FormalRun: "AMENDED_PRE_GOLD",
      preGoldAudit: "AWAITING_INDEPENDENT_REAUDIT",
      goldComparison: "KEEP_SEALED",
      corpusIngest: "KEEP_BLOCKED",
    },
    cases: caseRecords.map((r) => ({
      caseId: r.caseId,
      commanders: r.commanders,
      caseArtifactPath: `cases/${r.caseId}.json`,
      hypothesisCount: r.proposedHypotheses?.length ?? 0,
      validatedPackageCount: r.finalValidatedPackages?.length ?? 0,
      caseStatus: r.caseStatus,
      threeLensCollapseUnexplained: r.threeLensCollapseUnexplained,
      status: r.caseStatus === "RUNTIME_FAILURE" ? "FAILED" : "SEALED",
    })),
    population: {
      cases: caseRecords.length,
      sealedSuccessCases: caseRecords.filter((r) => r.caseStatus === "SEALED_SUCCESS").length,
      runtimeFailureCases: caseRecords.filter((r) => r.caseStatus === "RUNTIME_FAILURE").length,
      threeLensCollapseCases: caseRecords.filter((r) => r.threeLensCollapseUnexplained).length,
      totalHypotheses: caseRecords.reduce((n, r) => n + (r.proposedHypotheses?.length ?? 0), 0),
      totalValidatedPackages: caseRecords.reduce((n, r) => n + (r.finalValidatedPackages?.length ?? 0), 0),
    },
  };

  const manifestPath = resolve(AMENDED_DIR, "phase6a1-professor-plan-experiment-manifest-v3-amended.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const manifestSha256 = hashFile(manifestPath);
  const caseSetSha256 = hashCaseSet(casePaths);
  const sealedAt = new Date().toISOString();

  const runtimeComplete = manifest.population.runtimeFailureCases === 0;
  const preGoldClear =
    runtimeComplete && manifest.population.threeLensCollapseCases === 0 && manifest.population.sealedSuccessCases === 28;

  const sealed = {
    version: "phase6a1-professor-plan-experiment-sealed-v3-amended",
    sealedAt,
    caseCount: caseRecords.length,
    manifestSha256,
    caseSetSha256,
    sealKind: preGoldClear ? "AMENDED_AWAIT_PRE_GOLD_REAUDIT" : "AMENDED_INTERIM",
    preGoldAuditStatus: preGoldClear ? "AWAITING_INDEPENDENT_REAUDIT" : "BLOCKED_VALIDATION_OR_RUNTIME",
    goldEvaluationStatus: "NOT_RUN",
    note: "Amended Professor v3 population after pre-gold BLOCK repairs. Original v3 preserved as spent diagnostic evidence.",
    provenanceSidecar: "phase6a1-professor-plan-experiment-v3-seal-provenance-sidecar-v1.json",
  };

  const report = {
    version: "phase6a1-professor-plan-experiment-report-v3-amended",
    generatedAt: sealedAt,
    overallStatus: preGoldClear ? "AMENDED_AWAIT_PRE_GOLD_REAUDIT" : "AMENDED_PARTIAL_OR_BLOCKED",
    summary: manifest.population,
    goldComparison: "KEEP_SEALED",
  };

  writeFileSync(resolve(AMENDED_DIR, "phase6a1-professor-plan-experiment-sealed-v3-amended.json"), JSON.stringify(sealed, null, 2));
  writeFileSync(resolve(AMENDED_DIR, "phase6a1-professor-plan-experiment-report-v3-amended.json"), JSON.stringify(report, null, 2));

  const sidecar = {
    version: "phase6a1-professor-plan-experiment-v3-seal-provenance-sidecar-v1",
    recordedAt: sealedAt,
    originalSealArtifact: "phase6a1-professor-plan-experiment-sealed-v3.json",
    originalSealByteSha256: "ce3b310891223d2107a827124396a143db06c56d277d3d1d11b5b0dfc1c2de31",
    staleField: {
      field: "partialSealArchive",
      recordedValue: "phase6a1-professor-plan-experiment-v2-run-history/partial-seal-credit-exhaustion-2026-08-13/partial-seal-record.json",
      correction: "Credit-exhaustion partial seal belongs to v3 run-history at phase6a1-professor-plan-experiment-v3-run-history/partial-seal-credit-exhaustion-2026-08-14/partial-seal-record.json",
      policy: "Original sealed-v3 bytes preserved; this sidecar records metadata correction only.",
    },
    spentDiagnosticArchive: "phase6a1-professor-plan-experiment-v3-spent-diagnostic",
    amendedPopulation: "phase6a1-professor-plan-experiment-v3-amended",
  };
  writeFileSync(
    resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-seal-provenance-sidecar-v1.json"),
    JSON.stringify(sidecar, null, 2),
  );

  writeFileSync(
    resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-spent-diagnostic-manifest-v1.json"),
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-experiment-v3-spent-diagnostic-manifest-v1",
        spentAt: sealedAt,
        status: "SPENT_DIAGNOSTIC_PRE_GOLD_BLOCK",
        policy: "Original v3 formal run preserved for diagnostic comparison. Do not use for gold comparison.",
        originalSealByteSha256: sidecar.originalSealByteSha256,
        preGoldAudit: "phase6a1-professor-plan-experiment-v3-pre-gold-audit-gpt56sol-v1.json",
        successor: "phase6a1-professor-plan-experiment-v3-amended",
      },
      null,
      2,
    ),
  );

  copyFileSync(
    "C:/Users/h3art/Downloads/phase6a1-professor-plan-experiment-v3-pre-gold-audit-gpt56sol-v1.json",
    resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-pre-gold-audit-gpt56sol-v1.json"),
  );

  console.log(
    JSON.stringify(
      {
        amendedDir: AMENDED_DIR,
        manifestSha256,
        caseSetSha256,
        population: manifest.population,
        preGoldClear,
        skipBracketRerun,
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
