/**
 * Professor v4 Creative + Research team orchestration — offline fixture-driven state machine.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { CreativeProfessorPass1V4 } from "../../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { validateCreativeProfessorPass1V4 } from "../../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { validateResearchProfessorOutputV4 } from "../../src/lib/deck-synthesis/professor-research-contracts-v4";
import {
  assembleProfessorV4FinalAnswerV1,
  type ProfessorV4OrchestrationResultV1,
  type ProfessorV4OrchestrationStageV1,
} from "../../src/lib/deck-synthesis/professor-v4-orchestration-v1";
import {
  createEmptyProfessorV4CostTelemetryV1,
  mergeProfessorV4CostTelemetryV1,
} from "../../src/lib/deck-synthesis/professor-v4-cost-telemetry-v1";
import { criticAnnotationsNeverTerminateOrchestrationV4 } from "../../src/lib/deck-synthesis/professor-v4-critic-v1";
import { buildProfessorV3PromptPayload } from "./phase6a1-professor-v3-prompt-payload-v1";
import { runResearchProfessorOfflineV1 } from "./phase6a1-professor-v4-research-professor-v1";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";
import { getPilotMechanismCatalogEntry } from "./phase6a1-spent-pilot-truth-loader-v1";

export const PROFESSOR_V4_CREATIVE_RESEARCH_ORCHESTRATION_V1_VERSION =
  "phase6a1-professor-v4-creative-research-orchestration-v1";
export const PROFESSOR_V4_CREATIVE_RESEARCH_TEAM_DECISION_V1 =
  "PROFESSOR_V4_CREATIVE_RESEARCH_TEAM_ARCHITECTURE_V1_AUTHORIZED_NO_MODEL";

export type ProfessorV4FixtureCaseV1 = "meren" | "chatterfang";

export type ProfessorV4OrchestrationOutputTargetsV1 = {
  result: string;
  audit: string;
};

export function resolveProfessorV4OrchestrationOutputTargetsV1(args: {
  caseKey: ProfessorV4FixtureCaseV1;
  milestonesDir?: string;
}): ProfessorV4OrchestrationOutputTargetsV1 {
  const dir = args.milestonesDir ?? MILESTONES;
  return {
    result: resolve(dir, `phase6a1-professor-v4-creative-research-${args.caseKey}-result-v1.json`),
    audit: resolve(dir, `phase6a1-professor-v4-creative-research-${args.caseKey}-audit-v1.json`),
  };
}

function sha256ModelVisibleContext(ctx: ProfessorPlanningContextV3): string {
  return createHash("sha256").update(buildProfessorV3PromptPayload(ctx).modelVisibleText, "utf8").digest("hex");
}

export function runProfessorV4CreativeResearchOrchestrationOfflineV1(args: {
  caseKey: ProfessorV4FixtureCaseV1;
  mechanismTruthCaseId: string;
  creativePass1: CreativeProfessorPass1V4;
  frozenContext: ProfessorPlanningContextV3;
  writeArtifacts?: boolean;
  milestonesDir?: string;
}): ProfessorV4OrchestrationResultV1 {
  const stagesExecuted: ProfessorV4OrchestrationStageV1[] = [];
  let telemetry = createEmptyProfessorV4CostTelemetryV1();
  telemetry = mergeProfessorV4CostTelemetryV1(telemetry, { creativePass1Calls: 1 });

  stagesExecuted.push("COMMANDER_RESOLUTION");
  stagesExecuted.push("INITIAL_CONTEXT_FREEZE");
  const frozenContextSha256 = sha256ModelVisibleContext(args.frozenContext);

  stagesExecuted.push("CREATIVE_PASS_1_BOUNDARY");
  const pass1Validation = validateCreativeProfessorPass1V4(args.creativePass1);
  if (!pass1Validation.ok) {
    throw new Error(`Creative pass-1 invalid: ${pass1Validation.issues.map((i) => i.message).join("; ")}`);
  }

  stagesExecuted.push("RESEARCH_PROFESSOR");
  stagesExecuted.push("SEMANTIC_EXPLORATION");
  stagesExecuted.push("CRITIC_ANNOTATIONS");
  const researchRun = runResearchProfessorOfflineV1({ ctx: args.frozenContext, pass1: pass1Validation.pass1 });
  telemetry = mergeProfessorV4CostTelemetryV1(telemetry, researchRun.telemetryDelta);

  const criticOk = criticAnnotationsNeverTerminateOrchestrationV4(
    researchRun.output.claimDecomposition.map((c) => ({
      claimId: c.claimId,
      annotation: c.annotation,
      notes: c.notes,
      evidenceRefs: c.evidenceRefs,
      terminatesOrchestration: false as const,
    })),
  );
  if (!criticOk) throw new Error("FAIL_CLOSED: critic attempted to terminate orchestration");

  stagesExecuted.push("PASS3_GATE");
  const researchValidation = validateResearchProfessorOutputV4(researchRun.output);
  if (!researchValidation.ok) {
    throw new Error(`Research output invalid: ${researchValidation.issues.join("; ")}`);
  }

  let creativePass2: CreativeProfessorPass1V4 | null = null;
  if (researchRun.output.warrantSecondCreativeCall) {
    stagesExecuted.push("CREATIVE_PASS_2_BOUNDARY");
    telemetry = mergeProfessorV4CostTelemetryV1(telemetry, { creativePass2Calls: 0 });
  }

  stagesExecuted.push("FINAL_ASSEMBLY");
  stagesExecuted.push("COMPLETE");

  const finalAnswer = assembleProfessorV4FinalAnswerV1({
    mechanismTruthCaseId: args.mechanismTruthCaseId,
    frozenContextSha256,
    creativePass1: pass1Validation.pass1,
    researchReport: researchRun.output,
    creativePass2,
    stagesExecuted,
    costTelemetry: telemetry,
  });

  const result: ProfessorV4OrchestrationResultV1 = {
    decision: PROFESSOR_V4_CREATIVE_RESEARCH_TEAM_DECISION_V1,
    caseId: args.frozenContext.caseId,
    mechanismTruthCaseId: args.mechanismTruthCaseId,
    frozenContext: args.frozenContext,
    frozenContextSha256,
    creativePass1: pass1Validation.pass1,
    researchReport: researchRun.output,
    creativePass2,
    finalAnswer,
    stagesExecuted,
    costTelemetry: telemetry,
    orchestrationTerminatedByValidator: false,
  };

  if (args.writeArtifacts !== false) {
    const targets = resolveProfessorV4OrchestrationOutputTargetsV1({
      caseKey: args.caseKey,
      milestonesDir: args.milestonesDir,
    });
    writeFileSync(targets.result, JSON.stringify(result, null, 2));
    writeFileSync(
      targets.audit,
      JSON.stringify(
        {
          version: "phase6a1-professor-v4-creative-research-audit-v1",
          decision: PROFESSOR_V4_CREATIVE_RESEARCH_TEAM_DECISION_V1,
          caseKey: args.caseKey,
          warrantSecondCreativeCall: researchRun.output.warrantSecondCreativeCall,
          semanticDiscoveryCount: researchRun.output.semanticDiscoveries.length,
          highNoveltyDiscoveries: researchRun.output.semanticDiscoveries.filter((d) => d.noveltyEstimate === "HIGH").length,
          orchestrationTerminatedByValidator: false,
          stagesExecuted,
        },
        null,
        2,
      ),
    );
  }

  return result;
}

export function loadMerenFrozenContextV1(): ProfessorPlanningContextV3 {
  const artifact = JSON.parse(readFileSync(resolve(MILESTONES, "phase6a1-professor-v3-ab-v1-frozen-initial-context-v1.json"), "utf8")) as {
    frozenPlanningContext: ProfessorPlanningContextV3;
  };
  return artifact.frozenPlanningContext;
}

export function buildChatterfangFrozenContextV1(): ProfessorPlanningContextV3 {
  const entry = getPilotMechanismCatalogEntry("multi-chatterfang");
  if (!entry) throw new Error("Missing multi-chatterfang mechanism truth");
  return {
    caseId: "professor-v4-fixture-chatterfang-v1",
    commandZone: {
      configuration: entry.commandZoneConfiguration,
      commanders: entry.commanders,
      combinedColorIdentity: entry.combinedColorIdentity,
      bracket: entry.bracket,
    },
    canonicalOracle: entry.commanderOracleTexts.map((o) => ({
      sourceOracleId: o.sourceOracleId,
      name: o.name,
      oracleText: o.oracleText,
      provenanceTier: "CANONICAL_FACT" as const,
    })),
    commanderMechanismFacts: entry.independentMechanismFacts,
    semanticRelationships: [],
    knownMechanicalAffordances: [],
    noActionableFactIds: [],
    colorIdentity: entry.combinedColorIdentity,
    bracket: entry.bracket,
    userConstraints: ["Professor v4 offline fixture — bracket development benchmark"],
    initialRagEvidence: [],
    initialResearchEvidence: [],
    rulesConstraints: [],
  };
}
