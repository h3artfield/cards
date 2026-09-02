/**
 * Professor v4.17 — bounded live Sol blueprint call with telemetry.
 */
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import type { CommanderBlueprintV417, UserIntentBlueprintV417, BrewBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import { bracketQualityContractV417, PROFESSOR_BREW_BLUEPRINT_V4_17_V1_VERSION } from "./professor-brew-blueprint-v4-17-v1";
import {
  buildSolBlueprintUserPromptV417,
  SOL_BLUEPRINT_SYSTEM_PROMPT_V417,
  type SolBlueprintPromptInputV417,
} from "./professor-sol-blueprint-contract-v4-17-v1";
import {
  SOL_BLUEPRINT_PROPOSAL_JSON_SCHEMA,
  validateSolBlueprintProposalV417,
  SolBlueprintSchemaInvalidV417,
  solProposalToStrategy,
  type SolBlueprintProposalV417,
} from "./professor-sol-blueprint-proposal-v4-17-v1";
import { normalizeSolConceptsV417 } from "./professor-semantic-concept-normalizer-v4-17-v1";
import { materializeRequirementsFromBlueprintV417 } from "./professor-requirement-materializer-v4-17-v1";
import {
  assessBlueprintSlotFeasibilityV417,
  auditBlueprintConsistencyV417,
  defaultConsistencyAuditV417,
  defaultSlotFeasibilityV417,
} from "./professor-blueprint-feasibility-v4-17-v1";
import {
  createModelTelemetryCollector,
  type OpenAiUsageV4151,
} from "./professor-model-telemetry-v4-15-1-v1";
import { coerceSolBlueprintProposalRawV417 } from "./professor-sol-blueprint-coercion-v4-17-v1";
import {
  materializeFunctionalDensityRequirementsV417,
  refreshBlueprintFunctionalDensityV417,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";

export const PROFESSOR_SOL_BLUEPRINT_LIVE_V4_17_V1_VERSION = "professor-sol-blueprint-live-v4-17-v1";

export type LiveSolBlueprintTelemetryV417 = {
  model: string;
  callId: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
};

export type LiveSolBlueprintResultV417 = {
  proposal: SolBlueprintProposalV417 | null;
  telemetry: LiveSolBlueprintTelemetryV417;
  rawParsed: Record<string, unknown>;
  schemaFailure: SolBlueprintSchemaInvalidV417 | null;
  apiFailure: string | null;
};

export function liveSolBlueprintEnabledV417(): boolean {
  return process.env.PROFESSOR_V4_17_LIVE_SOL === "1" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

function usageFields(usage: OpenAiUsageV4151 | null): Omit<LiveSolBlueprintTelemetryV417, "model" | "callId" | "latencyMs"> {
  return {
    inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? null,
    outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? null,
    reasoningTokens: usage?.reasoningTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
  };
}

export async function runLiveSolBlueprintV417(
  input: SolBlueprintPromptInputV417,
): Promise<LiveSolBlueprintResultV417> {
  if (!liveSolBlueprintEnabledV417()) {
    throw new Error("LIVE_SOL_NOT_ENABLED — set PROFESSOR_V4_17_LIVE_SOL=1 and OPENAI_API_KEY");
  }
  const userContent = buildSolBlueprintUserPromptV417(input);
  const semanticBlock = input.semanticCommanderProfile
    ? `\n\nSemantic commander profile:\n${JSON.stringify(input.semanticCommanderProfile, null, 2)}`
    : "";
  const { collector } = createModelTelemetryCollector({ plannedCalls: 1 });
  const startedAt = Date.now();
  try {
    const { parsed, model, usage, callId } = await callHeadProfessorJsonV48<Record<string, unknown>>({
      system: SOL_BLUEPRINT_SYSTEM_PROMPT_V417,
      userContent: userContent + semanticBlock,
      jsonSchema: SOL_BLUEPRINT_PROPOSAL_JSON_SCHEMA,
      schemaName: "sol_blueprint_proposal_v417",
      useJsonSchema: true,
      liveFast: true,
      telemetry: { collector, purpose: "ARCHITECTURE_ANALYSIS", planned: true },
    });
    const latencyMs = Date.now() - startedAt;
    try {
      const coerced = coerceSolBlueprintProposalRawV417(parsed, { requestedBracket: input.requestedBracket });
      const proposal = validateSolBlueprintProposalV417(coerced);
      return {
        proposal,
        telemetry: { model, callId, latencyMs, ...usageFields(usage) },
        rawParsed: coerced,
        schemaFailure: null,
        apiFailure: null,
      };
    } catch (err) {
      return {
        proposal: null,
        telemetry: { model, callId, latencyMs, ...usageFields(usage) },
        rawParsed: coerceSolBlueprintProposalRawV417(parsed, { requestedBracket: input.requestedBracket }),
        schemaFailure: err instanceof SolBlueprintSchemaInvalidV417 ? err : new SolBlueprintSchemaInvalidV417([String(err)]),
        apiFailure: null,
      };
    }
  } catch (err) {
    return {
      proposal: null,
      telemetry: {
        model: "unknown",
        callId: null,
        latencyMs: Date.now() - startedAt,
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        totalTokens: null,
      },
      rawParsed: {},
      schemaFailure: null,
      apiFailure: err instanceof Error ? err.message : String(err),
    };
  }
}

export function buildBlueprintFromSolProposalV417(args: {
  commander: CommanderBlueprintV417;
  userIntent: UserIntentBlueprintV417;
  proposal: SolBlueprintProposalV417;
  blueprintRevisionId?: number;
}): BrewBlueprintV417 {
  const bracket = args.userIntent.bracket;
  const revisionId = args.blueprintRevisionId ?? 0;
  const normalizedConcepts = normalizeSolConceptsV417(args.proposal.strategicConcepts);
  const openRequirements = materializeRequirementsFromBlueprintV417({
    proposal: args.proposal,
    commanderColorIdentity: args.commander.colorIdentity,
    requestedBracket: bracket,
  }).map((r) => ({ ...r, blueprintRevisionId: revisionId }));

  const packages = args.proposal.packages.map((pkg) => ({
    ...pkg,
    minimumPhysicalContribution: pkg.minimumPhysicalContribution ?? pkg.minimumPhysicalSlots,
    preferredPhysicalContribution: pkg.preferredPhysicalContribution ?? pkg.preferredPhysicalSlots,
    requirementGroups: pkg.requirementGroups ?? [],
    relatedRequirementIds: [
      ...new Set([
        ...(pkg.relatedRequirementIds ?? []),
        ...(pkg.requirementGroups?.flatMap((g) => g.relatedRequirementIds) ?? []),
        ...openRequirements.filter((r) => r.packageIds.includes(pkg.packageId)).map((r) => r.requirementId),
      ]),
    ],
  }));

  const blueprint: BrewBlueprintV417 = {
    version: PROFESSOR_BREW_BLUEPRINT_V4_17_V1_VERSION,
    commander: args.commander,
    userIntent: args.userIntent,
    bracketContract: {
      ...args.proposal.bracketContract,
      qualityContract: bracketQualityContractV417(bracket),
    },
    strategy: solProposalToStrategy(args.proposal),
    normalizedConcepts,
    winArchitecture: args.proposal.winArchitecture.map((w) =>
      w.status === "VERIFIED" && !w.mechanicallyVerified ? { ...w, status: "HYPOTHESIZED" as const } : w,
    ),
    packages,
    functionalBudgets: args.proposal.functionalBudgets,
    openRequirements,
    selectedCards: [],
    packageDensityStates: [],
    functionalDensityStates: [],
    flexEntryTelemetry: null,
    physicalSlotBudget: {
      expectedNonlands: 64,
      selectedNonlands: 0,
      remainingNonlandSlots: 64,
      expectedLands: 35,
      selectedLands: 0,
      remainingLandSlots: 35,
    },
    manaPlan: { landTarget: 35, colorRequirements: {}, utilityLands: [], selectedLands: [] },
    slotFeasibility: defaultSlotFeasibilityV417(),
    consistencyAudit: defaultConsistencyAuditV417(),
    validation: {
      allSelectedCardsHavePrimaryRequirement: true,
      allSelectedCardsConsumeOnePhysicalSlot: true,
      openRequirementCount: openRequirements.length,
      satisfiedRequirementCount: 0,
      corePackagesSatisfied: false,
      winArchitectureVerified: false,
      structurallyReadyForMana: false,
      violations: [],
    },
    revisionHistory: [{ revision: revisionId, summary: "Sol blueprint generation", changedRequirementIds: [], changedPackageIds: [] }],
  };
  blueprint.slotFeasibility = assessBlueprintSlotFeasibilityV417(blueprint);
  blueprint.consistencyAudit = auditBlueprintConsistencyV417({ blueprint, proposal: args.proposal });
  return materializeFunctionalDensityRequirementsV417(refreshBlueprintFunctionalDensityV417(blueprint));
}
