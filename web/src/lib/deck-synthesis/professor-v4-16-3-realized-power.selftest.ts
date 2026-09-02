/**
 * PROFESSOR v4.16.3 — deterministic acceptance (no OpenAI prospective).
 */
import assert from "node:assert/strict";
import { assessBracketPowerAssessmentV4163 } from "./professor-bracket-power-assessment-v4-16-3-v1";
import { assessDeckSlotBudgetV4163, manaAssemblyLandAllowanceV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import { buildAccessArchitectureV4163 } from "./professor-access-architecture-v4-16-3-v1";
import { rankOpportunityCostCandidatesV4163 } from "./professor-opportunity-cost-v4-16-3-v1";
import { evaluateBracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import { assessB4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";
import { runPreFinalQualityCriticV4163 } from "./professor-pre-final-quality-critic-v4-16-3-v1";
import {
  auditCharterConceptSupportV4163,
  sanitizeUnsupportedCharterConceptsV4163,
} from "./professor-charter-concept-support-v4-16-3-v1";
import { appendManaBaseV48 } from "./professor-mana-base-v4-8-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";

import type { GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";

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

function accessCatalog(): DeckResolutionCatalog {
  const cards = [
    golden({
      oracleId: "oid-inventors-fair",
      canonicalName: "Inventors' Fair",
      typeLine: "Legendary Land",
      types: ["Land"],
      oracleText:
        "{T}, Sacrifice Inventors' Fair: Search your library for an artifact card, reveal it, put it into your hand, then shuffle.",
    }),
    golden({
      oracleId: "oid-urzas-saga",
      canonicalName: "Urza's Saga",
      typeLine: "Enchantment Land — Saga",
      types: ["Enchantment", "Land"],
      oracleText: "Chapter III — {1}, Sacrifice this Saga: Search your library for an artifact card with mana value 0 or 1, put it onto the battlefield, then shuffle.",
    }),
    golden({
      oracleId: "oid-walking-ballista",
      canonicalName: "Walking Ballista",
      typeLine: "Artifact Creature — Construct",
      types: ["Artifact", "Creature"],
      subtypes: ["Construct"],
      oracleText: "Walking Ballista enters with X +1/+1 counters on it.",
    }),
    golden({
      oracleId: "oid-mystic-forge",
      canonicalName: "Mystic Forge",
      typeLine: "Artifact",
      types: ["Artifact"],
      oracleText: "{T}: Look at the top card of your library. You may put that card onto the bottom of your library.",
    }),
  ];
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

function accessTheory(): WorkingDeckTheoryV4 {
  return {
    version: "professor-working-deck-theory-v4",
    commander: "Test",
    userIntent: [],
    thesis: { summary: "test", deckIdentity: "test", mechanicChain: [] },
    packages: [
      {
        packageId: "pkg-artifacts",
        name: "Artifact package",
        purpose: "Ballista",
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

function card(name: string, roles: string[] = [], category: CouncilCardV46["category"] = "spell"): CouncilCardV46 {
  return {
    cardId: `card-${name.replace(/\s+/g, "-").toLowerCase()}`,
    oracleId: `oid-${name.replace(/\s+/g, "-").toLowerCase()}`,
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

function charter(overrides: Partial<DeckCharterV45> = {}): DeckCharterV45 {
  return {
    commander: "Colorless Test Commander",
    requestedBracket: 4,
    playStyle: "Optimized",
    commanderRelationship: "Harmony",
    deckIdentity: "Colorless artifact counters",
    playerIntentSummary: "B4 optimized",
    primaryStrategy: "Counter Synergy Package",
    secondaryStrategy: "Overwhelm with large commander and colorless creatures using combat damage",
    commanderDependentEngine: "Counters",
    independentEngine: "Manifest value",
    harmonyPlan: "Counters and combat",
    intendedWinPaths: ["Combat overwhelm with counters"],
    expectedPlayPattern: "Fast",
    bracketConstraints: "B4",
    comboPolicy: "Secondary",
    tutorPolicy: "Allowed",
    designRules: [],
    avoidPatterns: [],
    researchPriorities: [
      "Premium acceleration",
      "Efficient tutors where colors permit",
      "Legendary creatures that benefit from shared board state",
    ],
    ...overrides,
  };
}

function run(): void {
  const ingredientDeck = [
    card("The One Ring", ["card-advantage", "protection"]),
    card("Mana Vault", ["ramp"]),
    card("Chrome Mox", ["ramp"]),
    card("Mox Diamond", ["ramp"]),
    card("Glacial Chasm", ["protection"], "land"),
    card("Walking Ballista", ["finisher"], "artifact"),
    card("Steel Overseer", ["finisher"], "artifact"),
    card("Thopter Assembly", ["engine"], "artifact"),
  ];
  const gcCount = 5;
  const winReadiness = assessB4WinReadinessV4161({
    requestedBracket: 4,
    selectedCards: ingredientDeck,
    charter: charter(),
    legality: { effectiveBracketEvaluable: true, failures: [] } as never,
  });
  const accessArchitecture = buildAccessArchitectureV4163({
    selectedCards: ingredientDeck,
    charter: charter(),
  });
  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: {
      expectedLandCount: 35,
      structuralNonLandTarget: 64,
      reservedLandSlots: 35,
    } as never,
    selectedCards: ingredientDeck,
  });
  const portfolio = evaluateBracketPowerPortfolioV416({
    contract: { requestedBracket: 4 } as never,
    powerPlan: null,
    selectedCards: ingredientDeck,
    profiles: [],
    gap: null,
    gameChangerCount: gcCount,
    winReadiness,
    accessArchitecture,
  });
  const power = assessBracketPowerAssessmentV4163({
    requestedBracket: 4,
    portfolio,
    quality: {
      failingDimensions: ["accessQuality", "interactionQuality", "winArchitectureQuality"],
      qualityReady: false,
    } as never,
    winReadiness,
    accessArchitecture,
    slotBudget,
    selectedNonlands: ingredientDeck,
    gameChangerCount: gcCount,
  });
  assert.ok(power.rawPowerCeiling >= 4, "RAW_VS_REALIZED: raw ceiling may reflect ingredients");
  assert.ok(
    power.realizedEffectiveBracket <= 3,
    `RAW_VS_REALIZED: realized must not be B5 with access/win failures — got B${power.realizedEffectiveBracket}`,
  );
  assert.notEqual(power.realizedEffectiveBracket, power.rawPowerCeiling, "realized must diverge from raw when machine incomplete");

  const incompleteBudget = assessDeckSlotBudgetV4163({
    manaPlan: { expectedLandCount: 35, structuralNonLandTarget: 64, reservedLandSlots: 35 } as never,
    selectedCards: Array.from({ length: 52 }, (_, i) => card(`Nonland ${i}`, ["engine"])),
  });
  assert.equal(incompleteBudget.status, "BUILD_STRUCTURALLY_INCOMPLETE");
  assert.equal(manaAssemblyLandAllowanceV4163({ slotBudget: incompleteBudget, libraryCount: 52 }), 0);

  const completeNonlands = Array.from({ length: 64 }, (_, i) => card(`Nonland ${i}`, ["engine"]));
  const completeBudget = assessDeckSlotBudgetV4163({
    manaPlan: { expectedLandCount: 35, structuralNonLandTarget: 64, reservedLandSlots: 35 } as never,
    selectedCards: completeNonlands,
  });
  assert.equal(manaAssemblyLandAllowanceV4163({ slotBudget: completeBudget, libraryCount: 64 }), 35);

  const accessDeck = [
    card("Inventors' Fair", ["ramp"], "land"),
    card("Urza's Saga", ["card-advantage"], "land"),
    card("Walking Ballista", ["finisher"], "artifact"),
    card("Mystic Forge", ["engine"], "artifact"),
  ];
  accessDeck[0]!.oracleId = "oid-inventors-fair";
  accessDeck[1]!.oracleId = "oid-urzas-saga";
  accessDeck[2]!.oracleId = "oid-walking-ballista";
  accessDeck[3]!.oracleId = "oid-mystic-forge";
  const access = buildAccessArchitectureV4163({
    selectedCards: accessDeck,
    charter: charter(),
    theory: accessTheory(),
    catalog: accessCatalog(),
  });
  assert.ok(access.routes.length >= 2, "ACCESS_GRAPH: colorless artifact targets discover access routes");
  assert.ok(access.engineAccess >= 1, "ACCESS_GRAPH: theory-critical artifact reachable via verified tutor");

  const oppDeck = [
    card("Mana Vault", ["ramp"]),
    card("Thopter Assembly", ["engine"], "artifact"),
    card("Summit Apes", ["finisher"], "creature"),
  ];
  const opp = rankOpportunityCostCandidatesV4163({
    selectedCards: oppDeck,
    charter: charter(),
    requestedBracket: 4,
  });
  assert.ok(
    !opp.bottomSlots.some((s) => s.currentCard === "Mana Vault"),
    "OPPORTUNITY_COST: premium fast mana not in replace bottom-five",
  );
  assert.ok(
    opp.bottomSlots.some((s) => s.currentCard === "Thopter Assembly" || s.currentCard === "Summit Apes"),
    "OPPORTUNITY_COST: mediocre card nominated before premium accel",
  );

  const winPortfolio = evaluateBracketPowerPortfolioV416({
    contract: { requestedBracket: 4 } as never,
    powerPlan: null,
    selectedCards: [card("Clockwork Droid", ["finisher"]), card("Executioner's Hood", ["finisher"])],
    profiles: [],
    gap: null,
    winReadiness: { concreteLineReady: false } as never,
  });
  const winEntry = winPortfolio.entries.find((e) => e.dimension === "WIN_COMPACTNESS");
  assert.notEqual(winEntry?.status, "OK", "WIN_ARCHITECTURE_TRUTH: finisher tags without verified line != ON_TARGET");

  const critic = runPreFinalQualityCriticV4163({
    commanderName: "Test",
    charter: charter(),
    selectedCards: [
      ...Array.from({ length: 47 }, (_, i) => card(`Land ${i}`, ["land"], "land")),
      ...Array.from({ length: 52 }, (_, i) => card(`Spell ${i}`, ["engine"])),
    ],
    requestedBracket: 4,
    slotBudget: assessDeckSlotBudgetV4163({
      manaPlan: { expectedLandCount: 35, structuralNonLandTarget: 64, reservedLandSlots: 35 } as never,
      selectedCards: [
        ...Array.from({ length: 47 }, (_, i) => card(`Land ${i}`, ["land"], "land")),
        ...Array.from({ length: 52 }, (_, i) => card(`Spell ${i}`, ["engine"])),
      ],
    }),
    accessArchitecture: buildAccessArchitectureV4163({ selectedCards: [], charter: charter() }),
    winReadiness: { concreteLineReady: false, summary: "no line", ready: false } as never,
    powerAssessment: power,
    opportunityCost: opp,
  });
  assert.ok(critic.structuralFailures.length > 0, "PRE_FINAL_CRITIC: explicit structural failures");
  assert.equal(critic.resemblesTargetBracket, false);

  const supportAudit = auditCharterConceptSupportV4163(charter());
  const legendaryPriority = supportAudit.concepts.find((c) => /legendary creatures/i.test(c.concept));
  assert.equal(legendaryPriority?.strategicallySupported, false, "CHARTER_SUPPORT: legendary boilerplate unsupported");
  const sanitized = sanitizeUnsupportedCharterConceptsV4163(charter());
  assert.ok(
    !sanitized.charter.researchPriorities.some((p) => /legendary creatures that benefit/i.test(p)),
    "CHARTER_SUPPORT: unsupported priority removed",
  );

  const manaState: ProfessorCouncilStateV47 = {
    version: "professor-council-assembly-v4-7-v1",
    selectedCards: Array.from({ length: 52 }, (_, i) => card(`Spell ${i}`, ["engine"])),
    manaPlanV416: {
      version: "professor-mana-plan-v4-16-v1",
      expectedLandCount: 35,
      structuralNonLandTarget: 64,
      reservedLandSlots: 35,
    } as never,
  } as ProfessorCouncilStateV47;
  const blocked = appendManaBaseV48({
    state: manaState,
    catalog: { byOracleId: new Map() } as never,
    colorIdentity: [],
    commanderName: "Test",
  });
  assert.equal(blocked.buildPhase, "STRUCTURALLY_INCOMPLETE");
  assert.equal(blocked.selectedCards.filter((c) => c.category === "land").length, 0, "STRUCTURAL_SLOT: no land pad");

  console.log("PROFESSOR v4.16.3 realized power acceptance — PASS");
}

run();
