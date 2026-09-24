/**
 * Full Professor vs Dumb Professor A/B v1 — frozen initial context, blind comparison, offline validation.
 */
import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StrategyHypothesisV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import {
  buildValidatorContextV3FromPlanning,
  validateProfessorPlanLensCoverageV3,
  validateProfessorPlanOutputV3,
  resetValidatorIssueCounterV3,
} from "../../src/lib/deck-synthesis/strategy-package-validator-v3";
import { syncContextFromRunLedger } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import { buildProfessorPlanningContextV3 } from "./phase6a1-professor-plan-context-builder-v3";
import {
  runProfessorPlanCaseV3Orchestration,
  type ProfessorCaseOrchestrationRecordV3,
  type ProfessorV3ModelCallerInput,
} from "./phase6a1-professor-plan-agent-v3";
import { normalizeProfessorPlanningResponseV3 } from "./phase6a1-professor-plan-normalizer-v3";
import { loadProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import { buildProfessorV3BudgetTelemetryContextFromPlanningContext, computeProfessorV3BudgetTelemetryV1 } from "./phase6a1-professor-v3-budget-telemetry-v1";
import type { ProfessorV3BudgetTelemetryV1 } from "./phase6a1-professor-v3-budget-telemetry-v1";
import {
  createProfessorV3ModelCallBudgetGuardV1,
  wrapProfessorV3ModelCallerWithBudgetV1,
} from "./phase6a1-professor-v3-model-call-budget-v1";
import { createProfessorV3ModelCallerV4, type ProfessorV3ModelCallerBoundaryResultV4 } from "./phase6a1-professor-v3-model-caller-v4";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./phase6a1-professor-v3-model-attempt-artifacts-v3";
import { buildProfessorV3PromptPayload } from "./phase6a1-professor-v3-prompt-payload-v1";
import { formatProfessorV3BoundedOutputContractForPromptV3 } from "./phase6a1-professor-v3-plan-output-schema-v3";
import { assertProfessorV3SuccessorRagPreflightBeforeModelV1 } from "./phase6a1-professor-v3-successor-rag-preflight-v1";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { getImplementedMechanismCatalog } from "./phase6a1-implemented-mechanism-catalog-v1";
import type { ImplementedMechanismCatalogEntry } from "./phase6a1-implemented-mechanism-catalog-v1";
import {
  getPilotMechanismCatalogEntry,
  loadSpentPilotMechanismTruthSupplement,
} from "./phase6a1-spent-pilot-truth-loader-v1";

export const PROFESSOR_V3_FULL_VS_DUMB_AB_V1_VERSION = "phase6a1-professor-v3-full-vs-dumb-ab-v1";
export const PROFESSOR_V3_FULL_VS_DUMB_AB_V1_DECISION = "PROFESSOR_V3_FULL_VS_DUMB_PROFESSOR_AB_V1_AUTHORIZED";

export const PROFESSOR_V3_AB_COMMANDER_CANDIDATE_ORDER_V1 = [
  "Marchesa, the Black Rose",
  "Brago, King Eternal",
  "Obeka, Brute Chronologist",
  "Mizzix of the Izmagnus",
  "Meren of Clan Nel Toth",
] as const;

export const PROFESSOR_V3_AB_SPENT_COMMANDER_NAMES_V1 = [
  "Muldrotha, the Gravetide",
  "Korvold, Fae-Cursed King",
  "Yuriko, the Tiger's Shadow",
  "Zada, Hedron Grinder",
  "Chatterfang, Squirrel General",
] as const;

export const DUMB_PROFESSOR_SYSTEM_PROMPT_V1 = `You are an expert Magic: The Gathering Commander deck-building strategist. Analyze the supplied commander using its canonical Oracle text, mechanism facts, rules evidence, and retrieved Commander knowledge.

Determine the strongest coherent ways to exploit the commander's mechanics. Reason from mechanics to required game states, then to engines, payoffs, interaction, resilience, and win conditions.

Distinguish:
strategies fundamentally dependent on the commander;
strategies enhanced by the commander but still functional without it;
commander-independent engines that support the deck;
important synergies between these packages.

Avoid superficial tribal/theme recommendations unless they are mechanically justified.

Prefer mechanically meaningful and non-obvious interactions over generic Commander advice.

Ground specific mechanical claims in the supplied evidence. If evidence is insufficient for a card-specific mechanic, do not invent it.

Produce your best complete strategy plan in one response.`;

const DUMB_PROFESSOR_ONE_SHOT_INSTRUCTION_V1 = [
  "Produce exactly one PLAN response.",
  "Use responseKind=PLAN, toolRequests=[], and exactly four strategyHypotheses covering all required strategic lenses.",
  "Do not request tools or additional evidence.",
  "Ground every mechanical claim in the supplied evidence below.",
].join("\n");

export type ProfessorV3AbOutputTargetsV1 = {
  rootDir: string;
  subjectSelection: string;
  frozenInitialContext: string;
  fullProfessorArm: string;
  dumbProfessorArm: string;
  candidateA: string;
  candidateB: string;
  armMapping: string;
  report: string;
  modelAttemptsDir: string;
};

export function resolveProfessorV3AbOutputTargetsV1(milestonesDir: string = MILESTONES): ProfessorV3AbOutputTargetsV1 {
  const rootDir = resolve(milestonesDir, "phase6a1-professor-v3-ab-v1");
  return {
    rootDir,
    subjectSelection: resolve(milestonesDir, "phase6a1-professor-v3-ab-v1-subject-selection-v1.json"),
    frozenInitialContext: resolve(milestonesDir, "phase6a1-professor-v3-ab-v1-frozen-initial-context-v1.json"),
    fullProfessorArm: resolve(milestonesDir, "phase6a1-professor-v3-ab-v1-full-professor-arm-v1.json"),
    dumbProfessorArm: resolve(milestonesDir, "phase6a1-professor-v3-ab-v1-dumb-professor-arm-v1.json"),
    candidateA: resolve(milestonesDir, "phase6a1-professor-v3-ab-v1-candidate-A-v1.json"),
    candidateB: resolve(milestonesDir, "phase6a1-professor-v3-ab-v1-candidate-B-v1.json"),
    armMapping: resolve(milestonesDir, "professor-v3-ab-v1-arm-mapping.json"),
    report: resolve(milestonesDir, "phase6a1-professor-v3-ab-v1-report-v1.json"),
    modelAttemptsDir: resolve(rootDir, "phase6a1-professor-v3-ab-v1-model-attempts-v1"),
  };
}

function findCatalogEntryByCommanderName(commanderName: string): ImplementedMechanismCatalogEntry | undefined {
  for (const entry of getImplementedMechanismCatalog()) {
    if (entry.commanders.includes(commanderName)) return entry;
  }
  for (const c of loadSpentPilotMechanismTruthSupplement().cases) {
    if (c.commanders.includes(commanderName)) return getPilotMechanismCatalogEntry(c.caseId);
  }
  for (const caseId of ["multi-yuriko", "multi-zada", "multi-chatterfang"] as const) {
    const entry = getPilotMechanismCatalogEntry(caseId);
    if (entry?.commanders.includes(commanderName)) return entry;
  }
  return undefined;
}

export function selectProfessorV3AbCommanderV1(): {
  commanderName: string;
  mechanismTruthCaseId: string;
  entry: ImplementedMechanismCatalogEntry;
  candidateOrderIndex: number;
  skippedCandidates: Array<{ commanderName: string; reason: string }>;
} {
  const skippedCandidates: Array<{ commanderName: string; reason: string }> = [];
  for (let i = 0; i < PROFESSOR_V3_AB_COMMANDER_CANDIDATE_ORDER_V1.length; i += 1) {
    const commanderName = PROFESSOR_V3_AB_COMMANDER_CANDIDATE_ORDER_V1[i];
    if ((PROFESSOR_V3_AB_SPENT_COMMANDER_NAMES_V1 as readonly string[]).includes(commanderName)) {
      skippedCandidates.push({ commanderName, reason: "SPENT_COMMANDER_EXCLUDED" });
      continue;
    }
    const entry = findCatalogEntryByCommanderName(commanderName);
    if (!entry) {
      skippedCandidates.push({ commanderName, reason: "NOT_SUPPORTED_BY_MECHANISM_TRUTH_CATALOG" });
      continue;
    }
    if ((PROFESSOR_V3_AB_SPENT_COMMANDER_NAMES_V1 as readonly string[]).some((spent) => entry.commanders.includes(spent))) {
      skippedCandidates.push({ commanderName, reason: "MECHANISM_TRUTH_CASE_MARKED_SPENT" });
      continue;
    }
    return {
      commanderName,
      mechanismTruthCaseId: entry.caseId,
      entry,
      candidateOrderIndex: i,
      skippedCandidates,
    };
  }
  throw new Error("FAIL_CLOSED: no supported commander available from authorized candidate order");
}

export function freezeProfessorPlanningContextV3(ctx: ProfessorPlanningContextV3): ProfessorPlanningContextV3 {
  return JSON.parse(JSON.stringify(ctx)) as ProfessorPlanningContextV3;
}

export function computeProfessorV3InitialContextShaV1(ctx: ProfessorPlanningContextV3): {
  modelVisibleTextSha256: string;
  evidenceLedgerSha256: string;
  promptPayload: ReturnType<typeof buildProfessorV3PromptPayload>;
} {
  const promptPayload = buildProfessorV3PromptPayload(ctx);
  return {
    modelVisibleTextSha256: createHash("sha256").update(promptPayload.modelVisibleText, "utf8").digest("hex"),
    evidenceLedgerSha256: createHash("sha256").update(JSON.stringify(promptPayload.evidenceLedger), "utf8").digest("hex"),
    promptPayload,
  };
}

function formatReadableStrategyPlan(hypotheses: StrategyHypothesisV3[]): string {
  return hypotheses
    .map((hyp, index) => {
      const packages = hyp.packages
        .map(
          (pkg) =>
            `  - Package ${pkg.packageId} (${pkg.commanderDependency}): ${pkg.title}\n    Claim: ${pkg.strategicClaim}\n    Roles: ${(pkg.functionalRoles ?? []).join(", ") || "(none)"}`,
        )
        .join("\n");
      const assertions = (hyp.strategicAssertions ?? [])
        .map((a) => `  - [${a.assertionId}] ${a.predicate}/${a.action ?? "null"}: ${a.statement}`)
        .join("\n");
      return [
        `### Lens ${index + 1}: ${hyp.lens} — ${hyp.title}`,
        `Commander dependency: ${hyp.commanderDependency}`,
        `Strategic claim: ${hyp.strategicClaim}`,
        `Causal reasoning: ${hyp.causalReasoning}`,
        "",
        "Packages:",
        packages || "  (none)",
        "",
        "Strategic assertions:",
        assertions || "  (none)",
        "",
        `Strengths: ${(hyp.strengths ?? []).join("; ") || "(none)"}`,
        `Vulnerabilities: ${(hyp.vulnerabilities ?? []).join("; ") || "(none)"}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

type ValidatorSummaryV1 = {
  assertionOutcomes: Record<string, number>;
  totalAssertions: number;
  acceptedAssertions: number;
  rejectedAssertions: number;
  incompleteAssertions: number;
  harmonyValid: boolean;
  inventedMechanics: number;
  lensCoverageIssueCount: number;
  results: ReturnType<typeof validateProfessorPlanOutputV3>;
  lensCoverageIssues: ReturnType<typeof validateProfessorPlanLensCoverageV3>;
};

function summarizeValidatorResults(args: {
  ctx: ProfessorPlanningContextV3;
  hypotheses: StrategyHypothesisV3[];
}): ValidatorSummaryV1 {
  resetValidatorIssueCounterV3();
  const validatorCtx = buildValidatorContextV3FromPlanning(args.ctx);
  const results = validateProfessorPlanOutputV3(validatorCtx, { strategyHypotheses: args.hypotheses });
  const lensCoverageIssues = validateProfessorPlanLensCoverageV3(args.hypotheses);
  const assertionOutcomes: Record<string, number> = {};
  let totalAssertions = 0;
  let acceptedAssertions = 0;
  let rejectedAssertions = 0;
  let incompleteAssertions = 0;
  let inventedMechanics = 0;
  let harmonyValid = true;

  for (const result of results) {
    assertionOutcomes[result.outcome] = (assertionOutcomes[result.outcome] ?? 0) + 1;
    if (result.outcome === "GROUNDED" || result.outcome === "GROUNDED_WITH_CONSTRAINT") {
      acceptedAssertions += 1;
    } else if (result.outcome === "PARTIALLY_GROUNDED") {
      incompleteAssertions += 1;
    } else {
      rejectedAssertions += 1;
    }
    totalAssertions += 1;
    for (const issue of result.issues) {
      if (issue.code.includes("INVENTED")) inventedMechanics += 1;
      if (issue.code.includes("ASSERTION_INCOMPLETE")) incompleteAssertions += 1;
      if (issue.code.includes("HARMONY")) harmonyValid = false;
    }
    if (result.failedChecks.some((check) => check.toLowerCase().includes("harmony"))) harmonyValid = false;
  }

  return {
    assertionOutcomes,
    totalAssertions,
    acceptedAssertions,
    rejectedAssertions,
    incompleteAssertions,
    harmonyValid: harmonyValid && lensCoverageIssues.length === 0,
    inventedMechanics,
    lensCoverageIssueCount: lensCoverageIssues.length,
    results,
    lensCoverageIssues,
  };
}

type ModelUsageAggregateV1 = {
  modelCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  toolCalls: number;
  wallTimeMs: number;
  attemptTelemetries: ProfessorV3BudgetTelemetryV1[];
};

function aggregateModelUsage(args: {
  attemptTelemetries: ProfessorV3BudgetTelemetryV1[];
  toolCalls: number;
  wallTimeMs: number;
}): ModelUsageAggregateV1 {
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let hasInput = false;
  let hasOutput = false;
  let hasReasoning = false;
  for (const telemetry of args.attemptTelemetries) {
    if (telemetry.inputTokens != null) {
      hasInput = true;
      inputTokens += telemetry.inputTokens;
    }
    const attemptOutput =
      telemetry.visibleGeneratedTokens != null && telemetry.reasoningTokens != null
        ? telemetry.visibleGeneratedTokens + telemetry.reasoningTokens
        : telemetry.visibleGeneratedTokens;
    if (attemptOutput != null) {
      hasOutput = true;
      outputTokens += attemptOutput;
    }
    if (telemetry.reasoningTokens != null) {
      hasReasoning = true;
      reasoningTokens += telemetry.reasoningTokens;
    }
  }
  return {
    modelCalls: args.attemptTelemetries.length,
    inputTokens: hasInput ? inputTokens : null,
    outputTokens: hasOutput ? outputTokens : null,
    reasoningTokens: hasReasoning ? reasoningTokens : null,
    totalTokens: hasInput && hasOutput ? inputTokens + outputTokens : null,
    toolCalls: args.toolCalls,
    wallTimeMs: args.wallTimeMs,
    attemptTelemetries: args.attemptTelemetries,
  };
}

function collectMechanicalAssertions(hypotheses: StrategyHypothesisV3[]) {
  return hypotheses.flatMap((hyp) =>
    (hyp.strategicAssertions ?? []).map((assertion) => ({
      hypothesisId: hyp.hypothesisId,
      lens: hyp.lens,
      ...assertion,
    })),
  );
}

function buildCandidateArtifact(args: {
  candidateId: "A" | "B";
  readableStrategyPlan: string;
  generatedArtifact: unknown;
  mechanicalAssertions: ReturnType<typeof collectMechanicalAssertions>;
  validatorSummary: ValidatorSummaryV1;
  strategyHypotheses: StrategyHypothesisV3[];
  toolRetrievalEvidence: Array<Record<string, unknown>>;
  usage: ModelUsageAggregateV1;
}) {
  return {
    version: "phase6a1-professor-v3-ab-v1-candidate-v1",
    candidateId: args.candidateId,
    readableStrategyPlan: args.readableStrategyPlan,
    generatedArtifact: args.generatedArtifact,
    strategyHypotheses: args.strategyHypotheses,
    mechanicalAssertions: args.mechanicalAssertions,
    validatorResults: args.validatorSummary.results,
    validatorSummary: {
      assertionOutcomes: args.validatorSummary.assertionOutcomes,
      totalAssertions: args.validatorSummary.totalAssertions,
      acceptedAssertions: args.validatorSummary.acceptedAssertions,
      rejectedAssertions: args.validatorSummary.rejectedAssertions,
      incompleteAssertions: args.validatorSummary.incompleteAssertions,
      harmonyValid: args.validatorSummary.harmonyValid,
      inventedMechanics: args.validatorSummary.inventedMechanics,
      lensCoverageIssueCount: args.validatorSummary.lensCoverageIssueCount,
    },
    groundingFailures: args.validatorSummary.results.flatMap((r) => r.issues),
    strategyLenses: args.strategyHypotheses.map((h) => h.lens),
    packages: args.strategyHypotheses.flatMap((h) => h.packages),
    toolRetrievalEvidenceUsed: args.toolRetrievalEvidence,
    usage: {
      modelCalls: args.usage.modelCalls,
      inputTokens: args.usage.inputTokens,
      outputTokens: args.usage.outputTokens,
      reasoningTokens: args.usage.reasoningTokens,
      totalTokens: args.usage.totalTokens,
      toolCalls: args.usage.toolCalls,
      wallTimeMs: args.usage.wallTimeMs,
    },
  };
}

function computeProfessorV3BudgetTelemetryFromEnvelope(args: {
  modelPin: ReturnType<typeof loadProfessorModelPinV2>;
  systemInstructions: string;
  userContent: string;
  frozenCtx: ProfessorPlanningContextV3;
  envelope: {
    usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
  };
}): ProfessorV3BudgetTelemetryV1 {
  return computeProfessorV3BudgetTelemetryV1({
    systemInstructions: args.systemInstructions,
    userContent: args.userContent,
    maxOutputTokens: args.modelPin.inferenceParameters.maxCompletionTokens,
    ...buildProfessorV3BudgetTelemetryContextFromPlanningContext(args.frozenCtx),
    envelope: args.envelope as Parameters<typeof computeProfessorV3BudgetTelemetryV1>[0]["envelope"],
  });
}

export async function runProfessorV3FullVsDumbAbV1(args?: {
  milestonesDir?: string;
  execute?: boolean;
}): Promise<{
  executed: boolean;
  selection: ReturnType<typeof selectProfessorV3AbCommanderV1>;
  initialContextSha256: string;
  fullInitialContextSha256: string;
  dumbInitialContextSha256: string;
  targets: ProfessorV3AbOutputTargetsV1;
  reportForUser: Record<string, unknown>;
}> {
  const milestonesDir = args?.milestonesDir ?? MILESTONES;
  const targets = resolveProfessorV3AbOutputTargetsV1(milestonesDir);
  const selection = selectProfessorV3AbCommanderV1();
  const experimentCaseId = `professor-v3-ab-v1-${selection.mechanismTruthCaseId}`;

  const subjectSelectionArtifact = {
    version: "phase6a1-professor-v3-ab-v1-subject-selection-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_FULL_VS_DUMB_AB_V1_DECISION,
    candidateOrder: [...PROFESSOR_V3_AB_COMMANDER_CANDIDATE_ORDER_V1],
    spentCommandersExcluded: [...PROFESSOR_V3_AB_SPENT_COMMANDER_NAMES_V1],
    skippedCandidates: selection.skippedCandidates,
    selected: {
      commanderName: selection.commanderName,
      mechanismTruthCaseId: selection.mechanismTruthCaseId,
      candidateOrderIndex: selection.candidateOrderIndex,
      experimentCaseId,
    },
    spentStatus: "UNSPENT_UNTIL_FIRST_OPENAI_CALL",
    firstOpenAiCallAt: null as string | null,
  };
  writeFileSync(targets.subjectSelection, JSON.stringify(subjectSelectionArtifact, null, 2));

  if (!args?.execute) {
    return {
      executed: false,
      selection,
      initialContextSha256: "(not computed — dry run)",
      fullInitialContextSha256: "(not computed — dry run)",
      dumbInitialContextSha256: "(not computed — dry run)",
      targets,
      reportForUser: {
        version: PROFESSOR_V3_FULL_VS_DUMB_AB_V1_VERSION,
        decision: PROFESSOR_V3_FULL_VS_DUMB_AB_V1_DECISION,
        dryRun: true,
        selectedCommander: selection.commanderName,
        mechanismTruthCaseId: selection.mechanismTruthCaseId,
        subjectSelectionArtifact: targets.subjectSelection,
        note: "Re-run with --execute to perform the A/B experiment.",
      },
    };
  }

  mkdirSync(targets.rootDir, { recursive: true });
  mkdirSync(targets.modelAttemptsDir, { recursive: true });

  type LoadedFullArm = {
    orchestration: ProfessorCaseOrchestrationRecordV3;
    readableStrategyPlan: string | null;
    validatorSummary: ValidatorSummaryV1;
    usage: ModelUsageAggregateV1;
    initialContextSha256: string;
  };

  let frozenCtx: ProfessorPlanningContextV3;
  let fullInitialContextSha256: string;
  let dumbInitialContextSha256: string;

  if (existsSync(targets.frozenInitialContext)) {
    const frozenArtifact = JSON.parse(readFileSync(targets.frozenInitialContext, "utf8")) as {
      frozenPlanningContext: ProfessorPlanningContextV3;
      fullInitialContextSha256: string;
      dumbInitialContextSha256: string;
    };
    frozenCtx = frozenArtifact.frozenPlanningContext;
    fullInitialContextSha256 = frozenArtifact.fullInitialContextSha256;
    dumbInitialContextSha256 = frozenArtifact.dumbInitialContextSha256;
  } else {
    const builtCtx = await buildProfessorPlanningContextV3({
      entry: selection.entry,
      oppCase: null,
      options: { includeMechanicalAffordances: true },
    });
    builtCtx.caseId = experimentCaseId;
    assertProfessorV3SuccessorRagPreflightBeforeModelV1(builtCtx);
    frozenCtx = freezeProfessorPlanningContextV3(builtCtx);
    const initialContext = computeProfessorV3InitialContextShaV1(frozenCtx);
    fullInitialContextSha256 = initialContext.modelVisibleTextSha256;
    dumbInitialContextSha256 = computeProfessorV3InitialContextShaV1(freezeProfessorPlanningContextV3(frozenCtx))
      .modelVisibleTextSha256;
    if (fullInitialContextSha256 !== dumbInitialContextSha256) {
      throw new Error(
        `FAIL_CLOSED: initial context SHA mismatch FULL=${fullInitialContextSha256} DUMB=${dumbInitialContextSha256}`,
      );
    }
    writeFileSync(
      targets.frozenInitialContext,
      JSON.stringify(
        {
          version: "phase6a1-professor-v3-ab-v1-frozen-initial-context-v1",
          generatedAt: new Date().toISOString(),
          decision: PROFESSOR_V3_FULL_VS_DUMB_AB_V1_DECISION,
          commanderName: selection.commanderName,
          mechanismTruthCaseId: selection.mechanismTruthCaseId,
          experimentCaseId,
          modelVisibleTextSha256: fullInitialContextSha256,
          evidenceLedgerSha256: initialContext.evidenceLedgerSha256,
          fullInitialContextSha256,
          dumbInitialContextSha256,
          initialContextShaMatch: true,
          frozenPlanningContext: frozenCtx,
          promptPayload: initialContext.promptPayload,
        },
        null,
        2,
      ),
    );
  }

  if (fullInitialContextSha256 !== dumbInitialContextSha256) {
    throw new Error(
      `FAIL_CLOSED: frozen initial context SHA mismatch FULL=${fullInitialContextSha256} DUMB=${dumbInitialContextSha256}`,
    );
  }

  const modelPin = loadProfessorModelPinV2();
  const experimentBudget = createProfessorV3ModelCallBudgetGuardV1(5);
  const fullBudget = createProfessorV3ModelCallBudgetGuardV1(4);
  const dumbBudget = createProfessorV3ModelCallBudgetGuardV1(1);
  let experimentAttemptIndex = 0;
  let firstOpenAiCallAt: string | null = subjectSelectionArtifact.firstOpenAiCallAt;

  const markSpentOnFirstOpenAiCall = () => {
    if (!firstOpenAiCallAt) {
      firstOpenAiCallAt = new Date().toISOString();
      subjectSelectionArtifact.firstOpenAiCallAt = firstOpenAiCallAt;
      subjectSelectionArtifact.spentStatus = "SPENT";
      writeFileSync(targets.subjectSelection, JSON.stringify(subjectSelectionArtifact, null, 2));
    }
  };

  const wrapWithBudgets = (
    caller: (input: ProfessorV3ModelCallerInput) => Promise<ProfessorV3ModelCallerBoundaryResultV4>,
    armBudget: ReturnType<typeof createProfessorV3ModelCallBudgetGuardV1>,
  ) => {
    const budgetWrapped = wrapProfessorV3ModelCallerWithBudgetV1({ modelCaller: caller, budgetGuard: armBudget });
    return async (input: ProfessorV3ModelCallerInput) => {
      experimentBudget.assertCallAllowed(experimentAttemptIndex);
      markSpentOnFirstOpenAiCall();
      const response = await budgetWrapped(input);
      experimentBudget.recordCallCompleted();
      experimentAttemptIndex += 1;
      return response;
    };
  };

  let loadedFullArm: LoadedFullArm | null = null;
  if (existsSync(targets.fullProfessorArm)) {
    const parsed = JSON.parse(readFileSync(targets.fullProfessorArm, "utf8")) as LoadedFullArm;
    loadedFullArm = parsed;
    experimentAttemptIndex = parsed.usage.modelCalls;
    for (let i = 0; i < parsed.usage.modelCalls; i += 1) experimentBudget.recordCallCompleted();
  }

  let fullOrchestration: ProfessorCaseOrchestrationRecordV3;
  let fullHypotheses: StrategyHypothesisV3[];
  let fullValidatorSummary: ValidatorSummaryV1;
  let fullUsage: ModelUsageAggregateV1;

  if (loadedFullArm) {
    fullOrchestration = loadedFullArm.orchestration;
    fullUsage = loadedFullArm.usage;
    const fullValidatorCtx = syncContextFromRunLedger(
      freezeProfessorPlanningContextV3(frozenCtx),
      fullOrchestration.runLedger,
    );
    fullHypotheses =
      fullOrchestration.normalization?.status === "SUCCESS" ? fullOrchestration.normalization.normalized : [];
    fullValidatorSummary =
      loadedFullArm.validatorSummary ??
      (fullHypotheses.length > 0
        ? summarizeValidatorResults({ ctx: fullValidatorCtx, hypotheses: fullHypotheses })
        : summarizeValidatorResults({ ctx: frozenCtx, hypotheses: [] }));
  } else {
    const fullAttemptTelemetries: ProfessorV3BudgetTelemetryV1[] = [];
    const fullRawCaller = createProfessorV3ModelCallerV4({
      modelPin,
      outputDir: resolve(targets.modelAttemptsDir, "full-professor"),
      relPrefix: "phase6a1-professor-v3-ab-v1-full-model-attempts-v1",
    });
    const fullModelCaller = wrapWithBudgets(async (input) => {
      const result = await fullRawCaller(input);
      if (result.budgetTelemetry) fullAttemptTelemetries.push(result.budgetTelemetry);
      return result;
    }, fullBudget);

    const fullStart = performance.now();
    fullOrchestration = await runProfessorPlanCaseV3Orchestration({
      ctx: freezeProfessorPlanningContextV3(frozenCtx),
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      requireLensCoverage: true,
      maxRepairRounds: modelPin.experimentBounds.maxValidationRepairRounds,
      toolBudget: {
        ...DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3,
        maxToolCalls: modelPin.experimentBounds.maxProfessorToolCalls,
        maxRetrievedEvidenceChunks: modelPin.experimentBounds.maxEvidenceChunks,
      },
      modelCaller: fullModelCaller as (input: ProfessorV3ModelCallerInput) => ReturnType<typeof fullModelCaller>,
    });
    const fullWallTimeMs = Math.round(performance.now() - fullStart);

    const fullValidatorCtx = syncContextFromRunLedger(
      freezeProfessorPlanningContextV3(frozenCtx),
      fullOrchestration.runLedger,
    );
    fullHypotheses =
      fullOrchestration.normalization?.status === "SUCCESS" ? fullOrchestration.normalization.normalized : [];
    fullValidatorSummary =
      fullHypotheses.length > 0
        ? summarizeValidatorResults({ ctx: fullValidatorCtx, hypotheses: fullHypotheses })
        : summarizeValidatorResults({ ctx: frozenCtx, hypotheses: [] });
    fullUsage = aggregateModelUsage({
      attemptTelemetries: fullAttemptTelemetries,
      toolCalls: fullOrchestration.professorToolCallCompletedCount ?? fullOrchestration.toolCalls.length,
      wallTimeMs: fullWallTimeMs,
    });

    writeFileSync(
      targets.fullProfessorArm,
      JSON.stringify(
        {
          version: "phase6a1-professor-v3-ab-v1-full-professor-arm-v1",
          generatedAt: new Date().toISOString(),
          arm: "FULL_PROFESSOR",
          caseStatus: fullOrchestration.caseStatus,
          executionStatus: fullOrchestration.executionStatus,
          orchestration: fullOrchestration,
          readableStrategyPlan: fullHypotheses.length ? formatReadableStrategyPlan(fullHypotheses) : null,
          validatorSummary: fullValidatorSummary,
          usage: fullUsage,
          initialContextSha256: fullInitialContextSha256,
        },
        null,
        2,
      ),
    );
  }

  type LoadedDumbArm = {
    normalization: ReturnType<typeof normalizeProfessorPlanningResponseV3>;
    rawModelResponse: { parsed?: unknown };
    readableStrategyPlan: string | null;
    validatorSummary: ValidatorSummaryV1;
    usage: ModelUsageAggregateV1;
    initialContextSha256: string;
  };

  const dumbAttemptDir = resolve(targets.modelAttemptsDir, "dumb-professor");
  const dumbParsedAttemptPath = resolve(dumbAttemptDir, "attempt-000-parsed-response.json");
  const dumbRawResponsePath = resolve(dumbAttemptDir, "attempt-000-api-response-raw.json");

  let dumbNormalization: ReturnType<typeof normalizeProfessorPlanningResponseV3>;
  let dumbHypotheses: StrategyHypothesisV3[];
  let dumbValidatorSummary: ValidatorSummaryV1;
  let dumbUsage: ModelUsageAggregateV1;
  let dumbModelResponseParsed: unknown;

  if (existsSync(targets.dumbProfessorArm)) {
    const loadedDumb = JSON.parse(readFileSync(targets.dumbProfessorArm, "utf8")) as LoadedDumbArm;
    dumbNormalization = loadedDumb.normalization;
    dumbHypotheses = dumbNormalization.status === "SUCCESS" ? dumbNormalization.normalized : [];
    dumbValidatorSummary = loadedDumb.validatorSummary;
    dumbUsage = loadedDumb.usage;
    dumbModelResponseParsed = loadedDumb.rawModelResponse?.parsed ?? loadedDumb.rawModelResponse;
    experimentAttemptIndex = Math.max(experimentAttemptIndex, (loadedFullArm?.usage.modelCalls ?? 0) + loadedDumb.usage.modelCalls);
  } else if (existsSync(dumbParsedAttemptPath)) {
    const parsedAttempt = JSON.parse(readFileSync(dumbParsedAttemptPath, "utf8")) as { parsed?: unknown };
    dumbModelResponseParsed = parsedAttempt.parsed ?? parsedAttempt;
    dumbNormalization = normalizeProfessorPlanningResponseV3({
      parsedModelResponse: dumbModelResponseParsed,
      ctx: frozenCtx,
    });
    dumbHypotheses = dumbNormalization.status === "SUCCESS" ? dumbNormalization.normalized : [];
    dumbValidatorSummary =
      dumbHypotheses.length > 0
        ? summarizeValidatorResults({ ctx: frozenCtx, hypotheses: dumbHypotheses })
        : summarizeValidatorResults({ ctx: frozenCtx, hypotheses: [] });

    let dumbTelemetry: ProfessorV3BudgetTelemetryV1 | null = null;
    if (existsSync(dumbRawResponsePath)) {
      const rawEnvelope = JSON.parse(readFileSync(dumbRawResponsePath, "utf8")) as {
        usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
      };
      const systemInstructions = existsSync(resolve(dumbAttemptDir, "attempt-000-system-instructions.txt"))
        ? readFileSync(resolve(dumbAttemptDir, "attempt-000-system-instructions.txt"), "utf8")
        : DUMB_PROFESSOR_SYSTEM_PROMPT_V1;
      const userContent = existsSync(resolve(dumbAttemptDir, "attempt-000-user-content.txt"))
        ? readFileSync(resolve(dumbAttemptDir, "attempt-000-user-content.txt"), "utf8")
        : buildProfessorV3PromptPayload(frozenCtx).modelVisibleText;
      dumbTelemetry = computeProfessorV3BudgetTelemetryFromEnvelope({
        modelPin,
        systemInstructions,
        userContent,
        frozenCtx,
        envelope: rawEnvelope,
      });
    }

    dumbUsage = aggregateModelUsage({
      attemptTelemetries: dumbTelemetry ? [dumbTelemetry] : [],
      toolCalls: 0,
      wallTimeMs: 0,
    });

    writeFileSync(
      targets.dumbProfessorArm,
      JSON.stringify(
        {
          version: "phase6a1-professor-v3-ab-v1-dumb-professor-arm-v1",
          generatedAt: new Date().toISOString(),
          arm: "DUMB_PROFESSOR",
          recoveredFromAttemptArtifacts: true,
          normalization: dumbNormalization,
          rawModelResponse: { parsed: dumbModelResponseParsed },
          readableStrategyPlan: dumbHypotheses.length ? formatReadableStrategyPlan(dumbHypotheses) : null,
          validatorSummary: dumbValidatorSummary,
          usage: dumbUsage,
          initialContextSha256: dumbInitialContextSha256,
        },
        null,
        2,
      ),
    );
  } else {
    mkdirSync(dumbAttemptDir, { recursive: true });
    const dumbAttemptTelemetries: ProfessorV3BudgetTelemetryV1[] = [];
    const dumbRawCaller = createProfessorV3ModelCallerV4({
      modelPin,
      outputDir: dumbAttemptDir,
      relPrefix: "phase6a1-professor-v3-ab-v1-dumb-model-attempts-v1",
      planOnly: true,
      omitToolGuidance: true,
    });
    const dumbModelCaller = wrapWithBudgets(async (input) => {
      const result = await dumbRawCaller(input);
      if (result.budgetTelemetry) dumbAttemptTelemetries.push(result.budgetTelemetry);
      return result;
    }, dumbBudget);

    const dumbPayload = buildProfessorV3PromptPayload(freezeProfessorPlanningContextV3(frozenCtx));
    if (createHash("sha256").update(dumbPayload.modelVisibleText, "utf8").digest("hex") !== fullInitialContextSha256) {
      throw new Error("FAIL_CLOSED: dumb arm prompt payload diverged from frozen initial context");
    }

    const dumbUserPayload = {
      ...dumbPayload,
      modelVisibleText: [DUMB_PROFESSOR_ONE_SHOT_INSTRUCTION_V1, "", dumbPayload.modelVisibleText].join("\n"),
    };

    const dumbStart = performance.now();
    const dumbModelResponse = await dumbModelCaller({
      attemptIndex: 0,
      systemPrompt: DUMB_PROFESSOR_SYSTEM_PROMPT_V1,
      userPayload: dumbUserPayload,
      afterToolResults: false,
      budgetTelemetryContext: buildProfessorV3BudgetTelemetryContextFromPlanningContext(frozenCtx),
    });
    const dumbWallTimeMs = Math.round(performance.now() - dumbStart);
    dumbModelResponseParsed = dumbModelResponse.parsed;

    dumbNormalization = normalizeProfessorPlanningResponseV3({
      parsedModelResponse: dumbModelResponse.parsed,
      ctx: frozenCtx,
    });
    dumbHypotheses = dumbNormalization.status === "SUCCESS" ? dumbNormalization.normalized : [];
    dumbValidatorSummary =
      dumbHypotheses.length > 0
        ? summarizeValidatorResults({ ctx: frozenCtx, hypotheses: dumbHypotheses })
        : summarizeValidatorResults({ ctx: frozenCtx, hypotheses: [] });

    dumbUsage = aggregateModelUsage({
      attemptTelemetries: dumbAttemptTelemetries,
      toolCalls: 0,
      wallTimeMs: dumbWallTimeMs,
    });

    writeFileSync(
      targets.dumbProfessorArm,
      JSON.stringify(
        {
          version: "phase6a1-professor-v3-ab-v1-dumb-professor-arm-v1",
          generatedAt: new Date().toISOString(),
          arm: "DUMB_PROFESSOR",
          normalization: dumbNormalization,
          rawModelResponse: dumbModelResponse,
          readableStrategyPlan: dumbHypotheses.length ? formatReadableStrategyPlan(dumbHypotheses) : null,
          validatorSummary: dumbValidatorSummary,
          usage: dumbUsage,
          initialContextSha256: dumbInitialContextSha256,
        },
        null,
        2,
      ),
    );
  }

  let candidateAArtifact: ReturnType<typeof buildCandidateArtifact>;
  let candidateBArtifact: ReturnType<typeof buildCandidateArtifact>;

  if (existsSync(targets.candidateA) && existsSync(targets.candidateB)) {
    candidateAArtifact = JSON.parse(readFileSync(targets.candidateA, "utf8")) as ReturnType<typeof buildCandidateArtifact>;
    candidateBArtifact = JSON.parse(readFileSync(targets.candidateB, "utf8")) as ReturnType<typeof buildCandidateArtifact>;
  } else {
    const fullCandidateBody = {
      readableStrategyPlan: fullHypotheses.length ? formatReadableStrategyPlan(fullHypotheses) : "",
      generatedArtifact: fullOrchestration,
      mechanicalAssertions: collectMechanicalAssertions(fullHypotheses),
      validatorSummary: fullValidatorSummary,
      strategyHypotheses: fullHypotheses,
      toolRetrievalEvidence: fullOrchestration.toolCalls.map((call) => ({ ...call })),
      usage: fullUsage,
    };
    const dumbCandidateBody = {
      readableStrategyPlan: dumbHypotheses.length ? formatReadableStrategyPlan(dumbHypotheses) : "",
      generatedArtifact: { normalization: dumbNormalization, rawModelResponse: dumbModelResponseParsed },
      mechanicalAssertions: collectMechanicalAssertions(dumbHypotheses),
      validatorSummary: dumbValidatorSummary,
      strategyHypotheses: dumbHypotheses,
      toolRetrievalEvidence: [],
      usage: dumbUsage,
    };

    const fullIsA = randomInt(2) === 0;
    candidateAArtifact = buildCandidateArtifact({
      candidateId: "A",
      ...(fullIsA ? fullCandidateBody : dumbCandidateBody),
    });
    candidateBArtifact = buildCandidateArtifact({
      candidateId: "B",
      ...(fullIsA ? dumbCandidateBody : fullCandidateBody),
    });

    writeFileSync(targets.candidateA, JSON.stringify(candidateAArtifact, null, 2));
    writeFileSync(targets.candidateB, JSON.stringify(candidateBArtifact, null, 2));
    writeFileSync(
      targets.armMapping,
      JSON.stringify(
        {
          version: "professor-v3-ab-v1-arm-mapping-v1",
          generatedAt: new Date().toISOString(),
          decision: PROFESSOR_V3_FULL_VS_DUMB_AB_V1_DECISION,
          commanderName: selection.commanderName,
          mechanismTruthCaseId: selection.mechanismTruthCaseId,
          randomAssignmentSeed: "crypto.randomInt",
          mapping: {
            candidateA: fullIsA ? "FULL_PROFESSOR" : "DUMB_PROFESSOR",
            candidateB: fullIsA ? "DUMB_PROFESSOR" : "FULL_PROFESSOR",
          },
          initialContextSha256: fullInitialContextSha256,
        },
        null,
        2,
      ),
    );
  }

  const reportForUser = {
    version: PROFESSOR_V3_FULL_VS_DUMB_AB_V1_VERSION,
    decision: PROFESSOR_V3_FULL_VS_DUMB_AB_V1_DECISION,
    commanderName: selection.commanderName,
    mechanismTruthCaseId: selection.mechanismTruthCaseId,
    initialContextSha256: fullInitialContextSha256,
    fullInitialContextSha256,
    dumbInitialContextSha256,
    initialContextShaMatch: fullInitialContextSha256 === dumbInitialContextSha256,
    totalModelCallsUsed: (loadedFullArm?.usage.modelCalls ?? 0) + dumbUsage.modelCalls,
    experimentModelBudget: 5,
    candidateA: candidateAArtifact,
    candidateB: candidateBArtifact,
    artifacts: {
      subjectSelection: targets.subjectSelection,
      frozenInitialContext: targets.frozenInitialContext,
      fullProfessorArm: targets.fullProfessorArm,
      dumbProfessorArm: targets.dumbProfessorArm,
      candidateA: targets.candidateA,
      candidateB: targets.candidateB,
      armMapping: targets.armMapping,
    },
    note: "Arm mapping withheld from this report — grade candidate A and B blind first.",
  };

  writeFileSync(targets.report, JSON.stringify(reportForUser, null, 2));

  return {
    executed: true,
    selection,
    initialContextSha256: fullInitialContextSha256,
    fullInitialContextSha256,
    dumbInitialContextSha256,
    targets,
    reportForUser,
  };
}
