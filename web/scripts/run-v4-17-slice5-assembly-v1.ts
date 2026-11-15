/**
 * PROFESSOR v4.17 Slice 5 — run full deck assembly on saved Slice 3 live blueprints.
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
const IN_DIR_ALT = resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice3-live-sol");
const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice5-assembly");
const OUT_DIR_ALT = resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice5-assembly");

function inputDir(): string {
  return existsSync(IN_DIR) ? IN_DIR : IN_DIR_ALT;
}

function outputDir(): string {
  const dir = existsSync(resolve(process.cwd(), "web")) ? OUT_DIR_ALT : OUT_DIR;
  mkdirSync(dir, { recursive: true });
  return dir;
}

const DEFAULT_CASES = [
  "spellslinger-kess",
  "tokens-chatterfang",
  "graveyard-ultimecia",
  "voltron-sigarda",
  "resource-korvold",
];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const out = outputDir();
  const caseFilter = process.env.PROFESSOR_V4_17_SLICE5_CASES?.split(",").map((s) => s.trim()).filter(Boolean);
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
    if (!proposal) {
      console.log(`SKIP ${caseId} — no proposal`);
      continue;
    }

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

    const report = {
      caseId,
      commander: spec.commanderName,
      requestedBracket: spec.requestedBracket,
      success: assembly.success,
      failure: assembly.failure,
      summary: assembly.summary,
      pickCount: assembly.decisions.length,
      libraryCount: libraryCountV417(assembly.blueprint),
      preCriticDeck: assembly.preCriticDeck,
      nonlandClosure: assembly.nonlandClosure,
      audits: assembly.audits,
      criticFindings: assembly.criticFindings,
      vagueWinDecompositions: assembly.vagueWinDecompositions,
      checkpoints: assembly.checkpoints,
      decisions: assembly.decisions,
      constructionRescue: assembly.constructionRescue,
      productQuality: {
        physicalAccounting: assembly.audits?.physicalAccounting,
        functionalCoverage: assembly.audits?.functionalCoverage,
        packageSatisfaction: assembly.audits?.packageSatisfaction,
        winArchitecture: assembly.audits?.winArchitecture,
        interaction: assembly.audits?.interactionQuality,
        acceleration: assembly.audits?.accelerationQuality,
        protection: assembly.audits?.protection,
        recovery: assembly.audits?.recovery,
        mana: assembly.audits?.mana,
      },
    };

    writeFileSync(resolve(out, `${caseId}-slice5-report.json`), JSON.stringify(report, null, 2));
    results.push({
      caseId,
      success: assembly.success,
      failure: assembly.failure,
      picks: assembly.decisions.length,
      libraryCount: libraryCountV417(assembly.blueprint),
    });
    console.log(`${caseId}: success=${assembly.success} failure=${assembly.failure} picks=${assembly.decisions.length} library=${libraryCountV417(assembly.blueprint)}`);
  }

  const summary = {
    version: "professor-v4-17-slice5-assembly-v1",
    caseCount: results.length,
    legal99Count: results.filter((r) => r.success).length,
    cases: results,
  };
  writeFileSync(resolve(out, "slice5-summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(
    resolve(out, "slice5-summary.md"),
    [
      "# PROFESSOR v4.17 Slice 5 — Full Deck Assembly",
      "",
      `Cases run: ${results.length}`,
      `Legal 99 reached: ${summary.legal99Count}`,
      "",
      "| Case | Success | Failure | Picks | Library |",
      "|------|---------|---------|-------|---------|",
      ...results.map((r) => `| ${r.caseId} | ${r.success} | ${r.failure ?? "—"} | ${r.picks} | ${r.libraryCount} |`),
    ].join("\n"),
  );
  console.log(`Wrote ${out}/slice5-summary.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
