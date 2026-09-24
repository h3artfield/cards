/**
 * PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_1 — Chatterfang second prospective run.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveCommanderBlueprintFromCatalogV417 } from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import {
  runCheapAcceptanceV11,
  runSolDirectedDeckConstructionV11,
} from "../src/lib/deck-synthesis/professor-sol-directed-orchestrator-v1-1";

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

function runScript(script: string): boolean {
  const result = spawnSync("npx", ["--yes", "tsx", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function architectFixturePath(): string {
  return resolve(process.cwd(), "data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json");
}

async function main() {
  loadEnvLocal();
  process.env.PROFESSOR_SOL_DIRECTED_LIVE = process.env.PROFESSOR_SOL_DIRECTED_LIVE ?? "1";

  const p0Pass = runScript("src/lib/deck-synthesis/professor-sol-directed-p0-truth.selftest.ts");
  const ingestionPass = runScript("src/lib/deck-synthesis/professor-sol-directed-architect-ingestion-v1-1.selftest.ts");
  const constructorInputPass = runScript("src/lib/deck-synthesis/professor-sol-directed-constructor-input-v1-1.selftest.ts");

  const catalog = await loadDeckResolutionCatalog();
  const commander = resolveCommanderBlueprintFromCatalogV417({
    catalog,
    commanderName: "Chatterfang, Squirrel General",
  });

  const architectRaw = JSON.parse(readFileSync(architectFixturePath(), "utf8"));
  const cheapAcceptance = runCheapAcceptanceV11({
    architectRaw,
    catalog,
    commander,
    bracket: 3,
  });

  const outDir = resolve(process.cwd(), "data/milestones/deck-synthesis/sol-directed-chatterfang-v1-1");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(resolve(outDir, "architect-raw-plan-fixture.json"), JSON.stringify(cheapAcceptance.ingested.architectRawPlan, null, 2));
  writeFileSync(resolve(outDir, "retrieval-contract.json"), JSON.stringify(cheapAcceptance.ingested.retrievalContract, null, 2));
  writeFileSync(resolve(outDir, "exact-resolution-hits.json"), JSON.stringify(cheapAcceptance.retrieval.exactResolutionHits, null, 2));
  writeFileSync(resolve(outDir, "candidate-dictionary.json"), JSON.stringify(cheapAcceptance.retrieval.candidateDictionary, null, 2));
  writeFileSync(
    resolve(outDir, "requirement-pools.json"),
    JSON.stringify(cheapAcceptance.retrieval.requirementPools, null, 2),
  );
  writeFileSync(resolve(outDir, "land-pool.json"), JSON.stringify(cheapAcceptance.retrieval.landPool, null, 2));
  writeFileSync(resolve(outDir, "supply-gate.json"), JSON.stringify(cheapAcceptance.supplyGate, null, 2));
  writeFileSync(
    resolve(outDir, "constructor-input-acceptance.json"),
    JSON.stringify(cheapAcceptance.constructorInputAcceptance, null, 2),
  );
  writeFileSync(resolve(outDir, "call-2-constructor-prompt.txt"), `${cheapAcceptance.bundle.systemPrompt}\n\n---\n\n${cheapAcceptance.bundle.userPrompt}`);

  const cheapOk = p0Pass && ingestionPass && constructorInputPass && cheapAcceptance.pass;

  let report = null;
  if (cheapOk) {
    report = await runSolDirectedDeckConstructionV11({
      caseId: "tokens-chatterfang",
      commander,
      bracket: 3,
      playstyle: "tokens/sacrifice",
      catalog,
      p0TruthPass: p0Pass,
      cheapAcceptance,
      architectFixtureRaw: architectRaw,
    });
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
    if (report.constructedDeck) {
      writeFileSync(resolve(outDir, "constructed-deck.json"), JSON.stringify(report.constructedDeck, null, 2));
    }
    if (report.validation) {
      writeFileSync(resolve(outDir, "validation.json"), JSON.stringify(report.validation, null, 2));
    }
  }

  writeFileSync(
    resolve(outDir, "REPORT.md"),
    [
      "# PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_1 — Chatterfang Report",
      "",
      `**Decision:** PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_1 — REPORT AND WAIT`,
      "",
      `- P0: ${p0Pass ? "PASS" : "FAIL"}`,
      `- Ingestion regression: ${ingestionPass ? "PASS" : "FAIL"}`,
      `- Constructor input acceptance: ${constructorInputPass ? "PASS" : "FAIL"}`,
      `- Supply gate: ${cheapAcceptance.supplyGate.pass ? "PASS" : "FAIL"} (${cheapAcceptance.retrieval.uniqueNonlandCount} unique nonlands)`,
      `- Live run: ${report ? report.summary : "SKIPPED — cheap acceptance not fully passing"}`,
      "",
      report
        ? `- Model calls used: ${report.modelCallBudget.used}/${report.modelCallBudget.max}`
        : "",
      report?.failure ? `- Failure: ${report.failure}` : "",
      "",
      "**Commander #10 NOT authorized. Production rewire NOT authorized.**",
    ].join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        cheapOk,
        uniqueNonlandCount: cheapAcceptance.retrieval.uniqueNonlandCount,
        supplyGatePass: cheapAcceptance.supplyGate.pass,
        liveFailure: report?.failure ?? "LIVE_SKIPPED",
        liveSummary: report?.summary ?? null,
        outDir,
        modelCallsUsed: report?.modelCallBudget.used ?? 0,
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
