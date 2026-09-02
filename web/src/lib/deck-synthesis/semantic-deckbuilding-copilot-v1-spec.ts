/**
 * @deprecated Renamed to Semantic Deckbuilding Professor — see semantic-deckbuilding-professor-v1-spec.ts
 * Re-exports preserved for transitional imports.
 */
export {
  SEMANTIC_DECKBUILDING_PROFESSOR_V1_SPEC_VERSION as SEMANTIC_DECKBUILDING_COPILOT_V1_SPEC_VERSION,
  SEMANTIC_DECKBUILDING_PROFESSOR_PRODUCT,
  SEMANTIC_DECKBUILDING_PROFESSOR_BOUNDARY as SEMANTIC_DECKBUILDING_COPILOT_BOUNDARY,
  SEMANTIC_DECKBUILDING_PROFESSOR_TOOLS_V1,
  SEMANTIC_DECKBUILDING_PROFESSOR_ESCALATION_TRIGGERS,
  SEMANTIC_DECKBUILDING_PROFESSOR_RAG_POLICY,
  SEMANTIC_DECKBUILDING_PROFESSOR_ORCHESTRATION,
  type ProfessorStrategyHypothesis as CopilotStrategyHypothesis,
  type ProfessorAssessment,
} from "./semantic-deckbuilding-professor-v1-spec";

import type { ProfessorAssessment } from "./semantic-deckbuilding-professor-v1-spec";

/** Legacy alias for ProfessorAssessment.interpretation fields. */
export type CopilotInterpretBuildResult = Pick<
  ProfessorAssessment,
  | "inferredStrategyHypotheses"
  | "confidence"
  | "missingFunctions"
  | "ambiguityQuestions"
  | "recommendedRetrievalRequests"
> & {
  likelyStrategies: ProfessorAssessment["inferredStrategyHypotheses"];
  supportingCardGroups: string[];
  conflictingCardGroups: string[];
  suggestedQuestions: ProfessorAssessment["ambiguityQuestions"];
  proposedRetrievalRequests: ProfessorAssessment["recommendedRetrievalRequests"];
};

/** Future non-authoritative entry concept — not implemented. */
export const INTERPRET_CURRENT_BUILD_CONTRACT = {
  entryPoint: "interpretCurrentBuild",
  input: {
    commander: "CommandZoneConfiguration",
    bracket: "CommanderBracket",
    selectedCards: "OracleId[]",
    buildDirections: "CommanderBuildDirection[]",
    directionAnchors: "DirectionAnchor[]",
    retrievalSpecification: "RetrievalSpecification",
    commandZoneComposition: "CommandZoneComposition | null",
  },
  output: "ProfessorAssessment",
} as const;
