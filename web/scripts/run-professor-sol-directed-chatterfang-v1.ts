/**
 * PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1 — Chatterfang development experiment.
 *
 * Requires P0 truth selftest pass before any OpenAI call.
 * Max 3 GPT-5.6 Sol calls: Architect, Constructor, Head Professor or Repair.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveCommanderBlueprintFromCatalogV417 } from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { runSolDirectedDeckConstructionV1 } from "../src/lib/deck-synthesis/professor-sol-directed-orchestrator-v1";

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

function runP0Selftest(): boolean {
  const cwd = process.cwd();
  const script = "src/lib/deck-synthesis/professor-sol-directed-p0-truth.selftest.ts";
  const result = spawnSync("npx", ["--yes", "tsx", script], { cwd, encoding: "utf8", shell: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

async function main() {
  loadEnvLocal();
  process.env.PROFESSOR_SOL_DIRECTED_LIVE = process.env.PROFESSOR_SOL_DIRECTED_LIVE ?? "1";

  const p0Pass = runP0Selftest();
  const catalog = await loadDeckResolutionCatalog();
  const commander = resolveCommanderBlueprintFromCatalogV417({
    catalog,
    commanderName: "Chatterfang, Squirrel General",
  });

  const report = await runSolDirectedDeckConstructionV1({
    caseId: "tokens-chatterfang",
    commander,
    bracket: 3,
    playstyle: "tokens/sacrifice",
    catalog,
    p0TruthPass: p0Pass,
  });

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis/sol-directed-chatterfang-v1");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "experiment-report.json"), JSON.stringify(report, null, 2));
  for (const [idx, call] of report.modelCalls.entries()) {
    writeFileSync(
      resolve(outDir, `call-${idx + 1}-${call.purpose.toLowerCase()}-prompt.txt`),
      `${call.systemPrompt}\n\n---\n\n${call.userPrompt}`,
    );
    writeFileSync(
      resolve(outDir, `call-${idx + 1}-${call.purpose.toLowerCase()}-response.json`),
      JSON.stringify(call.rawResponse, null, 2),
    );
  }
  if (report.candidatePools.length > 0) {
    writeFileSync(resolve(outDir, "candidate-pools.json"), JSON.stringify(report.candidatePools, null, 2));
  }
  if (report.validation) {
    writeFileSync(resolve(outDir, "validation.json"), JSON.stringify(report.validation, null, 2));
  }
  if (report.constructedDeck) {
    writeFileSync(resolve(outDir, "constructed-deck.json"), JSON.stringify(report.constructedDeck, null, 2));
  }

  console.log(
    JSON.stringify(
      {
        p0Pass,
        failure: report.failure,
        summary: report.summary,
        outDir,
        modelCallsUsed: report.modelCallBudget.used,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
