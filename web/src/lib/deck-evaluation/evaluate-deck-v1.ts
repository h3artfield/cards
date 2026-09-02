import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { buildDeckSemanticProfile } from "../commander-strategy/deck-semantic-profile-v1";
import { buildDeckFeatureBundle } from "../commander-strategy/model-c/deck-features-v1";
import type { CommanderGameChangerSnapshot } from "../commander-strategy/model-c/game-changer-snapshot-v1";
import { getEligibleMainboardCards } from "../commander-strategy/model-c/deck-mainboard-v1";
import { buildDeckInteractionProfileV2_1 } from "../commander-strategy/interaction-profile-v2.1/deck-interaction-profile-v2.1";
import type { ShadowSemanticIndex } from "../commander-strategy/shadow-semantic-index";
import type { NormalizedDeckInstance } from "../commander-strategy/types";
import { assembleMechanicalProfile } from "./deck-mechanical-profile-v1";
import { buildCardContributions } from "./deck-card-contributions-v1";
import {
  DECK_EVALUATION_ENGINE_V1_FROZEN_DEPENDENCIES,
  DECK_EVALUATION_ENGINE_V1_SPEC_VERSION,
} from "./deck-evaluation-engine-v1-spec";
import type {
  DeckEvaluationCoverage,
  DeckEvaluationReport,
  EvaluateDeckInput,
  EvaluateDeckOptions,
} from "./types";

function countShadowQuality(input: {
  deck: NormalizedDeckInstance;
  shadowIndex: ShadowSemanticIndex;
}): { needsReviewActionCount: number; structuralInvalidCount: number; cardsWithSemantics: number } {
  let needsReviewActionCount = 0;
  let structuralInvalidCount = 0;
  let cardsWithSemantics = 0;
  const seen = new Set<string>();
  for (const id of [...input.deck.commanderOracleIds, ...input.deck.mainboard.map((c) => c.oracleId).filter(Boolean)]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const shadow = input.shadowIndex.byOracleId.get(id);
    if (!shadow) continue;
    cardsWithSemantics += 1;
    if (shadow.structuralInvalid) structuralInvalidCount += 1;
    needsReviewActionCount += shadow.needsReviewActions?.length ?? 0;
  }
  return { needsReviewActionCount, structuralInvalidCount, cardsWithSemantics };
}

export function evaluateDeck(input: {
  deck: NormalizedDeckInstance;
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  gameChangerSnapshot: CommanderGameChangerSnapshot;
  options?: EvaluateDeckOptions;
}): DeckEvaluationReport {
  const options: Required<EvaluateDeckOptions> = {
    paperEligibleOnly: input.options?.paperEligibleOnly ?? true,
    includeEvaluative: input.options?.includeEvaluative ?? false,
    includeRecommendation: input.options?.includeRecommendation ?? false,
    goalProfile: input.options?.goalProfile ?? "balanced_commander",
  };
  if (options.includeEvaluative) {
    throw new Error("Evaluative layer not implemented — descriptive-only in v1 foundation");
  }

  const featureBundle = buildDeckFeatureBundle({
    deck: input.deck,
    catalog: input.catalog,
    shadowIndex: input.shadowIndex,
    gameChangerSnapshot: input.gameChangerSnapshot,
  });

  const cmdSet = new Set(input.deck.commanderOracleIds);
  const mainboardRows = input.deck.mainboard
    .filter((c) => c.oracleId && c.paperEligible && !cmdSet.has(c.oracleId))
    .map((c) => ({
      oracleId: c.oracleId!,
      quantity: c.quantity,
      paperEligible: c.paperEligible,
    }));

  const interactionProfile = buildDeckInteractionProfileV2_1({
    mainboard: mainboardRows,
    commandZoneOracleIds: input.deck.commanderOracleIds,
    catalog: input.catalog,
    shadowIndex: input.shadowIndex,
  });

  const mbCards = mainboardRows.flatMap((row) => {
    const card = input.catalog.byOracleId.get(row.oracleId);
    return card ? [{ oracleId: row.oracleId, quantity: row.quantity, card }] : [];
  });
  const cmdCards = input.deck.commanderOracleIds.flatMap((oracleId) => {
    const card = input.catalog.byOracleId.get(oracleId);
    return card ? [{ oracleId, card }] : [];
  });

  const cardContributions = buildCardContributions({
    mainboard: mbCards,
    commandZone: cmdCards,
    shadowIndex: input.shadowIndex,
  });

  const paperEligibleOracleIds = new Set(
    [...input.catalog.paperByOracleId.entries()]
      .filter(([, meta]) => meta.paperEligible)
      .map(([id]) => id),
  );
  const mainboardOracleIds = getEligibleMainboardCards(input.deck).cards.flatMap((c) =>
    Array.from({ length: c.quantity }, () => c.oracleId),
  );

  let semanticProfile = null as ReturnType<typeof buildDeckSemanticProfile>;
  try {
    semanticProfile = buildDeckSemanticProfile({
      deckHash: input.deck.deckHash,
      commanderOracleIds: input.deck.commanderOracleIds,
      mainboardOracleIds,
      shadowIndex: input.shadowIndex,
      catalogByOracleId: input.catalog.byOracleId,
      paperEligibleOracleIds,
    });
  } catch {
    semanticProfile = null;
  }

  const shadowQuality = countShadowQuality({ deck: input.deck, shadowIndex: input.shadowIndex });
  const coverage: DeckEvaluationCoverage = {
    ...featureBundle.census,
    ...shadowQuality,
  };

  return {
    meta: {
      engineVersion: "deck-evaluation-engine-v1",
      specVersion: DECK_EVALUATION_ENGINE_V1_SPEC_VERSION,
      generatedAt: new Date().toISOString(),
      dependencyPins: DECK_EVALUATION_ENGINE_V1_FROZEN_DEPENDENCIES,
      coverage,
      resolution: {
        cardResolutionRate: input.deck.cardResolutionRate,
        unresolvedCards: input.deck.unresolvedCards,
        commanderResolutionStatus: input.deck.commanderResolutionStatus,
      },
    },
    descriptive: assembleMechanicalProfile({
      interactionProfile,
      featureBundle,
      semanticProfile,
      cardContributions,
    }),
    evaluative: null,
    recommendation: null,
  };
}

export function evaluateDeckFromInput(input: {
  request: EvaluateDeckInput;
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  gameChangerSnapshot: CommanderGameChangerSnapshot;
}): DeckEvaluationReport {
  return evaluateDeck({
    deck: input.request.deck,
    catalog: input.catalog,
    shadowIndex: input.shadowIndex,
    gameChangerSnapshot: input.gameChangerSnapshot,
    options: input.request.options,
  });
}
