/**
 * Constructor input builder + offline acceptance test.
 */
import type {
  ArchitectRawPlanV11,
  ConstructorInputAcceptanceV11,
  ConstructorInputBundleV11,
  RetrievalContractV11,
  RetrievalResultV11,
} from "./professor-sol-directed-types-v1-1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import {
  evaluateConstructorSupplyGateV11,
  type ConstructorSupplyGateV11,
} from "./professor-sol-directed-supply-gate-v1-1";
import { CONSTRUCTOR_CANDIDATE_ORACLE_TEXT_MAX_V111 } from "./professor-card-semantic-functions-v1-1-1";
import { getSemanticOracleFactsForOracleId } from "./professor-semantic-oracle-facts-v1-1-1";
import { SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1_1 } from "./professor-sol-directed-constructor-system-prompt-v1-1-1";
import {
  userSemanticPreferencesForPromptV111,
  type UserSemanticPreferencesV111,
} from "./professor-user-semantic-preferences-v1-1-1";

export { SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1_1 };

export const PROFESSOR_SOL_DIRECTED_CONSTRUCTOR_INPUT_V1_1_VERSION =
  "professor-sol-directed-constructor-input-v1-1";

export const SOL_DIRECTED_CONSTRUCTED_DECK_JSON_SCHEMA_V1_1 = {
  type: "object",
  additionalProperties: false,
  properties: {
    landCount: { type: "number" },
    lands: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, copies: { type: "number" } },
        required: ["name", "copies"],
      },
    },
    nonlands: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          primaryArchitectRequirement: { type: "string" },
          primaryRole: { type: "string" },
          secondaryRoles: { type: "array", items: { type: "string" } },
          packageMembership: { type: "array", items: { type: "string" } },
          whyInThisDeck: { type: "string" },
          structuralNecessity: { type: "string", enum: ["REQUIRED", "FLEX"] },
        },
        required: [
          "name",
          "primaryArchitectRequirement",
          "primaryRole",
          "secondaryRoles",
          "packageMembership",
          "whyInThisDeck",
          "structuralNecessity",
        ],
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

export function buildConstructorInputBundleV11(args: {
  architectRawPlan: ArchitectRawPlanV11;
  retrievalContract: RetrievalContractV11;
  retrieval: RetrievalResultV11;
  commander: CommanderBlueprintV417;
  bracket: number;
  playstyle?: string;
  deckTheme?: string;
  winPreference?: string;
  commanderStyle?: string;
  deckPreferences?: string;
  userSemanticPreferences?: UserSemanticPreferencesV111 | null;
  supplyGate?: ConstructorSupplyGateV11;
}): ConstructorInputBundleV11 {
  const supplyGate = args.supplyGate ?? evaluateConstructorSupplyGateV11({
    contract: args.retrievalContract,
    retrieval: args.retrieval,
  });

  const requirementPoolRefs = args.retrieval.requirementPools.map((pool) => ({
    requirementId: pool.requirementId,
    primaryRole: pool.primaryRole,
    requestedCount: pool.requestedCount,
    candidateOracleIds: pool.oracleIds,
    seedOracleIds: pool.seedOracleIds,
  }));

  const landPoolPayload = {
    targetCount: args.retrieval.landPool.targetCount,
    basicForestSlots: args.retrieval.landPool.basicForestSlots,
    basicSwampSlots: args.retrieval.landPool.basicSwampSlots,
    entries: args.retrieval.landPool.entries.map((e) => ({
      name: e.name,
      oracleId: e.oracleId,
      isBasic: e.isBasic,
      maxCopies: e.maxCopies,
      category: e.category,
    })),
    nonBasicOracleIds: args.retrieval.landPool.nonBasicOracleIds,
  };

  const referencedOracleIds = new Set<string>();
  for (const pool of args.retrieval.requirementPools) {
    for (const oracleId of pool.oracleIds) referencedOracleIds.add(oracleId);
  }
  for (const oracleId of args.retrieval.landPool.nonBasicOracleIds) {
    referencedOracleIds.add(oracleId);
  }

  const eligibleRequirementPoolsByOracleId = new Map<string, string[]>();
  for (const pool of args.retrieval.requirementPools) {
    for (const oracleId of pool.oracleIds) {
      const existing = eligibleRequirementPoolsByOracleId.get(oracleId) ?? [];
      if (!existing.includes(pool.requirementId)) {
        existing.push(pool.requirementId);
      }
      eligibleRequirementPoolsByOracleId.set(oracleId, existing);
    }
  }

  const promptDictionary = Object.fromEntries(
    [...referencedOracleIds]
      .filter((id) => args.retrieval.candidateDictionary[id])
      .sort((a, b) => a.localeCompare(b))
      .map((id) => {
        const facts = args.retrieval.candidateDictionary[id]!;
        return [
          id,
          {
            name: facts.name,
            manaValue: facts.manaValue,
            typeLine: facts.typeLine,
            colorIdentity: facts.colorIdentity,
            oracleText: facts.oracleText.slice(0, CONSTRUCTOR_CANDIDATE_ORACLE_TEXT_MAX_V111),
            semanticOracle: facts.semanticOracle,
            supplementaryInferredFunctions: facts.semanticFunctions,
            eligibleRequirementPools: eligibleRequirementPoolsByOracleId.get(id) ?? [],
            commanderLegal: facts.commanderLegal,
            isLand: facts.isLand,
          },
        ];
      }),
  );

  const commanderSemanticOracle =
    getSemanticOracleFactsForOracleId(args.commander.oracleId) ??
    args.retrieval.candidateDictionary[args.commander.oracleId]?.semanticOracle ??
    null;

  const userPayload = {
    task: "Construct exact 99-card Commander library",
    retrievalEvidence: {
      requirementPoolMembership: "This card may satisfy this requirement.",
      semanticOracle: "This is what the card functionally does.",
      canonicalOracleTruth: "This is what the card legally says and is.",
      rule: "Use all three. Pool membership is not proof of strategic fitness.",
    },
    evidenceHierarchy: {
      eligibleRequirementPools: "This card may satisfy this requirement.",
      semanticOracle: "This is what the card functionally does.",
      canonicalOracleTruth: "This is what the card legally says and is.",
      constructorJudgment:
        "Among cards that genuinely perform the required function, choose the ones that make the entire 99 stronger.",
    },
    userSemanticPreferences: userSemanticPreferencesForPromptV111(args.userSemanticPreferences),
    commander: {
      name: args.commander.name,
      oracleId: args.commander.oracleId,
      colorIdentity: args.commander.colorIdentity,
      manaValue: args.commander.manaValue,
      oracleText: args.commander.oracleText,
      semanticOracle: commanderSemanticOracle,
      supplementaryInferredFunctions: args.commander.semanticFunctions,
    },
    bracket: args.bracket,
    playerIntent: {
      playstyle: args.playstyle?.trim() || null,
      deckTheme: args.deckTheme?.trim() || null,
      winPreference: args.winPreference?.trim() || null,
      commanderStyle: args.commanderStyle?.trim() || null,
      deckPreferences: args.deckPreferences?.trim() || null,
      userSemanticPreferences: userSemanticPreferencesForPromptV111(args.userSemanticPreferences),
    },
    architectRawPlan: args.architectRawPlan,
    retrievalContractSummary: {
      strategicThesis: args.retrievalContract.strategicThesis,
      earlyGamePlan: args.retrievalContract.earlyGamePlan,
      midGamePlan: args.retrievalContract.midGamePlan,
      lateGamePlan: args.retrievalContract.lateGamePlan,
      winLines: args.retrievalContract.winLines,
      nonlandSlotsRequired: args.retrievalContract.nonlandSlotsRequired,
      landSlotsRequired: args.retrievalContract.landSlotsRequired,
      cardRequirements: args.retrievalContract.cardRequirements,
      comboAndPowerGuardrails: args.retrievalContract.comboAndPowerGuardrails,
      retrievalRules: args.retrievalContract.retrievalRules,
    },
    candidateDictionary: promptDictionary,
    requirementPools: requirementPoolRefs,
    landPool: landPoolPayload,
    supplyGate,
    constraints: {
      librarySize: 99,
      singletonNonlands: true,
      singletonNonBasicLands: true,
      basicLandCopiesAllowed: true,
      assignEachNonlandToExactlyOnePrimaryArchitectRequirement: true,
      requirementSlotSum: args.retrievalContract.nonlandSlotsRequired,
      landCountTarget: args.retrievalContract.landSlotsRequired,
    },
  };

  return {
    systemPrompt: SOL_DIRECTED_CONSTRUCTOR_SYSTEM_V1_1,
    userPrompt: JSON.stringify(userPayload, null, 2),
    architectRawPlan: args.architectRawPlan,
    retrievalContract: args.retrievalContract,
    candidateDictionary: args.retrieval.candidateDictionary,
    requirementPools: args.retrieval.requirementPools,
    landPool: args.retrieval.landPool,
    supplyGate,
  };
}

export function acceptanceTestConstructorInputV11(args: {
  bundle: ConstructorInputBundleV11;
  retrieval: RetrievalResultV11;
}): ConstructorInputAcceptanceV11 {
  const failures: string[] = [];
  const contract = args.bundle.retrievalContract;
  const checks: Record<string, boolean> = {};

  checks.strategicThesisNonempty = contract.strategicThesis.trim().length > 0;
  checks.earlyGamePlanNonempty = contract.earlyGamePlan.length > 0;
  checks.midGamePlanNonempty = contract.midGamePlan.length > 0;
  checks.lateGamePlanNonempty = contract.lateGamePlan.length > 0;
  checks.winLinesNonempty = contract.winLines.length > 0;

  const requirementIds = contract.cardRequirements.map((r) => r.requirementId);
  checks.realNamedRequirementIds =
    requirementIds.length === 10 && !requirementIds.some((id) => /^req-\d+$/.test(id));

  const nonlandSum = contract.cardRequirements.reduce((s, r) => s + r.requestedCount, 0);
  checks.requirementCountsSum63 = nonlandSum === 63;
  checks.landTarget36 = contract.landSlotsRequired === 36;

  checks.guardrailsPreserved =
    Object.keys(contract.comboAndPowerGuardrails).length > 0 &&
    Array.isArray(contract.comboAndPowerGuardrails.prohibitedCards);

  checks.candidateUnionGte63 = args.retrieval.uniqueNonlandCount >= 63;

  const poolPayload = JSON.parse(args.bundle.userPrompt).requirementPools as Array<{
    candidateOracleIds: string[];
  }>;
  const serialized = args.bundle.userPrompt;
  const dictionaryCount = Object.keys(args.retrieval.candidateDictionary).length;
  checks.noRepeatedFullCandidateObjectsAcrossPools =
    serialized.includes('"candidateDictionary"') &&
    poolPayload.every((p) => Array.isArray(p.candidateOracleIds) && p.candidateOracleIds.every((id) => typeof id === "string"));

  const landPool = args.retrieval.landPool;
  checks.landPoolHasForestSwamp =
    landPool.entries.some((e) => e.basicKind === "forest" && e.maxCopies >= 14) &&
    landPool.entries.some((e) => e.basicKind === "swamp" && e.maxCopies >= 7);
  checks.landPoolHasPlanNonbasics = landPool.nonBasicOracleIds.length >= 10;

  checks.supplyGatePass = args.bundle.supplyGate.pass;
  checks.dictionaryNotEmpty = dictionaryCount > 0;

  const parsedPayload = JSON.parse(args.bundle.userPrompt) as {
    evidenceHierarchy?: Record<string, string>;
    candidateDictionary?: Record<
      string,
      {
        semanticOracle?: unknown;
        eligibleRequirementPools?: string[];
        supplementaryInferredFunctions?: string[];
      }
    >;
  };
  checks.evidenceHierarchyPresent =
    typeof parsedPayload.evidenceHierarchy?.semanticOracle === "string" &&
    typeof parsedPayload.evidenceHierarchy?.eligibleRequirementPools === "string";
  const dictionaryEntries = Object.values(parsedPayload.candidateDictionary ?? {});
  checks.candidateDictionaryHasSemanticOracleFields =
    dictionaryEntries.length > 0 &&
    dictionaryEntries.every(
      (entry) =>
        "semanticOracle" in entry &&
        Array.isArray(entry.eligibleRequirementPools) &&
        Array.isArray(entry.supplementaryInferredFunctions),
    );
  checks.someCandidatesHaveSemanticOracle =
    dictionaryEntries.some((entry) => entry.semanticOracle != null);

  for (const [key, ok] of Object.entries(checks)) {
    if (!ok) failures.push(`check failed: ${key}`);
  }

  return { pass: failures.length === 0, failures, checks };
}
