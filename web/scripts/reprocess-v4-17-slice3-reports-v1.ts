/**
 * Reprocess saved Slice 3 live Sol reports through coercion + full pipeline (no API).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
import { normalizeSolConceptsV417 } from "../src/lib/deck-synthesis/professor-semantic-concept-normalizer-v4-17-v1";
import { coerceSolBlueprintProposalRawV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-coercion-v4-17-v1";
import {
  validateSolBlueprintProposalV417,
  SolBlueprintSchemaInvalidV417,
} from "../src/lib/deck-synthesis/professor-sol-blueprint-proposal-v4-17-v1";

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

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol");

async function reprocessCase(
  spec: (typeof SLICE3_LIVE_COMMANDER_SPECS_V417)[number],
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  saved: Record<string, unknown>,
) {
  const commander = resolveCommanderBlueprintFromCatalogV417({ catalog, commanderName: spec.commanderName });
  const userIntent = {
    format: "Commander" as const,
    bracket: spec.requestedBracket,
    playStyle: spec.archetype,
    commanderDependence: "medium",
    comboPolicy: "no infinite combos",
  };

  const telemetry = saved.telemetry ?? {};
  const rawParsed = saved.rawParsed ?? saved.proposal;
  if (!rawParsed || typeof rawParsed !== "object") {
    return { ...saved, reprocessError: "NO_RAW_PARSED" };
  }

  try {
    const coerced = coerceSolBlueprintProposalRawV417(rawParsed as Record<string, unknown>, {
      requestedBracket: spec.requestedBracket,
    });
    const proposal = validateSolBlueprintProposalV417(coerced);
    const blueprint = buildBlueprintFromSolProposalV417({ commander, userIntent, proposal });
    const normalized = normalizeSolConceptsV417(proposal.strategicConcepts);
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
      proposal,
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
        proposal,
        findings: challengeFindings,
        summary: "Research/Rules revision after retrieval challenge",
      });
    }

    return {
      caseId: spec.caseId,
      archetype: spec.archetype,
      commander: spec.commanderName,
      failure: false,
      reprocessed: true,
      telemetry,
      canonicalCommanderFunctions: commander.semanticFunctions,
      solCommanderExploit: proposal.commanderExploit,
      normalizedExploit: normalized[0] ?? null,
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
      proposal,
      blueprint,
      revisedBlueprint,
    };
  } catch (err) {
    return {
      caseId: spec.caseId,
      failure: true,
      reprocessed: true,
      schemaFailure: err instanceof SolBlueprintSchemaInvalidV417 ? err.violations : [String(err)],
      telemetry,
      rawParsed,
    };
  }
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const cases = [];
  for (const spec of SLICE3_LIVE_COMMANDER_SPECS_V417) {
    const path = resolve(OUT_DIR, `${spec.caseId}-report.json`);
    if (!existsSync(path)) {
      console.log(`SKIP ${spec.caseId} — no report`);
      continue;
    }
    const saved = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const report = await reprocessCase(spec, catalog, saved);
    cases.push(report);
    writeFileSync(path, JSON.stringify(report, null, 2));
    const adj = report.adjudication as { decision?: string } | undefined;
    console.log(`${spec.caseId}: ${report.failure ? "FAIL" : adj?.decision ?? "OK"}`);
  }

  const summary = {
    version: "professor-v4-17-slice3-reprocess-v1",
    caseCount: cases.length,
    schemaValidRate: cases.filter((c) => !c.failure).length / Math.max(cases.length, 1),
    acceptCount: cases.filter((c) => (c.adjudication as { decision?: string })?.decision === "ACCEPT").length,
    acceptWithResearchCount: cases.filter((c) => (c.adjudication as { decision?: string })?.decision === "ACCEPT_WITH_RESEARCH").length,
    reviseCount: cases.filter((c) => (c.adjudication as { decision?: string })?.decision === "REVISE").length,
    rejectCount: cases.filter((c) => c.failure || (c.adjudication as { decision?: string })?.decision === "REJECT").length,
    cases: cases.map((c) => ({
      caseId: c.caseId,
      failure: c.failure,
      decision: (c.adjudication as { decision?: string })?.decision ?? (c.failure ? "FAIL" : "UNKNOWN"),
      scorecard: (c.adjudication as { scorecard?: Record<string, string> })?.scorecard,
    })),
  };
  writeFileSync(resolve(OUT_DIR, "slice3-summary-reprocessed.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
