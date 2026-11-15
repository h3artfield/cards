/**
 * Professor v3 v5 structural wiring fixtures — no OpenAI.
 */
import type { StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { IndependentMechanismFact } from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import {
  buildFixtureValidatorContext,
  buildMuldrothaProfessorContextV3ZeroAffordances,
  MULDROTHA_CAST_FACT,
  MULDROTHA_LAND_FACT,
  type ProfessorV3FixtureCase,
} from "./phase6a1-professor-v3-grounding-fixtures-v1";
import {
  castFromGraveyardAssertion,
  landFromGraveyardAssertion,
  mechanismRef,
  muldrothaBothFactsRef,
} from "./phase6a1-professor-v3-fixture-assertions-v1";
import { buildProfessorPlanningContextV3Sync } from "./phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./phase6a1-spent-pilot-truth-loader-v1";
import { appendRetrievalEvent, initRunLedgerFromContext } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";

export const PROFESSOR_V3_GROUNDING_FIXTURES_V5_VERSION = "phase6a1-professor-v3-grounding-fixtures-v5";

function hypothesis(overrides: Partial<StrategyHypothesisV3> & Pick<StrategyHypothesisV3, "hypothesisId">): StrategyHypothesisV3 {
  return {
    title: "v5 fixture",
    strategicClaim: "Fixture claim",
    causalReasoning: "Fixture reasoning",
    evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
    strategicAssertions: [],
    causalEdges: [],
    commanderDependency: "HIGH",
    lens: "DEPENDENT_SYNERGY",
    packages: [],
    relationships: [],
    ...overrides,
  };
}

function basePackage(overrides: Partial<StrategyHypothesisV3["packages"][number]>): StrategyHypothesisV3["packages"][number] {
  return {
    packageId: "pkg-v5",
    purpose: "Fixture package",
    functionalRoles: ["ENGINE"],
    inputs: [],
    resourcesRequired: [],
    outputs: [],
    resourcesProduced: [],
    commanderDependency: "HIGH",
    worksWithoutCommander: "LOW",
    evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
    ...overrides,
  };
}

const FIXTURE_TREASURE_FACT: IndependentMechanismFact = {
  mechanismId: "fixture-treasure-token",
  mechanismType: "TRIGGERED_ABILITY",
  evidenceSpan: "Whenever you play a card from exile, create a Treasure token.",
  trigger: "YOU_PLAY_A_CARD_FROM_EXILE",
  actions: [{ type: "CREATE_TOKEN", token: "TREASURE", quantity: 1 }],
};

const FIXTURE_EXILE_REMOVAL_FACT: IndependentMechanismFact = {
  mechanismId: "fixture-exile-removal",
  mechanismType: "TRIGGERED_ABILITY",
  evidenceSpan: "Exile target permanent an opponent controls.",
  actions: [{ type: "ZONE_MOVE", object: "PERMANENT", from: "BATTLEFIELD", to: "EXILE", target: "OPPONENT_PERMANENT" }],
};

const FIXTURE_OPPONENT_MILL_FACT: IndependentMechanismFact = {
  mechanismId: "fixture-opponent-mill",
  mechanismType: "TRIGGERED_ABILITY",
  evidenceSpan: "Target opponent mills two cards.",
  actions: [{ type: "MILL", quantity: 2, target: "OPPONENT_LIBRARY" }],
};

function ctxWithExtraFacts(extraFacts: IndependentMechanismFact[]) {
  return () => {
    const entry = getPilotMechanismCatalogEntry("multi-muldrotha");
    if (!entry) throw new Error("Missing Muldrotha");
    const ctx = buildProfessorPlanningContextV3Sync({ entry, oppCase: null, options: { includeMechanicalAffordances: false } });
    ctx.commanderMechanismFacts = [...ctx.commanderMechanismFacts, ...extraFacts];
    return buildFixtureValidatorContext({ ctx });
  };
}

export const PROFESSOR_V3_V5_ADVERSARIAL_FIXTURES: ProfessorV3FixtureCase[] = [
  {
    id: "v5-01-cross-fact-cast-land-reject",
    description: "CAST_FROM_GRAVEYARD + LAND_CARD assembled across Muldrotha facts must reject",
    hypothesis: hypothesis({
      hypothesisId: "cross-cast-land",
      packages: [basePackage({ packageId: "cross-cast-land" })],
      strategicAssertions: [
        {
          assertionId: "cross-cast-land",
          packageId: "cross-cast-land",
          predicate: "PERMITS_ACTION",
          action: "CAST_FROM_GRAVEYARD",
          object: "LAND_CARD",
          sourceZone: "GRAVEYARD",
          provider: "COMMANDER",
          evidenceRefs: [muldrothaBothFactsRef()],
        },
      ],
    }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "v5-02-cross-fact-play-permanent-reject",
    description: "PLAY_FROM_GRAVEYARD + PERMANENT_SPELL assembled across Muldrotha facts must reject",
    hypothesis: hypothesis({
      hypothesisId: "cross-play-perm",
      packages: [basePackage({ packageId: "cross-play-perm" })],
      strategicAssertions: [
        {
          assertionId: "cross-play-perm",
          packageId: "cross-play-perm",
          predicate: "PERMITS_ACTION",
          action: "PLAY_FROM_GRAVEYARD",
          object: "PERMANENT_SPELL",
          sourceZone: "GRAVEYARD",
          provider: "COMMANDER",
          evidenceRefs: [muldrothaBothFactsRef()],
        },
      ],
    }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "v5-03-correct-land-play-grounded",
    description: "Correct land-play assertion from single fact is grounded",
    hypothesis: hypothesis({
      hypothesisId: "correct-land-play",
      packages: [basePackage({ packageId: "land-play" })],
      strategicAssertions: [landFromGraveyardAssertion({ assertionId: "land-play", packageId: "land-play" })],
    }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "v5-04-correct-permanent-cast-grounded",
    description: "Correct permanent-cast assertion from single fact is grounded",
    hypothesis: hypothesis({
      hypothesisId: "correct-cast-perm",
      packages: [basePackage({ packageId: "cast-perm" })],
      strategicAssertions: [castFromGraveyardAssertion({ assertionId: "cast-perm", packageId: "cast-perm" })],
    }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "v5-05-treasure-not-creature-tokens",
    description: "Treasure CREATE_TOKEN must not produce CREATURE_TOKENS",
    buildContext: ctxWithExtraFacts([FIXTURE_TREASURE_FACT]),
    hypothesis: hypothesis({
      hypothesisId: "treasure-not-creature",
      packages: [basePackage({ packageId: "treasure" })],
      strategicAssertions: [
        {
          assertionId: "bad-creature-token",
          packageId: "treasure",
          predicate: "PRODUCES_STATE",
          resourceOrState: "CREATURE_TOKENS",
          evidenceRefs: [mechanismRef(["fixture-treasure-token"])],
        },
      ],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
  {
    id: "v5-06-exile-removal-not-playable",
    description: "Exiling opponent permanent without permission must not produce EXILE_PLAYABLE_CARDS",
    buildContext: ctxWithExtraFacts([FIXTURE_EXILE_REMOVAL_FACT]),
    hypothesis: hypothesis({
      hypothesisId: "exile-not-playable",
      packages: [basePackage({ packageId: "exile-removal" })],
      strategicAssertions: [
        {
          assertionId: "bad-exile-play",
          packageId: "exile-removal",
          predicate: "PRODUCES_STATE",
          resourceOrState: "EXILE_PLAYABLE_CARDS",
          evidenceRefs: [mechanismRef(["fixture-exile-removal"])],
        },
      ],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
  {
    id: "v5-07-opponent-mill-not-controller-gy",
    description: "Milling opponent must not produce controller GRAVEYARD_PERMANENTS",
    buildContext: ctxWithExtraFacts([FIXTURE_OPPONENT_MILL_FACT]),
    hypothesis: hypothesis({
      hypothesisId: "opponent-mill",
      packages: [basePackage({ packageId: "opp-mill" })],
      strategicAssertions: [
        {
          assertionId: "bad-opp-mill",
          packageId: "opp-mill",
          predicate: "PRODUCES_STATE",
          resourceOrState: "GRAVEYARD_PERMANENTS",
          evidenceRefs: [mechanismRef(["fixture-opponent-mill"])],
        },
      ],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
];

export type RunLedgerFixtureV5 = {
  id: string;
  description: string;
  run: () => { pass: boolean; issues: string[] };
};

export const PROFESSOR_V3_RUN_LEDGER_FIXTURES_V5: RunLedgerFixtureV5[] = [
  {
    id: "v5-08-two-retrieval-events-one-chunk",
    description: "Same RAG chunk from two queries preserves two retrieval events and one evidence object",
    run: () => {
      const ctx = buildMuldrothaProfessorContextV3ZeroAffordances();
      let runLedger = initRunLedgerFromContext(ctx);
      const hit = (id: string, text: string) =>
        ({
          chunkId: id,
          citationLabel: id,
          corpus: "fixture",
          authorityTier: "fixture",
          retrievalMethod: "lexical_exact",
          score: 1,
          provenanceTier: "CURATED_KNOWLEDGE",
          retrievalText: text,
          mode: "COMMANDER_PRIMER",
        }) as never;
      runLedger = appendRetrievalEvent({
        runLedger,
        hits: [hit("rag-shared-chunk", "Shared primer chunk.")],
        tool: "searchMtgKnowledge",
        query: "query-a",
        retrievalMode: "COMMANDER_PRIMER",
      });
      runLedger = appendRetrievalEvent({
        runLedger,
        hits: [hit("rag-shared-chunk", "Shared primer chunk.")],
        tool: "searchMtgKnowledge",
        query: "query-b",
        retrievalMode: "PACKAGE",
      });
      const issues: string[] = [];
      const ragObjects = runLedger.evidenceObjects.filter((o) => o.kind === "RAG");
      if (ragObjects.length !== 1) issues.push(`expected 1 RAG evidence object, got ${ragObjects.length}`);
      if (runLedger.retrievalEvents.length !== 2) issues.push(`expected 2 retrieval events, got ${runLedger.retrievalEvents.length}`);
      if (runLedger.retrievalEvents[0]?.query !== "query-a") issues.push("event 0 query mismatch");
      if (runLedger.retrievalEvents[1]?.query !== "query-b") issues.push("event 1 query mismatch");
      return { pass: issues.length === 0, issues };
    },
  },
];

export type NormalizationFixtureCaseV5 = {
  id: string;
  description: string;
  parsedModelResponse: unknown;
  expectNormalizationFailure: true;
};

export const PROFESSOR_V3_NORMALIZATION_FIXTURES_V5: NormalizationFixtureCaseV5[] = [
  {
    id: "v5-09-unknown-functional-role",
    description: "Unknown functional role fails normalization",
    expectNormalizationFailure: true,
    parsedModelResponse: {
      strategyHypotheses: [
        {
          hypothesisId: "bad-role",
          title: "Bad role",
          strategicClaim: "Claim",
          causalReasoning: "Reason",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
          commanderDependency: "HIGH",
          lens: "DEPENDENT_SYNERGY",
          packages: [
            {
              packageId: "bad-role-pkg",
              purpose: "Bad",
              functionalRoles: ["random-synonym-engine"],
              commanderDependency: "HIGH",
              worksWithoutCommander: "LOW",
              evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
            },
          ],
          strategicAssertions: [castFromGraveyardAssertion({ assertionId: "a1", packageId: "bad-role-pkg" })],
          causalEdges: [],
        },
      ],
    },
  },
];
