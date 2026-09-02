/**
 * Professor v4.1 conversation loop — offline state machine for working deck theory + brewing conversation.
 */
import type { ProfessorPlanningContextV3 } from "./professor-planning-contracts-v3";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import type { ResearchAnnotationV4 } from "./professor-research-contracts-v4";
import type { ProfessorV4CostTelemetryV1 } from "./professor-v4-cost-telemetry-v1";
import type { ScoredDiscoveryV4 } from "./professor-discovery-score-v4";
import type { ResearchMessageV4 } from "./professor-research-message-v4";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { IdeaBoardV4 } from "./professor-idea-board-v4";
import type { AbstractionChainV4, MechanicReverseSearchResultV4 } from "./professor-abstraction-levels-v4";
import type { SemanticQueryResultV4 } from "./professor-semantic-vocabulary-v4";

export const PROFESSOR_V4_1_CONVERSATION_LOOP_V1_VERSION = "professor-v4-1-conversation-loop-v1";
export const PROFESSOR_V4_1_DECISION_V1 =
  "PROFESSOR_V4_1_WORKING_DECK_THEORY_CONVERSATION_LOOP_V1_AUTHORIZED_NO_MODEL";

export const RESEARCH_MODE_V4 = ["MECHANIC", "EXPLORER", "ENGINEER", "SKEPTIC", "CONTRARIAN"] as const;
export type ResearchModeV4 = (typeof RESEARCH_MODE_V4)[number];

export type ConversationLoopStageV1 =
  | "CREATIVE_PASS_1_FIXTURE"
  | "SEED_WORKING_DECK_THEORY"
  | "IDENTIFY_OPEN_QUESTION"
  | "SELECT_RESEARCH_MODE"
  | "TRANSLATE_CONCEPT_TO_QUERIES"
  | "DETERMINISTIC_SEARCH"
  | "RESEARCH_MESSAGE"
  | "PATCH_WORKING_DECK_THEORY"
  | "SCORE_DISCOVERIES"
  | "LOOP_DECISION"
  | "COMPLETE";

export type ConversationLoopOutcomeV1 =
  | "KEEP_RESEARCHING_QUIETLY"
  | "ASK_USER"
  | "ESCALATE_TO_CREATIVE"
  | "FINISH";

export type ProfessorV41ConversationLoopResultV1 = {
  decision: typeof PROFESSOR_V4_1_DECISION_V1;
  caseId: string;
  mechanismTruthCaseId: string;
  frozenContextSha256: string;
  creativePass1: CreativeProfessorPass1V4;
  workingDeckTheory: WorkingDeckTheoryV4;
  selectedResearchModes: ResearchModeV4[];
  currentOpenQuestionId: string | null;
  researchMessages: ResearchMessageV4[];
  scoredDiscoveries: ScoredDiscoveryV4[];
  abstractionChains: AbstractionChainV4[];
  reverseSearchResults: MechanicReverseSearchResultV4[];
  semanticQueryResults: SemanticQueryResultV4[];
  loopOutcome: ConversationLoopOutcomeV1;
  warrantCreativeRevisit: boolean;
  escalationReasons: string[];
  stagesExecuted: ConversationLoopStageV1[];
  costTelemetry: ProfessorV4CostTelemetryV1;
  orchestrationTerminatedByValidator: false;
  criticAnnotations: { claimId: string; annotation: ResearchAnnotationV4; notes: string }[];
};

export function selectResearchModesForOpenQuestionV4(args: {
  openQuestion: string;
  thesisBlob: string;
  hasCrossResourceSignal: boolean;
}): ResearchModeV4[] {
  const q = args.openQuestion.toLowerCase();
  const thesis = args.thesisBlob.toLowerCase();
  const modes: ResearchModeV4[] = [];

  if (q.includes("verify") || q.includes("work") || q.includes("chain") || thesis.includes("experience")) {
    modes.push("MECHANIC");
  }
  if (q.includes("search") || q.includes("explore") || q.includes("haven't") || args.hasCrossResourceSignal) {
    modes.push("EXPLORER");
  }
  if (q.includes("slot") || q.includes("package") || q.includes("role")) {
    modes.push("ENGINEER");
  }
  if (q.includes("fragile") || q.includes("redundant") || q.includes("commander")) {
    modes.push("SKEPTIC");
  }
  if (q.includes("avoid") || q.includes("unconventional") || q.includes("obvious")) {
    modes.push("CONTRARIAN");
  }

  if (modes.length === 0) {
    if (args.hasCrossResourceSignal) return ["EXPLORER", "MECHANIC"];
    if (thesis.includes("death") || thesis.includes("recur")) return ["MECHANIC"];
    return ["MECHANIC"];
  }

  return [...new Set(modes)].slice(0, 2);
}

export function decideConversationLoopOutcomeV4(args: {
  theory: WorkingDeckTheoryV4;
  scoredDiscoveries: ScoredDiscoveryV4[];
  userDirectionRequired?: boolean;
}): { outcome: ConversationLoopOutcomeV1; warrantCreativeRevisit: boolean; escalationReasons: string[] } {
  const escalationReasons: string[] = [];
  for (const d of args.scoredDiscoveries) {
    if (d.classification === "ESCALATE_TO_CREATIVE" || d.classification === "MAJOR_CONTRADICTION") {
      escalationReasons.push(`${d.classification}: ${d.mechanicalPattern} — ${d.classificationReason}`);
    }
  }

  if (args.userDirectionRequired || args.theory.conversationState === "NEEDS_USER_DIRECTION") {
    return { outcome: "ASK_USER", warrantCreativeRevisit: false, escalationReasons: [] };
  }

  if (escalationReasons.length > 0) {
    return { outcome: "ESCALATE_TO_CREATIVE", warrantCreativeRevisit: true, escalationReasons };
  }

  const openCount = args.theory.openQuestions.filter((q) => q.status === "OPEN").length;
  if (openCount === 0 && args.scoredDiscoveries.every((d) => d.classification === "QUIET_INTEGRATION")) {
    return { outcome: "FINISH", warrantCreativeRevisit: false, escalationReasons: [] };
  }

  return { outcome: "KEEP_RESEARCHING_QUIETLY", warrantCreativeRevisit: false, escalationReasons: [] };
}

export function validateConversationLoopResultV1(result: ProfessorV41ConversationLoopResultV1): string[] {
  const issues: string[] = [];
  if (result.orchestrationTerminatedByValidator !== false) {
    issues.push("Validator must not terminate conversation loop");
  }
  if (result.workingDeckTheory.revisionHistory.length < 1) {
    issues.push("Working deck theory must have seed revision");
  }
  if (result.selectedResearchModes.length === 0) {
    issues.push("At least one research mode must be selected");
  }
  if (result.selectedResearchModes.length > 3) {
    issues.push("Research must not fan out to all modes automatically");
  }
  return issues;
}

export type ConversationLoopContextV1 = {
  ctx: ProfessorPlanningContextV3;
  pass1: CreativeProfessorPass1V4;
  mechanismTruthCaseId: string;
  frozenContextSha256: string;
};

export function summarizeIdeaBoardV4(board: IdeaBoardV4): Record<string, number> {
  return {
    CORE: board.items.filter((i) => i.lane === "CORE").length,
    VERIFY: board.items.filter((i) => i.lane === "VERIFY").length,
    EXPLORE: board.items.filter((i) => i.lane === "EXPLORE").length,
    WEIRD: board.items.filter((i) => i.lane === "WEIRD").length,
    REJECTED: board.items.filter((i) => i.lane === "REJECTED").length,
  };
}
