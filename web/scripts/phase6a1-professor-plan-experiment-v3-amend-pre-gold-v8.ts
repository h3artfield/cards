#!/usr/bin/env npx tsx
/**
 * Pre-gold amendment v8: ontology v6 atomic conjuncts + cardinality; graph v8; v7 Hua Tuo fix preserved.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasUnexplainedThreeLensCollapseV5,
  selectThreeLensPortfoliosV5,
  THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION,
} from "./lib/phase6a1-three-lens-portfolio-selector-v5";
import {
  auditCausalPredecessorDiff,
  PACKAGE_SYNERGY_GRAPH_V8_VERSION,
  type PackageSynergyTypedEdge,
} from "./lib/phase6a1-package-synergy-graph-v8";
import { CANONICAL_RESOURCE_ONTOLOGY_V6_VERSION } from "./lib/phase6a1-canonical-resource-ontology-v6";
import type { SemanticPackage } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type { ProfessorCaseExperimentRecordV2 } from "./lib/phase6a1-professor-plan-agent-v2";

const SPENT_AMENDED_V7_DIR = resolve(
  "data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v7-spent-diagnostic",
);
const SOURCE_AMENDED_V7_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v7");
const AMENDED_V8_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v8");
const AMENDED_V8_CASES_DIR = resolve(AMENDED_V8_DIR, "cases");
const PRE_GOLD_REAUDIT_SOURCE =
  "C:/Users/h3art/Downloads/phase6a1-professor-plan-experiment-v3-amended-v7-pre-gold-reaudit-gpt56sol-v1.json";
const EXPECTED_V8_CAUSAL_TYPED_EDGE_RECORDS = 44;

type CaseRecord = ProfessorCaseExperimentRecordV2 & {
  synergyGraphQA?: {
    passed: boolean;
    sharedEnablerEdgeCount?: number;
    sharedPayoffEdgeCount?: number;
    symmetricEdgeAuditFailures?: number;
  };
  packageSynergyTypedEdges?: PackageSynergyTypedEdge[];
  harmonyDetermination?: string;
};

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

function causalEdges(record: CaseRecord): PackageSynergyTypedEdge[] {
  return (record.packageSynergyTypedEdges ?? []).filter(
    (e) => e.kind === "REQUIRES_FROM" || e.kind === "PRODUCES_FOR",
  );
}

function loadCaseRecords(casesDir: string): CaseRecord[] {
  return readdirSync(casesDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(resolve(casesDir, f), "utf8")) as CaseRecord);
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
  record.synergyGraphVersion = PACKAGE_SYNERGY_GRAPH_V8_VERSION;
  record.canonicalResourceOntologyVersion = CANONICAL_RESOURCE_ONTOLOGY_V6_VERSION;
  record.harmonyDetermination = selection.harmonyDetermination;
  record.packageSynergyTypedEdges = selection.packageSynergyTypedEdges;
  record.synergyGraphQA = selection.synergyGraphQA;
  record.threeLensPairwiseEquivalences = selection.pairwiseEquivalences;
  record.threeLensCollapseUnexplained = hasUnexplainedThreeLensCollapseV5(selection);
  record.preGoldAmendment = {
    version: "phase6a1-professor-plan-experiment-v3-amended-pre-gold-v8",
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
  const skipArchive = process.env.PROFESSOR_V3_AMEND_V8_SKIP_ARCHIVE === "1";

  mkdirSync(AMENDED_V8_CASES_DIR, { recursive: true });

  if (!skipArchive) {
    mkdirSync(SPENT_AMENDED_V7_DIR, { recursive: true });
    for (const name of readdirSync(SOURCE_AMENDED_V7_DIR)) {
      const src = resolve(SOURCE_AMENDED_V7_DIR, name);
      const dest = resolve(SPENT_AMENDED_V7_DIR, name);
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

  const predecessorCasesDir = resolve(SPENT_AMENDED_V7_DIR, "cases");
  if (!existsSync(predecessorCasesDir)) {
    throw new Error(`Missing predecessor v7 spent cases at ${predecessorCasesDir}`);
  }
  const predecessorRecords = loadCaseRecords(predecessorCasesDir);
  const predecessorCausal = predecessorRecords.flatMap(causalEdges);

  for (const file of readdirSync(resolve(SOURCE_AMENDED_V7_DIR, "cases")).filter((f) => f.endsWith(".json"))) {
    const dest = resolve(AMENDED_V8_CASES_DIR, file);
    if (!existsSync(dest)) {
      copyFileSync(resolve(SOURCE_AMENDED_V7_DIR, "cases", file), dest);
    }
  }

  for (const file of readdirSync(AMENDED_V8_CASES_DIR).filter((f) => f.endsWith(".json"))) {
    recomputeThreeLens(resolve(AMENDED_V8_CASES_DIR, file));
  }

  const caseFiles = readdirSync(AMENDED_V8_CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const casePaths = caseFiles.map((f) => resolve(AMENDED_V8_CASES_DIR, f));
  const caseRecords = casePaths.map((p) => JSON.parse(readFileSync(p, "utf8")) as CaseRecord);
  const currentCausal = caseRecords.flatMap(causalEdges);
  const causalPredecessorDiff = auditCausalPredecessorDiff(predecessorCausal, currentCausal);

  const graphQaFailures = caseRecords.filter((r) => r.synergyGraphQA && !r.synergyGraphQA.passed).length;
  const typedEdgeCount = caseRecords.reduce((n, r) => n + (r.packageSynergyTypedEdges?.length ?? 0), 0);
  const causalTypedEdgeRecords = currentCausal.length;
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
  const sharedEnablerEdgeCount = caseRecords.reduce(
    (n, r) => n + (r.synergyGraphQA?.sharedEnablerEdgeCount ?? 0),
    0,
  );
  const sharedPayoffEdgeCount = caseRecords.reduce((n, r) => n + (r.synergyGraphQA?.sharedPayoffEdgeCount ?? 0), 0);

  const manifest = {
    version: "phase6a1-professor-plan-experiment-manifest-v3-amended-v8",
    generatedAt: new Date().toISOString(),
    sourceSpentDiagnostic: "phase6a1-professor-plan-experiment-v3-amended-v7-spent-diagnostic",
    preGoldAuditReference: "phase6a1-professor-plan-experiment-v3-amended-v7-pre-gold-reaudit-gpt56sol-v1.json",
    amendment: {
      version: "phase6a1-professor-plan-experiment-v3-amended-pre-gold-v8",
      professorRerun: false,
      canonicalResourceOntologyVersion: CANONICAL_RESOURCE_ONTOLOGY_V6_VERSION,
      synergyGraphVersion: PACKAGE_SYNERGY_GRAPH_V8_VERSION,
      threeLensSelectorVersion: THREE_LENS_PORTFOLIO_SELECTOR_V5_VERSION,
      symmetricLayerPreservedFrom: "phase6a1-package-synergy-graph-v6",
      huaTuoDestinationFixPreservedFrom: "phase6a1-canonical-resource-ontology-v5",
      atomicConjunctiveRequirements: true,
      resourceCardinalityFailClosed: true,
      harmonySemanticEdgeAggregation: true,
      causalPredecessorDiffGate: true,
      atomicSharedEnablerCompatibility: true,
      exhaustiveSymmetricEdgeAudit: true,
    },
    authorization: {
      semanticRetrievalFreeze: "FROZEN",
      professorV3FormalRun: "AMENDED_PRE_GOLD_V8",
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
      harmonyDetermination: r.harmonyDetermination,
      synergyGraphQAPassed: r.synergyGraphQA?.passed ?? false,
      status: r.caseStatus === "RUNTIME_FAILURE" ? "FAILED" : "SEALED",
    })),
    population: {
      cases: caseRecords.length,
      sealedSuccessCases: caseRecords.filter((r) => r.caseStatus === "SEALED_SUCCESS").length,
      runtimeFailureCases: caseRecords.filter((r) => r.caseStatus === "RUNTIME_FAILURE").length,
      threeLensCollapseCases: caseRecords.filter((r) => r.threeLensCollapseUnexplained).length,
      synergyGraphQAFailures: graphQaFailures,
      semanticRequirementCausalEdges,
      causalTypedEdgeRecords,
      sharedEnablerEdgeCount,
      sharedPayoffEdgeCount,
      totalHypotheses: caseRecords.reduce((n, r) => n + (r.proposedHypotheses?.length ?? 0), 0),
      totalValidatedPackages: caseRecords.reduce((n, r) => n + (r.finalValidatedPackages?.length ?? 0), 0),
      totalTypedSynergyEdges: typedEdgeCount,
    },
    causalPredecessorDiff,
  };

  const manifestPath = resolve(AMENDED_V8_DIR, "phase6a1-professor-plan-experiment-manifest-v3-amended-v8.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const manifestSha256 = hashFile(manifestPath);
  const caseSetSha256 = hashCaseSet(casePaths);
  const sealedAt = new Date().toISOString();

  const preGoldClear =
    manifest.population.runtimeFailureCases === 0 &&
    manifest.population.threeLensCollapseCases === 0 &&
    manifest.population.synergyGraphQAFailures === 0 &&
    manifest.population.semanticRequirementCausalEdges === 0 &&
    manifest.population.sharedEnablerEdgeCount === 0 &&
    manifest.population.sharedPayoffEdgeCount === 0 &&
    manifest.population.causalTypedEdgeRecords === EXPECTED_V8_CAUSAL_TYPED_EDGE_RECORDS &&
    causalPredecessorDiff.passed &&
    manifest.population.sealedSuccessCases === 28;

  const sealed = {
    version: "phase6a1-professor-plan-experiment-sealed-v3-amended-v8",
    sealedAt,
    caseCount: caseRecords.length,
    manifestSha256,
    caseSetSha256,
    sealKind: preGoldClear ? "AMENDED_V8_AWAIT_PRE_GOLD_REAUDIT" : "AMENDED_V8_INTERIM",
    preGoldAuditStatus: preGoldClear ? "AWAITING_INDEPENDENT_REAUDIT" : "BLOCKED_VALIDATION_OR_GRAPH_QA",
    goldEvaluationStatus: "NOT_RUN",
    note: "Amendment v8: atomic conjuncts + cardinality; v7 Hua Tuo + v6 symmetric preserved. Professor outputs unchanged.",
    provenanceSidecar: "phase6a1-professor-plan-experiment-v3-seal-provenance-sidecar-v1.json",
    predecessorAmendedPopulation: "phase6a1-professor-plan-experiment-v3-amended-v7-spent-diagnostic",
  };

  const report = {
    version: "phase6a1-professor-plan-experiment-report-v3-amended-v8",
    generatedAt: sealedAt,
    overallStatus: preGoldClear ? "AMENDED_V8_AWAIT_PRE_GOLD_REAUDIT" : "AMENDED_V8_PARTIAL_OR_BLOCKED",
    summary: manifest.population,
    causalPredecessorDiff,
    goldComparison: "KEEP_SEALED",
  };

  writeFileSync(resolve(AMENDED_V8_DIR, "phase6a1-professor-plan-experiment-sealed-v3-amended-v8.json"), JSON.stringify(sealed, null, 2));
  writeFileSync(resolve(AMENDED_V8_DIR, "phase6a1-professor-plan-experiment-report-v3-amended-v8.json"), JSON.stringify(report, null, 2));

  writeFileSync(
    resolve(AMENDED_V8_DIR, "phase6a1-professor-plan-experiment-v3-amended-v8-completion-v1.json"),
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-experiment-v3-amended-v8-completion-v1",
        completedAt: sealedAt,
        status: preGoldClear ? "AMENDED_V8_AWAIT_PRE_GOLD_REAUDIT" : "AMENDED_V8_PARTIAL_OR_BLOCKED",
        predecessor: {
          version: "phase6a1-professor-plan-experiment-v3-amended-v7-completion-v1",
          status: "SPENT_DIAGNOSTIC_PRE_GOLD_BLOCK",
          archive: "phase6a1-professor-plan-experiment-v3-amended-v7-spent-diagnostic",
          preGoldReaudit: "phase6a1-professor-plan-experiment-v3-amended-v7-pre-gold-reaudit-gpt56sol-v1.json",
          preGoldReauditDisposition: "BLOCK",
        },
        repairs: {
          canonicalResourceOntologyVersion: CANONICAL_RESOURCE_ONTOLOGY_V6_VERSION,
          synergyGraphVersion: PACKAGE_SYNERGY_GRAPH_V8_VERSION,
          symmetricLayerPreservedFrom: "phase6a1-package-synergy-graph-v6",
          huaTuoDestinationFixPreservedFrom: "phase6a1-canonical-resource-ontology-v5",
          atomicConjunctiveRequirements: true,
          resourceCardinalityFailClosed: true,
          harmonySemanticEdgeAggregation: true,
          causalPredecessorDiffGate: true,
          atomicSharedEnablerCompatibility: true,
          exhaustiveSymmetricEdgeAudit: true,
          semanticRegressionAssertions: 27,
          professorRerun: false,
        },
        population: manifest.population,
        causalPredecessorDiff,
        artifacts: {
          manifest: "phase6a1-professor-plan-experiment-manifest-v3-amended-v8.json",
          manifestSha256,
          sealed: "phase6a1-professor-plan-experiment-sealed-v3-amended-v8.json",
          caseSetSha256,
          report: "phase6a1-professor-plan-experiment-report-v3-amended-v8.json",
        },
        gateDisposition: {
          semanticRetrievalFreeze: "FROZEN",
          professorV3FormalRun: "AMENDED_PRE_GOLD_V8",
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
    resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v7-spent-diagnostic-manifest-v1.json"),
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-experiment-v3-amended-v7-spent-diagnostic-manifest-v1",
        spentAt: sealedAt,
        status: "SPENT_DIAGNOSTIC_PRE_GOLD_BLOCK",
        policy:
          "Amended v7 population preserved after re-audit BLOCK on conjunctive requirement partial matching and cardinality. Do not use for gold comparison.",
        preGoldReaudit: "phase6a1-professor-plan-experiment-v3-amended-v7-pre-gold-reaudit-gpt56sol-v1.json",
        successor: "phase6a1-professor-plan-experiment-v3-amended-v8",
      },
      null,
      2,
    ),
  );

  if (existsSync(PRE_GOLD_REAUDIT_SOURCE)) {
    copyFileSync(
      PRE_GOLD_REAUDIT_SOURCE,
      resolve(
        "data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v7-pre-gold-reaudit-gpt56sol-v1.json",
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        amendedV8Dir: AMENDED_V8_DIR,
        manifestSha256,
        caseSetSha256,
        population: manifest.population,
        causalPredecessorDiff,
        preGoldClear,
      },
      null,
      2,
    ),
  );

  if (!preGoldClear) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
