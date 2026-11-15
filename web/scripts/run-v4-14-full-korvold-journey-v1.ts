/**
 * v4.14 — Full B2→B4 journey on original v4.10 Korvold fixture.
 * v4.12 filler → v4.13 opportunity-cost → v4.14 package refinement
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveBenchmarkCommanderName } from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";
import type { CouncilCardV46 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-6-v1";
import type { ProfessorCouncilStateV47 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-7-v1";
import { buildFunctionalCardProfileV47 } from "../src/lib/deck-synthesis/professor-functional-profile-v4-7-v1";
import { buildBracketPowerPlanV410 } from "../src/lib/deck-synthesis/professor-bracket-power-plan-v4-10-v1";
import { buildBracketBuildPlanV49 } from "../src/lib/deck-synthesis/professor-bracket-build-plan-v4-9-v1";
import type { CreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { runFullBracketUpgradeJourneyV414 } from "../src/lib/deck-synthesis/professor-finalization-pipeline-v4-14-v1";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
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
loadEnvLocal();

const OUT = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-14-full-korvold-journey");
const V410_B4 = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-10-bracket-ab-live/run-b-b4.json");

const pass1Stub: CreativeProfessorPass1V4 = {
  strategicThesis: "Sacrifice engine with token generation",
  packages: [{ concept: "Token Generation", likelyCardsOrEffects: [], role: "ENGINE" }],
  researchModes: ["Mechanic"],
  claims: [],
};

function cardFromName(catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>, name: string, i: number): CouncilCardV46 {
  const target = name.split(" //")[0]!.trim();
  for (const [, card] of catalog.byOracleId.entries()) {
    if (card.canonicalName.split(" //")[0]!.trim() === target || card.canonicalName === name) {
      const profile = buildFunctionalCardProfileV47(card);
      const isLand = (card.typeLine ?? "").toLowerCase().includes("land");
      return {
        cardId: `card-${i}`, oracleId: card.oracleId, name: card.canonicalName,
        proposedBy: "RESEARCH", origin: "ORACLE_SEARCH", proposalReason: "Imported",
        functions: profile.roles, roles: profile.roles, packages: [], engines: [],
        commanderDependence: "MEDIUM", worksWithoutCommander: "MEDIUM", semanticConnections: [],
        oracleVerified: true, legalityVerified: true, colorIdentityVerified: true,
        criticStatus: "CHARTER_OK", status: "SELECTED", addedAtRevision: 1, lastReviewedRevision: 1,
        category: isLand ? "land" : "spell",
      };
    }
  }
  return {
    cardId: `card-${i}`, oracleId: null, name, proposedBy: "RESEARCH", origin: "ORACLE_SEARCH",
    proposalReason: "Imported", functions: ["land"], roles: ["land"], packages: [], engines: [],
    commanderDependence: "LOW", worksWithoutCommander: "HIGH", semanticConnections: [],
    oracleVerified: true, legalityVerified: true, colorIdentityVerified: true,
    criticStatus: "CHARTER_OK", status: "SELECTED", addedAtRevision: 1, lastReviewedRevision: 1,
    category: /^(Plains|Island|Swamp|Mountain|Forest)$/.test(name) ? "land" : "spell",
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const catalog = await loadDeckResolutionCatalog();
  const raw = JSON.parse(readFileSync(V410_B4, "utf8"));
  const names: string[] = raw.deckStats.allCardNames;

  const buildPlan = buildBracketBuildPlanV49({
    bracket: 4, playStyle: "Sacrifice Engine", relationship: "Harmony",
    commanderName: "Korvold, Fae-Cursed King", pass1: pass1Stub,
  });
  const powerPlan = buildBracketPowerPlanV410({
    bracket: 4, commanderName: "Korvold, Fae-Cursed King", playStyle: "Sacrifice Engine",
    relationship: "Harmony", pass1: pass1Stub, buildPlan,
  });

  const councilState = {
    phase: "BUILDING", buildPhase: "PROVISIONAL_100",
    selectedCards: names.map((n, i) => cardFromName(catalog, n, i)),
    snapshots: [], deckNeeds: [], bracketBuildPlan: buildPlan, bracketPowerPlanV410: powerPlan,
    assemblyRevision: 99, functionalProfiles: {}, conversation: [], councilDecisions: [],
    cardDecisions: [], candidatePool: [],
  } as unknown as ProfessorCouncilStateV47;

  const audit = resolveBenchmarkCommanderName(catalog, "Korvold, Fae-Cursed King");
  const golden = catalog.byOracleId.get(audit.oracleId!)!;

  console.log("v4.14 full journey — original B2 Korvold fixture…");
  const result = await runFullBracketUpgradeJourneyV414({
    councilState, catalog,
    commanderName: "Korvold, Fae-Cursed King",
    commanderOracleId: audit.oracleId,
    commanderColorIdentity: golden.colorIdentity ?? ["B", "R", "G"],
    bracket: 4, charter: null,
    onProgress: (m) => console.log(`  ${m}`),
  });

  const initialBracket = result.journey[0]?.bracket ?? 2;
  const finalBracket = result.adjudication.predictedEffectiveBracket;
  const totalCardSwaps = result.missions.reduce((n, m) => n + m.acceptedSwaps.length, 0);
  const packageSwaps = result.packageResult?.acceptedPackages.length ?? 0;

  const metricTruthPass =
    result.verifiedSnapshot.interaction.rawCount >= 0 &&
    result.adjudication.headProfessorReviewedDeckFingerprint === result.fingerprint.finalDeckFingerprint;

  const output = {
    journey: result.journey,
    initialBracket,
    finalBracket,
    requestedBracket: 4,
    totalCardSwaps,
    packageSwaps,
    verifiedSnapshot: result.verifiedSnapshot,
    missions: result.missions,
    packageResult: result.packageResult,
    fingerprint: result.fingerprint.finalDeckFingerprint,
    resultingDeck: result.councilState.selectedCards.map((c) => c.name),
    acceptance: {
      metricTruthPass,
      packagePipelinePass: (result.packageResult?.packageProposals.length ?? 0) > 0 && packageSwaps > 0,
      qualityPass: finalBracket > initialBracket || totalCardSwaps + packageSwaps >= 5,
      productPass: finalBracket >= 4,
    },
  };

  writeFileSync(resolve(OUT, "journey-result.json"), JSON.stringify(output, null, 2));

  const report = [
    "# v4.14 Full Korvold Journey (Original B2 Fixture)",
    "",
    "## Journey",
    ...result.journey.map((j) => `- **${j.phase}**: B${j.bracket} | fp=${j.fingerprint.slice(0, 12)}… | swaps=${j.swaps}`),
    "",
    `**Initial → Final: B${initialBracket} → B${finalBracket}** (requested B4)`,
    "",
    "## Acceptance",
    `- METRIC TRUTH: ${output.acceptance.metricTruthPass ? "PASS" : "FAIL"}`,
    `- interaction=${result.verifiedSnapshot.interaction.rawCount} protection=${result.verifiedSnapshot.protection.rawCount} tutors=${result.verifiedSnapshot.tutors.rawCount}`,
    `- PACKAGE PIPELINE: ${output.acceptance.packagePipelinePass ? "PASS" : "FAIL"} (${packageSwaps} package batches)`,
    `- QUALITY: ${output.acceptance.qualityPass ? "PASS" : "FAIL"}`,
    `- PRODUCT (B4): ${output.acceptance.productPass ? "PASS" : "FAIL"}`,
    "",
    "## Card swaps (v4.12/v4.13)",
    ...result.missions.flatMap((m) => m.acceptedSwaps.map((s) => `- CUT ${s.cut} → ADD ${s.add}`)),
    "",
    "## Package swaps (v4.14)",
    ...(result.packageResult?.acceptedPackages ?? []).map((p) => `- PKG: CUT [${p.removeCards.join(", ")}] → ADD [${p.addCards.join(", ")}]`),
  ].join("\n");
  writeFileSync(resolve(OUT, "REPORT.md"), report);
  console.log("\n" + report);
}

main().catch((e) => { console.error(e); process.exit(1); });
