/**
 * Typed-assertion adversarial fixtures v3 — no OpenAI.
 */
import type { StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import {
  buildFixtureValidatorContext,
  buildMuldrothaProfessorContextV3ZeroAffordances,
  MULDROTHA_CAST_FACT,
  MULDROTHA_ORACLE_ID,
  type ProfessorV3FixtureCase,
} from "./phase6a1-professor-v3-grounding-fixtures-v1";
import {
  castFromGraveyardAssertion,
  grantKeywordAssertion,
  harmonyEdge,
  mechanismRef,
  oracleRef,
  producesGraveyardPermanents,
  ragRef,
  requiresGraveyardPermanents,
  researchRef,
  rulesRef,
  tutorAssertion,
  FIXTURE_CR_305_1_RULE_ID,
} from "./phase6a1-professor-v3-fixture-assertions-v1";

export const PROFESSOR_V3_GROUNDING_FIXTURES_V3_VERSION = "phase6a1-professor-v3-grounding-fixtures-v3";

function hypothesis(overrides: Partial<StrategyHypothesisV3> & Pick<StrategyHypothesisV3, "hypothesisId">): StrategyHypothesisV3 {
  return {
    title: "Typed fixture",
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
    packageId: "pkg-v3",
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

export const PROFESSOR_V3_TYPED_ADVERSARIAL_FIXTURES: ProfessorV3FixtureCase[] = [
  {
    id: "typed-01-invented-hexproof",
    description: "Invented hexproof claim + valid Muldrotha evidence rejects via typed assertion",
    hypothesis: hypothesis({
      hypothesisId: "typed-hexproof",
      strategicClaim: "Muldrotha gives your creatures hexproof",
      packages: [basePackage({ packageId: "hexproof-pkg", purpose: "Hexproof board" })],
      strategicAssertions: [grantKeywordAssertion({ assertionId: "hexproof", packageId: "hexproof-pkg", keyword: "HEXPROOF" })],
    }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "typed-02-invented-tutor",
    description: "Invented tutor claim + valid Muldrotha evidence rejects via typed assertion",
    hypothesis: hypothesis({
      hypothesisId: "typed-tutor",
      strategicClaim: "Muldrotha tutors a permanent every upkeep",
      packages: [basePackage({ packageId: "tutor-pkg", purpose: "Tutor engine" })],
      strategicAssertions: [tutorAssertion({ assertionId: "tutor", packageId: "tutor-pkg" })],
    }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "typed-03-oracle-span-no-entailment",
    description: "Valid Oracle span exists but does not entail typed assertion",
    hypothesis: hypothesis({
      hypothesisId: "typed-oracle-no-entail",
      strategicClaim: "Muldrotha tutors on upkeep",
      packages: [basePackage({ packageId: "oracle-pkg", purpose: "Tutor" })],
      strategicAssertions: [
        {
          assertionId: "tutor-oracle",
          packageId: "oracle-pkg",
          predicate: "PERMITS_ACTION",
          action: "TUTOR",
          evidenceRefs: [oracleRef("you may play a land")],
        },
      ],
    }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "typed-04-irrelevant-rules-evidence",
    description: "Known rules ID present in ledger but irrelevant to tutor assertion",
    hypothesis: hypothesis({
      hypothesisId: "typed-irrelevant-rule",
      strategicClaim: "Rules-backed tutor",
      packages: [basePackage({ packageId: "rule-pkg", purpose: "Tutor" })],
      strategicAssertions: [tutorAssertion({ assertionId: "tutor-rule", packageId: "rule-pkg", evidenceRefs: [rulesRef(FIXTURE_CR_305_1_RULE_ID)] })],
    }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "typed-05-irrelevant-research-evidence",
    description: "Known research ID does not ground tutor assertion",
    hypothesis: hypothesis({
      hypothesisId: "typed-irrelevant-research",
      packages: [basePackage({ packageId: "research-pkg", purpose: "Research tutor" })],
      strategicAssertions: [tutorAssertion({ assertionId: "tutor-research", packageId: "research-pkg", evidenceRefs: [researchRef(["research-self-mill-note"])] })],
    }),
    buildContext: () =>
      buildFixtureValidatorContext({
        ctx: buildMuldrothaProfessorContextV3ZeroAffordances(),
        extraResearchIds: [{ evidenceId: "research-self-mill-note", summary: "Muldrotha self-mill primer discusses graveyard stocking." }],
      }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "typed-06-rag-wrong-causal-meaning",
    description: "RAG mentions graveyard/self-mill but does not ground artifact-treasure tutor claim",
    hypothesis: hypothesis({
      hypothesisId: "typed-rag-wrong-causal",
      strategicClaim: "Artifact treasure tutors accelerate Muldrotha",
      packages: [basePackage({ packageId: "rag-pkg", purpose: "Artifact tutors" })],
      strategicAssertions: [tutorAssertion({ assertionId: "tutor-rag", packageId: "rag-pkg", evidenceRefs: [ragRef(["rag-self-mill-primer-v3"])] })],
    }),
    buildContext: () =>
      buildFixtureValidatorContext({
        ctx: buildMuldrothaProfessorContextV3ZeroAffordances(),
        extraRagIds: ["rag-self-mill-primer-v3"],
        extraRagTexts: ["Self-mill Muldrotha decks stock the graveyard with permanents for recursion."],
      }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "typed-07-harmony-unvalidated-producer",
    description: "Matching package strings but producer assertion not validated",
    hypothesis: hypothesis({
      hypothesisId: "typed-harmony-unvalidated-producer",
      lens: "HARMONY",
      packages: [
        basePackage({ packageId: "producer-pkg", purpose: "Produce tokens", outputs: ["graveyard-permanents"], resourcesProduced: ["graveyard-permanents"] }),
        basePackage({ packageId: "consumer-pkg", purpose: "Consume gy", inputs: ["graveyard-permanents"], resourcesRequired: ["graveyard-permanents"] }),
      ],
      strategicAssertions: [
        {
          assertionId: "bad-producer",
          packageId: "producer-pkg",
          predicate: "PRODUCES_STATE",
          resourceOrState: "CREATURE_TOKENS",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
        },
        requiresGraveyardPermanents({ assertionId: "cast-requires", packageId: "consumer-pkg" }),
      ],
      causalEdges: [harmonyEdge({ edgeId: "bad-edge", producerAssertionId: "bad-producer", consumerAssertionId: "cast-requires", resourceOrState: "GRAVEYARD_PERMANENTS" })],
    }),
    expectOutcome: "HARMONY_UNDERDETERMINED",
  },
  {
    id: "typed-08-harmony-validated-bridge",
    description: "Validated producer output + validated consumer requirement accepts Harmony",
    hypothesis: hypothesis({
      hypothesisId: "typed-harmony-valid",
      lens: "HARMONY",
      packages: [
        basePackage({ packageId: "mill-pkg", purpose: "Mill", outputs: ["graveyard-permanents"] }),
        basePackage({ packageId: "cast-pkg", purpose: "Cast", inputs: ["graveyard-permanents"] }),
      ],
      strategicAssertions: [
        producesGraveyardPermanents({ assertionId: "mill-produces", packageId: "mill-pkg", evidenceRefs: [ragRef(["rag-harmony-mill-v3"])] }),
        requiresGraveyardPermanents({ assertionId: "cast-requires", packageId: "cast-pkg" }),
        castFromGraveyardAssertion({ assertionId: "cast-perm", packageId: "cast-pkg" }),
      ],
      causalEdges: [harmonyEdge({ edgeId: "valid-edge", producerAssertionId: "mill-produces", consumerAssertionId: "cast-requires" })],
    }),
    buildContext: () =>
      buildFixtureValidatorContext({
        ctx: buildMuldrothaProfessorContextV3ZeroAffordances(),
        extraRagIds: ["rag-harmony-mill-v3"],
        extraRagTexts: ["Self-mill Muldrotha decks stock the graveyard with permanents for recursion."],
      }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "typed-09-false-independence-graph",
    description: "Package claims independence but validated graph requires commander permission",
    hypothesis: hypothesis({
      hypothesisId: "typed-false-independence",
      packages: [
        basePackage({
          packageId: "false-ind",
          purpose: "Standalone engine",
          commanderDependency: "LOW",
          worksWithoutCommander: "HIGH",
        }),
      ],
      strategicAssertions: [castFromGraveyardAssertion({ assertionId: "cmd-cast", packageId: "false-ind" })],
    }),
    expectOutcome: "REJECTED_DEPENDENCY_MISCLASSIFICATION",
  },
];

export type NormalizationFixtureCaseV3 = {
  id: string;
  description: string;
  parsedModelResponse: unknown;
  expectNormalizationFailure: true;
};

export const PROFESSOR_V3_NORMALIZATION_FIXTURES: NormalizationFixtureCaseV3[] = [
  {
    id: "typed-10-dangling-relationship-endpoint",
    description: "Dangling relationship endpoint under non-Harmony lens fails normalization",
    expectNormalizationFailure: true,
    parsedModelResponse: {
      strategyHypotheses: [
        {
          hypothesisId: "dangling-rel",
          title: "Dangling",
          strategicClaim: "Claim",
          causalReasoning: "Reason",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
          commanderDependency: "HIGH",
          lens: "DEPENDENT_SYNERGY",
          packages: [{ packageId: "only", purpose: "Only", functionalRoles: ["engine"], commanderDependency: "HIGH", worksWithoutCommander: "LOW", evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])] }],
          relationships: [{ relationshipId: "bad", producer: "missing", consumer: "only", relationshipType: "X", causalReasoning: "bad", evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])] }],
          strategicAssertions: [castFromGraveyardAssertion({ assertionId: "a1", packageId: "only" })],
          causalEdges: [],
        },
      ],
    },
  },
];
