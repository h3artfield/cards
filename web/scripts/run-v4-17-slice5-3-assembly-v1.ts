/**
 * PROFESSOR v4.17 Slice 5.3 — run full deck assembly with adaptive full-corpus retrieval.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import {
  SLICE3_LIVE_COMMANDER_SPECS_V417,
  resolveCommanderBlueprintFromCatalogV417,
} from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-live-v4-17-v1";
import { validateSolBlueprintProposalV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-proposal-v4-17-v1";
import { coerceSolBlueprintProposalRawV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-coercion-v4-17-v1";
import { assembleDeckFromBlueprintV417 } from "../src/lib/deck-synthesis/professor-brew-blueprint-assembly-v4-17-v1";
import { libraryCountV417 } from "../src/lib/deck-synthesis/professor-brew-blueprint-mana-v4-17-v1";
import { openPackageDensityCountV417 } from "../src/lib/deck-synthesis/professor-brew-blueprint-package-density-v4-17-v1";
import { openFunctionalDensityCountV417 } from "../src/lib/deck-synthesis/professor-brew-blueprint-functional-density-v4-17-v1";

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

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice5-3-assembly");
const OUT_DIR_ALT = resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice5-3-assembly");
const IN_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol");
const IN_DIR_ALT = resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice3-live-sol");
const PRIOR_SUMMARY = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice5-2-assembly/slice5-2-summary.json");
const PRIOR_SUMMARY_ALT = resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice5-2-assembly/slice5-2-summary.json");

function priorSummaryPath(): string {
  return existsSync(PRIOR_SUMMARY) ? PRIOR_SUMMARY : PRIOR_SUMMARY_ALT;
}

function inputDir(): string {
  return existsSync(IN_DIR) ? IN_DIR : IN_DIR_ALT;
}

function outputDir(): string {
  const dir = existsSync(resolve(process.cwd(), "web")) ? OUT_DIR_ALT : OUT_DIR;
  mkdirSync(dir, { recursive: true });
  return dir;
}

const DEFAULT_CASES = ["spellslinger-kess", "tokens-chatterfang", "graveyard-ultimecia", "voltron-sigarda"];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const out = outputDir();
  const prior = existsSync(priorSummaryPath()) ? JSON.parse(readFileSync(priorSummaryPath(), "utf8")) as { cases?: Array<{ caseId: string; picks: number }> } : { cases: [] };
  const priorByCase = new Map((prior.cases ?? []).map((c) => [c.caseId, c.picks]));

  const caseFilter = process.env.PROFESSOR_V4_17_SLICE5_3_CASES?.split(",").map((s) => s.trim()).filter(Boolean);
  const cases = caseFilter?.length ? caseFilter : DEFAULT_CASES;
  const results = [];

  for (const caseId of cases) {
    const spec = SLICE3_LIVE_COMMANDER_SPECS_V417.find((s) => s.caseId === caseId);
    if (!spec) continue;
    const path = resolve(inputDir(), `${caseId}-report.json`);
    if (!existsSync(path)) {
      console.log(`SKIP ${caseId} — no saved report`);
      continue;
    }

    const saved = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const commander = resolveCommanderBlueprintFromCatalogV417({ catalog, commanderName: spec.commanderName });
    let proposal = saved.proposal as Record<string, unknown> | undefined;
    if (!proposal && saved.rawParsed) {
      proposal = validateSolBlueprintProposalV417(
        coerceSolBlueprintProposalRawV417(saved.rawParsed as Record<string, unknown>, { requestedBracket: spec.requestedBracket }),
      ) as unknown as Record<string, unknown>;
    }
    if (!proposal) continue;

    const validated = validateSolBlueprintProposalV417(proposal);
    const blueprint = buildBlueprintFromSolProposalV417({
      commander,
      userIntent: {
        format: "Commander",
        bracket: spec.requestedBracket,
        playStyle: spec.archetype,
        commanderDependence: "medium",
        comboPolicy: "no infinite combos",
      },
      proposal: validated,
    });

    const assembly = assembleDeckFromBlueprintV417(blueprint, {
      catalog,
      maxIterations: 96,
      maxScan: 12000,
      maxEvaluate: 500,
      minQualityScore: 35,
    });

    const lastCheckpoint = assembly.checkpoints[assembly.checkpoints.length - 1];
    const lastTail = assembly.lastTailExhaustion;
    results.push({
      caseId,
      success: assembly.success,
      failure: assembly.failure,
      picks: assembly.decisions.length,
      priorPicks52: priorByCase.get(caseId) ?? null,
      libraryCount: libraryCountV417(assembly.blueprint),
      fdOpen: openFunctionalDensityCountV417(assembly.blueprint),
      densityOpen: openPackageDensityCountV417(assembly.blueprint),
      lastConvergence: lastCheckpoint?.convergence ?? null,
      flexEntry: assembly.blueprint.flexEntryTelemetry,
      lastTailExhaustion: lastTail,
      tailExhaustionCount: assembly.tailExhaustions.length,
    });

    writeFileSync(
      resolve(out, `${caseId}-slice5-3-report.json`),
      JSON.stringify(
        {
          caseId,
          success: assembly.success,
          failure: assembly.failure,
          summary: assembly.summary,
          pickCount: assembly.decisions.length,
          priorPicks52: priorByCase.get(caseId) ?? null,
          libraryCount: libraryCountV417(assembly.blueprint),
          flexEntryTelemetry: assembly.blueprint.flexEntryTelemetry,
          checkpoints: assembly.checkpoints,
          decisions: assembly.decisions,
          tailExhaustions: assembly.tailExhaustions,
          lastTailExhaustion: lastTail,
        },
        null,
        2,
      ),
    );

    console.log(
      `${caseId}: success=${assembly.success} failure=${assembly.failure} picks=${assembly.decisions.length} (5.2=${priorByCase.get(caseId) ?? "?"}) tail=${lastTail?.terminalReason ?? "none"}`,
    );
  }

  writeFileSync(resolve(out, "slice5-3-summary.json"), JSON.stringify({ version: "professor-v4-17-slice5-3-assembly-v1", cases: results }, null, 2));
  console.log(`Wrote ${out}/slice5-3-summary.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
