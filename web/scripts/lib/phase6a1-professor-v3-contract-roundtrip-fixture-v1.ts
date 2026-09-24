/**
 * Representative four-lens Professor v3 plan fixture for contract round-trip audit.
 */
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import {
  buildFixtureValidatorContext,
  buildMuldrothaProfessorContextV3ZeroAffordances,
  MULDROTHA_CAST_FACT,
  MULDROTHA_LAND_FACT,
  MULDROTHA_ORACLE_ID,
} from "./phase6a1-professor-v3-grounding-fixtures-v1";
import {
  FIXTURE_CR_305_1_RULE_ID,
  mechanismRef,
  oracleRef,
  ragRef,
  researchRef,
  rulesRef,
} from "./phase6a1-professor-v3-fixture-assertions-v1";

export const PROFESSOR_V3_CONTRACT_ROUNDTRIP_FIXTURE_V1_VERSION = "phase6a1-professor-v3-contract-roundtrip-fixture-v1";

export const FIXTURE_SEMANTIC_RELATIONSHIP_ID = "fixture-muldrotha-graveyard-bridge";
export const FIXTURE_AFFORDANCE_ID = "fixture-muldrotha-land-affordance";
export const FIXTURE_RAG_EVIDENCE_ID = "fixture-muldrotha-rag-chunk";
export const FIXTURE_RESEARCH_EVIDENCE_ID = "fixture-muldrotha-research-note";

export function buildProfessorV3ContractRoundtripContextV1(): ProfessorPlanningContextV3 {
  const ctx = buildFixtureValidatorContext({
    ctx: buildMuldrothaProfessorContextV3ZeroAffordances(),
    extraRagIds: [FIXTURE_RAG_EVIDENCE_ID],
    extraRagTexts: ["Muldrotha primer fixture: graveyard value packages and type diversity matter."],
    extraAffordanceIds: [FIXTURE_AFFORDANCE_ID],
    extraResearchIds: [{ evidenceId: FIXTURE_RESEARCH_EVIDENCE_ID, summary: "Fixture research on graveyard synergy." }],
  });
  ctx.semanticRelationships = [
    {
      relationshipId: FIXTURE_SEMANTIC_RELATIONSHIP_ID,
      producerFactIds: [MULDROTHA_LAND_FACT],
      consumerFactIds: [MULDROTHA_CAST_FACT],
      relationshipType: "PRODUCER_TO_CONSUMER",
      causalStatement: "Land-play permission and per-type permanent cast permission share the graveyard loop.",
    },
  ];
  return ctx;
}

const allEvidenceKinds = [
  mechanismRef([MULDROTHA_CAST_FACT, MULDROTHA_LAND_FACT]),
  oracleRef("you may play a land and cast a permanent spell"),
  { kind: "SEMANTIC_RELATIONSHIP", relationshipId: FIXTURE_SEMANTIC_RELATIONSHIP_ID },
  { kind: "PRECOMPUTED_AFFORDANCE", opportunityIds: [FIXTURE_AFFORDANCE_ID] },
  ragRef([FIXTURE_RAG_EVIDENCE_ID]),
  rulesRef(FIXTURE_CR_305_1_RULE_ID),
  researchRef([FIXTURE_RESEARCH_EVIDENCE_ID]),
];

function lensHypothesis(args: {
  hypothesisId: string;
  lens: "AUTO" | "DEPENDENT_SYNERGY" | "INDEPENDENT_SYNERGY" | "HARMONY";
  packageId: string;
  commanderDependency: "HIGH" | "MEDIUM" | "LOW";
  worksWithoutCommander: "HIGH" | "MEDIUM" | "LOW";
  functionalRoles: string[];
  includeRelationship?: boolean;
  bridgeProducer?: string;
  bridgeConsumer?: string;
}) {
  const assertionId = `${args.hypothesisId}-assert`;
  return {
    hypothesisId: args.hypothesisId,
    title: `${args.lens} fixture hypothesis`,
    strategicClaim: "Representative strategic claim grounded across all evidence kinds.",
    causalReasoning: "Fixture causal reasoning using canonical facts, RAG, rules, research, affordance, and relationship evidence.",
    evidenceRefs: allEvidenceKinds,
    strategicAssertions: [
      {
        assertionId,
        packageId: args.packageId,
        predicate: "PERMITS_ACTION",
        action: "CAST_FROM_GRAVEYARD",
        object: "PERMANENT_SPELL",
        sourceZone: "GRAVEYARD",
        provider: "COMMANDER",
        evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
      },
    ],
    causalEdges: [
      {
        edgeId: `${args.hypothesisId}-edge`,
        producerAssertionId: assertionId,
        consumerAssertionId: assertionId,
        resourceOrState: "GRAVEYARD_PERMANENTS",
        evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
      },
    ],
    commanderDependency: args.commanderDependency,
    lens: args.lens,
    packages: [
      {
        packageId: args.packageId,
        purpose: `${args.lens} package purpose`,
        functionalRoles: args.functionalRoles,
        inputs: ["graveyard permanents"],
        resourcesRequired: ["GRAVEYARD_PERMANENTS"],
        outputs: ["board presence"],
        resourcesProduced: ["BOARD_PRESENCE"],
        commanderDependency: args.commanderDependency,
        worksWithoutCommander: args.worksWithoutCommander,
        evidenceRefs: allEvidenceKinds,
      },
    ],
    relationships:
      args.includeRelationship && args.bridgeProducer && args.bridgeConsumer
        ? [
            {
              relationshipId: `${args.hypothesisId}-rel`,
              producer: args.bridgeProducer,
              consumer: args.bridgeConsumer,
              relationshipType: "PRODUCER_TO_CONSUMER",
              causalReasoning: "Harmony bridge consumes graveyard permanents produced by producer package.",
              evidenceRefs: [{ kind: "SEMANTIC_RELATIONSHIP", relationshipId: FIXTURE_SEMANTIC_RELATIONSHIP_ID }],
            },
          ]
        : [],
    strengths: ["fixture-strength"],
    vulnerabilities: ["fixture-vulnerability"],
  };
}

export function buildProfessorV3ContractRoundtripRawPlanV1() {
  const harmony = lensHypothesis({
    hypothesisId: "roundtrip-harmony",
    lens: "HARMONY",
    packageId: "roundtrip-harmony-producer-pkg",
    commanderDependency: "MEDIUM",
    worksWithoutCommander: "MEDIUM",
    functionalRoles: ["CROSS_ENGINE_BRIDGE", "FUEL"],
  });
  harmony.packages = [
    {
      packageId: "roundtrip-harmony-producer-pkg",
      purpose: "Producer package",
      functionalRoles: ["ENGINE", "FUEL"],
      inputs: [],
      resourcesRequired: [],
      outputs: ["GRAVEYARD_PERMANENTS"],
      resourcesProduced: ["GRAVEYARD_PERMANENTS"],
      commanderDependency: "MEDIUM",
      worksWithoutCommander: "MEDIUM",
      evidenceRefs: allEvidenceKinds,
    },
    {
      packageId: "roundtrip-harmony-consumer-pkg",
      purpose: "Consumer package",
      functionalRoles: ["PAYOFF", "CONVERSION"],
      inputs: ["GRAVEYARD_PERMANENTS"],
      resourcesRequired: ["GRAVEYARD_PERMANENTS"],
      outputs: [],
      resourcesProduced: [],
      commanderDependency: "HIGH",
      worksWithoutCommander: "LOW",
      evidenceRefs: allEvidenceKinds,
    },
  ];
  harmony.relationships = [
    {
      relationshipId: "roundtrip-harmony-rel",
      producer: "roundtrip-harmony-producer-pkg",
      consumer: "roundtrip-harmony-consumer-pkg",
      relationshipType: "PRODUCER_TO_CONSUMER",
      causalReasoning: "Producer fills graveyard; consumer casts permanents using commander permission.",
      evidenceRefs: [{ kind: "SEMANTIC_RELATIONSHIP", relationshipId: FIXTURE_SEMANTIC_RELATIONSHIP_ID }],
    },
  ];
  harmony.strategicAssertions = [
    {
      assertionId: "roundtrip-harmony-assert",
      packageId: "roundtrip-harmony-producer-pkg",
      predicate: "PRODUCES_STATE",
      resourceOrState: "GRAVEYARD_PERMANENTS",
      provider: "SELF",
      evidenceRefs: [ragRef([FIXTURE_RAG_EVIDENCE_ID])],
    },
  ];
  harmony.causalEdges = [
    {
      edgeId: "roundtrip-harmony-edge",
      producerAssertionId: "roundtrip-harmony-assert",
      consumerAssertionId: "roundtrip-harmony-assert",
      resourceOrState: "GRAVEYARD_PERMANENTS",
      evidenceRefs: [ragRef([FIXTURE_RAG_EVIDENCE_ID])],
    },
  ];

  const independent = lensHypothesis({
    hypothesisId: "roundtrip-independent",
    lens: "INDEPENDENT_SYNERGY",
    packageId: "roundtrip-independent-pkg",
    commanderDependency: "LOW",
    worksWithoutCommander: "HIGH",
    functionalRoles: ["ENGINE", "CONVERSION"],
  });
  independent.strategicAssertions = [
    {
      assertionId: "roundtrip-independent-assert",
      packageId: "roundtrip-independent-pkg",
      predicate: "PRODUCES_STATE",
      resourceOrState: "GRAVEYARD_PERMANENTS",
      provider: "SELF",
      evidenceRefs: [researchRef([FIXTURE_RESEARCH_EVIDENCE_ID])],
    },
  ];
  independent.causalEdges = [
    {
      edgeId: "roundtrip-independent-edge",
      producerAssertionId: "roundtrip-independent-assert",
      consumerAssertionId: "roundtrip-independent-assert",
      resourceOrState: "GRAVEYARD_PERMANENTS",
      evidenceRefs: [researchRef([FIXTURE_RESEARCH_EVIDENCE_ID])],
    },
  ];

  return {
    strategyHypotheses: [
      lensHypothesis({
        hypothesisId: "roundtrip-auto",
        lens: "AUTO",
        packageId: "roundtrip-auto-pkg",
        commanderDependency: "HIGH",
        worksWithoutCommander: "LOW",
        functionalRoles: ["ENGINE", "PAYOFF"],
      }),
      lensHypothesis({
        hypothesisId: "roundtrip-dependent",
        lens: "DEPENDENT_SYNERGY",
        packageId: "roundtrip-dependent-pkg",
        commanderDependency: "HIGH",
        worksWithoutCommander: "LOW",
        functionalRoles: ["COMMANDER_MAINTENANCE", "ENABLER"],
      }),
      independent,
      harmony,
    ],
  };
}

export const PROFESSOR_V3_CONTRACT_NEGATIVE_FIXTURES_V1 = {
  stringEvidenceRef: {
    strategyHypotheses: [
      {
        ...lensHypothesis({
          hypothesisId: "neg-string-ref",
          lens: "AUTO",
          packageId: "neg-string-pkg",
          commanderDependency: "HIGH",
          worksWithoutCommander: "LOW",
          functionalRoles: ["ENGINE"],
        }),
        evidenceRefs: [MULDROTHA_ORACLE_ID],
      },
    ],
  },
  aliasEvidenceRef: {
    strategyHypotheses: [
      {
        ...lensHypothesis({
          hypothesisId: "neg-alias-ref",
          lens: "AUTO",
          packageId: "neg-alias-pkg",
          commanderDependency: "HIGH",
          worksWithoutCommander: "LOW",
          functionalRoles: ["ENGINE"],
        }),
        evidenceRefs: [{ evidenceId: MULDROTHA_ORACLE_ID, evidenceType: "ORACLE_CLAUSE" }],
      },
    ],
  },
  booleanWorksWithoutCommander: {
    strategyHypotheses: [
      {
        ...lensHypothesis({
          hypothesisId: "neg-bool-dependency",
          lens: "AUTO",
          packageId: "neg-bool-pkg",
          commanderDependency: "HIGH",
          worksWithoutCommander: "LOW",
          functionalRoles: ["ENGINE"],
        }),
        packages: [
          {
            packageId: "neg-bool-pkg",
            purpose: "Boolean dependency rejected",
            functionalRoles: ["ENGINE"],
            commanderDependency: "HIGH",
            worksWithoutCommander: false,
            evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
          },
        ],
      },
    ],
  },
  validMechanismRef: {
    strategyHypotheses: [
      lensHypothesis({
        hypothesisId: "pos-mechanism-ref",
        lens: "AUTO",
        packageId: "pos-mechanism-pkg",
        commanderDependency: "HIGH",
        worksWithoutCommander: "LOW",
        functionalRoles: ["ENGINE"],
      }),
    ],
  },
} as const;
