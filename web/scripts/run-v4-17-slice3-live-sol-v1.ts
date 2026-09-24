/**
 * PROFESSOR v4.17 Slice 3 — live Sol blueprint validation + requirement execution.
 * Decision: PROFESSOR_V4_17_STRUCTURED_BREW_BLUEPRINT_SLICE3_LIVE_SOL_BLUEPRINT_VALIDATION_AND_REQUIREMENT_EXECUTION_V1_AUTHORIZED
 *
 * Requires: PROFESSOR_V4_17_LIVE_SOL=1 + OPENAI_API_KEY (+ catalog access)
 * No Commander #10. No production rewire.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import {
  SLICE3_LIVE_COMMANDER_SPECS_V417,
  resolveCommanderBlueprintFromCatalogV417,
} from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import {
  liveSolBlueprintEnabledV417,
  runLiveSolBlueprintV417,
  buildBlueprintFromSolProposalV417,
} from "../src/lib/deck-synthesis/professor-sol-blueprint-live-v4-17-v1";
import { adjudicateBlueprintV417 } from "../src/lib/deck-synthesis/professor-blueprint-adjudication-v4-17-v1";
import {
  retrieveCandidatesForRequirementV417,
  selectRequirementsForExecutionV417,
} from "../src/lib/deck-synthesis/professor-requirement-retrieval-v4-17-v1";
import { evaluateResearchFindingsV417 } from "../src/lib/deck-synthesis/professor-blueprint-research-v4-17-v1";
import { applyBlueprintRevisionV417 } from "../src/lib/deck-synthesis/professor-blueprint-revision-v4-17-v1";
import { normalizeSolConceptsV417 } from "../src/lib/deck-synthesis/professor-semantic-concept-normalizer-v4-17-v1";

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvLocal();
process.env.PROFESSOR_V4_17_LIVE_SOL = process.env.PROFESSOR_V4_17_LIVE_SOL ?? "1";

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol");
mkdirSync(OUT_DIR, { recursive: true });

type CaseReport = Record<string, unknown>;

async function runCase(spec: (typeof SLICE3_LIVE_COMMANDER_SPECS_V417)[number], catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>): Promise<CaseReport> {
  const commander = resolveCommanderBlueprintFromCatalogV417({ catalog, commanderName: spec.commanderName });
  const userIntent = {
    format: "Commander" as const,
    bracket: spec.requestedBracket,
    playStyle: spec.archetype,
    commanderDependence: "medium",
    comboPolicy: "no infinite combos",
  };

  const sol = await runLiveSolBlueprintV417({
    commander,
    requestedBracket: spec.requestedBracket,
    userPreferences: [`Build for bracket B${spec.requestedBracket}`, spec.archetype],
    semanticCommanderProfile: {
      semanticFunctions: commander.semanticFunctions,
      mechanics: commander.mechanics,
      exploitOpportunities: commander.exploitOpportunities,
    },
  });

  if (sol.apiFailure || sol.schemaFailure || !sol.proposal) {
    return {
      caseId: spec.caseId,
      archetype: spec.archetype,
      commander: spec.commanderName,
      failure: true,
      apiFailure: sol.apiFailure,
      schemaFailure: sol.schemaFailure?.violations ?? null,
      rawParsed: sol.rawParsed,
      telemetry: sol.telemetry,
    };
  }

  const blueprint = buildBlueprintFromSolProposalV417({ commander, userIntent, proposal: sol.proposal });
  const normalized = normalizeSolConceptsV417(sol.proposal.strategicConcepts);
  const execReqs = selectRequirementsForExecutionV417(blueprint.openRequirements);
  const retrievals = execReqs.map((req) =>
    retrieveCandidatesForRequirementV417({
      catalog,
      requirement: req,
      commanderColorIdentity: commander.colorIdentity,
    }),
  );
  const researchExecutability =
    retrievals.filter((r) => r.eligibleCount >= 1).length >= Math.ceil(retrievals.length * 0.66)
      ? "PASS"
      : retrievals.some((r) => r.eligibleCount >= 1)
        ? "PARTIAL"
        : "FAIL";

  const adjudication = adjudicateBlueprintV417({
    proposal: sol.proposal,
    blueprint,
    schemaValid: true,
    researchExecutability,
  });

  const findings = evaluateResearchFindingsV417({
    blueprint,
    retrievalResults: retrievals.map((r) => ({
      requirementId: r.requirementId,
      eligibleCount: r.eligibleCount,
      family: r.family,
    })),
  });

  let revisedBlueprint = blueprint;
  const challengeFindings = findings.filter((f) => f.verdict === "CHALLENGE" || f.verdict === "REJECT");
  if (challengeFindings.length > 0) {
    revisedBlueprint = applyBlueprintRevisionV417({
      blueprint,
      proposal: sol.proposal,
      findings: challengeFindings,
      summary: "Research/Rules revision after retrieval challenge",
    });
  }

  return {
    caseId: spec.caseId,
    archetype: spec.archetype,
    commander: spec.commanderName,
    failure: false,
    telemetry: sol.telemetry,
    canonicalCommanderFunctions: commander.semanticFunctions,
    solCommanderExploit: sol.proposal.commanderExploit,
    normalizedExploit: normalized.find((c) => sol.proposal!.commanderExploit.includes(c.concept.split(" ")[0] ?? "")) ?? normalized[0],
    layers: {
      A_schema: adjudication.layerA_schema,
      B_semantic: adjudication.layerB_semanticNormalization,
      C_mechanical: adjudication.layerC_mechanicalSupport,
      D_feasibility: adjudication.layerD_physicalFeasibility,
    },
    adjudication,
    materializedRequirementCount: blueprint.openRequirements.length,
    requirementExecutions: retrievals.map((r) => ({
      requirementId: r.requirementId,
      family: r.family,
      catalogScanned: r.catalogScanned,
      eligibleCount: r.eligibleCount,
      topEligible: r.topCandidates.slice(0, 3).map((c) => ({
        name: c.cardName,
        score: c.finalRequirementScore,
        eligible: c.requirementEligible,
      })),
    })),
    researchFindings: findings,
    revised: revisedBlueprint.revisionHistory.length > blueprint.revisionHistory.length,
    revisedRequirementCount: revisedBlueprint.openRequirements.length,
    proposal: sol.proposal,
    blueprint,
    revisedBlueprint,
  };
}

async function main() {
  if (!liveSolBlueprintEnabledV417()) {
    console.error("LIVE_SOL_NOT_ENABLED — set PROFESSOR_V4_17_LIVE_SOL=1 and OPENAI_API_KEY");
    process.exit(1);
  }

  console.log("PROFESSOR v4.17 Slice 3 — live Sol blueprint validation");
  const catalog = await loadDeckResolutionCatalog();
  const cases: CaseReport[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalReasoning = 0;
  let totalLatency = 0;

  for (const spec of SLICE3_LIVE_COMMANDER_SPECS_V417) {
    console.log(`\n=== ${spec.caseId} — ${spec.commanderName} ===`);
    const report = await runCase(spec, catalog);
    cases.push(report);
    writeFileSync(resolve(OUT_DIR, `${spec.caseId}-report.json`), JSON.stringify(report, null, 2));
    if (!report.failure) {
      const t = report.telemetry as { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; latencyMs?: number };
      totalInput += t.inputTokens ?? 0;
      totalOutput += t.outputTokens ?? 0;
      totalReasoning += t.reasoningTokens ?? 0;
      totalLatency += t.latencyMs ?? 0;
      const adj = report.adjudication as { decision: string; scorecard: Record<string, string> };
      console.log(`Decision: ${adj.decision}`);
      console.log(`Scorecard: ${JSON.stringify(adj.scorecard)}`);
    } else {
      console.log(`FAILURE: api=${report.apiFailure} schema=${JSON.stringify(report.schemaFailure)}`);
    }
  }

  const summary = {
    version: "professor-v4-17-slice3-live-sol-v1",
    caseCount: cases.length,
    schemaValidRate: cases.filter((c) => !c.failure && (c.adjudication as { layerA_schema: boolean })?.layerA_schema).length / cases.length,
    acceptCount: cases.filter((c) => (c.adjudication as { decision: string })?.decision === "ACCEPT").length,
    acceptWithResearchCount: cases.filter((c) => (c.adjudication as { decision: string })?.decision === "ACCEPT_WITH_RESEARCH").length,
    reviseCount: cases.filter((c) => (c.adjudication as { decision: string })?.decision === "REVISE").length,
    rejectCount: cases.filter((c) => (c.adjudication as { decision: string })?.decision === "REJECT" || c.failure).length,
    tokenAccounting: {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalReasoningTokens: totalReasoning,
      totalLatencyMs: totalLatency,
    },
    cases: cases.map((c) => ({
      caseId: c.caseId,
      failure: c.failure,
      decision: (c.adjudication as { decision?: string })?.decision ?? "FAIL",
      scorecard: (c.adjudication as { scorecard?: Record<string, string> })?.scorecard,
      telemetry: c.telemetry,
    })),
  };

  writeFileSync(resolve(OUT_DIR, "slice3-summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(
    resolve(OUT_DIR, "slice3-summary.md"),
    `# PROFESSOR v4.17 Slice 3 — Live Sol Report\n\n${summary.cases
      .map(
        (c) =>
          `## ${c.caseId}\n- Decision: ${c.decision}\n- Model: ${(c.telemetry as { model?: string })?.model}\n- Latency: ${(c.telemetry as { latencyMs?: number })?.latencyMs}ms\n- Tokens: in=${(c.telemetry as { inputTokens?: number })?.inputTokens} out=${(c.telemetry as { outputTokens?: number })?.outputTokens}\n`,
      )
      .join("\n")}\n`,
  );
  console.log(`\nWrote ${OUT_DIR}/slice3-summary.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
