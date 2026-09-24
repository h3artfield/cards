#!/usr/bin/env npx tsx
/**
 * Pre-gold amendment v5: canonical ontology v3 + synergy graph v5 recompute only.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasUnexplainedThreeLensCollapseV5,
  selectThreeLensPortfoliosV5,
  THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION,
} from "./lib/phase6a1-three-lens-portfolio-selector-v5";
import { PACKAGE_SYNERGY_GRAPH_V5_VERSION } from "./lib/phase6a1-package-synergy-graph-v5";
import { CANONICAL_RESOURCE_ONTOLOGY_V3_VERSION } from "./lib/phase6a1-canonical-resource-ontology-v3";
import type { SemanticPackage } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type { ProfessorCaseExperimentRecordV2 } from "./lib/phase6a1-professor-plan-agent-v2";

const SPENT_AMENDED_V4_DIR = resolve(
  "data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v4-spent-diagnostic",
);
const SOURCE_AMENDED_V4_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v4");
const AMENDED_V5_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v5");
const AMENDED_V5_CASES_DIR = resolve(AMENDED_V5_DIR, "cases");
const PRE_GOLD_REAUDIT_SOURCE =
  "C:/Users/h3art/Downloads/phase6a1-professor-plan-experiment-v3-amended-v4-pre-gold-reaudit-gpt56sol-v2.json";

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

function stripDerivedGraphFields(packages: SemanticPackage[]): SemanticPackage[] {
  return packages.map((p) => ({
    ...p,
    dependsOnPackageIds: [],
    overlapsWithPackageIds: [],
  }));
}

function recomputeThreeLens(casePath: string): void {
  const record = JSON.parse(readFileSync(casePath, "utf8")) as Record<string, unknown> & {
    finalValidatedPackages: SemanticPackage[];
    caseId: string;
  };
  const selection = selectThreeLensPortfoliosV5(record.caseId, stripDerivedGraphFields(record.finalValidatedPackages));
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
  record.threeLensSelectorVersion = THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION;
  record.synergyGraphVersion = PACKAGE_SYNERGY_GRAPH_V5_VERSION;
  record.canonicalResourceOntologyVersion = CANONICAL_RESOURCE_ONTOLOGY_V3_VERSION;
  record.harmonyDetermination = selection.harmonyDetermination;
  record.packageSynergyTypedEdges = selection.packageSynergyTypedEdges;
  record.synergyGraphQA = selection.synergyGraphQA;
  record.threeLensPairwiseEquivalences = selection.pairwiseEquivalences;
  record.threeLensCollapseUnexplained = hasUnexplainedThreeLensCollapseV5(selection);
  record.preGoldAmendment = {
    version: "phase6a1-professor-plan-experiment-v3-amended-pre-gold-v5",
    amendedAt: new Date().toISOString(),
    synergyGraphRecomputed: true,
    threeLensRecomputed: true,
    professorRerun: false,
  };
  if (record.threeLensCollapseUnexplained || !selection.synergyGraphQA.passed) {
    record.caseStatus = "SEALED_FAILURE";
  } else if (selection.enrichedPackages.length === 0) {
    record.caseStatus = "SEALED_FAILURE";
  } else {
    record.caseStatus = "SEALED_SUCCESS";
  }
  writeFileSync(casePath, JSON.stringify(record, null, 2));
}

async function main() {
  const skipArchive = process.env.PROFESSOR_V3_AMEND_V5_SKIP_ARCHIVE === "1";

  mkdirSync(AMENDED_V5_CASES_DIR, { recursive: true });

  if (!skipArchive) {
    mkdirSync(SPENT_AMENDED_V4_DIR, { recursive: true });
    for (const name of readdirSync(SOURCE_AMENDED_V4_DIR)) {
      const src = resolve(SOURCE_AMENDED_V4_DIR, name);
      const dest = resolve(SPENT_AMENDED_V4_DIR, name);
      if (name === "cases") {
        mkdirSync(dest, { recursive: true });
        for (const file of readdirSync(src).filter((f) => f.endsWith(".json"))) {
          copyFileSync(resolve(src, file), resolve(dest, file));
        }
      } else if (!name.startsWith(".")) {
        copyFileSync(src, dest);
      }
    }
  }

  for (const file of readdirSync(resolve(SOURCE_AMENDED_V4_DIR, "cases")).filter((f) => f.endsWith(".json"))) {
    const dest = resolve(AMENDED_V5_CASES_DIR, file);
    if (!existsSync(dest)) {
      copyFileSync(resolve(SOURCE_AMENDED_V4_DIR, "cases", file), dest);
    }
  }

  for (const file of readdirSync(AMENDED_V5_CASES_DIR).filter((f) => f.endsWith(".json"))) {
    recomputeThreeLens(resolve(AMENDED_V5_CASES_DIR, file));
  }

  const caseFiles = readdirSync(AMENDED_V5_CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const casePaths = caseFiles.map((f) => resolve(AMENDED_V5_CASES_DIR, f));
  const caseRecords = casePaths.map((p) => JSON.parse(readFileSync(p, "utf8")) as ProfessorCaseExperimentRecordV2 & {
    synergyGraphQA?: { passed: boolean; semanticRegressions?: Array<{ id: string; passed: boolean }> };
    packageSynergyTypedEdges?: Array<{ kind: string; support?: { consumerField?: string } }>;
    harmonyDetermination?: string;
  });

  const graphQaFailures = caseRecords.filter((r) => r.synergyGraphQA && !r.synergyGraphQA.passed).length;
  const typedEdgeCount = caseRecords.reduce((n, r) => n + (r.packageSynergyTypedEdges?.length ?? 0), 0);
  const semanticRequirementCausalEdges = caseRecords.reduce((n, r) => {
    const edges = r.packageSynergyTypedEdges ?? [];
    return (
      n +
      edges.filter(
        (e) =>
          (e.kind === "REQUIRES_FROM" || e.kind === "PRODUCES_FOR") &&
          e.support?.consumerField === "semanticRequirements",
      ).length
    );
  }, 0);

  const manifest = {
    version: "phase6a1-professor-plan-experiment-manifest-v3-amended-v5",
    generatedAt: new Date().toISOString(),
    sourceSpentDiagnostic: "phase6a1-professor-plan-experiment-v3-amended-v4-spent-diagnostic",
    preGoldAuditReference: "phase6a1-professor-plan-experiment-v3-amended-v4-pre-gold-reaudit-gpt56sol-v2.json",
    amendment: {
      version: "phase6a1-professor-plan-experiment-v3-amended-pre-gold-v5",
      professorRerun: false,
      canonicalResourceOntologyVersion: CANONICAL_RESOURCE_ONTOLOGY_V3_VERSION,
      synergyGraphVersion: PACKAGE_SYNERGY_GRAPH_V5_VERSION,
      threeLensSelectorVersion: THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION,
      semanticRoleCompatibility: true,
      requiredResourcesOnlyCausal: true,
    },
    authorization: {
      semanticRetrievalFreeze: "FROZEN",
      professorV3FormalRun: "AMENDED_PRE_GOLD_V5",
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
      harmonyDetermination: (r as { harmonyDetermination?: string }).harmonyDetermination,
      synergyGraphQAPassed: (r as { synergyGraphQA?: { passed: boolean } }).synergyGraphQA?.passed ?? false,
      status: r.caseStatus === "RUNTIME_FAILURE" ? "FAILED" : "SEALED",
    })),
    population: {
      cases: caseRecords.length,
      sealedSuccessCases: caseRecords.filter((r) => r.caseStatus === "SEALED_SUCCESS").length,
      runtimeFailureCases: caseRecords.filter((r) => r.caseStatus === "RUNTIME_FAILURE").length,
      threeLensCollapseCases: caseRecords.filter((r) => r.threeLensCollapseUnexplained).length,
      synergyGraphQAFailures: graphQaFailures,
      semanticRequirementCausalEdges,
      totalHypotheses: caseRecords.reduce((n, r) => n + (r.proposedHypotheses?.length ?? 0), 0),
      totalValidatedPackages: caseRecords.reduce((n, r) => n + (r.finalValidatedPackages?.length ?? 0), 0),
      totalTypedSynergyEdges: typedEdgeCount,
    },
  };

  const manifestPath = resolve(AMENDED_V5_DIR, "phase6a1-professor-plan-experiment-manifest-v3-amended-v5.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const manifestSha256 = hashFile(manifestPath);
  const caseSetSha256 = hashCaseSet(casePaths);
  const sealedAt = new Date().toISOString();

  const preGoldClear =
    manifest.population.runtimeFailureCases === 0 &&
    manifest.population.threeLensCollapseCases === 0 &&
    manifest.population.synergyGraphQAFailures === 0 &&
    manifest.population.semanticRequirementCausalEdges === 0 &&
    manifest.population.sealedSuccessCases === 28;

  const sealed = {
    version: "phase6a1-professor-plan-experiment-sealed-v3-amended-v5",
    sealedAt,
    caseCount: caseRecords.length,
    manifestSha256,
    caseSetSha256,
    sealKind: preGoldClear ? "AMENDED_V5_AWAIT_PRE_GOLD_REAUDIT" : "AMENDED_V5_INTERIM",
    preGoldAuditStatus: preGoldClear ? "AWAITING_INDEPENDENT_REAUDIT" : "BLOCKED_VALIDATION_OR_GRAPH_QA",
    goldEvaluationStatus: "NOT_RUN",
    note: "Amendment v5: semantic-role compatibility; requiredResources-only causal edges. Professor outputs unchanged.",
    provenanceSidecar: "phase6a1-professor-plan-experiment-v3-seal-provenance-sidecar-v1.json",
    predecessorAmendedPopulation: "phase6a1-professor-plan-experiment-v3-amended-v4-spent-diagnostic",
  };

  const report = {
    version: "phase6a1-professor-plan-experiment-report-v3-amended-v5",
    generatedAt: sealedAt,
    overallStatus: preGoldClear ? "AMENDED_V5_AWAIT_PRE_GOLD_REAUDIT" : "AMENDED_V5_PARTIAL_OR_BLOCKED",
    summary: manifest.population,
    goldComparison: "KEEP_SEALED",
  };

  writeFileSync(resolve(AMENDED_V5_DIR, "phase6a1-professor-plan-experiment-sealed-v3-amended-v5.json"), JSON.stringify(sealed, null, 2));
  writeFileSync(resolve(AMENDED_V5_DIR, "phase6a1-professor-plan-experiment-report-v3-amended-v5.json"), JSON.stringify(report, null, 2));

  writeFileSync(
    resolve(AMENDED_V5_DIR, "phase6a1-professor-plan-experiment-v3-amended-v5-completion-v1.json"),
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-experiment-v3-amended-v5-completion-v1",
        completedAt: sealedAt,
        status: preGoldClear ? "AMENDED_V5_AWAIT_PRE_GOLD_REAUDIT" : "AMENDED_V5_PARTIAL_OR_BLOCKED",
        predecessor: {
          version: "phase6a1-professor-plan-experiment-v3-amended-v4-completion-v1",
          status: "SPENT_DIAGNOSTIC_PRE_GOLD_BLOCK",
          archive: "phase6a1-professor-plan-experiment-v3-amended-v4-spent-diagnostic",
          preGoldReaudit: "phase6a1-professor-plan-experiment-v3-amended-v4-pre-gold-reaudit-gpt56sol-v2.json",
          preGoldReauditDisposition: "BLOCK",
        },
        repairs: {
          canonicalResourceOntologyVersion: CANONICAL_RESOURCE_ONTOLOGY_V3_VERSION,
          synergyGraphVersion: PACKAGE_SYNERGY_GRAPH_V5_VERSION,
          semanticRoleCompatibility: true,
          requiredResourcesOnlyCausal: true,
          semanticRegressionAssertions: 15,
          professorRerun: false,
        },
        population: manifest.population,
        artifacts: {
          manifest: "phase6a1-professor-plan-experiment-manifest-v3-amended-v5.json",
          manifestSha256,
          sealed: "phase6a1-professor-plan-experiment-sealed-v3-amended-v5.json",
          caseSetSha256,
          report: "phase6a1-professor-plan-experiment-report-v3-amended-v5.json",
        },
        gateDisposition: {
          semanticRetrievalFreeze: "FROZEN",
          professorV3FormalRun: "AMENDED_PRE_GOLD_V5",
          preGoldAudit: "AWAITING_INDEPENDENT_REAUDIT",
          goldComparison: "KEEP_SEALED",
          corpusIngest: "KEEP_BLOCKED",
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v4-spent-diagnostic-manifest-v1.json"),
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-experiment-v3-amended-v4-spent-diagnostic-manifest-v1",
        spentAt: sealedAt,
        status: "SPENT_DIAGNOSTIC_PRE_GOLD_BLOCK",
        policy:
          "Amended v4 population preserved after re-audit BLOCK on semantic-role compatibility. Do not use for gold comparison.",
        preGoldReaudit: "phase6a1-professor-plan-experiment-v3-amended-v4-pre-gold-reaudit-gpt56sol-v2.json",
        successor: "phase6a1-professor-plan-experiment-v3-amended-v5",
      },
      null,
      2,
    ),
  );

  if (existsSync(PRE_GOLD_REAUDIT_SOURCE)) {
    copyFileSync(
      PRE_GOLD_REAUDIT_SOURCE,
      resolve(
        "data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v4-pre-gold-reaudit-gpt56sol-v2.json",
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        amendedV5Dir: AMENDED_V5_DIR,
        manifestSha256,
        caseSetSha256,
        population: manifest.population,
        preGoldClear,
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
