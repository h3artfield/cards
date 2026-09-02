/**
 * CALL 1 — Sol Deck Architect.
 */
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { createModelTelemetryCollector } from "./professor-model-telemetry-v4-15-1-v1";
import type { DeckConstructionPlanV1, SolDirectedModelCallRecordV1 } from "./professor-sol-directed-types-v1";

export const PROFESSOR_SOL_DIRECTED_ARCHITECT_V1_VERSION = "professor-sol-directed-architect-v1";

export const SOL_DIRECTED_ARCHITECT_SYSTEM_V1 = `You are GPT-5.6 Sol Deck Architect for Commander deck construction.
Produce a structured DeckConstructionPlan. You own strategic judgment: thesis, plans, packages, budgets, win lines, and card-role requirements.
Do not ask the system to reinterpret your plan. Your plan is the strategy contract.
Return JSON only.`;

export const DECK_CONSTRUCTION_PLAN_JSON_SCHEMA_V1 = {
  type: "object",
  additionalProperties: false,
  properties: {
    deckThesis: { type: "string" },
    primaryPlan: { type: "string" },
    secondaryPlan: { type: "string" },
    earlyGamePlan: { type: "string" },
    midgamePlan: { type: "string" },
    closingPlan: { type: "string" },
    explicitWinLines: { type: "array", items: { type: "string" } },
    failureRecoveryPlan: { type: "string" },
    manaCurveTarget: { type: "string" },
    desiredLandRange: {
      type: "object",
      additionalProperties: false,
      properties: { min: { type: "number" }, preferred: { type: "number" }, max: { type: "number" } },
      required: ["min", "preferred", "max"],
    },
    functionalBudgets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          minimum: { type: "number" },
          preferred: { type: "number" },
          maximum: { type: "number" },
          obligation: { type: "string", enum: ["REQUIRED_MINIMUM", "PREFERRED_TARGET", "OPTIONAL"] },
        },
        required: ["category", "minimum", "obligation"],
      },
    },
    strategicPackages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          packageId: { type: "string" },
          name: { type: "string" },
          purpose: { type: "string" },
          minimumCards: { type: "number" },
          preferredCards: { type: "number" },
        },
        required: ["packageId", "name", "purpose"],
      },
    },
    cardRequirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirementId: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
          minimumCount: { type: "number" },
          preferredCount: { type: "number" },
          requiredCharacteristics: { type: "array", items: { type: "string" } },
          mechanics: { type: "array", items: { type: "string" } },
          avoid: { type: "array", items: { type: "string" } },
        },
        required: ["requirementId", "label", "description", "requiredCharacteristics"],
      },
    },
    tutorAccessTargets: { type: "array", items: { type: "string" } },
    protectionRequirements: { type: "array", items: { type: "string" } },
    interactionRequirements: { type: "array", items: { type: "string" } },
    redundancyRequirements: { type: "array", items: { type: "string" } },
    cardsToAvoid: { type: "array", items: { type: "string" } },
    bracketPowerExpectations: { type: "string" },
  },
  required: [
    "deckThesis",
    "primaryPlan",
    "secondaryPlan",
    "earlyGamePlan",
    "midgamePlan",
    "closingPlan",
    "explicitWinLines",
    "failureRecoveryPlan",
    "manaCurveTarget",
    "desiredLandRange",
    "functionalBudgets",
    "strategicPackages",
    "cardRequirements",
    "tutorAccessTargets",
    "protectionRequirements",
    "interactionRequirements",
    "redundancyRequirements",
    "cardsToAvoid",
    "bracketPowerExpectations",
  ],
} as const;

export function buildArchitectUserPromptV1(args: {
  commander: CommanderBlueprintV417;
  bracket: number;
  playstyle: string;
  deckTheme?: string;
  winPreference?: string;
  commanderStyle?: string;
  deckPreferences?: string;
  userSemanticPreferences?: "none" | { prefer: string[]; avoid: string[] };
  bracketConstraints?: string[];
  inventoryConstraints?: string[];
}): string {
  return JSON.stringify(
    {
      task: "Design DeckConstructionPlan for Commander",
      commander: {
        name: args.commander.name,
        oracleId: args.commander.oracleId,
        colorIdentity: args.commander.colorIdentity,
        manaValue: args.commander.manaValue,
        oracleText: args.commander.oracleText,
        semanticFunctions: args.commander.semanticFunctions,
      },
      requestedBracket: args.bracket,
      playstyle: args.playstyle,
      deckTheme: args.deckTheme?.trim() || undefined,
      winPreference: args.winPreference?.trim() || undefined,
      commanderStyle: args.commanderStyle ?? args.playstyle,
      deckPreferences: args.deckPreferences?.trim() || undefined,
      userSemanticPreferences: args.userSemanticPreferences ?? "none",
      bracketConstraints: args.bracketConstraints ?? [`Bracket ${args.bracket} — no infinite combos unless bracket allows`],
      inventoryConstraints: args.inventoryConstraints ?? [],
      instructions:
        "Return a complete strategic blueprint. playstyle describes HOW the game should feel while playing. deckTheme (when provided) lists theme preferences to SYNTHESIZE — combine compatible themes into a coherent primary strategy with optional secondary support; do NOT treat each theme as an equal rigid bucket. When selected themes compete structurally, prioritize the strongest coherent combination for this commander and bracket and deemphasize conflicting themes. winPreference guides how the deck should close games. Include 8-14 cardRequirements for retrieval. Land range should sum to a 99-card library with your nonland picks. Honor deckPreferences when provided. userSemanticPreferences are optional soft function biases (prefer/avoid). If the value is \"none\", determine the optimal semantic functions yourself. Do not turn prefer/avoid into hard cardRequirements unless the player explicitly marked them as hard constraints in deckPreferences.",
    },
    null,
    2,
  );
}

export function normalizeDeckConstructionPlanV1(
  raw: Partial<DeckConstructionPlanV1>,
  bracket: number,
): DeckConstructionPlanV1 {
  const defaultLands = bracket >= 4 ? 35 : bracket === 3 ? 34 : 33;
  return {
    deckThesis: raw.deckThesis ?? "",
    primaryPlan: raw.primaryPlan ?? "",
    secondaryPlan: raw.secondaryPlan ?? "",
    earlyGamePlan: raw.earlyGamePlan ?? "",
    midgamePlan: raw.midgamePlan ?? "",
    closingPlan: raw.closingPlan ?? "",
    explicitWinLines: raw.explicitWinLines ?? [],
    failureRecoveryPlan: raw.failureRecoveryPlan ?? "",
    manaCurveTarget: raw.manaCurveTarget ?? "balanced",
    desiredLandRange: raw.desiredLandRange ?? {
      min: Math.max(32, defaultLands - 2),
      preferred: defaultLands,
      max: Math.min(38, defaultLands + 2),
    },
    functionalBudgets: (raw.functionalBudgets ?? []).map((b) => ({
      category: b.category ?? "general",
      minimum: b.minimum ?? 0,
      preferred: b.preferred,
      maximum: b.maximum,
      obligation: b.obligation ?? (b.minimum > 0 ? "REQUIRED_MINIMUM" : "OPTIONAL"),
    })),
    strategicPackages: raw.strategicPackages ?? [],
    cardRequirements: (raw.cardRequirements ?? []).map((r, index) => ({
      requirementId: r.requirementId ?? `req-${index + 1}`,
      label: r.label ?? `Requirement ${index + 1}`,
      description: r.description ?? "",
      minimumCount: r.minimumCount,
      preferredCount: r.preferredCount,
      requiredCharacteristics: r.requiredCharacteristics ?? [],
      mechanics: r.mechanics ?? [],
      avoid: r.avoid ?? [],
    })),
    tutorAccessTargets: raw.tutorAccessTargets ?? [],
    protectionRequirements: raw.protectionRequirements ?? [],
    interactionRequirements: raw.interactionRequirements ?? [],
    redundancyRequirements: raw.redundancyRequirements ?? [],
    cardsToAvoid: raw.cardsToAvoid ?? [],
    bracketPowerExpectations: raw.bracketPowerExpectations ?? `Bracket ${bracket}`,
  };
}

export async function runSolDirectedArchitectV1(args: {
  commander: CommanderBlueprintV417;
  bracket: number;
  playstyle: string;
  commanderStyle?: string;
}): Promise<{ plan: DeckConstructionPlanV1; record: SolDirectedModelCallRecordV1 }> {
  const userPrompt = buildArchitectUserPromptV1(args);
  const { collector } = createModelTelemetryCollector({ plannedCalls: 1 });
  const startedAt = Date.now();
  const { parsed, model, usage, callId } = await callHeadProfessorJsonV48<DeckConstructionPlanV1>({
    system: SOL_DIRECTED_ARCHITECT_SYSTEM_V1,
    userContent: userPrompt,
    jsonSchema: DECK_CONSTRUCTION_PLAN_JSON_SCHEMA_V1,
    schemaName: "deck_construction_plan_v1",
    useJsonSchema: true,
    liveFast: false,
    telemetry: { collector, purpose: "ARCHITECTURE_ANALYSIS", planned: true },
  });
  return {
    plan: normalizeDeckConstructionPlanV1(parsed, args.bracket),
    record: {
      purpose: "ARCHITECT",
      systemPrompt: SOL_DIRECTED_ARCHITECT_SYSTEM_V1,
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
