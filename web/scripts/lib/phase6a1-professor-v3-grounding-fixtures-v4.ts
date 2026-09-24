/**
 * Professor v3 semantic coverage + v4 adversarial fixtures — generic semantics, no commander hardcoding in validator.
 */
import type { ProfessorPlanningContextV3, StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { buildProfessorPlanningContextV3Sync } from "./phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./phase6a1-spent-pilot-truth-loader-v1";
import {
  buildFixtureValidatorContext,
  buildMuldrothaProfessorContextV3ZeroAffordances,
  MULDROTHA_CAST_FACT,
  type ProfessorV3FixtureCase,
} from "./phase6a1-professor-v3-grounding-fixtures-v1";
import {
  castFromGraveyardAssertion,
  harmonyEdge,
  mechanismRef,
  producesGraveyardPermanents,
  ragRef,
  requiresGraveyardPermanents,
} from "./phase6a1-professor-v3-fixture-assertions-v1";
import type { ProfessorEvidenceLedgerEntryV3 } from "../../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";
import { appendLedgerEntriesFromRagHits, buildProfessorEvidenceLedgerV3 } from "../../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";

export const PROFESSOR_V3_GROUNDING_FIXTURES_V4_VERSION = "phase6a1-professor-v3-grounding-fixtures-v4";

export const ZAXARA_HYDRA_FACT = "zaxara-x-spell-hydra";
export const OMNATH_LANDFALL_FACT = "omnath-landfall-elemental";
export const OMNATH_DEATH_DAMAGE_FACT = "omnath-elemental-death-damage";
export const PROSPER_EXILE_FACT = "prosper-endstep-impulse";
export const PROSPER_TREASURE_FACT = "prosper-exile-play-treasure";
export const KORVOLD_SACRIFICE_PAYOFF_FACT = "korvold-sacrifice-payoff";

function buildContextForCase(caseId: string): ProfessorPlanningContextV3 {
  const entry = getPilotMechanismCatalogEntry(caseId);
  if (!entry) throw new Error(`Missing mechanism truth for ${caseId}`);
  const ctx = buildProfessorPlanningContextV3Sync({ entry, oppCase: null, options: { includeMechanicalAffordances: false } });
  ctx.caseId = `professor-v3-fixture-${caseId}`;
  return ctx;
}

function hypothesis(overrides: Partial<StrategyHypothesisV3> & Pick<StrategyHypothesisV3, "hypothesisId">): StrategyHypothesisV3 {
  return {
    title: "Semantic coverage fixture",
    strategicClaim: "Fixture claim",
    causalReasoning: "Fixture reasoning",
    evidenceRefs: [],
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
    packageId: "pkg-semantic",
    purpose: "Fixture package",
    functionalRoles: ["ENGINE"],
    inputs: [],
    resourcesRequired: [],
    outputs: [],
    resourcesProduced: [],
    commanderDependency: "HIGH",
    worksWithoutCommander: "LOW",
    evidenceRefs: [],
    ...overrides,
  };
}

export const PROFESSOR_V3_SEMANTIC_COVERAGE_FIXTURES: ProfessorV3FixtureCase[] = [
  {
    id: "semantic-muldrotha-graveyard-replay",
    description: "Generic graveyard stocking → replay chain",
    hypothesis: hypothesis({
      hypothesisId: "muldrotha-gy-replay",
      lens: "HARMONY",
      packages: [
        basePackage({ packageId: "stock", purpose: "Stock graveyard" }),
        basePackage({ packageId: "replay", purpose: "Replay permanents" }),
      ],
      strategicAssertions: [
        producesGraveyardPermanents({
          assertionId: "mill-produces-gy",
          packageId: "stock",
          evidenceRefs: [ragRef(["rag-semantic-mill"])],
        }),
        requiresGraveyardPermanents({ assertionId: "cast-requires-gy", packageId: "replay" }),
        castFromGraveyardAssertion({ assertionId: "cast-perm", packageId: "replay" }),
      ],
      causalEdges: [harmonyEdge({ edgeId: "gy-bridge", producerAssertionId: "mill-produces-gy", consumerAssertionId: "cast-requires-gy" })],
    }),
    buildContext: () =>
      buildFixtureValidatorContext({
        ctx: buildMuldrothaProfessorContextV3ZeroAffordances(),
        extraRagIds: ["rag-semantic-mill"],
        extraRagTexts: ["Self-mill decks stock the graveyard with permanents for recursion."],
      }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "semantic-zaxara-x-hydra-counters",
    description: "X spell cast → Hydra token → X counters/scaling",
    buildContext: () => buildContextForCase("blindv5-52-tokens"),
    hypothesis: hypothesis({
      hypothesisId: "zaxara-x-hydra",
      packages: [basePackage({ packageId: "x-engine", purpose: "X spell hydra engine" })],
      strategicAssertions: [
        {
          assertionId: "hydra-produces",
          packageId: "x-engine",
          predicate: "PRODUCES_STATE",
          resourceOrState: "HYDRA_TOKENS",
          evidenceRefs: [mechanismRef([ZAXARA_HYDRA_FACT])],
        },
        {
          assertionId: "counter-scaling",
          packageId: "x-engine",
          predicate: "PRODUCES_STATE",
          resourceOrState: "X_COUNTERS",
          evidenceRefs: [mechanismRef([ZAXARA_HYDRA_FACT])],
        },
      ],
    }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "semantic-omnath-landfall-damage",
    description: "Landfall → Elemental → death → damage",
    buildContext: () => buildContextForCase("single-landfall-omnath"),
    hypothesis: hypothesis({
      hypothesisId: "omnath-landfall-chain",
      lens: "HARMONY",
      packages: [
        basePackage({ packageId: "landfall", purpose: "Landfall tokens" }),
        basePackage({ packageId: "damage", purpose: "Death damage" }),
      ],
      strategicAssertions: [
        {
          assertionId: "landfall-produces",
          packageId: "landfall",
          predicate: "PRODUCES_STATE",
          resourceOrState: "ELEMENTAL_TOKENS",
          evidenceRefs: [mechanismRef([OMNATH_LANDFALL_FACT])],
        },
        {
          assertionId: "damage-requires",
          packageId: "damage",
          predicate: "REQUIRES_STATE",
          resourceOrState: "ELEMENTAL_TOKENS",
          evidenceRefs: [mechanismRef([OMNATH_DEATH_DAMAGE_FACT])],
        },
        {
          assertionId: "damage-produces",
          packageId: "damage",
          predicate: "PRODUCES_STATE",
          resourceOrState: "DAMAGE",
          evidenceRefs: [mechanismRef([OMNATH_DEATH_DAMAGE_FACT])],
        },
      ],
      causalEdges: [
        {
          edgeId: "elemental-bridge",
          producerAssertionId: "landfall-produces",
          consumerAssertionId: "damage-requires",
          resourceOrState: "ELEMENTAL_TOKENS",
          evidenceRefs: [mechanismRef([OMNATH_LANDFALL_FACT, OMNATH_DEATH_DAMAGE_FACT])],
        },
      ],
    }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "semantic-prosper-exile-treasure",
    description: "Play from exile → Treasure resource conversion",
    buildContext: () => buildContextForCase("hybrid-prosper"),
    hypothesis: hypothesis({
      hypothesisId: "prosper-exile-treasure",
      lens: "DEPENDENT_SYNERGY",
      packages: [
        basePackage({ packageId: "exile", purpose: "Exile impulse" }),
        basePackage({ packageId: "treasure", purpose: "Treasure conversion" }),
      ],
      strategicAssertions: [
        {
          assertionId: "exile-produces",
          packageId: "exile",
          predicate: "PRODUCES_STATE",
          resourceOrState: "EXILE_PLAYABLE_CARDS",
          evidenceRefs: [mechanismRef([PROSPER_EXILE_FACT])],
        },
        {
          assertionId: "treasure-produces",
          packageId: "treasure",
          predicate: "PRODUCES_STATE",
          resourceOrState: "TREASURE_TOKENS",
          evidenceRefs: [mechanismRef([PROSPER_TREASURE_FACT])],
        },
      ],
    }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "semantic-korvold-sacrifice-value",
    description: "Sacrifice → draw/counter value",
    buildContext: () => buildContextForCase("multi-korvold"),
    hypothesis: hypothesis({
      hypothesisId: "korvold-sac-value",
      packages: [basePackage({ packageId: "sac-engine", purpose: "Sacrifice payoffs" })],
      strategicAssertions: [
        {
          assertionId: "requires-fodder",
          packageId: "sac-engine",
          predicate: "REQUIRES_STATE",
          resourceOrState: "SACRIFICE_FODDER",
          evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_PAYOFF_FACT])],
        },
        {
          assertionId: "produces-advantage",
          packageId: "sac-engine",
          predicate: "PRODUCES_STATE",
          resourceOrState: "CARD_ADVANTAGE",
          evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_PAYOFF_FACT])],
        },
      ],
    }),
    expectOutcome: "GROUNDED",
  },
];

export const PROFESSOR_V3_V4_ADVERSARIAL_FIXTURES: ProfessorV3FixtureCase[] = [
  {
    id: "v4-01-produces-infinite-mana-false",
    description: "PRODUCES INFINITE_MANA with real cast-from-graveyard evidence must reject",
    hypothesis: hypothesis({
      hypothesisId: "false-infinite-mana",
      packages: [basePackage({ packageId: "false-mana", purpose: "Infinite mana" })],
      strategicAssertions: [
        {
          assertionId: "bad-mana",
          packageId: "false-mana",
          predicate: "PRODUCES_STATE",
          resourceOrState: "INFINITE_MANA",
          action: "CAST_FROM_GRAVEYARD",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
        },
      ],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
  {
    id: "v4-02-requires-hexproof-false",
    description: "REQUIRES HEXPROOFED_CREATURES with cast evidence must reject",
    hypothesis: hypothesis({
      hypothesisId: "false-hexproof-req",
      packages: [basePackage({ packageId: "false-hex", purpose: "Hexproof requirement" })],
      strategicAssertions: [
        {
          assertionId: "bad-hex-req",
          packageId: "false-hex",
          predicate: "REQUIRES_STATE",
          resourceOrState: "HEXPROOFED_CREATURES",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
        },
      ],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
  {
    id: "v4-03-fabricated-harmony-string-match",
    description: "Matching resource strings without validated producer/consumer states → underdetermined",
    hypothesis: hypothesis({
      hypothesisId: "fabricated-harmony",
      lens: "HARMONY",
      packages: [
        basePackage({ packageId: "fake-producer", purpose: "Fake producer", outputs: ["artifact-treasure"], resourcesProduced: ["artifact-treasure"] }),
        basePackage({ packageId: "fake-consumer", purpose: "Fake consumer", inputs: ["artifact-treasure"], resourcesRequired: ["artifact-treasure"] }),
      ],
      strategicAssertions: [
        {
          assertionId: "fake-produce",
          packageId: "fake-producer",
          predicate: "PRODUCES_STATE",
          resourceOrState: "ARTIFACT_TREASURE_TOKENS",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
        },
        {
          assertionId: "fake-consume",
          packageId: "fake-consumer",
          predicate: "REQUIRES_STATE",
          resourceOrState: "ARTIFACT_TREASURE_TOKENS",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
        },
      ],
      causalEdges: [
        harmonyEdge({
          edgeId: "fake-edge",
          producerAssertionId: "fake-produce",
          consumerAssertionId: "fake-consume",
          resourceOrState: "ARTIFACT_TREASURE_TOKENS",
        }),
      ],
    }),
    expectOutcome: "HARMONY_UNDERDETERMINED",
  },
  {
    id: "v4-04-validated-harmony-same-state",
    description: "Validated producer + validated consumer for same typed state accepts Harmony",
    hypothesis: hypothesis({
      hypothesisId: "validated-harmony-v4",
      lens: "HARMONY",
      packages: [
        basePackage({ packageId: "producer-v4", purpose: "Produce gy permanents" }),
        basePackage({ packageId: "consumer-v4", purpose: "Consume gy permanents" }),
      ],
      strategicAssertions: [
        producesGraveyardPermanents({
          assertionId: "producer-v4-assert",
          packageId: "producer-v4",
          evidenceRefs: [ragRef(["rag-v4-harmony-mill"])],
        }),
        requiresGraveyardPermanents({ assertionId: "consumer-v4-assert", packageId: "consumer-v4" }),
      ],
      causalEdges: [
        harmonyEdge({
          edgeId: "v4-valid-edge",
          producerAssertionId: "producer-v4-assert",
          consumerAssertionId: "consumer-v4-assert",
        }),
      ],
    }),
    buildContext: () =>
      buildFixtureValidatorContext({
        ctx: buildMuldrothaProfessorContextV3ZeroAffordances(),
        extraRagIds: ["rag-v4-harmony-mill"],
        extraRagTexts: ["Self-mill decks stock the graveyard with permanents for recursion."],
      }),
    expectOutcome: "GROUNDED",
  },
];

export type LedgerProvenanceFixtureV4 = {
  id: string;
  description: string;
  run: () => { pass: boolean; issues: string[] };
};

export const PROFESSOR_V3_LEDGER_PROVENANCE_FIXTURES: LedgerProvenanceFixtureV4[] = [
  {
    id: "v4-05-sequential-rag-provenance",
    description: "Two sequential RAG tool retrievals preserve exact queries through ledger rebuild",
    run: () => {
      const ctx = buildMuldrothaProfessorContextV3ZeroAffordances();
      let ledger = buildProfessorEvidenceLedgerV3(ctx);
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

      ledger = appendLedgerEntriesFromRagHits({
        ledger,
        hits: [hit("rag-seq-a", "Primer chunk A about sacrifice loops.")],
        tool: "searchMtgKnowledge",
        query: "Muldrotha sacrifice recursion enablers",
        retrievalMode: "COMMANDER_PRIMER",
      });
      ledger = appendLedgerEntriesFromRagHits({
        ledger,
        hits: [hit("rag-seq-b", "Primer chunk B about graveyard value.")],
        tool: "searchMtgKnowledge",
        query: "Muldrotha graveyard permanent value packages",
        retrievalMode: "PACKAGE",
      });

      const supplement: ProfessorEvidenceLedgerEntryV3[] = ledger.entries.filter((e) => e.kind === "RAG");
      const rebuiltCtx = { ...ctx, initialRagEvidence: [hit("rag-seq-a", "Primer chunk A about sacrifice loops."), hit("rag-seq-b", "Primer chunk B about graveyard value.")], evidenceLedgerSupplement: supplement };
      const rebuilt = buildProfessorEvidenceLedgerV3(rebuiltCtx);

      const issues: string[] = [];
      const a = rebuilt.entries.find((e) => e.evidenceId === "rag-seq-a");
      const b = rebuilt.entries.find((e) => e.evidenceId === "rag-seq-b");
      if (!a || a.query !== "Muldrotha sacrifice recursion enablers" || a.tool !== "searchMtgKnowledge") {
        issues.push("rag-seq-a lost provenance");
      }
      if (!b || b.query !== "Muldrotha graveyard permanent value packages" || b.tool !== "searchMtgKnowledge") {
        issues.push("rag-seq-b lost provenance");
      }
      if (rebuilt.entries.filter((e) => e.evidenceId === "rag-seq-a").length !== 1) issues.push("rag-seq-a duplicated");
      return { pass: issues.length === 0, issues };
    },
  },
];
