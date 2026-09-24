/**
 * Professor v4.1 conversation orchestration — working deck theory + brewing conversation loop.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { CreativeProfessorPass1V4 } from "../../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { validateCreativeProfessorPass1V4 } from "../../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import {
  decideConversationLoopOutcomeV4,
  PROFESSOR_V4_1_DECISION_V1,
  summarizeIdeaBoardV4,
  type ConversationLoopStageV1,
  type ProfessorV41ConversationLoopResultV1,
} from "../../src/lib/deck-synthesis/professor-v4-1-conversation-loop-v1";
import {
  createEmptyProfessorV4CostTelemetryV1,
  mergeProfessorV4CostTelemetryV1,
} from "../../src/lib/deck-synthesis/professor-v4-cost-telemetry-v1";
import { criticAnnotationsNeverTerminateOrchestrationV4 } from "../../src/lib/deck-synthesis/professor-v4-critic-v1";
import { applyWorkingDeckTheoryPatchesV4 } from "../../src/lib/deck-synthesis/professor-working-deck-theory-v4";
import { buildProfessorV3PromptPayload } from "./phase6a1-professor-v3-prompt-payload-v1";
import { runResearchProfessorV41OfflineV1 } from "./phase6a1-professor-v4-1-research-professor-v1";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";

export const PROFESSOR_V4_1_CONVERSATION_ORCHESTRATION_V1_VERSION =
  "phase6a1-professor-v4-1-conversation-orchestration-v1";

export type ProfessorV41FixtureCaseV1 = "meren" | "chatterfang";

function sha256ModelVisibleContext(ctx: ProfessorPlanningContextV3): string {
  return createHash("sha256").update(buildProfessorV3PromptPayload(ctx).modelVisibleText, "utf8").digest("hex");
}

function buildUserDirectionForks(): ProfessorV41ConversationLoopResultV1["workingDeckTheory"]["userDirectionForks"] {
  return [
    {
      forkId: "fork-a",
      label: "A. conventional recursion-control",
      description: "Lean into proven graveyard recursion and experience thresholds.",
      whyInteresting: "High mechanical confidence; commander-native.",
      conventionality: "CONVENTIONAL",
      commanderDependence: "HIGH",
      mechanicalConfidence: "HIGH",
      expectedPlayStyle: "Grindy value engine with inevitability.",
    },
    {
      forkId: "fork-b",
      label: "B. self-sacrificing toolbox",
      description: "Utility creatures that sacrifice for immediate effects then recur.",
      whyInteresting: "Flexible interaction without overcommitting to one finisher.",
      conventionality: "MODERATE",
      commanderDependence: "MEDIUM",
      mechanicalConfidence: "MEDIUM",
      expectedPlayStyle: "Interactive midrange with reusable bullets.",
    },
    {
      forkId: "fork-c",
      label: "C. ETB/death reset engine",
      description: "Zone-change asymmetry where death and reentry reset triggers.",
      whyInteresting: "Unconventional sequencing that exploits reentry resets.",
      conventionality: "UNCONVENTIONAL",
      commanderDependence: "MEDIUM",
      mechanicalConfidence: "MEDIUM",
      expectedPlayStyle: "Synergy-heavy engine with blink/sacrifice loops.",
    },
  ];
}

export { PROFESSOR_V4_1_DECISION_V1 } from "../../src/lib/deck-synthesis/professor-v4-1-conversation-loop-v1";

export function runProfessorV41ConversationLoopOfflineV1(args: {
  caseKey: ProfessorV41FixtureCaseV1;
  mechanismTruthCaseId: string;
  creativePass1: CreativeProfessorPass1V4;
  frozenContext: ProfessorPlanningContextV3;
  simulateUserDirection?: boolean;
  writeArtifacts?: boolean;
  milestonesDir?: string;
}): ProfessorV41ConversationLoopResultV1 {
  const stagesExecuted: ConversationLoopStageV1[] = [];
  let telemetry = createEmptyProfessorV4CostTelemetryV1();
  telemetry = mergeProfessorV4CostTelemetryV1(telemetry, { creativePass1Calls: 1 });

  stagesExecuted.push("CREATIVE_PASS_1_FIXTURE");
  const pass1Validation = validateCreativeProfessorPass1V4(args.creativePass1);
  if (!pass1Validation.ok) {
    throw new Error(`Creative pass-1 invalid: ${pass1Validation.issues.map((i) => i.message).join("; ")}`);
  }

  stagesExecuted.push("SEED_WORKING_DECK_THEORY");
  const frozenContextSha256 = sha256ModelVisibleContext(args.frozenContext);

  stagesExecuted.push("IDENTIFY_OPEN_QUESTION");
  stagesExecuted.push("SELECT_RESEARCH_MODE");
  stagesExecuted.push("TRANSLATE_CONCEPT_TO_QUERIES");
  stagesExecuted.push("DETERMINISTIC_SEARCH");

  const researchRun = runResearchProfessorV41OfflineV1({ ctx: args.frozenContext, pass1: pass1Validation.pass1 });
  telemetry = mergeProfessorV4CostTelemetryV1(telemetry, {
    researchModelCalls: 0,
    semanticSearchCalls: researchRun.semanticPrimitiveResults.length,
    oracleLookups: researchRun.criticAnnotations.filter((c) => c.annotation === "NEEDS_ORACLE_VERIFICATION").length,
  });

  stagesExecuted.push("RESEARCH_MESSAGE");
  stagesExecuted.push("PATCH_WORKING_DECK_THEORY");
  stagesExecuted.push("SCORE_DISCOVERIES");

  const criticOk = criticAnnotationsNeverTerminateOrchestrationV4(
    researchRun.criticAnnotations.map((c) => ({
      claimId: c.claimId,
      annotation: c.annotation as import("../../src/lib/deck-synthesis/professor-research-contracts-v4").ResearchAnnotationV4,
      notes: c.notes,
      evidenceRefs: [],
      terminatesOrchestration: false as const,
    })),
  );
  if (!criticOk) throw new Error("FAIL_CLOSED: validator attempted to terminate conversation loop");

  let workingDeckTheory = researchRun.workingDeckTheory;
  if (args.simulateUserDirection) {
    workingDeckTheory = applyWorkingDeckTheoryPatchesV4({
      theory: workingDeckTheory,
      author: "RESEARCH_PROFESSOR",
      summary: "Present strategic forks — needs user direction.",
      patches: [
        {
          op: "SET_CONVERSATION_STATE",
          state: "NEEDS_USER_DIRECTION",
          userDirectionForks: buildUserDirectionForks(),
        },
      ],
      preservedReasoning: ["Multiple viable strategic branches require brewer choice."],
    });
  }

  const loopDecision = decideConversationLoopOutcomeV4({
    theory: workingDeckTheory,
    scoredDiscoveries: researchRun.scoredDiscoveries,
    userDirectionRequired: args.simulateUserDirection,
  });

  stagesExecuted.push("LOOP_DECISION");
  stagesExecuted.push("COMPLETE");

  const result: ProfessorV41ConversationLoopResultV1 = {
    decision: PROFESSOR_V4_1_DECISION_V1,
    caseId: args.frozenContext.caseId,
    mechanismTruthCaseId: args.mechanismTruthCaseId,
    frozenContextSha256,
    creativePass1: pass1Validation.pass1,
    workingDeckTheory,
    selectedResearchModes: researchRun.selectedResearchModes,
    currentOpenQuestionId: researchRun.currentOpenQuestionId,
    researchMessages: researchRun.researchMessages,
    scoredDiscoveries: researchRun.scoredDiscoveries,
    abstractionChains: researchRun.abstractionChains,
    reverseSearchResults: researchRun.reverseSearchResults,
    semanticQueryResults: researchRun.semanticQueryResults,
    loopOutcome: loopDecision.outcome,
    warrantCreativeRevisit: loopDecision.warrantCreativeRevisit,
    escalationReasons: loopDecision.escalationReasons,
    stagesExecuted,
    costTelemetry: telemetry,
    orchestrationTerminatedByValidator: false,
    criticAnnotations: researchRun.criticAnnotations,
  };

  if (args.writeArtifacts !== false) {
    const dir = args.milestonesDir ?? MILESTONES;
    writeFileSync(
      resolve(dir, `phase6a1-professor-v4-1-conversation-${args.caseKey}-result-v1.json`),
      JSON.stringify(result, null, 2),
    );
    writeFileSync(
      resolve(dir, `phase6a1-professor-v4-1-conversation-${args.caseKey}-audit-v1.json`),
      JSON.stringify(
        {
          version: "phase6a1-professor-v4-1-conversation-audit-v1",
          caseKey: args.caseKey,
          selectedResearchModes: result.selectedResearchModes,
          ideaBoardSummary: summarizeIdeaBoardV4(result.workingDeckTheory.ideaBoard),
          revisionCount: result.workingDeckTheory.revisionHistory.length,
          researchMessageCount: result.researchMessages.length,
          warrantCreativeRevisit: result.warrantCreativeRevisit,
          loopOutcome: result.loopOutcome,
        },
        null,
        2,
      ),
    );
  }

  return result;
}
