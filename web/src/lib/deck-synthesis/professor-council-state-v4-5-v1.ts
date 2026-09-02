/**
 * Professor Council State v4.5 — shared collaborative deck-building object.
 * Creative, Research, and Critic read and patch the same state.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { ProfessorV41ConversationLoopResultV1 } from "./professor-v4-1-conversation-loop-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { ProfessorDeckListEntryV43 } from "./professor-brew-deck-list-v4-3-v1";

export const PROFESSOR_COUNCIL_STATE_V4_5_V1_VERSION = "professor-council-state-v4-5-v1";

export type CouncilPhaseV45 =
  | "PRE_BUILD"
  | "STRATEGY"
  | "SKELETON"
  | "ASSEMBLY"
  | "CHECKPOINT"
  | "CUT_REVIEW"
  | "FINAL"
  | "COMPLETE";

export type CouncilMessageIntentV45 =
  | "PROPOSE"
  | "CHALLENGE"
  | "ANSWER"
  | "VERIFY"
  | "REJECT"
  | "SEARCH"
  | "COMPARE"
  | "CHANGE"
  | "DECIDE"
  | "ASK_USER";

export type CouncilSpeakerV45 = "CREATIVE" | "RESEARCH" | "CRITIC" | "SYSTEM";

export type CandidateCardOriginV45 =
  | "MODEL_PRIOR"
  | "COMMANDER_RAG"
  | "GENERIC_RAG"
  | "SEMANTIC_DISCOVERY"
  | "ORACLE_SEARCH"
  | "USER"
  | "DECK_CHECKPOINT";

export type CandidateCardStatusV45 =
  | "PROPOSED"
  | "CANDIDATE"
  | "VERIFIED"
  | "CORE"
  | "REJECTED";

export type CouncilTurnV45 = {
  turnId: string;
  phase: CouncilPhaseV45;
  speaker: CouncilSpeakerV45;
  intent: CouncilMessageIntentV45;
  respondsToTurnIds: string[];
  message: string;
  evidenceRefs?: string[];
  /** Developer-only detail (claim IDs, validator codes) — hidden in default UI. */
  developerDetail?: string;
};

export type CouncilDecisionV45 = {
  decisionId: string;
  phase: CouncilPhaseV45;
  decision: string;
  reasoning: string;
  supportingTurnIds: string[];
  designRulesAdded?: string[];
  reconsiderable: boolean;
};

export type DeckCharterV45 = {
  commander: string;
  requestedBracket: CommanderBracket;
  playStyle: string;
  commanderRelationship: string;
  deckIdentity: string;
  playerIntentSummary: string;
  primaryStrategy: string;
  secondaryStrategy: string;
  commanderDependentEngine: string;
  independentEngine: string;
  harmonyPlan: string;
  intendedWinPaths: string[];
  expectedPlayPattern: string;
  bracketConstraints: string;
  comboPolicy: string;
  tutorPolicy: string;
  designRules: string[];
  avoidPatterns: string[];
  researchPriorities: string[];
};

export type StrategyPathV45 = {
  pathId: string;
  label: string;
  summary: string;
  commanderDependence: "HIGH" | "MEDIUM" | "LOW";
};

export type CandidateCardV45 = {
  cardId: string;
  name: string;
  proposedBy: CouncilSpeakerV45;
  proposalReason: string;
  origin: CandidateCardOriginV45;
  functions: string[];
  packages: string[];
  commanderDependence: "HIGH" | "MEDIUM" | "LOW";
  worksWithoutCommander: "HIGH" | "MEDIUM" | "LOW";
  oracleVerified: boolean;
  legalityVerified: boolean;
  status: CandidateCardStatusV45;
  rejectionReason?: string;
};

export type DeckSnapshotV45 = {
  snapshotId: string;
  cardCount: number;
  targetCount: number;
  roleCounts: Record<string, number>;
  commanderDependentCount: number;
  independentCount: number;
  engines: string[];
  packages: string[];
  weaknesses: string[];
  charterAlignmentNotes: string[];
};

export type ProfessorCouncilStateV45 = {
  version: typeof PROFESSOR_COUNCIL_STATE_V4_5_V1_VERSION;
  phase: CouncilPhaseV45;
  deckCharter: DeckCharterV45 | null;
  strategyPaths: StrategyPathV45[];
  selectedStrategyPathId: string | null;
  workingDeckTheory: WorkingDeckTheoryV4 | null;
  selectedCards: CandidateCardV45[];
  candidatePool: CandidateCardV45[];
  rejectedCards: CandidateCardV45[];
  openRoles: string[];
  councilDecisions: CouncilDecisionV45[];
  conversation: CouncilTurnV45[];
  snapshots: DeckSnapshotV45[];
  loopResult: ProfessorV41ConversationLoopResultV1 | null;
  revisionHistory: { revision: number; summary: string; author: CouncilSpeakerV45 | "USER" }[];
};

export type CouncilBrewContextV45 = {
  commanderName: string;
  bracket: CommanderBracket;
  userIntent: string[];
  relationshipLens: string | null;
  playStyle: string;
  commanderRelationship: string;
  fixtureCase: "meren" | "chatterfang" | null;
};

export function councilSpeakerLabel(speaker: CouncilSpeakerV45): string {
  switch (speaker) {
    case "CREATIVE":
      return "Creative Professor";
    case "RESEARCH":
      return "Research Professor";
    case "CRITIC":
      return "Critic Professor";
    case "SYSTEM":
      return "Council";
  }
}

export function emptyProfessorCouncilStateV45(): ProfessorCouncilStateV45 {
  return {
    version: PROFESSOR_COUNCIL_STATE_V4_5_V1_VERSION,
    phase: "PRE_BUILD",
    deckCharter: null,
    strategyPaths: [],
    selectedStrategyPathId: null,
    workingDeckTheory: null,
    selectedCards: [],
    candidatePool: [],
    rejectedCards: [],
    openRoles: [],
    councilDecisions: [],
    conversation: [],
    snapshots: [],
    loopResult: null,
    revisionHistory: [],
  };
}

export function deckEntriesToCandidateCards(
  entries: ProfessorDeckListEntryV43[],
  proposedBy: CouncilSpeakerV45 = "RESEARCH",
): CandidateCardV45[] {
  return entries
    .filter((e) => e.category !== "commander")
    .map((entry, index) => ({
      cardId: `card-${index}-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: entry.name,
      proposedBy,
      proposalReason: `Attached to ${entry.category} role during assembly.`,
      origin: "MODEL_PRIOR" as const,
      functions: [entry.category],
      packages: [],
      commanderDependence: "MEDIUM" as const,
      worksWithoutCommander: "MEDIUM" as const,
      oracleVerified: false,
      legalityVerified: true,
      status: "CANDIDATE" as const,
    }));
}
