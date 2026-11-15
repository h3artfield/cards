/**
 * Harmony bridge validation using frozen spent amendment-v8 evidence (Kinnan/Yuriko).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProfessorCaseExperimentRecordV2 } from "./phase6a1-professor-plan-agent-v2";
import {
  serializeProfessorPlanToRuntimeInputV8,
  type RuntimeInputV8,
} from "./phase6a1-professor-plan-serializer-v1";
import { canonicalFactsForCommanders } from "./phase6a1-closure-commander-canonical-facts-v6";
import type { GoldenCatalogIndex } from "./load-golden-catalog-index";
import { HARMONY_EVIDENCE_PATH } from "./phase6a1-serialization-pilot-v8-config-v1";
import { getPilotOpportunityCase } from "./phase6a1-spent-pilot-truth-loader-v1";

export const PROFESSOR_PLAN_SERIALIZATION_HARMONY_V1_VERSION = "phase6a1-professor-plan-serialization-harmony-v1";

type HarmonyEvidenceV3 = {
  harmonySufficientSpentOutput: {
    label: string;
    zipMemberPath: string;
    innerByteSha256: string;
    commander: string;
    expectedBridgeRuleOutcome: string;
  };
  harmonyInsufficientSpentOutput: {
    label: string;
    zipMemberPath: string;
    innerByteSha256: string;
    commander: string;
    harmonyDetermination: string;
    expectedBridgeRuleOutcome: string;
  };
};

export type HarmonyBridgeAssessment = {
  caseId: string;
  commander: string;
  label: string;
  innerByteSha256: string;
  qualifyingBridgeEdgeCount: number;
  distinctEngineDomains: number;
  outcome: "HARMONY_SUFFICIENT" | "HARMONY_UNDERDETERMINED";
  pass: boolean;
};

export type HarmonyEvidenceValidationResult = {
  pass: boolean;
  frozenEvidenceSha256: string;
  assessments: HarmonyBridgeAssessment[];
  issues: string[];
};

function loadHarmonyEvidence(): HarmonyEvidenceV3 {
  return JSON.parse(readFileSync(HARMONY_EVIDENCE_PATH, "utf8")) as HarmonyEvidenceV3;
}

function countQualifyingBridgeEdges(runtime: RuntimeInputV8): {
  qualifyingBridgeEdgeCount: number;
  distinctEngineDomains: number;
} {
  const harm = runtime.lenses.HARMONY;
  const bridgeEdges = harm.resourceGraph.edges.filter((e) => e.relationship === "bridges");
  const packageNodes = new Set(harm.validatedPackages.map((p) => p.packageRefId));
  const qualifying = bridgeEdges.filter(
    (e) => packageNodes.has(e.fromNodeId) && packageNodes.has(e.toNodeId),
  );
  const domains = new Set<string>();
  for (const edge of qualifying) {
    domains.add(edge.fromNodeId);
    domains.add(edge.toNodeId);
  }
  return {
    qualifyingBridgeEdgeCount: qualifying.length,
    distinctEngineDomains: domains.size,
  };
}

function assessFrozenCase(args: {
  record: ProfessorCaseExperimentRecordV2;
  catalog: GoldenCatalogIndex;
  label: string;
  expectedSufficient: boolean;
  innerByteSha256: string;
}): HarmonyBridgeAssessment {
  const oppCase = getPilotOpportunityCase(args.record.caseId);
  if (!oppCase) throw new Error(`Missing opportunity case for harmony record ${args.record.caseId}`);
  const frozenFacts = canonicalFactsForCommanders(args.catalog, args.record.commanders);
  const runtime = serializeProfessorPlanToRuntimeInputV8({
    record: args.record,
    commandZoneConfiguration: "single_commander",
    frozenFacts,
    semanticOpportunities: oppCase.opportunities,
    catalog: args.catalog,
  });
  const counts = countQualifyingBridgeEdges(runtime);
  const sufficient = counts.qualifyingBridgeEdgeCount >= 2 && counts.distinctEngineDomains >= 2;
  const outcome = sufficient ? "HARMONY_SUFFICIENT" : "HARMONY_UNDERDETERMINED";
  return {
    caseId: args.record.caseId,
    commander: args.record.commanders[0] ?? "unknown",
    label: args.label,
    innerByteSha256: args.innerByteSha256,
    qualifyingBridgeEdgeCount: counts.qualifyingBridgeEdgeCount,
    distinctEngineDomains: counts.distinctEngineDomains,
    outcome,
    pass: args.expectedSufficient ? sufficient : !sufficient,
  };
}

export function validateFrozenHarmonyEvidenceV1(args: {
  catalog: GoldenCatalogIndex;
  kinnanRecordPath: string;
  yurikoRecordPath: string;
}): HarmonyEvidenceValidationResult {
  const evidence = loadHarmonyEvidence();
  const issues: string[] = [];

  for (const [path, expectedSha] of [
    [args.kinnanRecordPath, evidence.harmonySufficientSpentOutput.innerByteSha256],
    [args.yurikoRecordPath, evidence.harmonyInsufficientSpentOutput.innerByteSha256],
  ] as const) {
    if (!existsSync(path)) {
      issues.push(`Missing frozen harmony case bytes: ${path}`);
      continue;
    }
    const sha = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (sha !== expectedSha) {
      issues.push(`Frozen harmony byte SHA mismatch for ${path}: got ${sha}, expected ${expectedSha}`);
    }
  }

  if (issues.length > 0) {
    return {
      pass: false,
      frozenEvidenceSha256: createHash("sha256").update(readFileSync(HARMONY_EVIDENCE_PATH)).digest("hex"),
      assessments: [],
      issues,
    };
  }

  const kinnanRecord = JSON.parse(readFileSync(args.kinnanRecordPath, "utf8")) as ProfessorCaseExperimentRecordV2;
  const yurikoRecord = JSON.parse(readFileSync(args.yurikoRecordPath, "utf8")) as ProfessorCaseExperimentRecordV2;

  const assessments = [
    assessFrozenCase({
      record: kinnanRecord,
      catalog: args.catalog,
      label: evidence.harmonySufficientSpentOutput.label,
      expectedSufficient: true,
      innerByteSha256: evidence.harmonySufficientSpentOutput.innerByteSha256,
    }),
    assessFrozenCase({
      record: yurikoRecord,
      catalog: args.catalog,
      label: evidence.harmonyInsufficientSpentOutput.label,
      expectedSufficient: false,
      innerByteSha256: evidence.harmonyInsufficientSpentOutput.innerByteSha256,
    }),
  ];

  for (const a of assessments) {
    if (!a.pass) {
      issues.push(
        `Harmony frozen case ${a.caseId} failed bridge expectation (${a.outcome}, edges=${a.qualifyingBridgeEdgeCount})`,
      );
    }
  }

  return {
    pass: issues.length === 0,
    frozenEvidenceSha256: createHash("sha256").update(readFileSync(HARMONY_EVIDENCE_PATH)).digest("hex"),
    assessments,
    issues,
  };
}
