/**
 * Professor PLAN agent — bounded tool loop + validation/repair integration.
 * Does NOT expose BuildPath v3 gold to the model.
 */
import { createHash } from "node:crypto";
import { formatMtgKnowledgeEvidence, searchMtgKnowledge } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import type { MtgKnowledgeRetrievalMode } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import {
  DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET,
  PROFESSOR_REPAIR_LOOP_V1,
  type ProfessorPlanningContext,
  type ProfessorPlanOutput,
  type SemanticPackage,
  type StrategyHypothesis,
  type StrategyPackageValidationResult,
  type StructuredValidationIssue,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import {
  buildValidatorContextFromPlanning,
  validateStrategyHypothesis,
} from "../../src/lib/deck-synthesis/strategy-package-validator-v1";
import { selectThreeLensPortfolios } from "./phase6a1-three-lens-portfolio-selector-v1";
import type { ThreeLensPortfolioSelection } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const PROFESSOR_PLAN_AGENT_V1_VERSION = "phase6a1-professor-plan-agent-v1";

export type ProfessorToolCallRecord = {
  callIndex: number;
  tool: string;
  arguments: Record<string, unknown>;
  resultSummary: string;
  evidenceChunkIds: string[];
};

export type ProfessorRepairRoundRecord = {
  round: number;
  validationResults: StrategyPackageValidationResult[];
  issueCount: number;
  repairApplied: boolean;
};

export type ProfessorCaseExperimentRecord = {
  caseId: string;
  commanders: string[];
  frozenFactIds: string[];
  frozenOpportunityIds: string[];
  ragEvidenceIds: string[];
  professorModel: string;
  professorConfiguration: {
    maxToolCalls: number;
    maxEvidenceChunks: number;
    maxRepairRounds: number;
    experimentPath: "SEMANTIC_ONLY";
    goldBuildPathExcluded: true;
    researchExcluded: true;
  };
  systemPromptHash: string;
  userPromptHash: string;
  toolCallTrace: ProfessorToolCallRecord[];
  proposedHypotheses: StrategyHypothesis[];
  validationResults: StrategyPackageValidationResult[];
  repairRounds: ProfessorRepairRoundRecord[];
  finalValidatedPackages: SemanticPackage[];
  threeLensPortfolios: ThreeLensPortfolioSelection;
  sealedAt: string;
  goldComparisonStatus: "NOT_RUN_AWAITING_SEALED_OUTPUTS";
};

const SYSTEM_PROMPT = `You are the Semantic Deckbuilding Professor PLAN agent for Phase 6A.1.

You produce StrategyHypothesis objects with SemanticPackages — NOT decklists and NOT card names.

HARD RULES:
- Use ONLY commanderMechanismFactIds and semanticOpportunityIds from the provided frozen lists.
- Canonical CommanderMechanismFacts and SemanticOpportunities are immutable truth; never override them.
- Do NOT reference BuildPath v3, gold strategies, EDHREC, TopDeck, or meta tier lists.
- Packages must include provenance-tagged evidence (CANONICAL_FACT, CURATED_KNOWLEDGE, or MODEL_INFERENCE).
- Opportunities with recordKind RISK_CONSTRAINT are constraints/risks — acknowledge but do not treat as positive leverage.
- Produce 2–4 hypotheses totaling 6–12 packages across all hypotheses.
- Each package needs: packageId, title, purpose, causalChain (2+ steps), semanticRequirements, resources, payoffs, commanderContribution, commanderIndependentFunction, commanderDependency, worksWithoutCommander, dependsOnPackageIds, overlapsWithPackageIds, vulnerabilities, evidence.
- commanderDependency and worksWithoutCommander must be HIGH, MEDIUM, or LOW.

Respond with JSON: { "hypotheses": StrategyHypothesis[] } only when finished planning.`;

function requireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY required for Professor PLAN experiment");
  return key;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function buildUserPrompt(ctx: ProfessorPlanningContext, repairIssues?: StructuredValidationIssue[]): string {
  const factIds = ctx.commanderMechanismFacts.map((f) => f.mechanismId);
  const oppSummaries = ctx.semanticOpportunities.map((o) => ({
    opportunityId: o.opportunityId,
    type: o.opportunityType,
    recordKind: o.recordKind ?? "OPPORTUNITY",
    causalStatement: o.causalStatement,
    semanticEdge: o.semanticEdge,
    sourceFactIds: o.sourceFactIds,
    confidence: o.opportunityConfidence,
  }));

  const factsCompact = ctx.commanderMechanismFacts.map((f) => ({
    mechanismId: f.mechanismId,
    mechanismType: f.mechanismType,
    evidenceSpan: f.evidenceSpan,
    trigger: f.trigger,
    target: f.target,
  }));

  const ragBlock = formatMtgKnowledgeEvidence(ctx.initialRagEvidence);

  let prompt = [
    `caseId=${ctx.caseId}`,
    `commandZone=${JSON.stringify(ctx.commandZone)}`,
    `colorIdentity=${ctx.colorIdentity.join("")}`,
    `bracket=${ctx.bracket}`,
    `constraints=${JSON.stringify(ctx.userConstraints)}`,
    "",
    "FROZEN mechanismFactIds (cite subset in hypotheses):",
    JSON.stringify(factIds),
    "",
    "FROZEN mechanism facts (compact):",
    JSON.stringify(factsCompact, null, 0),
    "",
    "FROZEN semantic opportunities:",
    JSON.stringify(oppSummaries, null, 0),
    "",
    "Initial curated RAG evidence:",
    ragBlock,
  ].join("\n");

  if (repairIssues && repairIssues.length > 0) {
    prompt += `\n\nVALIDATOR FEEDBACK — repair these issues and return revised hypotheses JSON:\n${JSON.stringify(repairIssues, null, 2)}`;
  }

  return prompt;
}

type ToolState = {
  toolCalls: ProfessorToolCallRecord[];
  evidenceChunkIds: Set<string>;
  toolCallCount: number;
};

async function executeTool(
  ctx: ProfessorPlanningContext,
  name: string,
  args: Record<string, unknown>,
  state: ToolState,
  maxEvidenceChunks: number,
): Promise<string> {
  if (name === "inspectCommanderFacts") {
    const ids = Array.isArray(args.factIds) ? (args.factIds as string[]) : [];
    const facts = ctx.commanderMechanismFacts.filter((f) => ids.length === 0 || ids.includes(f.mechanismId));
    return JSON.stringify(facts.slice(0, 20));
  }

  if (name === "inspectSemanticOpportunities") {
    const ids = Array.isArray(args.opportunityIds) ? (args.opportunityIds as string[]) : [];
    const opps = ctx.semanticOpportunities.filter((o) => ids.length === 0 || ids.includes(o.opportunityId));
    return JSON.stringify(opps.slice(0, 30));
  }

  if (name === "searchMtgKnowledge") {
    const query = String(args.query ?? ctx.commandZone.commanders.join(" "));
    const mode = String(args.mode ?? "PACKAGE") as MtgKnowledgeRetrievalMode;
    const remaining = maxEvidenceChunks - state.evidenceChunkIds.size;
    if (remaining <= 0) return JSON.stringify({ note: "evidence chunk budget exhausted", hits: [] });

    const result = await searchMtgKnowledge({
      query,
      mode,
      consumer: "professor_planner",
      commanderName: ctx.commandZone.commanders[0],
      limit: Math.min(4, remaining),
    });

    for (const hit of result.hits) {
      state.evidenceChunkIds.add(hit.chunkId);
    }

    return JSON.stringify({
      hits: result.hits.map((h) => ({
        chunkId: h.chunkId,
        corpus: h.corpus,
        citationLabel: h.citationLabel,
        retrievalText: h.retrievalText.slice(0, 800),
      })),
    });
  }

  return JSON.stringify({ error: `Unknown tool ${name}` });
}

const OPENAI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "searchMtgKnowledge",
      description: "Search curated MTG knowledge (rules, primers, packages). No EDHREC/TopDeck.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          mode: {
            type: "string",
            enum: ["RULES", "TERMINOLOGY", "STRATEGY", "COMMANDER_PRIMER", "PACKAGE", "INTERACTION"],
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "inspectCommanderFacts",
      description: "Return frozen CommanderMechanismFacts by mechanismId",
      parameters: {
        type: "object",
        properties: { factIds: { type: "array", items: { type: "string" } } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "inspectSemanticOpportunities",
      description: "Return frozen SemanticOpportunities by opportunityId",
      parameters: {
        type: "object",
        properties: { opportunityIds: { type: "array", items: { type: "string" } } },
      },
    },
  },
];

function parseHypothesesJson(content: string): StrategyHypothesis[] {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : content).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`Professor content is not JSON: ${raw.slice(0, 120)}`);
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { hypotheses?: StrategyHypothesis[] };
  if (!Array.isArray(parsed.hypotheses) || parsed.hypotheses.length === 0) {
    throw new Error("Professor returned no hypotheses");
  }
  return parsed.hypotheses;
}

function normalizePackage(pkg: SemanticPackage, index: number, caseId: string): SemanticPackage {
  return {
    packageId: pkg.packageId || `${caseId}-pkg-${index + 1}`,
    title: pkg.title || `Package ${index + 1}`,
    purpose: pkg.purpose || "",
    causalChain: Array.isArray(pkg.causalChain) ? pkg.causalChain : [],
    semanticRequirements: (Array.isArray(pkg.semanticRequirements) ? pkg.semanticRequirements : []).map((s, si) => ({
      slotId: String((s as { slotId?: string }).slotId ?? `${index + 1}-slot-${si + 1}`),
      requirement: String((s as { requirement?: string }).requirement ?? ""),
      alternatives: Array.isArray((s as { alternatives?: string[] }).alternatives)
        ? (s as { alternatives?: string[] }).alternatives
        : undefined,
      satisfiesOpportunityIds: Array.isArray((s as { satisfiesOpportunityIds?: string[] }).satisfiesOpportunityIds)
        ? (s as { satisfiesOpportunityIds?: string[] }).satisfiesOpportunityIds
        : undefined,
    })),
    requiredResources: Array.isArray(pkg.requiredResources) ? pkg.requiredResources : [],
    producedResources: Array.isArray(pkg.producedResources) ? pkg.producedResources : [],
    payoffs: Array.isArray(pkg.payoffs) ? pkg.payoffs : [],
    commanderContribution: pkg.commanderContribution || "",
    commanderIndependentFunction: pkg.commanderIndependentFunction || "",
    commanderDependency: pkg.commanderDependency || "MEDIUM",
    worksWithoutCommander: pkg.worksWithoutCommander || "MEDIUM",
    dependsOnPackageIds: Array.isArray(pkg.dependsOnPackageIds) ? pkg.dependsOnPackageIds : [],
    overlapsWithPackageIds: Array.isArray(pkg.overlapsWithPackageIds) ? pkg.overlapsWithPackageIds : [],
    vulnerabilities: Array.isArray(pkg.vulnerabilities) ? pkg.vulnerabilities : [],
    evidence: Array.isArray(pkg.evidence)
      ? pkg.evidence
      : [{ tier: "MODEL_INFERENCE" as const, statement: pkg.purpose || pkg.title }],
  };
}

function normalizeHypotheses(raw: StrategyHypothesis[], ctx: ProfessorPlanningContext): StrategyHypothesis[] {
  return raw.map((h, i) => ({
    hypothesisId: h.hypothesisId || `${ctx.caseId}-hyp-${i + 1}`,
    title: h.title || `Hypothesis ${i + 1}`,
    thesis: h.thesis || "",
    commanderMechanismFactIds: Array.isArray(h.commanderMechanismFactIds) ? h.commanderMechanismFactIds : [],
    semanticOpportunityIds: Array.isArray(h.semanticOpportunityIds) ? h.semanticOpportunityIds : [],
    packages: (Array.isArray(h.packages) ? h.packages : []).map((p, j) => normalizePackage(p, j, ctx.caseId)),
    strengths: Array.isArray(h.strengths) ? h.strengths : [],
    vulnerabilities: Array.isArray(h.vulnerabilities) ? h.vulnerabilities : [],
    evidence: Array.isArray(h.evidence)
      ? h.evidence
      : [{ tier: "MODEL_INFERENCE" as const, statement: h.thesis || h.title }],
  }));
}

async function openAiChat(
  apiKey: string,
  model: string,
  messages: Array<Record<string, unknown>>,
  options?: { tools?: typeof OPENAI_TOOLS; json?: boolean },
): Promise<{ content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools: options?.tools,
      tool_choice: options?.tools ? "auto" : undefined,
      response_format: options?.json ? { type: "json_object" } : undefined,
      temperature: 0.3,
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "120000", 10)),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Professor PLAN failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
  };
  const message = data.choices[0]?.message;
  if (!message) throw new Error("Empty OpenAI response");
  return message;
}

async function callProfessor(
  ctx: ProfessorPlanningContext,
  repairIssues: StructuredValidationIssue[] | undefined,
  state: ToolState,
  maxToolCalls: number,
  maxEvidenceChunks: number,
): Promise<StrategyHypothesis[]> {
  const apiKey = requireOpenAiKey();
  const model = process.env.PROFESSOR_PLAN_MODEL?.trim() || "gpt-4o";
  const userPrompt = buildUserPrompt(ctx, repairIssues);

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  while (state.toolCallCount < maxToolCalls) {
    const message = await openAiChat(apiKey, model, messages, { tools: OPENAI_TOOLS });

    if (!message.tool_calls?.length) break;

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });

    for (const tc of message.tool_calls) {
      if (state.toolCallCount >= maxToolCalls) break;
      state.toolCallCount++;
      const args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      const result = await executeTool(ctx, tc.function.name, args, state, maxEvidenceChunks);
      state.toolCalls.push({
        callIndex: state.toolCallCount,
        tool: tc.function.name,
        arguments: args,
        resultSummary: result.slice(0, 300),
        evidenceChunkIds: [...state.evidenceChunkIds],
      });
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  messages.push({
    role: "user",
    content:
      "Finalize now. Return ONLY valid JSON: {\"hypotheses\":[...]} with 2-4 StrategyHypothesis objects and 6-12 total SemanticPackages.",
  });

  const finalMessage = await openAiChat(apiKey, model, messages, { json: true });
  if (!finalMessage.content) throw new Error("Professor returned no final JSON content");
  return normalizeHypotheses(parseHypothesesJson(finalMessage.content), ctx);
}

function collectValidatedPackages(
  hypotheses: StrategyHypothesis[],
  results: StrategyPackageValidationResult[],
): SemanticPackage[] {
  const ok = new Set(
    results
      .filter((r) => r.outcome === "VALIDATED" || r.outcome === "VALID_WITH_CONSTRAINT" || r.outcome === "NEEDS_MORE_EVIDENCE")
      .map((r) => r.hypothesisId),
  );
  const packages: SemanticPackage[] = [];
  for (const h of hypotheses) {
    if (ok.has(h.hypothesisId)) packages.push(...h.packages);
  }
  return packages;
}

function hasBlockingErrors(results: StrategyPackageValidationResult[]): boolean {
  return results.some(
    (r) =>
      r.outcome === "REJECTED_MECHANICALLY" ||
      r.outcome === "REJECTED_LEGALITY" ||
      r.issues.some((i) => i.severity === "ERROR"),
  );
}

export async function runProfessorPlanCase(ctx: ProfessorPlanningContext): Promise<ProfessorCaseExperimentRecord> {
  const budget = DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET;
  const maxRepair = PROFESSOR_REPAIR_LOOP_V1.maxRepairIterations;
  const model = process.env.PROFESSOR_PLAN_MODEL?.trim() || "gpt-4o";

  const validatorCtx = buildValidatorContextFromPlanning({
    caseId: ctx.caseId,
    colorIdentity: ctx.colorIdentity,
    bracket: ctx.bracket,
    commandZoneConfiguration: ctx.commandZone.configuration,
    commanders: ctx.commandZone.commanders,
    mechanismFacts: ctx.commanderMechanismFacts,
    semanticOpportunities: ctx.semanticOpportunities,
  });

  const state: ToolState = {
    toolCalls: [],
    evidenceChunkIds: new Set(ctx.initialRagEvidence.map((h) => h.chunkId)),
    toolCallCount: 0,
  };

  const userPromptBase = buildUserPrompt(ctx);
  let hypotheses: StrategyHypothesis[] = [];
  let validationResults: StrategyPackageValidationResult[] = [];
  const repairRounds: ProfessorRepairRoundRecord[] = [];
  let repairIssues: StructuredValidationIssue[] | undefined;

  for (let round = 0; round <= maxRepair; round++) {
    hypotheses = await callProfessor(ctx, repairIssues, state, budget.maxToolCalls, budget.maxRetrievedEvidenceChunks);
    validationResults = hypotheses.map((h) => validateStrategyHypothesis(validatorCtx, h));
    const issueCount = validationResults.reduce((n, r) => n + r.issues.length, 0);
    const blocking = hasBlockingErrors(validationResults);

    repairRounds.push({
      round,
      validationResults,
      issueCount,
      repairApplied: round < maxRepair && blocking,
    });

    if (!blocking || round >= maxRepair) break;

    repairIssues = validationResults.flatMap((r) => r.issues.filter((i) => i.severity === "ERROR" || i.fixable));
  }

  const finalValidatedPackages = collectValidatedPackages(hypotheses, validationResults);
  const threeLensPortfolios = selectThreeLensPortfolios(ctx.caseId, finalValidatedPackages);

  const ragEvidenceIds = [...new Set([...ctx.initialRagEvidence.map((h) => h.chunkId), ...state.evidenceChunkIds])];

  return {
    caseId: ctx.caseId,
    commanders: ctx.commandZone.commanders,
    frozenFactIds: ctx.commanderMechanismFacts.map((f) => f.mechanismId),
    frozenOpportunityIds: ctx.semanticOpportunities.map((o) => o.opportunityId),
    ragEvidenceIds,
    professorModel: model,
    professorConfiguration: {
      maxToolCalls: budget.maxToolCalls,
      maxEvidenceChunks: budget.maxRetrievedEvidenceChunks,
      maxRepairRounds: maxRepair,
      experimentPath: "SEMANTIC_ONLY",
      goldBuildPathExcluded: true,
      researchExcluded: true,
    },
    systemPromptHash: sha256(SYSTEM_PROMPT),
    userPromptHash: sha256(userPromptBase),
    toolCallTrace: state.toolCalls,
    proposedHypotheses: hypotheses,
    validationResults,
    repairRounds,
    finalValidatedPackages,
    threeLensPortfolios,
    sealedAt: new Date().toISOString(),
    goldComparisonStatus: "NOT_RUN_AWAITING_SEALED_OUTPUTS",
  };
}

export type { ProfessorPlanOutput };
