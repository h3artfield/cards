import { buildCardFeatureBundle } from "@/lib/semantic-visualization/feature-vector-v1";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import {
  buildCardInteractionProfile,
  scoredDimensionsToVector,
} from "./card-interaction-profile-v1";
import type { DeckSemanticProfile, DeckStrategyAssignment } from "./types";
import {
  DECK_SEMANTIC_PROFILE_VERSION,
  STRATEGY_TAXONOMY_VERSION,
} from "./types";
import type { ShadowSemanticIndex } from "./shadow-semantic-index";
import { aggregateKeyedVectors, sumKeyedVectors } from "./shadow-semantic-index";
import { classifyDeckStrategy } from "./deck-strategy-classifier-v1";
import { DERIVED_ROLE_NAMES } from "@/lib/semantic-visualization/derived-features-v1";
import { buildDeckProfileProvenance } from "./semantic-universe-v1";
import { generateDeckSynergyEdges } from "./semantic-synergy-edges-v1";

export type DeckSemanticProfileInput = {
  deckHash: string;
  commanderOracleIds: string[];
  mainboardOracleIds: string[];
  shadowIndex: ShadowSemanticIndex;
  catalogByOracleId: Map<string, GoldenCatalogOracleCard>;
  paperEligibleOracleIds: Set<string>;
};

export function buildDeckSemanticProfile(input: DeckSemanticProfileInput): DeckSemanticProfile | null {
  const paperMainboard = input.mainboardOracleIds.filter((id) =>
    input.paperEligibleOracleIds.has(id),
  );
  const paperCommanders = input.commanderOracleIds.filter((id) =>
    input.paperEligibleOracleIds.has(id),
  );

  const bundles = [];
  const interactionProfiles = [];
  const commanderProfiles = [];
  const cardRoleBundles = [];

  for (const oracleId of paperMainboard) {
    const shadow = input.shadowIndex.byOracleId.get(oracleId);
    const card = input.catalogByOracleId.get(oracleId);
    if (!shadow || !card) continue;
    const bundle = buildCardFeatureBundle({
      card,
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
    });
    bundles.push(bundle);
    const profile = buildCardInteractionProfile({
      oracleId,
      card,
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
      semanticVersion: input.shadowIndex.semanticVersion,
      parserVersion: input.shadowIndex.parserVersion,
      parserBlobClosure: input.shadowIndex.parserBlobClosure,
    });
    interactionProfiles.push(profile);
    cardRoleBundles.push({ oracleId, derivedRoles: bundle.derivedRoles, profile });
  }

  for (const oracleId of paperCommanders) {
    const shadow = input.shadowIndex.byOracleId.get(oracleId);
    const card = input.catalogByOracleId.get(oracleId);
    if (!shadow || !card) continue;
    commanderProfiles.push(
      buildCardInteractionProfile({
        oracleId,
        card,
        actions: shadow.semantic.actions,
        abilities: shadow.semantic.abilities,
        semanticVersion: input.shadowIndex.semanticVersion,
        parserVersion: input.shadowIndex.parserVersion,
        parserBlobClosure: input.shadowIndex.parserBlobClosure,
      }),
    );
  }

  if (bundles.length === 0) return null;

  const derivedRoles: Record<string, number> = {};
  for (const bundle of bundles) {
    for (const role of bundle.derivedRoles) {
      derivedRoles[role] = (derivedRoles[role] ?? 0) + 1 / bundles.length;
    }
  }
  for (const role of DERIVED_ROLE_NAMES) {
    if (!(role in derivedRoles)) derivedRoles[role] = 0;
  }

  const deckAttack = sumKeyedVectors(
    interactionProfiles.map((p) => scoredDimensionsToVector(p.answerCapabilities)),
    true,
  );
  const deckVuln = sumKeyedVectors(
    interactionProfiles.map((p) => ({
      ...scoredDimensionsToVector(p.dependencies),
      ...scoredDimensionsToVector(p.vulnerabilities),
    })),
    true,
  );
  const commanderAttack = aggregateKeyedVectors(
    commanderProfiles.map((p) => scoredDimensionsToVector(p.answerCapabilities)),
  );
  const commanderVuln = aggregateKeyedVectors(
    commanderProfiles.map((p) => ({
      ...scoredDimensionsToVector(p.dependencies),
      ...scoredDimensionsToVector(p.vulnerabilities),
    })),
  );
  const commanderDerived: Record<string, number> = {};
  for (const oracleId of paperCommanders) {
    const shadow = input.shadowIndex.byOracleId.get(oracleId);
    const card = input.catalogByOracleId.get(oracleId);
    if (!shadow || !card) continue;
    const bundle = buildCardFeatureBundle({
      card,
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
    });
    for (const role of bundle.derivedRoles) {
      commanderDerived[role] = Math.max(commanderDerived[role] ?? 0, 1);
    }
  }

  const synergyEdges = generateDeckSynergyEdges({
    cards: cardRoleBundles,
    semanticVersion: input.shadowIndex.semanticVersion,
  });

  const strategyPartial = classifyDeckStrategy({
    derivedRoles,
    attackVector: deckAttack,
    vulnerabilityVector: deckVuln,
    commanderAttack,
  });

  const strategyAssignment: DeckStrategyAssignment = {
    deckHash: input.deckHash,
    assignmentVersion: "deck-strategy-assignment-v1",
    generatedAt: new Date().toISOString(),
    assignmentSource: strategyPartial.assignmentSource,
    archetypeDistribution: strategyPartial.archetypeDistribution,
    themeDistribution: strategyPartial.themeDistribution,
    classifierConfidence: strategyPartial.classifierConfidence,
    evidence: strategyPartial.evidence,
    contributingCards: paperMainboard.slice(0, 25),
    contributingSemanticFeatures: strategyPartial.contributingSemanticFeatures,
  };

  const commanderSupportSignals = ["ramp", "protection", "recursion", "card_draw", "tutor"] as const;
  let commanderSupport = 0;
  for (const signal of commanderSupportSignals) {
    commanderSupport += derivedRoles[signal] ?? 0;
  }
  commanderSupport = Math.min(1, commanderSupport / commanderSupportSignals.length);

  const commanderDependency =
    Object.values(
      aggregateKeyedVectors(commanderProfiles.map((p) => scoredDimensionsToVector(p.dependencies))),
    ).reduce((a, b) => a + b, 0) / Math.max(1, commanderProfiles.length);

  return {
    deckHash: input.deckHash,
    profileVersion: DECK_SEMANTIC_PROFILE_VERSION,
    provenance: buildDeckProfileProvenance({
      strategyTaxonomyVersion: STRATEGY_TAXONOMY_VERSION,
      deckProfileVersion: DECK_SEMANTIC_PROFILE_VERSION,
    }),
    commanderOracleIds: input.commanderOracleIds,
    commanderVector: {
      attackVector: commanderAttack,
      vulnerabilityVector: commanderVuln,
      actionDensity: commanderAttack,
      derivedRoles: commanderDerived,
    },
    deckAggregateVector: {
      actionDensity: deckAttack,
      zoneProfile: aggregateKeyedVectors(interactionProfiles.map((p) => p.zonesUsed)),
      abilityProfile: aggregateKeyedVectors(interactionProfiles.map((p) => p.timingProfile)),
      attackVector: deckAttack,
      vulnerabilityVector: deckVuln,
      dependencies: aggregateKeyedVectors(
        interactionProfiles.map((p) => scoredDimensionsToVector(p.dependencies)),
      ),
      derivedRoles,
    },
    deckInteractionStructure: {
      commanderSupport,
      commanderDependency,
      commanderSynergy: strategyPartial.classifierConfidence * 0.5 + commanderSupport * 0.5,
      commanderRedundancy: derivedRoles.tutor ?? 0,
      internalSynergyEdgeCount: synergyEdges.length,
    },
    strategyAssignment,
  };
}
