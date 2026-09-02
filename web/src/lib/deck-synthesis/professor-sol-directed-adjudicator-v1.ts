/**
 * CALL 3 — Sol repair or Head Professor adjudication.
 */
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import { createModelTelemetryCollector } from "./professor-model-telemetry-v4-15-1-v1";
import type {
  DeckConstructionPlanV1,
  SolDirectedConstructedDeckV1,
  SolDirectedHeadProfessorVerdictV1,
  SolDirectedModelCallRecordV1,
  SolDirectedRepairActionV1,
  SolDirectedValidationV1,
} from "./professor-sol-directed-types-v1";

export const PROFESSOR_SOL_DIRECTED_ADJUDICATOR_V1_VERSION = "professor-sol-directed-adjudicator-v1";

const REPAIR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["REMOVE", "ADD"] },
          card: { type: "string" },
          why: { type: "string" },
          expectedEffect: { type: "string" },
        },
        required: ["action", "card", "why", "expectedEffect"],
      },
    },
  },
  required: ["actions"],
} as const;

const HEAD_PROFESSOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    executesPlan: { type: "boolean" },
    bracketAppropriate: { type: "boolean" },
    offPlanCards: { type: "array", items: { type: "string" } },
    manaCorrect: { type: "boolean" },
    winConditionsCredible: { type: "boolean" },
    tutorTargetsCoherent: { type: "boolean" },
    deadPackages: { type: "array", items: { type: "string" } },
    redundancySufficient: { type: "boolean" },
    highestValueSwaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { cut: { type: "string" }, add: { type: "string" }, reason: { type: "string" } },
        required: ["cut", "add", "reason"],
      },
    },
    verdict: { type: "string", enum: ["CONSTRUCTION_SUCCESS", "OPTIONAL_REFINEMENT", "CONSTRUCTION_DEFECT"] },
    narrative: { type: "string" },
  },
  required: [
    "executesPlan",
    "bracketAppropriate",
    "offPlanCards",
    "manaCorrect",
    "winConditionsCredible",
    "tutorTargetsCoherent",
    "deadPackages",
    "redundancySufficient",
    "highestValueSwaps",
    "verdict",
    "narrative",
  ],
} as const;

export async function runSolDirectedRepairV1(args: {
  deck: SolDirectedConstructedDeckV1;
  plan: DeckConstructionPlanV1;
  validation: SolDirectedValidationV1;
  nearbyCandidates: string[];
}): Promise<{ actions: SolDirectedRepairActionV1[]; record: SolDirectedModelCallRecordV1 }> {
  const system = "You are GPT-5.6 Sol Deck Repair. Propose the smallest repair for deterministic violations only.";
  const userPrompt = JSON.stringify(
    {
      deck: args.deck,
      plan: args.plan,
      violations: args.validation.violations,
      nearbyCandidates: args.nearbyCandidates.slice(0, 80),
      format: { actions: [{ action: "REMOVE|ADD", card: "name", why: "...", expectedEffect: "..." }] },
    },
    null,
    2,
  );
  const { collector } = createModelTelemetryCollector({ plannedCalls: 1 });
  const startedAt = Date.now();
  const { parsed, model, usage, callId } = await callHeadProfessorJsonV48<{ actions: SolDirectedRepairActionV1[] }>({
    system,
    userContent: userPrompt,
    jsonSchema: REPAIR_SCHEMA,
    schemaName: "sol_directed_repair_v1",
    useJsonSchema: true,
    liveFast: true,
    telemetry: { collector, purpose: "OTHER", planned: true },
  });
  return {
    actions: parsed.actions,
    record: {
      purpose: "REPAIR",
      systemPrompt: system,
      userPrompt,
      rawResponse: parsed,
      model,
      callId,
      latencyMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? null,
      outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
  };
}

export async function runSolDirectedHeadProfessorV1(args: {
  deck: SolDirectedConstructedDeckV1;
  plan: DeckConstructionPlanV1;
  validation: SolDirectedValidationV1;
  bracket: number;
}): Promise<{ verdict: SolDirectedHeadProfessorVerdictV1; record: SolDirectedModelCallRecordV1 }> {
  const system =
    "You are GPT-5.6 Sol Head Professor. Review whether the deck executes the stated plan for the requested bracket.";
  const userPrompt = JSON.stringify(
    {
      task: "Whole-deck construction review",
      bracket: args.bracket,
      plan: args.plan,
      deck: args.deck,
      deterministicValidation: args.validation,
      questions: [
        "Does the deck execute the stated plan?",
        "Is it appropriate for the requested bracket?",
        "Are any cards off-plan?",
        "Is the mana correct?",
        "Are win conditions credible?",
        "Are tutor targets coherent?",
        "Are there dead packages?",
        "Is redundancy sufficient?",
        "What are the highest-value swaps?",
        "CONSTRUCTION_SUCCESS, OPTIONAL_REFINEMENT, or CONSTRUCTION_DEFECT?",
      ],
    },
    null,
    2,
  );
  const { collector } = createModelTelemetryCollector({ plannedCalls: 1 });
  const startedAt = Date.now();
  const { parsed, model, usage, callId } = await callHeadProfessorJsonV48<SolDirectedHeadProfessorVerdictV1>({
    system,
    userContent: userPrompt,
    jsonSchema: HEAD_PROFESSOR_SCHEMA,
    schemaName: "sol_directed_head_professor_v1",
    useJsonSchema: true,
    liveFast: false,
    telemetry: { collector, purpose: "HEAD_PROFESSOR_REVIEW", planned: true },
  });
  return {
    verdict: parsed,
    record: {
      purpose: "HEAD_PROFESSOR",
      systemPrompt: system,
      userPrompt,
      rawResponse: parsed,
      model,
      callId,
      latencyMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? null,
      outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? null,
      reasoningTokens: usage?.reasoningTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    },
  };
}
