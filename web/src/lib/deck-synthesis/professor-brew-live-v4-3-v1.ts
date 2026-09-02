/**
 * Professor v4.3 live brew — Creative + Research via gpt-4o-mini (cheap model default).
 */
import { createHash } from "node:crypto";
import { callOpenAiJson } from "../card-flow-v2/openai-json";
import type { ProfessorPlanningContextV3 } from "./professor-planning-contracts-v3";
import {
  PROFESSOR_CREATIVE_PASS1_CONTRACTS_V4_VERSION,
  validateCreativeProfessorPass1V4,
  type CreativeProfessorPass1V4,
} from "./professor-creative-pass1-contracts-v4";
import {
  decideConversationLoopOutcomeV4,
  PROFESSOR_V4_1_DECISION_V1,
  type ProfessorV41ConversationLoopResultV1,
} from "./professor-v4-1-conversation-loop-v1";
import { createEmptyProfessorV4CostTelemetryV1, mergeProfessorV4CostTelemetryV1 } from "./professor-v4-cost-telemetry-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import { buildProfessorPlanningContextV3, buildProfessorPlanningContextV3Sync } from "../../../scripts/lib/phase6a1-professor-plan-context-builder-v3";
import { buildProfessorV3PromptPayload } from "../../../scripts/lib/phase6a1-professor-v3-prompt-payload-v1";
import type { ImplementedMechanismCatalogEntry } from "../../../scripts/lib/phase6a1-implemented-mechanism-catalog-v1";
import { getPilotMechanismCatalogEntry } from "../../../scripts/lib/phase6a1-spent-pilot-truth-loader-v1";
import { runResearchProfessorV41OfflineV1 } from "../../../scripts/lib/phase6a1-professor-v4-1-research-professor-v1";
import { PROFESSOR_V4_3_ANY_COMMANDER_LIVE_KNOWLEDGE_TEAM_V1 } from "./professor-brew-commander-resolver-v4-4-v1";

export const PROFESSOR_BREW_LIVE_V4_3_V1_VERSION = "professor-brew-live-v4-3-v1";
export const PROFESSOR_V4_3_DECISION_V1 = PROFESSOR_V4_3_ANY_COMMANDER_LIVE_KNOWLEDGE_TEAM_V1;

const CREATIVE_MODEL =
  process.env.PROFESSOR_BREW_CREATIVE_MODEL?.trim() ||
  process.env.OPENAI_CATEGORY_CLASSIFIER_MODEL?.trim() ||
  "gpt-4o-mini";

const RESEARCH_MODEL =
  process.env.PROFESSOR_BREW_RESEARCH_MODEL?.trim() ||
  process.env.PROFESSOR_BREW_CREATIVE_MODEL?.trim() ||
  "gpt-4o-mini";

const CREATIVE_SYSTEM = `You are the Creative Professor for a Magic: The Gathering Commander deck-building session.
Analyze the commander using supplied mechanism facts and oracle text.
Produce a lightweight strategic thesis with packages, win paths, and open questions.
Ground claims in the evidence. Do not invent card-specific mechanics without support.
Return JSON matching the CreativeProfessorPass1V4 schema exactly.`;

const CREATIVE_JSON_SCHEMA = `{
  "version": "${PROFESSOR_CREATIVE_PASS1_CONTRACTS_V4_VERSION}",
  "commander": "exact commander name",
  "strategicThesis": "one paragraph deck thesis",
  "mechanicInterpretation": ["step 1", "step 2", "step 3"],
  "packages": [{
    "id": "pkg-id",
    "concept": "package name",
    "purpose": "what it does",
    "commanderDependence": "HIGH|MEDIUM|LOW",
    "whyInteresting": "brief rationale",
    "likelyCardsOrEffects": ["card or effect names"],
    "evidenceRefs": []
  }],
  "winPaths": [{ "id": "win-1", "description": "...", "commanderDependence": "HIGH|MEDIUM|LOW", "evidenceRefs": [] }],
  "independentEngines": [{ "id": "ind-1", "description": "...", "worksWithoutCommander": "HIGH|MEDIUM|LOW", "evidenceRefs": [] }],
  "vulnerabilities": ["..."],
  "openQuestions": ["..."],
  "confidenceNotes": ["..."],
  "evidenceRefs": []
}`;

function sha256Context(ctx: ProfessorPlanningContextV3): string {
  return createHash("sha256").update(buildProfessorV3PromptPayload(ctx).modelVisibleText, "utf8").digest("hex");
}

export function resolveMechanismCatalogEntryV44(
  mechanismTruthCaseId: string,
  catalogEntry?: ImplementedMechanismCatalogEntry,
): ImplementedMechanismCatalogEntry {
  if (catalogEntry) return catalogEntry;
  const entry = getPilotMechanismCatalogEntry(mechanismTruthCaseId);
  if (!entry) throw new Error(`Unknown mechanism case: ${mechanismTruthCaseId}`);
  return entry;
}

/** Sync builder — fixtures/tests and RAG-degraded fallback. */
export function buildLivePlanningContextV43(
  mechanismTruthCaseId: string,
  catalogEntry?: ImplementedMechanismCatalogEntry,
): ProfessorPlanningContextV3 {
  const entry = resolveMechanismCatalogEntryV44(mechanismTruthCaseId, catalogEntry);
  return buildProfessorPlanningContextV3Sync({ entry, oppCase: null, options: { includeMechanicalAffordances: true } });
}

/** Async builder with RAG — production path for arbitrary commanders. */
export async function buildLivePlanningContextV43Async(args: {
  catalogEntry: ImplementedMechanismCatalogEntry;
}): Promise<ProfessorPlanningContextV3> {
  try {
    return await buildProfessorPlanningContextV3({
      entry: args.catalogEntry,
      oppCase: null,
      options: { includeMechanicalAffordances: true },
    });
  } catch {
    return buildProfessorPlanningContextV3Sync({
      entry: args.catalogEntry,
      oppCase: null,
      options: { includeMechanicalAffordances: true },
    });
  }
}

export async function runLiveCreativePass1V43(args: {
  catalogEntry: ImplementedMechanismCatalogEntry;
  commanderName: string;
  userIntent: string[];
  relationshipLens: string;
}): Promise<{ pass1: CreativeProfessorPass1V4; professorLine: string; model: string; planningContext: ProfessorPlanningContextV3 }> {
  const ctx = await buildLivePlanningContextV43Async({ catalogEntry: args.catalogEntry });
  const payload = buildProfessorV3PromptPayload(ctx);
  const userPrompt = [
    `Commander: ${args.commanderName}`,
    `Target bracket: ${args.catalogEntry.bracket}`,
    `User brew direction: ${args.userIntent.join(" → ")}`,
    `Relationship lens: ${args.relationshipLens}`,
    "",
    "Evidence and mechanism context:",
    payload.modelVisibleText.slice(0, 12000),
    "",
    "Return JSON only:",
    CREATIVE_JSON_SCHEMA,
  ].join("\n");

  const raw = await callOpenAiJson<CreativeProfessorPass1V4>(
    CREATIVE_SYSTEM,
    [{ type: "text", text: userPrompt }],
    { model: CREATIVE_MODEL, maxTokens: 2200, temperature: 0.35 },
  );

  raw.commander = args.commanderName;
  raw.version = PROFESSOR_CREATIVE_PASS1_CONTRACTS_V4_VERSION;

  const validated = validateCreativeProfessorPass1V4(raw);
  if (!validated.ok) {
    throw new Error(`Live creative pass invalid: ${validated.issues.map((i) => i.message).join("; ")}`);
  }

  const thesis = validated.pass1.strategicThesis.slice(0, 220);
  const professorLine = `Here's my read: ${thesis} Let's grow the deck from there — watch the tree.`;

  return { pass1: validated.pass1, professorLine, model: CREATIVE_MODEL, planningContext: ctx };
}

export function buildLiveLoopResultV43(args: {
  mechanismTruthCaseId: string;
  creativePass1: CreativeProfessorPass1V4;
  userIntent: string[];
  frozenContext: ProfessorPlanningContextV3;
}): ProfessorV41ConversationLoopResultV1 {
  let telemetry = createEmptyProfessorV4CostTelemetryV1();
  telemetry = mergeProfessorV4CostTelemetryV1(telemetry, { creativePass1Calls: 1 });

  const researchRun = runResearchProfessorV41OfflineV1({ ctx: args.frozenContext, pass1: args.creativePass1 });
  telemetry = mergeProfessorV4CostTelemetryV1(telemetry, {
    researchModelCalls: 0,
    semanticSearchCalls: researchRun.semanticPrimitiveResults.length,
  });

  let workingDeckTheory = researchRun.workingDeckTheory;
  for (const intent of args.userIntent) {
    if (!workingDeckTheory.userIntent.includes(intent)) {
      workingDeckTheory = {
        ...workingDeckTheory,
        userIntent: [...workingDeckTheory.userIntent, intent],
      };
    }
  }

  const loopDecision = decideConversationLoopOutcomeV4({
    theory: workingDeckTheory,
    scoredDiscoveries: researchRun.scoredDiscoveries,
    userDirectionRequired: false,
  });

  return {
    decision: PROFESSOR_V4_1_DECISION_V1,
    caseId: args.frozenContext.caseId,
    mechanismTruthCaseId: args.mechanismTruthCaseId,
    frozenContextSha256: sha256Context(args.frozenContext),
    creativePass1: args.creativePass1,
    workingDeckTheory,
    selectedResearchModes: researchRun.selectedResearchModes,
    currentOpenQuestionId: researchRun.currentOpenQuestionId,
    researchMessages: researchRun.researchMessages,
    scoredDiscoveries: researchRun.scoredDiscoveries,
    abstractionChains: researchRun.abstractionChains,
    reverseSearchResults: researchRun.reverseSearchResults,
    semanticQueryResults: researchRun.semanticQueryResults,
    loopOutcome: loopDecision.outcome,
    warrantCreativeRevisit: loopDecision.warrantCreativeRevisit,
    escalationReasons: loopDecision.escalationReasons,
    stagesExecuted: ["CREATIVE_PASS_1_LIVE", "SEED_WORKING_DECK_THEORY", "DETERMINISTIC_SEARCH", "COMPLETE"],
    costTelemetry: telemetry,
    orchestrationTerminatedByValidator: false,
    criticAnnotations: researchRun.criticAnnotations,
  };
}

export async function runLiveResearchProfessorLineV43(args: {
  theory: WorkingDeckTheoryV4;
  treeRevealStep: number;
  commanderName: string;
}): Promise<string> {
  const pkgSummary = args.theory.packages
    .slice(0, 3)
    .map((p) => `${p.name}: ${p.purpose.slice(0, 80)}`)
    .join("\n");

  const system = `You are the Research Professor in a Commander deck brew session. Speak in 1-2 short conversational sentences. Be specific to the deck thesis. No bullet lists.`;
  const user = [
    `Commander: ${args.commanderName}`,
    `Tree reveal step: ${args.treeRevealStep}/6`,
    `Thesis: ${args.theory.thesis.summary.slice(0, 300)}`,
    `Packages:\n${pkgSummary}`,
    `Say what you are verifying or laying out at this step.`,
  ].join("\n");

  const result = await callOpenAiJson<{ line: string }>(
    system,
    [{ type: "text", text: user }],
    { model: RESEARCH_MODEL, maxTokens: 180, temperature: 0.4 },
  );
  return result.line?.trim() || "Researching the next branch of the tree.";
}
