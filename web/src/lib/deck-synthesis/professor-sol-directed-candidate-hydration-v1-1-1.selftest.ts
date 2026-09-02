/**
 * Candidate-scoped hydration regression on archived v1.1 Constructor output (no OpenAI).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveCommanderBlueprintFromCatalogV417 } from "./professor-commander-catalog-v4-17-v1";
import { loadDeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { hydrateSolDirectedConstructedDeckV111 } from "./professor-sol-directed-candidate-hydration-v1-1-1";
import type {
  CanonicalCardFactsV11,
  LandPoolV11,
  RequirementPoolV11,
} from "./professor-sol-directed-types-v1-1";
import {
  evaluatePreHeadProfessorGateV111,
  validateSolDirectedDeckV111,
} from "./professor-sol-directed-pre-head-professor-gate-v1-1-1";

function artifactPath(name: string): string {
  const candidates = [
    resolve(process.cwd(), `data/milestones/deck-synthesis/sol-directed-chatterfang-v1-1/${name}`),
    resolve(process.cwd(), `web/data/milestones/deck-synthesis/sol-directed-chatterfang-v1-1/${name}`),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[0]!;
}

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

async function main() {
  loadEnvLocal();

  const raw = JSON.parse(readFileSync(artifactPath("call-1-constructor-response.json"), "utf8"));
  const candidateDictionary = JSON.parse(
    readFileSync(artifactPath("candidate-dictionary.json"), "utf8"),
  ) as Record<string, CanonicalCardFactsV11>;
  const requirementPools = JSON.parse(
    readFileSync(artifactPath("requirement-pools.json"), "utf8"),
  ) as RequirementPoolV11[];
  const landPool = JSON.parse(readFileSync(artifactPath("land-pool.json"), "utf8")) as LandPoolV11;
  const retrievalContract = JSON.parse(readFileSync(artifactPath("retrieval-contract.json"), "utf8"));

  const catalog = await loadDeckResolutionCatalog();
  const commander = resolveCommanderBlueprintFromCatalogV417({
    catalog,
    commanderName: "Chatterfang, Squirrel General",
  });

  const { deck, ledger, errors } = hydrateSolDirectedConstructedDeckV111({
    raw,
    commander,
    context: { candidateDictionary, requirementPools, landPool },
  });

  assert.equal(errors.length, 0, errors.join("; "));
  const bastion = deck.nonlands.find((card) => card.name === "Bastion of Remembrance");
  assert.ok(bastion, "Bastion present");
  assert.equal(bastion!.oracleId, "c7f33cea-2ec8-4081-9208-a5b1d86721b3");

  const bastionLedger = ledger.find(
    (entry) => entry.selectionName === "Bastion of Remembrance" && entry.resolutionSource === "CANDIDATE_DICTIONARY",
  );
  assert.ok(bastionLedger);
  assert.equal(bastionLedger!.resolvedOracleId, "c7f33cea-2ec8-4081-9208-a5b1d86721b3");

  const validation = validateSolDirectedDeckV111({
    deck,
    catalog,
    contract: retrievalContract,
    candidateDictionary,
    landPool,
    identityLedger: ledger,
  });
  const gate = evaluatePreHeadProfessorGateV111(validation);
  assert.equal(gate.pass, true, gate.reasons.join("; "));
  assert.equal(validation.architectRequirementRealization.pass, true);
  assert.equal(validation.legacyHeuristicAudit.label, "NON_AUTHORITATIVE_DIAGNOSTIC");
  assert.equal(deck.nonlands.length, 63);
  assert.equal(deck.lands.reduce((sum, land) => sum + land.copies, 0), 36);

  console.log("PASS candidate-scoped hydration — Bastion maps to c7f33cea and pre-Head-Professor gate passes");
  console.log("ALL PASS — professor-sol-directed-candidate-hydration-v1-1-1");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
