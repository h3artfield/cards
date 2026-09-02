/**
 * Professor brew session types — client-safe, no server imports.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BrewArchetypeChoiceV42, BrewFixtureCaseV42 } from "./professor-brew-fixtures-v4-2-v1";
import type { CardProgressionStatusV42, BrewTreeGraphV42 } from "./professor-brew-tree-v4-2-v1";
import type { ProfessorCouncilStateV45 } from "./professor-council-state-v4-5-v1";
import type { DeckBuildPhaseV47, LegalityGateResultV47 } from "./professor-deck-completion-v4-7-v1";
import type { ProfessorV41ConversationLoopResultV1 } from "./professor-v4-1-conversation-loop-v1";
import type { ResearchMessageV4 } from "./professor-research-message-v4";
import type { ProfessorDeckFinalReportV48 } from "./professor-deck-final-report-v4-8-v1";
import type { ProfessorDeckGradeV4 } from "./professor-deck-grade-v4-v1";
import type { FinalDeckDoctorSessionV48 } from "./professor-final-deck-doctor-v4-8-v1";

/** Client-safe council snapshot — v4.7 fields without importing server assembly modules. */
export type BrewSessionCouncilStateV42 = ProfessorCouncilStateV45 & {
  buildPhase?: DeckBuildPhaseV47;
  legalityGate?: LegalityGateResultV47 | null;
  targetTotalCards?: number;
};

export const PROFESSOR_BREW_SESSION_V4_2_V1_VERSION = "professor-brew-session-v4-2-v1";
export const PROFESSOR_V4_2_DECISION_V1 = "PROFESSOR_V4_2_INTERACTIVE_BREWING_GAME_FIRST_TEN_MINUTES_V1_AUTHORIZED";

export type BrewSessionModeV42 = "offline_replay" | "live";

export type BrewSessionPhaseV42 =
  | "COMMANDER_SELECT"
  | "OPENING_DIALOGUE"
  | "ARCHETYPE_CHOICE"
  | "RELATIONSHIP_CHOICE"
  | "TREE_GROWING"
  | "RESEARCH_ACTIVE"
  | "DISCOVERY_INTERRUPT"
  | "USER_FORK"
  | "COMPLETE";

export type BrewDialogueChoiceV42 = {
  choiceId: string;
  label: string;
  description?: string;
  action: string;
  meta?: Record<string, string>;
};

export type BrewProfessorLineV42 = {
  lineId: string;
  speaker: "PROFESSOR";
  body: string;
  intent?: ResearchMessageV4["intent"];
  conceptProbe?: string;
};

export type BrewCostBudgetV42 = {
  creativePass1Max: 1;
  researchCallsMax: 6;
  creativeRevisitMax: 1;
  creativePass1Used: number;
  researchCallsUsed: number;
  creativeRevisitUsed: number;
};

export type BrewDiscoveryInterruptV42 = {
  interruptId: string;
  headline: string;
  body: string;
  choices: BrewDialogueChoiceV42[];
  mechanicalPattern: string;
};

export type BrewSessionV42 = {
  version: typeof PROFESSOR_BREW_SESSION_V4_2_V1_VERSION;
  decision: typeof PROFESSOR_V4_2_DECISION_V1;
  sessionId: string;
  mode: BrewSessionModeV42;
  phase: BrewSessionPhaseV42;
  fixtureCase: BrewFixtureCaseV42 | null;
  commanderName: string | null;
  commanderSlug: string | null;
  commanderOracleId: string | null;
  commanderColorIdentity: string[];
  bracket: CommanderBracket;
  archetypeChoices: BrewArchetypeChoiceV42[];
  userIntent: string[];
  relationshipLens: string | null;
  workingDeckTheory: WorkingDeckTheoryV4 | null;
  loopResult: ProfessorV41ConversationLoopResultV1 | null;
  treeRevealStep: number;
  verifiedPackageIds: string[];
  cardStatusOverrides: Record<string, CardProgressionStatusV42>;
  professorLines: BrewProfessorLineV42[];
  pendingChoices: BrewDialogueChoiceV42[];
  discoveryInterrupt: BrewDiscoveryInterruptV42 | null;
  warrantCreativeRevisit: boolean;
  selectedTreeNodeId: string | null;
  costBudget: BrewCostBudgetV42;
  journalEntries: string[];
  cardImageUrls: Record<string, string>;
  mechanismTruthCaseId: string | null;
  liveStatus: string | null;
  autoBuildComplete: boolean;
  deckList: { name: string; category: string }[];
  deckListRevealCount: number;
  storeSlug: string | null;
  inStockNames: string[];
  councilState: BrewSessionCouncilStateV42 | null;
  finalReport: ProfessorDeckFinalReportV48 | null;
  deckGrade: ProfessorDeckGradeV4 | null;
  finalDeckDoctor: FinalDeckDoctorSessionV48 | null;
};

export type BrewSessionViewV42 = {
  session: BrewSessionV42;
  tree: BrewTreeGraphV42 | null;
};
