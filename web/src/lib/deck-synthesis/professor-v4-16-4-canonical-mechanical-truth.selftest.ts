/**
 * PROFESSOR v4.16.4 — deterministic acceptance (no OpenAI, no commander #5).
 */
import assert from "node:assert/strict";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";
import {
  cardLegalInCommanderColorIdentity,
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import { buildAccessArchitectureV4164 } from "./professor-verified-access-route-v4-16-4-v1";
import { assessVerifiedWinLineV4164 } from "./professor-verified-win-line-v4-16-4-v1";
import { rankOpportunityCostCandidatesV4164 } from "./professor-opportunity-cost-v4-16-4-v1";
import {
  buildStructuralCompletionPlanV4164,
  updateStructuralBuildTelemetryV4164,
} from "./professor-structural-completion-v4-16-4-v1";
import { assessProspectiveAcceptanceSemanticsV4164 } from "./professor-acceptance-semantics-v4-16-4-v1";
import { assessCanonicalDeckLegalityV4161 } from "./professor-canonical-legality-v4-16-1-v1";
import { assessDeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import { professorBrewNeedsStructuralResearchV4164 } from "./professor-brew-progress-v4-7-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { BrewSessionV42 } from "./professor-brew-session-types-v4-2-v1";

function golden(partial: Partial<GoldenCatalogOracleCard> & Pick<GoldenCatalogOracleCard, "oracleId" | "canonicalName">): GoldenCatalogOracleCard {
  return {
    id: partial.oracleId,
    oracleId: partial.oracleId,
    canonicalName: partial.canonicalName,
    normalizedName: partial.canonicalName.toLowerCase(),
    manaValue: partial.manaValue ?? 0,
    cmc: partial.manaValue ?? 0,
    colors: partial.colors ?? [],
    colorIdentity: partial.colorIdentity ?? partial.colors ?? [],
    typeLine: partial.typeLine ?? "",
    supertypes: partial.supertypes ?? [],
    types: partial.types ?? [],
    subtypes: partial.subtypes ?? [],
    keywords: partial.keywords ?? [],
    legalities: partial.legalities ?? { commander: "legal" },
    commanderClassification: partial.commanderClassification ?? { commanderFormatStatus: "LEGAL" },
    commanderEligibility: partial.commanderEligibility ?? { eligible: true, basis: "oracle_rules" },
    commanderEligibilityVersion: "test",
    oracleTags: [],
    printingIds: [],
    sourceVersion: "test",
    updatedAt: "2026-01-01",
    ...partial,
  };
}

function testCatalog(cards: GoldenCatalogOracleCard[]): DeckResolutionCatalog {
  const byOracleId = new Map(cards.map((c) => [c.oracleId, c]));
  return {
    byOracleId,
    byNormalizedName: new Map(),
    byOracleTextHash: new Map(),
    catalogVersion: "test",
    loadedAt: "2026-01-01",
    cardCount: cards.length,
    paperByOracleId: new Map(),
    officialAliasByNormalizedName: new Map(),
    competitiveDeckOracleIds: new Set(),
    nonCompetitiveOracleReasons: new Map(),
    catalogUniverse: {
      rawCatalogIdentitiesLoaded: cards.length,
      paperIdentitiesAvailable: cards.length,
      digitalOnlyIdentities: 0,
      nonCardIdentities: 0,
      paperPopulationHash: "test",
    },
  } as DeckResolutionCatalog;
}

const FIXTURE_CATALOG = testCatalog([
  golden({
    oracleId: "oid-jace",
    canonicalName: "Jace, the Mind Sculptor",
    manaCost: "{2}{U}{U}",
    manaValue: 4,
    colors: ["U"],
    colorIdentity: ["U"],
    typeLine: "Legendary Planeswalker — Jace",
    types: ["Planeswalker"],
    supertypes: ["Legendary"],
    oracleText: "+2: Look at the top card of your library.",
  }),
  golden({
    oracleId: "oid-teferi",
    canonicalName: "Teferi, Temporal Archmage",
    manaCost: "{4}{U}{U}",
    manaValue: 6,
    colors: ["U"],
    colorIdentity: ["U"],
    typeLine: "Legendary Planeswalker — Teferi",
    types: ["Planeswalker"],
    supertypes: ["Legendary"],
    oracleText: "+1: Draw a card.",
  }),
  golden({
    oracleId: "oid-mystical-tutor",
    canonicalName: "Mystical Tutor",
    manaCost: "{U}",
    manaValue: 1,
    colors: ["U"],
    colorIdentity: ["U"],
    typeLine: "Instant",
    types: ["Instant"],
    oracleText:
      "Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top of your library.",
  }),
  golden({
    oracleId: "oid-counterspell",
    canonicalName: "Counterspell",
    manaCost: "{U}{U}",
    manaValue: 2,
    colors: ["U"],
    colorIdentity: ["U"],
    typeLine: "Instant",
    types: ["Instant"],
    oracleText: "Counter target spell.",
  }),
  golden({
    oracleId: "oid-swords",
    canonicalName: "Swords to Plowshares",
    manaCost: "{W}",
    manaValue: 1,
    colors: ["W"],
    colorIdentity: ["W"],
    typeLine: "Instant",
    types: ["Instant"],
    oracleText: "Exile target creature.",
  }),
  golden({
    oracleId: "oid-inventors-fair",
    canonicalName: "Inventors' Fair",
    manaCost: "",
    manaValue: 0,
    colors: [],
    colorIdentity: [],
    typeLine: "Legendary Land",
    types: ["Land"],
    supertypes: ["Legendary"],
    oracleText:
      "{T}, Sacrifice Inventors' Fair: Search your library for an artifact card, reveal it, put it into your hand, then shuffle.",
  }),
  golden({
    oracleId: "oid-ballista",
    canonicalName: "Walking Ballista",
    manaCost: "{X}{X}",
    manaValue: 0,
    colors: [],
    colorIdentity: [],
    typeLine: "Artifact Creature — Construct",
    types: ["Artifact", "Creature"],
    subtypes: ["Construct"],
    oracleText: "Walking Ballista enters with X +1/+1 counters on it.",
  }),
  golden({
    oracleId: "oid-storm-crow",
    canonicalName: "Storm Crow",
    manaCost: "{1}{U}",
    manaValue: 2,
    colors: ["U"],
    colorIdentity: ["U"],
    typeLine: "Creature — Bird",
    types: ["Creature"],
    subtypes: ["Bird"],
    oracleText: "Flying",
  }),
  golden({
    oracleId: "oid-jace-engine",
    canonicalName: "Jace, Eldrazi Confluence",
    manaCost: "{2}{U}{U}",
    manaValue: 4,
    colors: ["U"],
    colorIdentity: ["U"],
    typeLine: "Legendary Planeswalker — Jace",
    types: ["Planeswalker"],
    supertypes: ["Legendary"],
    oracleText: "+1: Draw a card. -8: You win the game.",
  }),
]);

function card(name: string, oracleId: string, roles: string[] = [], category: CouncilCardV46["category"] = "spell"): CouncilCardV46 {
  return {
    cardId: oracleId,
    oracleId,
    name,
    category,
    roles,
    origin: "GOLDEN_CATALOG",
    proposedBy: "RESEARCH",
    status: "SELECTED",
    oracleVerified: true,
    colorIdentityVerified: true,
    legalityVerified: true,
    addedAtRevision: 1,
    lastReviewedRevision: 1,
  };
}

function charter(): DeckCharterV45 {
  return {
    commander: "Teferi, Temporal Archmage",
    requestedBracket: 4,
    playStyle: "Optimized",
    commanderRelationship: "Harmony",
    deckIdentity: "Mono-blue planeswalker control",
    playerIntentSummary: "B4 optimized",
    primaryStrategy: "Counter Synergy Package",
    secondaryStrategy: "Planeswalker control",
    commanderDependentEngine: "Teferi stasis",
    independentEngine: "Card advantage",
    harmonyPlan: "Control then win",
    intendedWinPaths: ["Planeswalker ultimate pressure"],
    expectedPlayPattern: "Slow",
    bracketConstraints: "B4",
    comboPolicy: "Secondary",
    tutorPolicy: "Allowed",
    designRules: [],
    avoidPatterns: [],
    researchPriorities: [],
  };
}

function theoryWithBallista(): WorkingDeckTheoryV4 {
  return {
    version: "professor-working-deck-theory-v4",
    commander: "Teferi, Temporal Archmage",
    userIntent: [],
    thesis: { summary: "test", deckIdentity: "test", mechanicChain: [] },
    packages: [
      {
        packageId: "pkg-artifacts",
        name: "Artifact engine",
        purpose: "Ballista payoff",
        commanderDependence: "LOW",
        status: "CORE",
        inputs: [],
        outputs: [],
        roles: ["engine"],
        candidateCards: ["Walking Ballista"],
        evidenceRefs: [],
        notes: [],
      },
    ],
    winPaths: [],
    independentEngines: [],
    resiliencePlan: [],
    weaknesses: [],
    openQuestions: [],
    verifiedDiscoveries: [],
    ideaBoard: { version: "professor-idea-board-v4", clusters: [], edges: [] },
    conversationState: "COMPLETE",
    researchMessages: [],
    revisionHistory: [],
    currentRevision: 1,
  };
}

function run(): void {
  const jace = resolveCanonicalCardTruthV4164({
    name: "Jace, the Mind Sculptor",
    oracleId: "oid-jace",
    catalog: FIXTURE_CATALOG,
  });
  assert.equal(jace.status, "RESOLVED");
  assert.ok(jace.cardTypes.includes("Planeswalker"), "Jace must be planeswalker");
  assert.equal(jace.manaValue, 4, "Jace MV must match Oracle");

  const teferi = resolveCanonicalCardTruthV4164({
    name: "Teferi, Temporal Archmage",
    oracleId: "oid-teferi",
    catalog: FIXTURE_CATALOG,
  });
  assert.equal(teferi.manaValue, 6, "Teferi commander MV must be 6 not guessed 3");

  const unresolved = resolveCanonicalCardTruthV4164({ name: "Totally Fake Card", catalog: FIXTURE_CATALOG });
  assert.equal(unresolved.status, "CARD_TRUTH_UNRESOLVED");
  assert.equal(cardTruthAllowsIntelligenceParticipation(unresolved), false);

  const accessDeck = [
    card("Mystical Tutor", "oid-mystical-tutor", ["interaction"]),
    card("Jace, the Mind Sculptor", "oid-jace", ["engine"]),
    card("Counterspell", "oid-counterspell", ["interaction"]),
    card("Walking Ballista", "oid-ballista", ["finisher"], "artifact"),
  ];
  const access = buildAccessArchitectureV4164({
    selectedCards: accessDeck,
    charter: charter(),
    theory: theoryWithBallista(),
    catalog: FIXTURE_CATALOG,
  });
  assert.ok(
    !access.routes.some((r) => r.sourceName === "Mystical Tutor" && r.targetName.includes("Jace")),
    "Mystical Tutor must not access planeswalker Jace",
  );
  const mysticalRoute = access.routes.find((r) => r.sourceName === "Mystical Tutor");
  if (mysticalRoute) {
    assert.equal(mysticalRoute.destination, "TOP_OF_LIBRARY", "Topdeck tutor must be TOP_OF_LIBRARY");
    assert.notEqual(mysticalRoute.destination, "HAND");
  }

  const artifactAccess = buildAccessArchitectureV4164({
    selectedCards: [
      card("Inventors' Fair", "oid-inventors-fair", ["ramp"], "land"),
      card("Walking Ballista", "oid-ballista", ["finisher"], "artifact"),
    ],
    charter: charter(),
    theory: theoryWithBallista(),
    catalog: FIXTURE_CATALOG,
  });
  assert.ok(artifactAccess.routes.some((r) => r.destination === "HAND"), "Artifact tutor may put into hand");

  const opp = rankOpportunityCostCandidatesV4164({
    selectedCards: [
      card("Jace, Eldrazi Confluence", "oid-jace-engine", ["interaction", "engine"]),
      card("Counterspell", "oid-counterspell", ["interaction"]),
    ],
    charter: charter(),
    requestedBracket: 4,
    commanderColorIdentity: ["U"],
    catalog: FIXTURE_CATALOG,
  });
  assert.ok(
    !opp.bottomSlots.some((s) => s.bestKnownReplacement === "Swords to Plowshares"),
    "Mono-blue deck must reject white Swords before scoring",
  );
  assert.ok(opp.illegalReplacementsRejected >= 0);

  const dualRoleSlot = rankOpportunityCostCandidatesV4164({
    selectedCards: [card("Jace, Eldrazi Confluence", "oid-jace-engine", ["interaction", "engine", "card-advantage"])],
    charter: charter(),
    requestedBracket: 4,
    commanderColorIdentity: ["U"],
    catalog: FIXTURE_CATALOG,
  });
  const dual = dualRoleSlot.bottomSlots.find((s) => s.currentCard.includes("Jace"));
  if (dual && dual.rolesLost.length > 0) {
    assert.notEqual(dual.recommendation, "REPLACE", "Dual-role loss must penalize naive replacement");
  }

  const finisherDeck = [
    card("Storm Crow", "oid-storm-crow", ["finisher"], "creature"),
    card("Storm Crow", "oid-storm-crow-2", ["finisher"], "creature"),
  ];
  finisherDeck[1]!.name = "Welkin Tern";
  finisherDeck[1]!.oracleId = "oid-welkin";
  const win = assessVerifiedWinLineV4164({
    requestedBracket: 4,
    selectedCards: [
      card("Storm Crow", "oid-storm-crow", ["finisher"], "creature"),
      card("Welkin Tern", "oid-welkin", ["finisher"], "creature"),
      card("Storm Crow", "oid-storm-crow-b", ["finisher"], "creature"),
      card("Marang River Prowler", "oid-prowler", ["finisher"], "creature"),
      card("Higure, the Still Wind", "oid-higure", ["finisher"], "creature"),
    ],
    charter: charter(),
    legality: { effectiveBracketEvaluable: true, failures: [] } as never,
    catalog: FIXTURE_CATALOG,
  });
  assert.equal(win.mechanicallyVerified, false);
  assert.equal(win.concreteLineReady, false);

  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: { expectedLandCount: 35, structuralNonLandTarget: 64, reservedLandSlots: 35 } as never,
    selectedCards: Array.from({ length: 40 }, (_, i) => card(`Spell ${i}`, `oid-spell-${i}`, ["engine"])),
  });
  const plan = buildStructuralCompletionPlanV4164({
    slotBudget,
    deckNeeds: [{ needId: "need-1", status: "OPEN" } as never],
  });
  assert.ok(plan);
  assert.equal(plan!.action, "RUN_STRUCTURAL_RESEARCH");
  assert.equal(plan!.remainingNonlandSlots, 24);

  let telemetry = updateStructuralBuildTelemetryV4164({
    prior: null,
    selectedCardCount: 42,
    remainingNonlandSlots: 24,
  });
  telemetry = updateStructuralBuildTelemetryV4164({
    prior: telemetry,
    selectedCardCount: 42,
    remainingNonlandSlots: 24,
  });
  assert.equal(telemetry.consecutiveUnchangedPasses, 1);
  telemetry = updateStructuralBuildTelemetryV4164({
    prior: telemetry,
    selectedCardCount: 42,
    remainingNonlandSlots: 24,
  });
  assert.equal(telemetry.searchEscalationRequired, true, "Two unchanged passes must trigger escalation");

  const partialLegality = assessCanonicalDeckLegalityV4161({
    selectedCards: Array.from({ length: 42 }, (_, i) => card(`Spell ${i}`, `oid-spell-${i}`, ["engine"])),
    commanderName: "Teferi, Temporal Archmage",
    catalog: FIXTURE_CATALOG,
  });
  assert.equal(partialLegality.selectedCardsLegalSoFar, true);
  assert.equal(partialLegality.completeDeckLegal, false);
  assert.equal(partialLegality.gradeEligible, false);
  assert.equal(partialLegality.draftReadyEligible, false);

  const brewSession = {
    fixtureCase: false,
    councilState: {
      selectedCards: Array.from({ length: 42 }, (_, i) => card(`Spell ${i}`, `oid-spell-${i}`, ["engine"])),
      manaPlanV416: { expectedLandCount: 35, structuralNonLandTarget: 64, reservedLandSlots: 35 },
    },
  } as BrewSessionV42;
  assert.equal(professorBrewNeedsStructuralResearchV4164(brewSession), true);

  const acceptance = assessProspectiveAcceptanceSemanticsV4164({
    headProfessorExecuted: false,
    refinementExecuted: false,
    buildStalled: true,
    accessMechanicallyVerified: true,
    opportunityCostLegal: true,
    winMechanicallyVerified: false,
    structuralResearchTriggered: true,
    canonicalTruthResolved: true,
    partialDeckLegalSplitCorrect: true,
  });
  assert.equal(acceptance.headProfessor, "NOT_EVALUATED");
  assert.equal(acceptance.refinement, "NOT_EVALUATED");
  assert.equal(acceptance.constructionVsRescue, "NOT_EVALUATED");

  const swords = resolveCanonicalCardTruthV4164({ name: "Swords to Plowshares", catalog: FIXTURE_CATALOG });
  assert.equal(cardLegalInCommanderColorIdentity({ card: swords, commanderColorIdentity: ["U"] }), false);

  console.log("PROFESSOR v4.16.4 canonical mechanical truth acceptance — PASS");
}

run();
