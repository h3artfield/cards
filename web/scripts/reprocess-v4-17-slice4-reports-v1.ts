/**
 * PROFESSOR v4.17 Slice 4 — reprocess saved Slice 3 live proposals (no Sol calls).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import {
  SLICE3_LIVE_COMMANDER_SPECS_V417,
  resolveCommanderBlueprintFromCatalogV417,
} from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-live-v4-17-v1";
import { adjudicateBlueprintV417 } from "../src/lib/deck-synthesis/professor-blueprint-adjudication-v4-17-v1";
import {
  retrieveCandidatesForRequirementV417,
  selectRequirementsForExecutionV417,
} from "../src/lib/deck-synthesis/professor-requirement-retrieval-v4-17-v1";
import { evaluateResearchFindingsV417 } from "../src/lib/deck-synthesis/professor-blueprint-research-v4-17-v1";
import { applyBlueprintRevisionV417 } from "../src/lib/deck-synthesis/professor-blueprint-revision-v4-17-v1";
import { validateSolBlueprintProposalV417, SolBlueprintSchemaInvalidV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-proposal-v4-17-v1";
import { coerceSolBlueprintProposalRawV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-coercion-v4-17-v1";

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

const IN_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol");
const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice4-reprocessed");
mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const cases = [];

  for (const spec of SLICE3_LIVE_COMMANDER_SPECS_V417) {
    const path = resolve(IN_DIR, `${spec.caseId}-report.json`);
    if (!existsSync(path)) continue;
    const saved = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const commander = resolveCommanderBlueprintFromCatalogV417({ catalog, commanderName: spec.commanderName });
    const userIntent = {
      format: "Commander" as const,
      bracket: spec.requestedBracket,
      playStyle: spec.archetype,
      commanderDependence: "medium",
      comboPolicy: "no infinite combos",
    };

    let proposal = saved.proposal as Record<string, unknown> | undefined;
    if (!proposal && saved.rawParsed) {
      const coerced = coerceSolBlueprintProposalRawV417(saved.rawParsed as Record<string, unknown>, {
        requestedBracket: spec.requestedBracket,
      });
      proposal = validateSolBlueprintProposalV417(coerced) as unknown as Record<string, unknown>;
    }
    if (!proposal) {
      console.log(`SKIP ${spec.caseId} — no proposal`);
      continue;
    }

    const validated = validateSolBlueprintProposalV417(proposal);
    const blueprint = buildBlueprintFromSolProposalV417({ commander, userIntent, proposal: validated });
    const execReqs = selectRequirementsForExecutionV417(blueprint.openRequirements);
    const retrievals = execReqs.map((req) =>
      retrieveCandidatesForRequirementV417({ catalog, requirement: req, commanderColorIdentity: commander.colorIdentity }),
    );

    const confirmCount = retrievals.filter((r) => r.researchEvidence.requirementCoveragePotential >= 0.4 && r.researchEvidence.topCandidatePrecision !== "FALSE_POSITIVE").length;
    const researchExecutability =
      retrievals.filter((r) => r.eligibleCount >= 1).length >= Math.ceil(retrievals.length * 0.66) ? "PASS" : retrievals.some((r) => r.eligibleCount >= 1) ? "PARTIAL" : "FAIL";
    const retrievalPrecision =
      confirmCount >= Math.ceil(retrievals.length * 0.5) ? "PASS" : confirmCount > 0 ? "PARTIAL" : "FAIL";
    const researchConfirmationTruth =
      retrievals.every((r) => r.researchEvidence.falsePositiveRateSample < 0.6) ? "PASS" : "PARTIAL";

    const adjudication = adjudicateBlueprintV417({
      proposal: validated,
      blueprint,
      schemaValid: true,
      researchExecutability,
      retrievalPrecision,
      researchConfirmationTruth,
    });

    const findings = evaluateResearchFindingsV417({
      blueprint,
      retrievalResults: retrievals.map((r) => ({
        requirementId: r.requirementId,
        eligibleCount: r.eligibleCount,
        family: r.family,
        researchEvidence: r.researchEvidence,
        topEvaluations: r.topEvaluationsSample,
      })),
    });

    let revisedBlueprint = blueprint;
    const challenges = findings.filter((f) => f.verdict === "CHALLENGE" || f.verdict === "REJECT");
    if (challenges.length > 0) {
      revisedBlueprint = applyBlueprintRevisionV417({
        blueprint,
        proposal: validated,
        findings: challenges,
        summary: "Slice 4 research/rules revision",
      });
    }

    const feasibility = blueprint.slotFeasibility;
    const report = {
      caseId: spec.caseId,
      archetype: spec.archetype,
      commander: spec.commanderName,
      physicalFeasibility: {
        naiveMinimum: feasibility.naiveMinimumPhysicalStillRequired,
        correctedLowerBound: feasibility.physicalLowerBound.correctedLowerBound,
        inflationRemoved: feasibility.physicalLowerBound.inflationRemoved,
        feasible: feasibility.feasible,
        trace: feasibility.feasibilityTrace,
      },
      adjudication,
      requirementExecutions: retrievals.map((r) => ({
        requirementId: r.requirementId,
        family: r.family,
        eligibleCount: r.eligibleCount,
        researchEvidence: r.researchEvidence,
        topSample: r.topEvaluationsSample.slice(0, 3).map((c) => ({ name: c.cardName, precision: c.rolePrecision, score: c.finalRequirementScore })),
      })),
      researchFindings: findings,
      revised: revisedBlueprint.revisionHistory.length > blueprint.revisionHistory.length,
      revisedRequirementCount: revisedBlueprint.openRequirements.length,
    };
    cases.push(report);
    writeFileSync(resolve(OUT_DIR, `${spec.caseId}-slice4-report.json`), JSON.stringify(report, null, 2));
    console.log(
      `${spec.caseId}: naive=${feasibility.naiveMinimumPhysicalStillRequired} corrected=${feasibility.physicalLowerBound.correctedLowerBound} feasible=${feasibility.feasible} decision=${adjudication.decision}`,
    );
  }

  const summary = {
    version: "professor-v4-17-slice4-reprocess-v1",
    caseCount: cases.length,
    feasibleCount: cases.filter((c) => (c.physicalFeasibility as { feasible: boolean }).feasible).length,
    acceptCount: cases.filter((c) => (c.adjudication as { decision: string }).decision === "ACCEPT").length,
    acceptWithResearchCount: cases.filter((c) => (c.adjudication as { decision: string }).decision === "ACCEPT_WITH_RESEARCH").length,
    rejectCount: cases.filter((c) => (c.adjudication as { decision: string }).decision === "REJECT").length,
    cases: cases.map((c) => ({
      caseId: c.caseId,
      naive: (c.physicalFeasibility as { naiveMinimum: number }).naiveMinimum,
      corrected: (c.physicalFeasibility as { correctedLowerBound: number }).correctedLowerBound,
      feasible: (c.physicalFeasibility as { feasible: boolean }).feasible,
      decision: (c.adjudication as { decision: string }).decision,
      scorecard: (c.adjudication as { scorecard: Record<string, string> }).scorecard,
    })),
  };
  writeFileSync(resolve(OUT_DIR, "slice4-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  if (e instanceof SolBlueprintSchemaInvalidV417) console.error(e.violations);
  console.error(e);
  process.exit(1);
});
