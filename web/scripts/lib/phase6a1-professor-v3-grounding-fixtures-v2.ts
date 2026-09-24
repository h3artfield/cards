/**
 * Adversarial Professor v3 grounding fixtures — structural validator proof, no OpenAI.
 */
import type { ProfessorPlanningContextV3, StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import {
  buildFixtureValidatorContext,
  buildMuldrothaProfessorContextV3ZeroAffordances,
  MULDROTHA_CAST_FACT,
  MULDROTHA_LAND_FACT,
  MULDROTHA_ORACLE_ID,
  type ProfessorV3FixtureCase,
} from "./phase6a1-professor-v3-grounding-fixtures-v1";
import {
  additionalLandAssertion,
  castFromGraveyardAssertion,
  drawCardAssertion,
  harmonyEdge,
  instantGyAssertion,
  landFromGraveyardAssertion,
  mechanismRef,
  oracleRef,
  producesGraveyardPermanents,
  ragRef,
  researchRef,
  rulesRef,
} from "./phase6a1-professor-v3-fixture-assertions-v1";

export const PROFESSOR_V3_GROUNDING_FIXTURES_V2_VERSION = "phase6a1-professor-v3-grounding-fixtures-v2";

function hypothesis(overrides: Partial<StrategyHypothesisV3> & Pick<StrategyHypothesisV3, "hypothesisId">): StrategyHypothesisV3 {
  return {
    title: "Adversarial fixture",
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
    packageId: "pkg-adv",
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

export function buildRagOnlyProfessorContextV3(): ProfessorPlanningContextV3 {
  const ctx = buildMuldrothaProfessorContextV3ZeroAffordances();
  ctx.caseId = "professor-v3-fixture-rag-only-baseline";
  ctx.canonicalOracle = [];
  ctx.commanderMechanismFacts = [];
  ctx.initialRagEvidence = [
    {
      chunkId: "rag-only-primer",
      citationLabel: "rag-only-primer",
      corpus: "fixture",
      authorityTier: "fixture",
      retrievalMethod: "lexical_exact",
      score: 1,
      provenanceTier: "CURATED_KNOWLEDGE",
      retrievalText: "Muldrotha graveyard value primer discussing self-mill and permanent recursion.",
    },
  ] as never;
  return ctx;
}

export const PROFESSOR_V3_ADVERSARIAL_FIXTURES: ProfessorV3FixtureCase[] = [
  {
    id: "adv-01-oracle-broadening-without-forbidden-phrase",
    description: "Structural rejection of second land-play claim without forbidden phrase list wording",
    hypothesis: hypothesis({
      hypothesisId: "adv-broadening-structural",
      strategicClaim: "Muldrotha enables playing two lands on each of your turns from any zone",
      causalReasoning: "Multiple land plays accelerate mana development",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_LAND_FACT] }],
      strategicAssertions: [additionalLandAssertion({ assertionId: "adv-two-lands", packageId: "two-lands" })],
      packages: [
        basePackage({
          packageId: "two-lands",
          purpose: "Play two lands per turn",
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_LAND_FACT] }],
        }),
      ],
    }),
    expectOutcome: "REJECTED_BROADENED_PERMISSION",
  },
  {
    id: "adv-02-invented-draw-mechanic",
    description: "Completely different invented mechanic (draw on cast) rejected structurally",
    hypothesis: hypothesis({
      hypothesisId: "adv-invented-draw",
      strategicClaim: "Muldrotha draws two cards whenever you cast from graveyard",
      causalReasoning: "Extra cards fuel the engine",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [drawCardAssertion({ assertionId: "adv-draw", packageId: "draw-engine" })],
      packages: [
        basePackage({
          packageId: "draw-engine",
          purpose: "Draw cards on graveyard casts",
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
        }),
      ],
    }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "adv-03-fabricated-oracle-span",
    description: "Valid Oracle ID with fabricated oracleSpan is rejected",
    hypothesis: hypothesis({
      hypothesisId: "adv-fabricated-span",
      strategicClaim: "Muldrotha recurs permanent spells from graveyard during your turns",
      causalReasoning: "Fabricated span cited",
      evidenceRefs: [
        {
          kind: "ORACLE_CLAUSE",
          sourceOracleId: MULDROTHA_ORACLE_ID,
          oracleSpan: "you may cast three creature spells from anywhere",
        },
      ],
      strategicAssertions: [
        {
          ...castFromGraveyardAssertion({ assertionId: "adv-fabricated-span-cast", packageId: "fabricated-oracle" }),
          evidenceRefs: [oracleRef("you may cast three creature spells from anywhere")],
        },
      ],
      packages: [
        basePackage({
          packageId: "fabricated-oracle",
          purpose: "Recursion",
          evidenceRefs: [
            {
              kind: "ORACLE_CLAUSE",
              sourceOracleId: MULDROTHA_ORACLE_ID,
              oracleSpan: "you may cast three creature spells from anywhere",
            },
          ],
        }),
      ],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
  {
    id: "adv-04-empty-mechanism-fact-ids",
    description: "MECHANISM_FACT with empty factIds fails evidence resolution",
    hypothesis: hypothesis({
      hypothesisId: "adv-empty-facts",
      strategicClaim: "Graveyard engine",
      causalReasoning: "Empty factIds",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [] }],
      strategicAssertions: [
        {
          ...castFromGraveyardAssertion({ assertionId: "adv-empty-facts-cast", packageId: "empty-facts" }),
          evidenceRefs: [mechanismRef([])],
        },
      ],
      packages: [basePackage({ packageId: "empty-facts", purpose: "Engine", evidenceRefs: [] })],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
  {
    id: "adv-05-empty-affordance-ids",
    description: "PRECOMPUTED_AFFORDANCE with empty opportunityIds fails evidence resolution",
    hypothesis: hypothesis({
      hypothesisId: "adv-empty-affordance",
      strategicClaim: "Affordance engine",
      causalReasoning: "Empty opportunityIds",
      evidenceRefs: [{ kind: "PRECOMPUTED_AFFORDANCE", opportunityIds: [] }],
      strategicAssertions: [
        {
          ...landFromGraveyardAssertion({ assertionId: "adv-empty-aff-land", packageId: "empty-aff" }),
          evidenceRefs: [{ kind: "PRECOMPUTED_AFFORDANCE", opportunityIds: [] }],
        },
      ],
      packages: [basePackage({ packageId: "empty-aff", purpose: "Affordance", evidenceRefs: [] })],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
  {
    id: "adv-06-unknown-rules-evidence",
    description: "Unknown RULES_EVIDENCE ruleId fails closed",
    hypothesis: hypothesis({
      hypothesisId: "adv-unknown-rule",
      strategicClaim: "Rules-backed land play",
      causalReasoning: "Unknown rule cited",
      evidenceRefs: [
        { kind: "MECHANISM_FACT", factIds: [MULDROTHA_LAND_FACT] },
        { kind: "RULES_EVIDENCE", ruleId: "cr-999-nonexistent-rule" },
      ],
      strategicAssertions: [
        {
          ...landFromGraveyardAssertion({ assertionId: "adv-unknown-rule-land", packageId: "unknown-rule" }),
          evidenceRefs: [mechanismRef([MULDROTHA_LAND_FACT]), rulesRef("cr-999-nonexistent-rule")],
        },
      ],
      packages: [basePackage({ packageId: "unknown-rule", purpose: "Rules", evidenceRefs: [] })],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
  {
    id: "adv-07-unknown-research-evidence",
    description: "Unknown RESEARCH_EVIDENCE ID fails closed",
    hypothesis: hypothesis({
      hypothesisId: "adv-unknown-research",
      strategicClaim: "Research-backed strategy",
      causalReasoning: "Unknown research cited",
      evidenceRefs: [
        { kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] },
        { kind: "RESEARCH_EVIDENCE", evidenceIds: ["research-does-not-exist"] },
      ],
      strategicAssertions: [
        {
          ...castFromGraveyardAssertion({ assertionId: "adv-unknown-research-cast", packageId: "unknown-research" }),
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT]), researchRef(["research-does-not-exist"])],
        },
      ],
      packages: [basePackage({ packageId: "unknown-research", purpose: "Research", evidenceRefs: [] })],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
  },
  {
    id: "adv-08-rag-without-entailment",
    description: "Real RAG chunk that does not support the strategic claim is not grounding",
    hypothesis: hypothesis({
      hypothesisId: "adv-rag-no-entailment",
      strategicClaim: "Muldrotha artifact treasure synergies convert artifacts into repeatable mana acceleration",
      causalReasoning: "Primer documents artifact treasure ramp package",
      evidenceRefs: [
        { kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] },
        { kind: "RAG_EVIDENCE", evidenceIds: ["rag-self-mill-primer"], statement: "artifact treasure ramp package" },
      ],
      strategicAssertions: [
        {
          assertionId: "adv-rag-artifact",
          packageId: "rag-ramp",
          predicate: "PRODUCES_STATE",
          resourceOrState: "ARTIFACT_TREASURE_TOKENS",
          evidenceRefs: [ragRef(["rag-self-mill-primer"])],
        },
      ],
      packages: [basePackage({ packageId: "rag-ramp", purpose: "Artifact ramp", evidenceRefs: [] })],
    }),
    expectOutcome: "REJECTED_UNGROUNDED",
    buildContext: () =>
      buildFixtureValidatorContext({
        ctx: buildMuldrothaProfessorContextV3ZeroAffordances(),
        extraRagIds: ["rag-self-mill-primer"],
        extraRagTexts: ["Self-mill Muldrotha decks stock the graveyard with permanents for recursion."],
      }),
  },
  {
    id: "adv-09-false-independence",
    description: "Package declares independence but evidence requires commander graveyard cast permission",
    hypothesis: hypothesis({
      hypothesisId: "adv-false-independence",
      lens: "DEPENDENT_SYNERGY",
      strategicClaim: "Standalone treasure engine",
      causalReasoning: "Works without commander",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [
        castFromGraveyardAssertion({ assertionId: "adv-false-ind-cast", packageId: "false-independent" }),
      ],
      packages: [
        basePackage({
          packageId: "false-independent",
          purpose: "Independent treasure",
          commanderDependency: "LOW",
          worksWithoutCommander: "HIGH",
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
        }),
      ],
    }),
    expectOutcome: "REJECTED_DEPENDENCY_MISCLASSIFICATION",
  },
  {
    id: "adv-10-harmony-nonexistent-package",
    description: "Harmony relationship references nonexistent package",
    hypothesis: hypothesis({
      hypothesisId: "adv-harmony-missing-pkg",
      lens: "HARMONY",
      strategicClaim: "Packages harmonize",
      causalReasoning: "Bridge between packages",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [castFromGraveyardAssertion({ assertionId: "adv-harmony-only-cast", packageId: "only-pkg" })],
      packages: [basePackage({ packageId: "only-pkg", purpose: "Only package" })],
      relationships: [
        {
          relationshipId: "bad-bridge",
          producer: "missing-producer",
          consumer: "only-pkg",
          relationshipType: "PRODUCER_TO_CONSUMER",
          causalReasoning: "Missing producer feeds consumer",
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
        },
      ],
    }),
    expectOutcome: "HARMONY_UNDERDETERMINED",
  },
  {
    id: "adv-11-harmony-resource-mismatch",
    description: "Harmony producer output and consumer input do not match",
    hypothesis: hypothesis({
      hypothesisId: "adv-harmony-mismatch",
      lens: "HARMONY",
      strategicClaim: "Packages harmonize via mismatched resources",
      causalReasoning: "Producer and consumer do not connect",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [
        {
          assertionId: "adv-producer-tokens",
          packageId: "producer-pkg",
          predicate: "PRODUCES_STATE",
          resourceOrState: "CREATURE_TOKENS",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
        },
        {
          assertionId: "adv-consumer-mana",
          packageId: "consumer-pkg",
          predicate: "REQUIRES_STATE",
          resourceOrState: "COLORLESS_MANA",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
        },
      ],
      causalEdges: [
        harmonyEdge({
          edgeId: "mismatch-bridge-edge",
          producerAssertionId: "adv-producer-tokens",
          consumerAssertionId: "adv-consumer-mana",
          resourceOrState: "CREATURE_TOKENS",
        }),
      ],
      packages: [
        basePackage({ packageId: "producer-pkg", purpose: "Produce tokens", outputs: ["creature-tokens"] }),
        basePackage({ packageId: "consumer-pkg", purpose: "Consume mana", inputs: ["colorless-mana"] }),
      ],
      relationships: [
        {
          relationshipId: "mismatch-bridge",
          producer: "producer-pkg",
          consumer: "consumer-pkg",
          relationshipType: "PRODUCER_TO_CONSUMER",
          causalReasoning: "Tokens somehow become mana",
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
        },
      ],
    }),
    expectOutcome: "HARMONY_UNDERDETERMINED",
  },
  {
    id: "adv-12-rag-only-preflight-fail",
    description: "Context with RAG but no canonical Oracle/mechanism truth fails preflight",
    buildContext: buildRagOnlyProfessorContextV3,
    hypothesis: hypothesis({ hypothesisId: "unused-preflight" }),
    expectPreflightPass: false,
    expectOutcome: "PREFLIGHT_SATISFIABLE_ONLY",
  },
];
