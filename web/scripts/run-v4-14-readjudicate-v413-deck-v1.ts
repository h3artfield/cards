/**
 * v4.14 — Re-adjudicate post-v4.13 deck with corrected metrics, then package pass if needed.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveBenchmarkCommanderName } from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";
import type { CouncilCardV46 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-6-v1";
import type { ProfessorCouncilStateV47 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-7-v1";
import { buildFunctionalCardProfileV47 } from "../src/lib/deck-synthesis/professor-functional-profile-v4-7-v1";
import { prepareDeckForBracketAdjudicationV412 } from "../src/lib/deck-synthesis/professor-final-deck-canonical-v4-12-v1";
import { buildFinalDeckDoctorDossierV48 } from "../src/lib/deck-synthesis/professor-deck-dossier-v4-8-v1";
import { runBracketAdjudicationV411 } from "../src/lib/deck-synthesis/professor-bracket-adjudication-v4-11-v1";
import { computeFinalDeckFingerprintV411 } from "../src/lib/deck-synthesis/professor-deck-fingerprint-v4-11-v1";
import {
  computeVerifiedDeckSnapshotV414,
  hydrateAndVerifyDeckStateV414,
} from "../src/lib/deck-synthesis/professor-verified-final-snapshot-v4-14-v1";
import { runPackageRefinementPassV414 } from "../src/lib/deck-synthesis/professor-finalization-pipeline-v4-14-v1";
import { gameChangerOracleIdSet, loadCommanderGameChangerSnapshot } from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";

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

const OUT = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-14-readjudicate-v413-deck");
const V413 = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-13-b3-deep-refinement/deep-refinement-result.json");

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
  const v413 = JSON.parse(readFileSync(V413, "utf8"));
  const names: string[] = v413.resultingDeck;

  const councilState = {
    phase: "BUILDING", buildPhase: "PROVISIONAL_100",
    selectedCards: names.map((n, i) => cardFromName(catalog, n, i)),
    snapshots: [], deckNeeds: [], assemblyRevision: 140, functionalProfiles: {},
    conversation: [], councilDecisions: [], cardDecisions: [], candidatePool: [],
  } as unknown as ProfessorCouncilStateV47;

  const audit = resolveBenchmarkCommanderName(catalog, "Korvold, Fae-Cursed King");
  const golden = catalog.byOracleId.get(audit.oracleId!)!;
  const gcIds = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());

  const prepared = prepareDeckForBracketAdjudicationV412({
    state: councilState, catalog, colorIdentity: golden.colorIdentity ?? ["B","R","G"],
    commanderName: "Korvold, Fae-Cursed King",
  });
  let state = hydrateAndVerifyDeckStateV414({ state: prepared.state, catalog });
  let fp = computeFinalDeckFingerprintV411({ state, catalog });
  const verifiedBefore = computeVerifiedDeckSnapshotV414({ state, catalog });

  const dossier = buildFinalDeckDoctorDossierV48({
    commanderName: "Korvold, Fae-Cursed King", commanderOracleId: audit.oracleId,
    commanderColorIdentity: golden.colorIdentity ?? ["B","R","G"], bracket: 4,
    userIntent: [], relationshipLens: null, charter: null, theory: null, councilState: state, catalog,
  });

  console.log("Re-adjudicating with CORRECTED metrics…");
  console.log(`  interaction=${verifiedBefore.interaction.rawCount} protection=${verifiedBefore.protection.rawCount} tutors=${verifiedBefore.tutors.rawCount}`);

  let adj = await runBracketAdjudicationV411({
    dossier, fingerprint: fp,
    gameChangerCount: state.selectedCards.filter((c) => c.oracleId && gcIds.has(c.oracleId)).length,
  });

  const metricTruthPass =
    verifiedBefore.interaction.rawCount >= 1 &&
    verifiedBefore.protection.rawCount >= 1 &&
    adj.headProfessorReviewedDeckFingerprint === fp.finalDeckFingerprint;

  let packageResult = null;
  if (adj.predictedEffectiveBracket < 4) {
    console.log(`  Still B${adj.predictedEffectiveBracket} — running package pass…`);
    packageResult = await runPackageRefinementPassV414({
      councilState: state, catalog, commanderName: "Korvold, Fae-Cursed King",
      commanderColorIdentity: golden.colorIdentity ?? ["B","R","G"], bracket: 4, charter: null, adjudication: adj,
      onProgress: (m) => console.log(`  ${m}`),
    });
    state = packageResult.councilState;
    fp = packageResult.fingerprint;
    adj = packageResult.adjudication;
  }

  const verifiedAfter = computeVerifiedDeckSnapshotV414({ state, catalog });

  const output = {
    metricTruthPass,
    oldBracketReported: v413.finalSolBracket,
    correctedAdjudicationBracket: adj.predictedEffectiveBracket,
    verifiedBefore,
    verifiedAfter,
    adjudication: adj,
    packageResult,
    fingerprint: fp.finalDeckFingerprint,
  };
  writeFileSync(resolve(OUT, "result.json"), JSON.stringify(output, null, 2));

  const report = [
    "# v4.14 Re-adjudication — Post-v4.13 Deck",
    "",
    `## METRIC TRUTH PASS: ${metricTruthPass ? "YES" : "NO"}`,
    `- interaction (corrected): **${verifiedBefore.interaction.rawCount}** (${verifiedBefore.interaction.quality.cards.join(", ")})`,
    `- protection (corrected): **${verifiedBefore.protection.rawCount}** (${verifiedBefore.protection.quality.cards.join(", ")})`,
    `- tutors: **${verifiedBefore.tutors.rawCount}**`,
    `- fingerprint binding: **${adj.headProfessorReviewedDeckFingerprint === fp.finalDeckFingerprint}**`,
    "",
    `## Bracket`,
    `- v4.13 reported: B${v413.finalSolBracket}`,
    `- Corrected metrics Sol: **B${adj.predictedEffectiveBracket}**`,
    "",
    packageResult ? `## Package pass: ${packageResult.acceptedPackages.length} accepted` : "",
  ].join("\n");
  writeFileSync(resolve(OUT, "REPORT.md"), report);
  console.log("\n" + report);
}

main().catch((e) => { console.error(e); process.exit(1); });
