/**
 * Deterministic Professor v3 grounding fixtures — no OpenAI.
 */
import type { ProfessorPlanningContextV3, StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { EvidenceRef } from "../../src/lib/deck-synthesis/professor-planning-evidence-v3";
import type { ProfessorEvidenceLedgerEntryV3 } from "../../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";
import { createHash } from "node:crypto";
import { buildProfessorPlanningContextV3Sync } from "./phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./phase6a1-spent-pilot-truth-loader-v1";
import {
  additionalLandAssertion,
  castFromGraveyardAssertion,
  harmonyEdge,
  instantGyAssertion,
  landFromGraveyardAssertion,
  mechanismRef,
  oracleRef,
  producesGraveyardPermanents,
  ragRef,
  requiresGraveyardPermanents,
  FIXTURE_PINNED_RULES_LEDGER,
} from "./phase6a1-professor-v3-fixture-assertions-v1";

export const PROFESSOR_V3_GROUNDING_FIXTURES_V1_VERSION = "phase6a1-professor-v3-grounding-fixtures-v1";

export const MULDROTHA_ORACLE_ID = "e4625704-1d52-44e4-804f-2f45644d76ac";
export const MULDROTHA_LAND_FACT = "muldrotha-graveyard-land-play";
export const MULDROTHA_CAST_FACT = "muldrotha-graveyard-permanent-cast";

export function buildMuldrothaProfessorContextV3ZeroAffordances(): ProfessorPlanningContextV3 {
  const entry = getPilotMechanismCatalogEntry("multi-muldrotha");
  if (!entry) throw new Error("Missing Muldrotha mechanism truth");
  const ctx = buildProfessorPlanningContextV3Sync({ entry, oppCase: null, options: { includeMechanicalAffordances: false } });
  ctx.caseId = "professor-v3-fixture-muldrotha-zero-affordances";
  return ctx;
}

function basePackage(overrides: Partial<StrategyHypothesisV3["packages"][number]>): StrategyHypothesisV3["packages"][number] {
  return {
    packageId: "pkg-1",
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

function hypothesis(overrides: Partial<StrategyHypothesisV3> & Pick<StrategyHypothesisV3, "hypothesisId">): StrategyHypothesisV3 {
  return {
    title: "Fixture",
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

export type ProfessorV3FixtureCase = {
  id: string;
  description: string;
  buildContext?: () => ProfessorPlanningContextV3;
  hypothesis: StrategyHypothesisV3;
  expectPreflightPass?: boolean;
  expectOutcome:
    | "GROUNDED"
    | "REJECTED_BROADENED_PERMISSION"
    | "REJECTED_INVENTED_MECHANIC"
    | "REJECTED_EVIDENCE_CONTRADICTION"
    | "REJECTED_DEPENDENCY_MISCLASSIFICATION"
    | "HARMONY_UNDERDETERMINED"
    | "PREFLIGHT_SATISFIABLE_ONLY";
};

export const PROFESSOR_V3_GROUNDING_FIXTURES: ProfessorV3FixtureCase[] = [
  {
    id: "fixture-01-muldrotha-zero-affordances-preflight",
    description: "Muldrotha with zero precomputed affordances but valid mechanism facts + Oracle remains satisfiable",
    buildContext: buildMuldrothaProfessorContextV3ZeroAffordances,
    hypothesis: hypothesis({ hypothesisId: "unused" }),
    expectPreflightPass: true,
    expectOutcome: "PREFLIGHT_SATISFIABLE_ONLY",
  },
  {
    id: "fixture-02-self-mill-grounded-by-graveyard-cast",
    description: "Self-mill strategy grounded by graveyard permanent cast fact",
    hypothesis: hypothesis({
      hypothesisId: "self-mill-grounded",
      strategicClaim: "Self-mill increases usable graveyard permanent access for replay",
      causalReasoning: "Milling puts permanent spells into graveyard where they can be cast under graveyard cast permission",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [
        castFromGraveyardAssertion({ assertionId: "self-mill-cast", packageId: "self-mill-engine" }),
      ],
      packages: [
        basePackage({
          packageId: "self-mill-engine",
          purpose: "Stock graveyard with replayable permanents",
          functionalRoles: ["FUEL", "ENGINE"],
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
        }),
      ],
    }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "fixture-03-extra-land-drop-rejected",
    description: "Muldrotha extra land drop claim is rejected",
    hypothesis: hypothesis({
      hypothesisId: "extra-land-drop",
      strategicClaim: "Muldrotha grants an additional land drop every turn",
      causalReasoning: "Play multiple lands as extra land drops",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_LAND_FACT] }],
      strategicAssertions: [additionalLandAssertion({ assertionId: "extra-land-assert", packageId: "extra-land" })],
      packages: [
        basePackage({
          packageId: "extra-land",
          purpose: "Gain extra land drops",
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_LAND_FACT] }],
        }),
      ],
    }),
    expectOutcome: "REJECTED_BROADENED_PERMISSION",
  },
  {
    id: "fixture-04-instant-graveyard-cast-rejected",
    description: "Invented instant graveyard cast rejected",
    hypothesis: hypothesis({
      hypothesisId: "instant-gy-cast",
      strategicClaim: "Cast instants from graveyard for burst interaction",
      causalReasoning: "Use Muldrotha to cast instants from graveyard",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [instantGyAssertion({ assertionId: "instant-gy-assert", packageId: "instant-gy" })],
      packages: [
        basePackage({
          packageId: "instant-gy",
          purpose: "Replay instants from graveyard",
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
        }),
      ],
    }),
    expectOutcome: "REJECTED_INVENTED_MECHANIC",
  },
  {
    id: "fixture-05-affordance-only-grounding",
    description: "Strategy grounded only via precomputed affordance remains valid",
    hypothesis: hypothesis({
      hypothesisId: "affordance-only",
      strategicClaim: "Exploit graveyard land zone permission affordance",
      causalReasoning: "Affordance encodes graveyard land play enablement",
      evidenceRefs: [{ kind: "PRECOMPUTED_AFFORDANCE", opportunityIds: ["muldrotha-graveyard-land-play--graveyard-land-zone-enablement"] }],
      strategicAssertions: [
        {
          ...landFromGraveyardAssertion({ assertionId: "affordance-land", packageId: "affordance-pkg" }),
          evidenceRefs: [{ kind: "PRECOMPUTED_AFFORDANCE", opportunityIds: ["muldrotha-graveyard-land-play--graveyard-land-zone-enablement"] }],
        },
      ],
      packages: [
        basePackage({
          packageId: "affordance-pkg",
          purpose: "Leverage affordance",
          evidenceRefs: [{ kind: "PRECOMPUTED_AFFORDANCE", opportunityIds: ["muldrotha-graveyard-land-play--graveyard-land-zone-enablement"] }],
        }),
      ],
    }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "fixture-06-mechanism-oracle-only-grounding",
    description: "Strategy grounded only by mechanism fact + Oracle clause",
    hypothesis: hypothesis({
      hypothesisId: "mechanism-oracle-only",
      strategicClaim: "During your turns, cast permanent spells from graveyard under type limits",
      causalReasoning: "Oracle permission plus permanent cast mechanism fact",
      evidenceRefs: [
        { kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] },
        { kind: "ORACLE_CLAUSE", sourceOracleId: MULDROTHA_ORACLE_ID, oracleSpan: "cast a permanent spell of each permanent type from your graveyard" },
      ],
      strategicAssertions: [
        castFromGraveyardAssertion({ assertionId: "oracle-cast", packageId: "oracle-grounded" }),
      ],
      packages: [
        basePackage({
          packageId: "oracle-grounded",
          purpose: "Graveyard permanent suite",
          evidenceRefs: [{ kind: "ORACLE_CLAUSE", sourceOracleId: MULDROTHA_ORACLE_ID }],
        }),
      ],
    }),
    expectOutcome: "GROUNDED",
  },
  {
    id: "fixture-07-rag-contradicts-oracle",
    description: "RAG evidence contradicted by Oracle is rejected",
    hypothesis: hypothesis({
      hypothesisId: "rag-oracle-contradiction",
      strategicClaim: "Commander strategy relies on RAG primer claim contradicted by Oracle",
      causalReasoning: "Primer asserts mechanic contradicted by canonical Oracle text",
      evidenceRefs: [
        { kind: "ORACLE_CLAUSE", sourceOracleId: MULDROTHA_ORACLE_ID },
        { kind: "RAG_EVIDENCE", evidenceIds: ["rag-muldrotha-primer-001"], statement: "contradicts oracle on land drop count" },
      ],
      strategicAssertions: [additionalLandAssertion({ assertionId: "rag-extra-land", packageId: "rag-bad" })],
      packages: [basePackage({ packageId: "rag-bad", purpose: "Extra lands", evidenceRefs: [] })],
    }),
    expectOutcome: "REJECTED_BROADENED_PERMISSION",
  },
  {
    id: "fixture-08-independent-requires-commander",
    description: "Independent engine that actually requires commander is rejected",
    hypothesis: hypothesis({
      hypothesisId: "independent-needs-commander",
      lens: "INDEPENDENT_SYNERGY",
      strategicClaim: "Independent treasure engine",
      causalReasoning: "Engine only works with commander cast permission",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [castFromGraveyardAssertion({ assertionId: "fake-ind-cast", packageId: "fake-independent" })],
      packages: [
        basePackage({
          packageId: "fake-independent",
          purpose: "Independent treasure",
          commanderDependency: "HIGH",
          worksWithoutCommander: "LOW",
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
        }),
      ],
    }),
    expectOutcome: "REJECTED_DEPENDENCY_MISCLASSIFICATION",
  },
  {
    id: "fixture-09-harmony-underdetermined",
    description: "Harmony lens without causal bridge is underdetermined",
    hypothesis: hypothesis({
      hypothesisId: "harmony-no-bridge",
      lens: "HARMONY",
      strategicClaim: "Packages harmonize",
      causalReasoning: "They synergize",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [castFromGraveyardAssertion({ assertionId: "harmony-a", packageId: "a" })],
      packages: [basePackage({ packageId: "a", purpose: "A" }), basePackage({ packageId: "b", purpose: "B" })],
      relationships: [],
    }),
    expectOutcome: "HARMONY_UNDERDETERMINED",
  },
  {
    id: "fixture-10-harmony-valid-bridge",
    description: "Harmony with explicit cross-package bridge accepted",
    hypothesis: hypothesis({
      hypothesisId: "harmony-valid",
      lens: "HARMONY",
      strategicClaim: "Self-mill package feeds graveyard cast package",
      causalReasoning: "Milled permanents become inputs for cast-from-graveyard package",
      evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [
        producesGraveyardPermanents({
          assertionId: "mill-produces",
          packageId: "mill-pkg",
          evidenceRefs: [ragRef(["rag-harmony-mill"])],
        }),
        requiresGraveyardPermanents({ assertionId: "cast-requires", packageId: "cast-pkg" }),
        castFromGraveyardAssertion({ assertionId: "cast-perm", packageId: "cast-pkg" }),
      ],
      causalEdges: [harmonyEdge({ edgeId: "mill-to-cast", producerAssertionId: "mill-produces", consumerAssertionId: "cast-requires" })],
      packages: [
        basePackage({ packageId: "mill-pkg", purpose: "Stock graveyard", outputs: ["graveyard-permanents"] }),
        basePackage({ packageId: "cast-pkg", purpose: "Cast permanents from graveyard", inputs: ["graveyard-permanents"] }),
      ],
      relationships: [
        {
          relationshipId: "mill-to-cast",
          producer: "mill-pkg",
          consumer: "cast-pkg",
          relationshipType: "PRODUCER_TO_CONSUMER",
          causalReasoning: "Graveyard permanents produced by mill package are consumed by cast package",
          evidenceRefs: [{ kind: "MECHANISM_FACT", factIds: [MULDROTHA_CAST_FACT] }],
        },
      ],
    }),
    expectOutcome: "GROUNDED",
  },
];

export function buildFixtureValidatorContext(args: {
  ctx: ProfessorPlanningContextV3;
  extraRagIds?: string[];
  extraRagTexts?: string[];
  extraRagProvenance?: Array<{ tool: string; query: string; retrievalMode?: string }>;
  extraAffordanceIds?: string[];
  extraResearchIds?: Array<{ evidenceId: string; summary: string }>;
  ledgerSupplement?: ProfessorEvidenceLedgerEntryV3[];
}) {
  const ctx = args.ctx;
  ctx.evidenceLedgerSupplement = [...FIXTURE_PINNED_RULES_LEDGER, ...(args.ledgerSupplement ?? [])];
  if (args.extraRagIds?.length) {
    const ragEntries: ProfessorEvidenceLedgerEntryV3[] = args.extraRagIds.map((chunkId, index) => {
      const provenance = args.extraRagProvenance?.[index] ?? {
        tool: "searchMtgKnowledge",
        query: `fixture rag query for ${chunkId}`,
        retrievalMode: "COMMANDER_PRIMER",
      };
      const exactText = args.extraRagTexts?.[index] ?? "fixture rag";
      return {
        evidenceId: chunkId,
        kind: "RAG" as const,
        tool: provenance.tool,
        query: provenance.query,
        retrievalMode: provenance.retrievalMode ?? "COMMANDER_PRIMER",
        source: "fixture",
        citationLabel: chunkId,
        exactText,
        contentSha256: createHash("sha256").update(exactText, "utf8").digest("hex"),
      };
    });
    ctx.evidenceLedgerSupplement = [...(ctx.evidenceLedgerSupplement ?? []), ...ragEntries];
    ctx.initialRagEvidence = args.extraRagIds.map((chunkId, index) => ({
      chunkId,
      citationLabel: chunkId,
      corpus: "fixture",
      authorityTier: "fixture",
      retrievalMethod: "lexical_exact",
      score: 1,
      provenanceTier: "CURATED_KNOWLEDGE",
      retrievalText: args.extraRagTexts?.[index] ?? "fixture rag",
      mode: "COMMANDER_PRIMER",
    })) as never;
  }
  if (args.extraAffordanceIds?.length) {
    ctx.knownMechanicalAffordances = args.extraAffordanceIds.map((opportunityId) => ({
      opportunityId,
      sourceMechanismFactIds: [MULDROTHA_LAND_FACT],
      sourceFactIds: [MULDROTHA_LAND_FACT],
      opportunityType: "ZONE_ENABLEMENT",
      derivationClass: "DIRECT_MECHANICAL",
      opportunityConfidence: "HIGH",
      causalStatement: "fixture affordance",
      requiredStateOrAction: "fixture",
      expectedMechanicalEffect: "fixture",
      causalProof: [`${opportunityId} PLAY_FROM_GRAVEYARD zone=GRAVEYARD object=LAND_CARD`],
      prerequisites: [],
      mutuallyRelevantWith: [],
      evidence: { type: "COMMANDER_ORACLE", oracleSpan: "you may play a land" },
      exactScopes: {},
      semanticEdge: "PERMISSION:PLAY_FROM_GRAVEYARD → ZONE:GRAVEYARD land enablement",
      recordKind: "OPPORTUNITY",
    }));
  }
  if (args.extraResearchIds?.length) {
    ctx.initialResearchEvidence = args.extraResearchIds.map((r) => ({
      evidenceId: r.evidenceId,
      sourceTitle: "fixture research",
      summary: r.summary,
      retrievedAt: new Date(0).toISOString(),
    }));
  }
  return ctx;
}
