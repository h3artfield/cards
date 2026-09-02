/**
 * Professor v4.17 — strict Sol blueprint proposal schema + validation.
 */
import type {
  BracketContractBlueprintV417,
  FunctionalBudgetV417,
  PackageBlueprintV417,
  StrategyBlueprintV417,
  WinArchitectureBlueprintV417,
} from "./professor-brew-blueprint-v4-17-v1";
import { normalizeFunctionalBudgetEntryV417 } from "./professor-brew-blueprint-functional-density-v4-17-v1";

export const PROFESSOR_SOL_BLUEPRINT_PROPOSAL_V4_17_V1_VERSION = "professor-sol-blueprint-proposal-v4-17-v1";

export type SolBlueprintProposalV417 = {
  version: typeof PROFESSOR_SOL_BLUEPRINT_PROPOSAL_V4_17_V1_VERSION;
  strategicThesis: string;
  primaryStrategy: string;
  secondaryStrategy: string;
  commanderExploit: string;
  independentEngine: string;
  expectedPlayPattern: string;
  strategicConcepts: string[];
  packages: PackageBlueprintV417[];
  winArchitecture: WinArchitectureBlueprintV417[];
  functionalBudgets: FunctionalBudgetV417[];
  accessNeeds: string[];
  protectionNeeds: string[];
  weaknesses: string[];
  strengths: string[];
  dependencies: string[];
  bracketConstructionGuidance: string[];
  researchSeeds: string[];
  bracketContract: BracketContractBlueprintV417;
};

export const SOL_BLUEPRINT_PROPOSAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    strategicThesis: { type: "string" },
    primaryStrategy: { type: "string" },
    secondaryStrategy: { type: "string" },
    commanderExploit: { type: "string" },
    independentEngine: { type: "string" },
    expectedPlayPattern: { type: "string" },
    strategicConcepts: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
    packages: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          packageId: { type: "string" },
          name: { type: "string" },
          purpose: { type: "string" },
          core: { type: "boolean" },
          minimumPhysicalSlots: { type: "number" },
          preferredPhysicalSlots: { type: "number" },
          maximumPhysicalSlots: { type: "number" },
          minimumPhysicalContribution: { type: "number" },
          preferredPhysicalContribution: { type: "number" },
          requiredFunctions: { type: "array", items: { type: "string" } },
          preferredFunctions: { type: "array", items: { type: "string" } },
          requirementGroups: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                groupId: { type: "string" },
                name: { type: "string" },
                mandatory: { type: "boolean" },
                relatedRequirementIds: { type: "array", items: { type: "string" } },
                minimumPhysicalSlots: { type: "number" },
                preferredPhysicalSlots: { type: "number" },
              },
              required: ["groupId", "name", "mandatory", "relatedRequirementIds", "minimumPhysicalSlots", "preferredPhysicalSlots"],
            },
          },
        },
        required: [
          "packageId",
          "name",
          "purpose",
          "core",
          "minimumPhysicalSlots",
          "preferredPhysicalSlots",
          "maximumPhysicalSlots",
          "requiredFunctions",
          "preferredFunctions",
        ],
      },
    },
    winArchitecture: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          planId: { type: "string" },
          plan: { type: "string" },
          status: { type: "string", enum: ["HYPOTHESIZED", "PARTIAL", "VERIFIED"] },
          mechanicallyVerified: { type: "boolean" },
          requiredFunctions: { type: "array", items: { type: "string" } },
          requiredCardsOrEquivalents: { type: "array", items: { type: "string" } },
        },
        required: ["planId", "plan", "status", "mechanicallyVerified", "requiredFunctions", "requiredCardsOrEquivalents"],
      },
    },
    functionalBudgets: {
      type: "array",
      minItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          minimum: { type: "number" },
          maximum: { type: "number" },
        },
        required: ["category", "minimum", "maximum"],
      },
    },
    accessNeeds: { type: "array", items: { type: "string" } },
    protectionNeeds: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" }, minItems: 1 },
    strengths: { type: "array", items: { type: "string" }, minItems: 1 },
    dependencies: { type: "array", items: { type: "string" } },
    bracketConstructionGuidance: { type: "array", items: { type: "string" }, minItems: 1 },
    researchSeeds: { type: "array", items: { type: "string" } },
    bracketContract: {
      type: "object",
      additionalProperties: false,
      properties: {
        requestedBracket: { type: "number", enum: [1, 2, 3, 4, 5] },
        accelerationExpectation: { type: "string" },
        interactionExpectation: { type: "string" },
        cardQualityExpectation: { type: "string" },
        tutorExpectation: { type: "string" },
        protectionExpectation: { type: "string" },
        redundancyExpectation: { type: "string" },
        threatSpeedExpectation: { type: "string" },
        recoveryExpectation: { type: "string" },
        winCompactnessExpectation: { type: "string" },
        comboPolicy: { type: "string" },
        commanderDependenceTarget: { type: "string" },
      },
      required: [
        "requestedBracket",
        "accelerationExpectation",
        "interactionExpectation",
        "cardQualityExpectation",
        "tutorExpectation",
        "protectionExpectation",
        "redundancyExpectation",
        "threatSpeedExpectation",
        "recoveryExpectation",
        "winCompactnessExpectation",
        "comboPolicy",
        "commanderDependenceTarget",
      ],
    },
  },
  required: [
    "strategicThesis",
    "primaryStrategy",
    "secondaryStrategy",
    "commanderExploit",
    "independentEngine",
    "expectedPlayPattern",
    "strategicConcepts",
    "packages",
    "winArchitecture",
    "functionalBudgets",
    "accessNeeds",
    "protectionNeeds",
    "weaknesses",
    "strengths",
    "dependencies",
    "bracketConstructionGuidance",
    "researchSeeds",
    "bracketContract",
  ],
} as const;

export class SolBlueprintSchemaInvalidV417 extends Error {
  readonly code = "SOL_BLUEPRINT_SCHEMA_INVALID" as const;
  readonly violations: string[];
  constructor(violations: string[]) {
    super(`SOL_BLUEPRINT_SCHEMA_INVALID: ${violations.join("; ")}`);
    this.violations = violations;
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: unknown, min = 0): v is string[] {
  return Array.isArray(v) && v.length >= min && v.every((x) => typeof x === "string");
}

export function validateSolBlueprintProposalV417(raw: unknown): SolBlueprintProposalV417 {
  const violations: string[] = [];
  if (!raw || typeof raw !== "object") throw new SolBlueprintSchemaInvalidV417(["NOT_OBJECT"]);

  const o = raw as Record<string, unknown>;
  const requiredStrings = [
    "strategicThesis",
    "primaryStrategy",
    "secondaryStrategy",
    "commanderExploit",
    "independentEngine",
    "expectedPlayPattern",
  ] as const;
  for (const key of requiredStrings) {
    if (!isNonEmptyString(o[key])) violations.push(`MISSING_${key.toUpperCase()}`);
  }
  if (!isStringArray(o.strategicConcepts, 1)) violations.push("MISSING_STRATEGIC_CONCEPTS");
  if (!Array.isArray(o.packages) || o.packages.length < 1) violations.push("MISSING_PACKAGES");
  if (!Array.isArray(o.winArchitecture) || o.winArchitecture.length < 1) violations.push("MISSING_WIN_ARCHITECTURE");
  if (!Array.isArray(o.functionalBudgets) || o.functionalBudgets.length < 3) violations.push("MISSING_FUNCTIONAL_BUDGETS");
  if (!isStringArray(o.weaknesses, 1)) violations.push("MISSING_WEAKNESSES");
  if (!isStringArray(o.strengths, 1)) violations.push("MISSING_STRENGTHS");
  if (!isStringArray(o.bracketConstructionGuidance, 1)) violations.push("MISSING_BRACKET_GUIDANCE");
  if (!Array.isArray(o.researchSeeds)) violations.push("MISSING_RESEARCH_SEEDS");
  if (!o.bracketContract || typeof o.bracketContract !== "object") violations.push("MISSING_BRACKET_CONTRACT");

  if (violations.length) throw new SolBlueprintSchemaInvalidV417(violations);

  const packages = (o.packages as PackageBlueprintV417[]).map((pkg) => ({
    ...pkg,
    minimumPhysicalContribution: pkg.minimumPhysicalContribution ?? pkg.minimumPhysicalSlots,
    preferredPhysicalContribution: pkg.preferredPhysicalContribution ?? pkg.preferredPhysicalSlots,
    requirementGroups: pkg.requirementGroups ?? [],
    relatedRequirementIds: pkg.relatedRequirementIds ?? [],
    status: pkg.status ?? "OPEN",
    selectedCardIds: pkg.selectedCardIds ?? [],
  }));

  for (const win of o.winArchitecture as WinArchitectureBlueprintV417[]) {
    if (win.status === "VERIFIED" && !win.mechanicallyVerified) {
      violations.push(`WIN_VERIFIED_WITHOUT_MECHANICAL:${win.planId}`);
    }
  }
  if (violations.length) throw new SolBlueprintSchemaInvalidV417(violations);

  return {
    version: PROFESSOR_SOL_BLUEPRINT_PROPOSAL_V4_17_V1_VERSION,
    strategicThesis: o.strategicThesis as string,
    primaryStrategy: o.primaryStrategy as string,
    secondaryStrategy: o.secondaryStrategy as string,
    commanderExploit: o.commanderExploit as string,
    independentEngine: o.independentEngine as string,
    expectedPlayPattern: o.expectedPlayPattern as string,
    strategicConcepts: o.strategicConcepts as string[],
    packages,
    winArchitecture: o.winArchitecture as WinArchitectureBlueprintV417[],
    functionalBudgets: (o.functionalBudgets as FunctionalBudgetV417[]).map((b) =>
      normalizeFunctionalBudgetEntryV417(b as FunctionalBudgetV417 & Record<string, unknown>),
    ),
    accessNeeds: (o.accessNeeds as string[]) ?? [],
    protectionNeeds: (o.protectionNeeds as string[]) ?? [],
    weaknesses: o.weaknesses as string[],
    strengths: o.strengths as string[],
    dependencies: (o.dependencies as string[]) ?? [],
    bracketConstructionGuidance: o.bracketConstructionGuidance as string[],
    researchSeeds: o.researchSeeds as string[],
    bracketContract: o.bracketContract as BracketContractBlueprintV417,
  };
}

export function solProposalToStrategy(proposal: SolBlueprintProposalV417): StrategyBlueprintV417 {
  return {
    primaryStrategy: proposal.primaryStrategy,
    secondaryStrategy: proposal.secondaryStrategy,
    commanderExploit: proposal.commanderExploit,
    independentEngine: proposal.independentEngine,
    expectedPlayPattern: proposal.expectedPlayPattern,
    strategicThesis: proposal.strategicThesis,
    strengths: proposal.strengths,
    weaknesses: proposal.weaknesses,
    dependencies: proposal.dependencies,
    protectionNeeds: proposal.protectionNeeds,
    accessNeeds: proposal.accessNeeds,
    researchSeeds: proposal.researchSeeds,
  };
}
