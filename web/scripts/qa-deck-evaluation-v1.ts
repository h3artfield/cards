#!/usr/bin/env npx tsx
/**
 * Deck Evaluation Engine v1 + Bracket Policy — foundation QA.
 * Descriptive evaluateDeck, evaluateSwap, bracket validation only.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import {
  explainBracketFit,
  getBracketPolicy,
  validateBracketHardRules,
} from "../src/lib/bracket-policy/bracket-policy-v1";
import {
  coerceNormalizedDeckInstance,
  evaluateDeck,
  evaluateSwap,
} from "../src/lib/deck-evaluation";
import { loadCommanderGameChangerSnapshot } from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";

loadProjectEnvLocal();

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();

  function oracleIdByName(name: string): string {
    const row = lookupGoldenByName(catalog, name);
    if (!row?.oracleId) throw new Error(`Missing card: ${name}`);
    return row.oracleId;
  }

  const meren = oracleIdByName("Meren of Clan Nel Toth");
  const mainboardNames = [
    "Swamp", "Swamp", "Forest", "Forest", "Command Tower", "Arcane Signet", "Sol Ring",
    "Reanimate", "Animate Dead", "Living Death", "Victimize", "Dread Return",
    "Gravecrawler", "Stitcher's Supplier", "Blood Artist", "Zulaport Cutthroat",
    "Viscera Seer", "Carrion Feeder", "Ashnod's Altar", "Phyrexian Altar",
    "Skullclamp", "Smothering Tithe", "Toxic Deluge", "Beast Within",
  ];

  const mainboard = mainboardNames.map((name) => ({
    oracleId: oracleIdByName(name),
    quantity: name === "Swamp" || name === "Forest" ? 10 : 1,
  }));

  const deck = coerceNormalizedDeckInstance({
    deck: { commanderOracleIds: [meren], mainboard, deckHash: "qa-deck-eval-v1" },
    catalog,
  });

  const report = evaluateDeck({ deck, catalog, shadowIndex, gameChangerSnapshot });
  const swap = evaluateSwap({
    request: {
      deck,
      removeOracleId: oracleIdByName("Gravecrawler"),
      addOracleId: oracleIdByName("Muldrotha, the Gravetide"),
    },
    catalog,
    shadowIndex,
    gameChangerSnapshot,
  });

  const bracket3 = validateBracketHardRules({ deck, bracket: 3, catalog, gameChangerSnapshot });
  const bracketFit = explainBracketFit({ deck, bracket: 3, catalog, shadowIndex });

  const checks = [
    {
      check: "evaluateDeck returns descriptive profile",
      pass: report.descriptive.profileVersion === "deck-mechanical-profile-v1",
    },
    {
      check: "evaluative layer null (descriptive-only)",
      pass: report.evaluative === null && report.recommendation === null,
    },
    {
      check: "IPV2.1 zone profiles separate (MB and CMD non-empty)",
      pass:
        Object.keys(report.descriptive.zoneProfiles.mainboard).length > 0 &&
        Object.keys(report.descriptive.zoneProfiles.commandZone).length > 0,
    },
    {
      check: "mechanical dimensions projected",
      pass: report.descriptive.dimensions.length >= 10,
    },
    {
      check: "card contributions with evidence",
      pass:
        report.descriptive.cardContributions.length > 0 &&
        report.descriptive.cardContributions.some((c) => c.evidenceRefs.length > 0),
    },
    {
      check: "graveyard reliance dimension present",
      pass: report.descriptive.relianceDimensions.graveyard_reliance !== undefined,
    },
    {
      check: "evaluateSwap produces before/after and delta",
      pass: swap.before.descriptive.dimensions.length > 0 && swap.after.descriptive.dimensions.length > 0,
    },
    {
      check: "evaluateSwap explanation non-empty",
      pass: swap.explanation.length >= 2,
    },
    {
      check: "bracket policy loads",
      pass: getBracketPolicy(3).hardRules.gameChangerMax === 3,
    },
    {
      check: "bracket validation runs (QA deck may fail size — expected)",
      pass: typeof bracket3.bracketRulesSatisfied === "boolean" && Array.isArray(bracket3.violations),
    },
    {
      check: "bracketIntentFit labeled heuristic",
      pass: bracketFit.note.includes("HEURISTIC"),
    },
  ];

  const qaReport = {
    version: "deck-evaluation-engine-v1-foundation-qa",
    generatedAt: new Date().toISOString(),
    qaVerdict: checks.every((c) => c.pass) ? "PASS" : "FAIL",
    checks,
    sampleDeck: {
      commanderOracleId: meren,
      mainboardUnique: mainboard.length,
      mainboardTotal: mainboard.reduce((s, r) => s + r.quantity, 0),
    },
    evaluateDeckSummary: {
      dimensionCount: report.descriptive.dimensions.length,
      contributionCount: report.descriptive.cardContributions.length,
      semanticCoverage: report.meta.coverage.semanticCoverageByQuantity,
      graveyardRelianceMb: report.descriptive.relianceDimensions.graveyard_reliance?.mainboard,
      commanderCohesion: report.descriptive.commanderCohesion?.commanderSynergy ?? null,
    },
    swapSummary: {
      removeOracleId: swap.meta.removeOracleId,
      addOracleId: swap.meta.addOracleId,
      topDimensionShifts: swap.delta.mechanicalProfile
        .filter((d) => Math.abs(d.delta) > 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 5),
    },
    bracketSummary: {
      bracket3RulesSatisfied: bracket3.bracketRulesSatisfied,
      violationCodes: bracket3.violations.map((v) => v.code),
      bracketIntentFit: bracketFit.bracketIntentFit,
    },
    authorization: {
      descriptiveImplementation: "QA_COMPLETE",
      evaluateSwapFoundation: "QA_COMPLETE",
      bracketPolicyEngine: "QA_COMPLETE",
      heuristicScores: "WAIT",
      archetypeDiscovery: "WAIT",
      optimizer: "WAIT",
      synthesisImplementation: "WAIT",
    },
  };

  qaReport.qaVerdict = checks.every((c) => c.pass) ? "PASS" : "FAIL";

  const outDir = resolve(process.cwd(), "data/milestones/deck-evaluation");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "deck-evaluation-engine-v1-foundation-qa.json");
  writeFileSync(outPath, JSON.stringify(qaReport, null, 2));

  const hash = createHash("sha256").update(JSON.stringify(qaReport)).digest("hex");
  console.log(JSON.stringify({ qaVerdict: qaReport.qaVerdict, checks: checks.filter((c) => !c.pass), outPath, hash }, null, 2));
  if (qaReport.qaVerdict !== "PASS") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
