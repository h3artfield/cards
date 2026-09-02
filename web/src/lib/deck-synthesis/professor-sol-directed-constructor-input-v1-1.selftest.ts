/**
 * Constructor input acceptance — fixture architect + retrieval, no OpenAI.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { resolveCommanderBlueprintFromCatalogV417 } from "./professor-commander-catalog-v4-17-v1";
import { ingestArchitectResponseV11 } from "./professor-sol-directed-architect-ingestion-v1-1";
import { runSolDirectedRetrievalV11 } from "./professor-sol-directed-retrieval-v1-1";
import {
  acceptanceTestConstructorInputV11,
  buildConstructorInputBundleV11,
} from "./professor-sol-directed-constructor-input-v1-1";
import { evaluateConstructorSupplyGateV11 } from "./professor-sol-directed-supply-gate-v1-1";

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

function fixturePath(): string {
  const candidates = [
    resolve(process.cwd(), "data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json"),
    resolve(process.cwd(), "web/data/milestones/deck-synthesis/sol-directed-chatterfang-v1/call-1-architect-response.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error("Missing call-1-architect-response.json fixture");
}

async function main() {
  loadEnvLocal();
  const raw = JSON.parse(readFileSync(fixturePath(), "utf8"));
  const catalog = await loadDeckResolutionCatalog();
  const commander = resolveCommanderBlueprintFromCatalogV417({
    catalog,
    commanderName: "Chatterfang, Squirrel General",
  });

  const ingested = ingestArchitectResponseV11(raw);
  const retrieval = runSolDirectedRetrievalV11({
    contract: ingested.retrievalContract,
    catalog,
    commander,
  });
  const supplyGate = evaluateConstructorSupplyGateV11({
    contract: ingested.retrievalContract,
    retrieval,
  });
  const bundle = buildConstructorInputBundleV11({
    architectRawPlan: ingested.architectRawPlan,
    retrievalContract: ingested.retrievalContract,
    retrieval,
    commander,
    bracket: 3,
    supplyGate,
  });
  const acceptance = acceptanceTestConstructorInputV11({ bundle, retrieval });

  console.log(
    JSON.stringify(
      {
        uniqueNonlandCount: retrieval.uniqueNonlandCount,
        supplyGatePass: supplyGate.pass,
        supplyGateReasons: supplyGate.reasons,
        perRequirement: supplyGate.perRequirement.map((r) => ({
          id: r.requirementId,
          available: r.availableCount,
          requested: r.requestedCount,
        })),
        promptBytes: Buffer.byteLength(bundle.userPrompt, "utf8"),
        checks: acceptance.checks,
      },
      null,
      2,
    ),
  );

  if (!acceptance.pass) {
    console.error("FAIL constructor input acceptance:", acceptance.failures);
    process.exit(1);
  }

  assert.ok(retrieval.uniqueNonlandCount >= 63);
  assert.ok(supplyGate.pass);
  assert.ok(bundle.userPrompt.includes('"architectRawPlan"'));
  assert.ok(bundle.userPrompt.includes("ramp_and_fixing"));
  assert.ok(bundle.userPrompt.includes('"evidenceHierarchy"'));
  assert.ok(bundle.userPrompt.includes('"retrievalEvidence"'));
  assert.ok(bundle.systemPrompt.includes("RETRIEVAL EVIDENCE"));
  assert.ok(bundle.userPrompt.includes('"semanticOracle"'));
  assert.ok(bundle.userPrompt.includes('"userSemanticPreferences"'));
  assert.ok(bundle.userPrompt.includes('"eligibleRequirementPools"'));
  assert.ok(!bundle.userPrompt.includes('"req-1"'));

  console.log("PASS constructor input acceptance — prompt ready for Call 2");
  console.log("ALL PASS — professor-sol-directed-constructor-input-v1-1");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
