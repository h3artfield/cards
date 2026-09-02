import type { DeckInteractionProfileV2_1, RpsVectorKind } from "../commander-strategy/interaction-profile-v2.1/types";
import type { GameChangerDeckAudit } from "../commander-strategy/model-c/game-changer-features-v1";
import type { DeckSemanticCensus } from "../commander-strategy/model-c/types";
import type { DeckStrategyAssignment } from "../commander-strategy/types";
import type { NormalizedDeckInstance } from "../commander-strategy/types";
import type { DECK_EVALUATION_ENGINE_V1_FROZEN_DEPENDENCIES } from "./deck-evaluation-engine-v1-spec";

export const DECK_EVALUATION_ENGINE_VERSION = "deck-evaluation-engine-v1";

export type EvaluateDeckOptions = {
  paperEligibleOnly?: boolean;
  includeEvaluative?: boolean;
  includeRecommendation?: boolean;
  goalProfile?: string;
};

export type EvaluateDeckInput = {
  deck: NormalizedDeckInstance;
  options?: EvaluateDeckOptions;
};

export type CardContributionRecord = {
  oracleId: string;
  cardName: string;
  zone: "mainboard" | "commandZone";
  quantity: number;
  dimensionId: string;
  ipv2Key: string;
  vectorKind: RpsVectorKind;
  rawScore: number;
  weightedContribution: number;
  contributionShare: number;
  rulesTriggered: string[];
  evidenceRefs: Array<{ oracleId: string; rule: string; note?: string }>;
};

export type MechanicalDimensionValue = {
  id: string;
  label: string;
  zone: "mainboard" | "commandZone" | "both";
  value: number;
  sourceKeys: string[];
};

export type DeckMechanicalProfileV1 = {
  profileVersion: "deck-mechanical-profile-v1";
  interactionProfile: DeckInteractionProfileV2_1;
  dimensions: MechanicalDimensionValue[];
  zoneProfiles: {
    mainboard: Record<string, number>;
    commandZone: Record<string, number>;
  };
  relianceDimensions: Record<string, { mainboard: number; commandZone: number }>;
  structuralSupplements: {
    basicStructure: Record<string, number>;
    gameChanger: Record<string, number>;
    gameChangerAudit: GameChangerDeckAudit;
    rc8SemanticAggregate: Record<string, number>;
  };
  commanderCohesion: {
    commanderSupport: number;
    commanderDependency: number;
    commanderSynergy: number;
    commanderRedundancy: number;
    internalSynergyEdgeCount: number;
    strategyAssignment?: DeckStrategyAssignment;
  } | null;
  cardContributions: CardContributionRecord[];
};

export type DeckEvaluationCoverage = DeckSemanticCensus & {
  needsReviewActionCount: number;
  structuralInvalidCount: number;
  cardsWithSemantics: number;
};

export type DeckEvaluationReport = {
  meta: {
    engineVersion: typeof DECK_EVALUATION_ENGINE_VERSION;
    specVersion: string;
    generatedAt: string;
    dependencyPins: typeof DECK_EVALUATION_ENGINE_V1_FROZEN_DEPENDENCIES;
    coverage: DeckEvaluationCoverage;
    resolution: {
      cardResolutionRate: number;
      unresolvedCards: string[];
      commanderResolutionStatus: string;
    };
  };
  descriptive: DeckMechanicalProfileV1;
  evaluative: null;
  recommendation: null;
};

export type EvaluateSwapInput = {
  deck: NormalizedDeckInstance;
  removeOracleId: string;
  addOracleId: string;
  options?: EvaluateDeckOptions;
};

export type ProfileDimensionDelta = {
  dimensionId: string;
  label: string;
  before: number;
  after: number;
  delta: number;
};

export type SwapEvaluationReport = {
  meta: {
    engineVersion: typeof DECK_EVALUATION_ENGINE_VERSION;
    generatedAt: string;
    removeOracleId: string;
    addOracleId: string;
  };
  before: DeckEvaluationReport;
  after: DeckEvaluationReport;
  delta: {
    mechanicalProfile: ProfileDimensionDelta[];
    zoneProfiles: {
      mainboardKeysChanged: string[];
      commandZoneKeysChanged: string[];
    };
    structuralChanges: {
      mainboardCountBefore: number;
      mainboardCountAfter: number;
      gameChangerCountBefore: number;
      gameChangerCountAfter: number;
    };
    contributionsAdded: CardContributionRecord[];
    contributionsRemoved: CardContributionRecord[];
  };
  explanation: Array<{
    kind: "dimension_shift" | "card_removed" | "card_added" | "structural";
    message: string;
    dimensionId?: string;
    evidenceRefs?: Array<{ oracleId: string; rule: string; note?: string }>;
  }>;
};
