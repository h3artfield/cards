/**
 * Korvold orchestration success stub — zero network; grounds against multi-korvold mechanism truth.
 */
import type { StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { KORVOLD_SACRIFICE_PAYOFF_FACT } from "./phase6a1-professor-v3-grounding-fixtures-v4";
import { mechanismRef } from "./phase6a1-professor-v3-fixture-assertions-v1";

export const PROFESSOR_V3_KORVOLD_ORCHESTRATION_SUCCESS_FIXTURE_V1_VERSION =
  "phase6a1-professor-v3-korvold-orchestration-success-fixture-v1";

const KORVOLD_SACRIFICE_TRIGGER_FACT = "korvold-entry-attack-sacrifice";

function korvoldLensHypothesis(args: {
  hypothesisId: string;
  lens: StrategyHypothesisV3["lens"];
  packageId: string;
  harmonyBridge?: boolean;
}): StrategyHypothesisV3 {
  const assertionId = `${args.hypothesisId}-assert`;
  const producerPackageId = `${args.packageId}-producer`;
  const consumerPackageId = `${args.packageId}-consumer`;
  const packages =
    args.harmonyBridge && args.lens === "HARMONY"
      ? [
          {
            packageId: producerPackageId,
            purpose: "Generate sacrifice fodder",
            functionalRoles: ["ENGINE", "FUEL"],
            inputs: [],
            resourcesRequired: [],
            outputs: [],
            resourcesProduced: [],
            commanderDependency: "HIGH",
            worksWithoutCommander: "LOW",
            evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_TRIGGER_FACT])],
          },
          {
            packageId: consumerPackageId,
            purpose: "Convert sacrifices into card advantage",
            functionalRoles: ["PAYOFF", "CONVERSION"],
            inputs: ["SACRIFICE_FODDER"],
            resourcesRequired: ["SACRIFICE_FODDER"],
            outputs: ["CARD_ADVANTAGE"],
            resourcesProduced: ["CARD_ADVANTAGE"],
            commanderDependency: "HIGH",
            worksWithoutCommander: "LOW",
            evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_PAYOFF_FACT])],
          },
        ]
      : [
          {
            packageId: args.packageId,
            purpose: "Sacrifice value engine",
            functionalRoles: ["ENGINE", "PAYOFF"],
            inputs: ["SACRIFICE_FODDER"],
            resourcesRequired: ["SACRIFICE_FODDER"],
            outputs: ["CARD_ADVANTAGE"],
            resourcesProduced: ["CARD_ADVANTAGE"],
            commanderDependency: "HIGH",
            worksWithoutCommander: "LOW",
            evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_PAYOFF_FACT])],
          },
        ];

  const strategicAssertions =
    args.harmonyBridge && args.lens === "HARMONY"
      ? [
          {
            assertionId: `${assertionId}-producer`,
            packageId: producerPackageId,
            predicate: "PRODUCES_STATE",
            resourceOrState: "SACRIFICE_FODDER",
            evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_TRIGGER_FACT])],
          },
          {
            assertionId: `${assertionId}-consumer`,
            packageId: consumerPackageId,
            predicate: "REQUIRES_STATE",
            resourceOrState: "SACRIFICE_FODDER",
            evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_PAYOFF_FACT])],
          },
        ]
      : [
          {
            assertionId: `${assertionId}-requires`,
            packageId: args.packageId,
            predicate: "REQUIRES_STATE",
            resourceOrState: "SACRIFICE_FODDER",
            evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_TRIGGER_FACT])],
          },
          {
            assertionId: `${assertionId}-produces`,
            packageId: args.packageId,
            predicate: "PRODUCES_STATE",
            resourceOrState: "CARD_ADVANTAGE",
            evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_PAYOFF_FACT])],
          },
        ];

  const causalEdges =
    args.harmonyBridge && args.lens === "HARMONY"
      ? [
          {
            edgeId: `${args.hypothesisId}-edge`,
            producerAssertionId: `${assertionId}-producer`,
            consumerAssertionId: `${assertionId}-consumer`,
            resourceOrState: "SACRIFICE_FODDER",
            evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_PAYOFF_FACT])],
          },
        ]
      : [];

  const relationships =
    args.harmonyBridge && args.lens === "HARMONY"
      ? [
          {
            relationshipId: `${args.hypothesisId}-rel`,
            producer: producerPackageId,
            consumer: consumerPackageId,
            relationshipType: "PRODUCER_TO_CONSUMER",
            causalReasoning: "Sacrifice fodder feeds Korvold payoffs for card advantage.",
            evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_PAYOFF_FACT])],
          },
        ]
      : [];

  return {
    hypothesisId: args.hypothesisId,
    title: `${args.lens} Korvold sacrifice engine`,
    strategicClaim: "Sacrifice fodder converts into card advantage through Korvold payoffs.",
    causalReasoning: "Commander sacrifice triggers produce counters and card draw.",
    evidenceRefs: [mechanismRef([KORVOLD_SACRIFICE_PAYOFF_FACT, KORVOLD_SACRIFICE_TRIGGER_FACT])],
    strategicAssertions,
    causalEdges,
    commanderDependency: "HIGH",
    lens: args.lens,
    packages,
    relationships,
    strengths: ["fixture-strength"],
    vulnerabilities: ["fixture-vulnerability"],
  };
}

export function buildProfessorV3KorvoldOrchestrationSuccessEnvelopeV1() {
  return {
    responseKind: "PLAN" as const,
    toolRequests: [] as [],
    strategyHypotheses: [
      korvoldLensHypothesis({ hypothesisId: "korvold-auto", lens: "AUTO", packageId: "korvold-auto-pkg" }),
      korvoldLensHypothesis({
        hypothesisId: "korvold-dependent",
        lens: "DEPENDENT_SYNERGY",
        packageId: "korvold-dependent-pkg",
      }),
      korvoldLensHypothesis({
        hypothesisId: "korvold-independent",
        lens: "INDEPENDENT_SYNERGY",
        packageId: "korvold-independent-pkg",
      }),
    ],
  };
}

export function buildProfessorV3KorvoldOrchestrationSuccessResponsesApiBodyV1(): string {
  const envelope = buildProfessorV3KorvoldOrchestrationSuccessEnvelopeV1();
  const outputText = JSON.stringify(envelope);
  return JSON.stringify({
    id: "resp-korvold-orchestration-success-stub-v1",
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

export function createProfessorV3KorvoldOrchestrationSuccessFetchStubV1(): typeof fetch {
  const body = buildProfessorV3KorvoldOrchestrationSuccessResponsesApiBodyV1();
  return async () =>
    ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => body,
    }) as Response;
}
