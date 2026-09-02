/**
 * Professor v4 orchestration contracts — state machine stages and final assembly.
 */
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import type { ResearchProfessorOutputV4 } from "./professor-research-contracts-v4";
import type { ProfessorPlanningContextV3 } from "./professor-planning-contracts-v3";
import type { ProfessorV4CostTelemetryV1 } from "./professor-v4-cost-telemetry-v1";

export const PROFESSOR_V4_ORCHESTRATION_V1_VERSION = "professor-v4-orchestration-v1";

export type ProfessorV4OrchestrationStageV1 =
  | "COMMANDER_RESOLUTION"
  | "INITIAL_CONTEXT_FREEZE"
  | "CREATIVE_PASS_1_BOUNDARY"
  | "RESEARCH_PROFESSOR"
  | "SEMANTIC_EXPLORATION"
  | "CRITIC_ANNOTATIONS"
  | "PASS3_GATE"
  | "CREATIVE_PASS_2_BOUNDARY"
  | "FINAL_ASSEMBLY"
  | "COMPLETE";

export type ProfessorV4FinalAnswerV1 = {
  version: typeof PROFESSOR_V4_ORCHESTRATION_V1_VERSION;
  commander: string;
  mechanismTruthCaseId: string;
  frozenContextSha256: string;
  creativePass1: CreativeProfessorPass1V4;
  researchReport: ResearchProfessorOutputV4;
  creativePass2: CreativeProfessorPass1V4 | null;
  readableSummary: string;
  costTelemetry: ProfessorV4CostTelemetryV1;
  stagesExecuted: ProfessorV4OrchestrationStageV1[];
};

export type ProfessorV4OrchestrationResultV1 = {
  decision: string;
  caseId: string;
  mechanismTruthCaseId: string;
  frozenContext: ProfessorPlanningContextV3;
  frozenContextSha256: string;
  creativePass1: CreativeProfessorPass1V4;
  researchReport: ResearchProfessorOutputV4;
  creativePass2: CreativeProfessorPass1V4 | null;
  finalAnswer: ProfessorV4FinalAnswerV1;
  stagesExecuted: ProfessorV4OrchestrationStageV1[];
  costTelemetry: ProfessorV4CostTelemetryV1;
  orchestrationTerminatedByValidator: false;
};

export function assembleProfessorV4FinalAnswerV1(args: {
  mechanismTruthCaseId: string;
  frozenContextSha256: string;
  creativePass1: CreativeProfessorPass1V4;
  researchReport: ResearchProfessorOutputV4;
  creativePass2: CreativeProfessorPass1V4 | null;
  stagesExecuted: ProfessorV4OrchestrationStageV1[];
  costTelemetry: ProfessorV4CostTelemetryV1;
}): ProfessorV4FinalAnswerV1 {
  const plan = args.creativePass2 ?? args.creativePass1;
  const readableSummary = [
    `# ${plan.commander} — Professor v4 Team Answer`,
    "",
    "## Strategic thesis",
    plan.strategicThesis,
    "",
    "## Packages",
    ...plan.packages.map((p) => `- **${p.id}** (${p.commanderDependence}): ${p.concept} — ${p.purpose}`),
    "",
    "## Win paths",
    ...plan.winPaths.map((w) => `- ${w.description}`),
    "",
    "## Research verdict",
    args.researchReport.warrantSecondCreativeCall
      ? `Second creative pass warranted: ${args.researchReport.secondCallReasons.join("; ")}`
      : "Research confirms the creative plan is already strong; no second expensive call warranted.",
  ].join("\n");

  return {
    version: PROFESSOR_V4_ORCHESTRATION_V1_VERSION,
    commander: plan.commander,
    mechanismTruthCaseId: args.mechanismTruthCaseId,
    frozenContextSha256: args.frozenContextSha256,
    creativePass1: args.creativePass1,
    researchReport: args.researchReport,
    creativePass2: args.creativePass2,
    readableSummary,
    costTelemetry: args.costTelemetry,
    stagesExecuted: args.stagesExecuted,
  };
}
