/**
 * Yuriko orchestration success stub — zero network; grounds against multi-yuriko mechanism truth.
 */
import type { EvidenceRef } from "../../src/lib/deck-synthesis/professor-planning-evidence-v3";
import type { StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";

export const PROFESSOR_V3_YURIKO_ORCHESTRATION_SUCCESS_FIXTURE_V1_VERSION =
  "phase6a1-professor-v3-yuriko-orchestration-success-fixture-v1";

const YURIKO_COMMANDER_NINJUTSU_FACT = "yuriko-commander-ninjutsu";
const YURIKO_NINJA_HIT_FACT = "yuriko-ninja-hit";
const YURIKO_PINNED_RAG_EVIDENCE_ID_V1 = "128a98a132eb106aa99166129a59d8a33b602dd6752a3e4f8766c23f82b90d04";

function mechanismRef(factIds: string[]): EvidenceRef {
  return { kind: "MECHANISM_FACT", factIds };
}

function ragRef(evidenceIds: string[]): EvidenceRef {
  return { kind: "RAG_EVIDENCE", evidenceIds };
}

function yurikoLensHypothesis(args: {
  hypothesisId: string;
  lens: StrategyHypothesisV3["lens"];
  packageId: string;
}): StrategyHypothesisV3 {
  const assertionId = `${args.hypothesisId}-assert`;
  return {
    hypothesisId: args.hypothesisId,
    title: `${args.lens} Yuriko ninjutsu engine`,
    strategicClaim: "Ninjutsu deployment and ninja combat damage combine into a top-deck ninja strategy.",
    causalReasoning: "Commander ninjutsu and ninja hit triggers align with primer ninja archetype signals.",
    evidenceRefs: [mechanismRef([YURIKO_COMMANDER_NINJUTSU_FACT, YURIKO_NINJA_HIT_FACT])],
    strategicAssertions: [
      {
        assertionId: `${assertionId}-requires-ninja`,
        packageId: args.packageId,
        predicate: "REQUIRES_STATE",
        resourceOrState: "NINJAS",
        evidenceRefs: [ragRef([YURIKO_PINNED_RAG_EVIDENCE_ID_V1])],
      },
      {
        assertionId: `${assertionId}-produces-topdeck`,
        packageId: args.packageId,
        predicate: "PRODUCES_STATE",
        resourceOrState: "TOP_DECK",
        evidenceRefs: [ragRef([YURIKO_PINNED_RAG_EVIDENCE_ID_V1])],
      },
    ],
    causalEdges: [],
    commanderDependency: "HIGH",
    lens: args.lens,
    packages: [
      {
        packageId: args.packageId,
        purpose: "Ninjutsu and ninja hit value engine",
        functionalRoles: ["ENGINE", "PAYOFF"],
        inputs: ["NINJAS"],
        resourcesRequired: ["NINJAS"],
        outputs: ["TOP_DECK"],
        resourcesProduced: ["TOP_DECK"],
        commanderDependency: "HIGH",
        worksWithoutCommander: "LOW",
        evidenceRefs: [
          mechanismRef([YURIKO_COMMANDER_NINJUTSU_FACT, YURIKO_NINJA_HIT_FACT]),
          ragRef([YURIKO_PINNED_RAG_EVIDENCE_ID_V1]),
        ],
      },
    ],
    relationships: [],
    strengths: ["fixture-strength"],
    vulnerabilities: ["fixture-vulnerability"],
  };
}

export function buildProfessorV3YurikoOrchestrationSuccessEnvelopeV1() {
  return {
    responseKind: "PLAN" as const,
    toolRequests: [] as [],
    strategyHypotheses: [
      yurikoLensHypothesis({ hypothesisId: "yuriko-auto", lens: "AUTO", packageId: "yuriko-auto-pkg" }),
      yurikoLensHypothesis({
        hypothesisId: "yuriko-dependent",
        lens: "DEPENDENT_SYNERGY",
        packageId: "yuriko-dependent-pkg",
      }),
      yurikoLensHypothesis({
        hypothesisId: "yuriko-independent",
        lens: "INDEPENDENT_SYNERGY",
        packageId: "yuriko-independent-pkg",
      }),
    ],
  };
}

export function buildProfessorV3YurikoOrchestrationSuccessResponsesApiBodyV1(): string {
  const envelope = buildProfessorV3YurikoOrchestrationSuccessEnvelopeV1();
  const outputText = JSON.stringify(envelope);
  return JSON.stringify({
    id: "resp-yuriko-orchestration-success-stub-v1",
    status: "completed",
    output: [
      {
        type: "message",
        status: "completed",
        content: [{ type: "output_text", text: outputText }],
      },
    ],
    output_text: outputText,
  });
}

export function createProfessorV3YurikoOrchestrationSuccessFetchStubV1(): typeof fetch {
  const body = buildProfessorV3YurikoOrchestrationSuccessResponsesApiBodyV1();
  return async () =>
    ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => body,
    }) as Response;
}
