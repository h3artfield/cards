/**
 * CALL 2 — Sol Deck Constructor.
 */
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import { createModelTelemetryCollector } from "./professor-model-telemetry-v4-15-1-v1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type {
  DeckConstructionPlanV1,
  SolDirectedCandidatePoolV1,
  SolDirectedConstructedDeckV1,
  SolDirectedModelCallRecordV1,
} from "./professor-sol-directed-types-v1";

export const PROFESSOR_SOL_DIRECTED_CONSTRUCTOR_V1_VERSION = "professor-sol-directed-constructor-v1";

export const SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1 = `You are GPT-5.6 Sol Deck Constructor for Commander.
Given your DeckConstructionPlan and legal candidate pools, select the exact 99-card library (commander separate).
You must choose actual card names from the candidate pools for nonlands and from the land pool for lands.
No deterministic filler. No alphabetical padding. Every nonland needs role, packages, and why.
Return JSON only.`;

export const SOL_DIRECTED_CONSTRUCTED_DECK_JSON_SCHEMA_V1 = {
  type: "object",
  additionalProperties: false,
  properties: {
    landCount: { type: "number" },
    lands: { type: "array", items: { type: "string" } },
    nonlands: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          primaryRole: { type: "string" },
          secondaryRoles: { type: "array", items: { type: "string" } },
          packageMembership: { type: "array", items: { type: "string" } },
          whyInThisDeck: { type: "string" },
          structuralNecessity: { type: "string", enum: ["REQUIRED", "FLEX"] },
        },
        required: ["name", "primaryRole", "secondaryRoles", "packageMembership", "whyInThisDeck", "structuralNecessity"],
      },
    },
    primaryWinPaths: { type: "array", items: { type: "string" } },
    secondaryWinPaths: { type: "array", items: { type: "string" } },
    expectedPlayPattern: { type: "string" },
    structuralNecessities: { type: "array", items: { type: "string" } },
    replaceableFlex: { type: "array", items: { type: "string" } },
  },
  required: [
    "landCount",
    "lands",
    "nonlands",
    "primaryWinPaths",
    "secondaryWinPaths",
    "expectedPlayPattern",
    "structuralNecessities",
    "replaceableFlex",
  ],
} as const;

export function buildConstructorUserPromptV1(args: {
  commander: CommanderBlueprintV417;
  plan: DeckConstructionPlanV1;
  candidatePools: SolDirectedCandidatePoolV1[];
  landCandidates: Array<{ name: string; oracleId: string; typeLine: string; oracleText: string }>;
  bracket: number;
}): string {
  const compactPools = args.candidatePools.slice(0, 12).map((pool) => ({
    requirementId: pool.requirementId,
    label: pool.label,
    recallQuality: pool.recallQuality,
    candidates: pool.candidates.slice(0, 25).map((c) => ({
      name: c.name,
      manaValue: c.truth.manaValue,
      typeLine: c.truth.typeLine,
      oracleText: c.truth.oracleText.slice(0, 220),
    })),
  }));

  return JSON.stringify(
    {
      task: "Construct exact 99-card Commander library from plan and candidates",
      commander: { name: args.commander.name, colorIdentity: args.commander.colorIdentity },
      bracket: args.bracket,
      plan: args.plan,
      candidatePools: compactPools,
      landCandidates: args.landCandidates.slice(0, 80),
      constraints: {
        librarySize: 99,
        singleton: true,
        commanderSeparate: true,
        landCountMustMatchLandsArray: true,
        nonlandCountPlusLandCountMustEqual99: true,
      },
    },
    null,
    2,
  );
}

export function normalizeSolDirectedConstructedDeckV1(
  raw: Partial<Omit<SolDirectedConstructedDeckV1, "commander">>,
  commander: CommanderBlueprintV417,
  plan: DeckConstructionPlanV1,
): SolDirectedConstructedDeckV1 {
  const lands = raw.lands ?? [];
  const nonlands = (raw.nonlands ?? []).map((c, index) => ({
    oracleId: c.oracleId ?? "",
    name: c.name ?? "Unknown",
    primaryRole: c.primaryRole ?? "flex",
    secondaryRoles: c.secondaryRoles ?? [],
    packageMembership: c.packageMembership ?? [],
    whyInThisDeck: c.whyInThisDeck ?? "",
    structuralNecessity: c.structuralNecessity ?? "FLEX",
  }));
  const landCount = raw.landCount ?? lands.length;
  return {
    commander,
    landCount,
    lands,
    nonlands,
    primaryWinPaths: raw.primaryWinPaths ?? plan.explicitWinLines,
    secondaryWinPaths: raw.secondaryWinPaths ?? [],
    expectedPlayPattern: raw.expectedPlayPattern ?? plan.primaryPlan,
    structuralNecessities: raw.structuralNecessities ?? [],
    replaceableFlex: raw.replaceableFlex ?? [],
  };
}

export async function runSolDirectedConstructorV1(args: {
  commander: CommanderBlueprintV417;
  plan: DeckConstructionPlanV1;
  candidatePools: SolDirectedCandidatePoolV1[];
  landCandidates: Array<{ name: string; oracleId: string; typeLine: string; oracleText: string }>;
  bracket: number;
}): Promise<{ deck: SolDirectedConstructedDeckV1; record: SolDirectedModelCallRecordV1 }> {
  const userPrompt = buildConstructorUserPromptV1(args);
  const { collector } = createModelTelemetryCollector({ plannedCalls: 1 });
  const startedAt = Date.now();
  const { parsed, model, usage, callId } = await callHeadProfessorJsonV48<
    Omit<SolDirectedConstructedDeckV1, "commander">
  >({
    system: SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1,
    userContent: userPrompt,
    jsonSchema: SOL_DIRECTED_CONSTRUCTED_DECK_JSON_SCHEMA_V1,
    schemaName: "sol_directed_constructed_deck_v1",
    useJsonSchema: true,
    liveFast: true,
    backgroundFirst: userPrompt.length > 180_000,
    telemetry: { collector, purpose: "OTHER", planned: true },
  });

  return {
    deck: normalizeSolDirectedConstructedDeckV1(parsed, args.commander, args.plan),
    record: {
      purpose: "CONSTRUCTOR",
      systemPrompt: SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1,
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
