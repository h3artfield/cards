/**
 * v4.11 — Execute bracket upgrade mission on existing B4 Korvold final list.
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
import { runStandaloneBracketUpgradeMissionV411 } from "../src/lib/deck-synthesis/professor-finalization-pipeline-v4-11-v1";
import type { CreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { computeFinalDeckFingerprintV411 } from "../src/lib/deck-synthesis/professor-deck-fingerprint-v4-11-v1";
import { computeDeckSnapshotV47 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-7-v1";

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

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-11-b4-upgrade-mission");
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
    const canonical = card.canonicalName.split(" //")[0]!.trim();
    if (canonical === target || card.canonicalName === name) {
      const profile = buildFunctionalCardProfileV47(card);
      const isLand = (card.typeLine ?? "").toLowerCase().includes("land");
      return {
        cardId: `card-${i}`,
        oracleId: card.oracleId,
        name: card.canonicalName,
        proposedBy: "RESEARCH",
        origin: "ORACLE_SEARCH",
        proposalReason: "Imported",
        functions: profile.roles,
        roles: profile.roles,
        packages: [],
        engines: [],
        commanderDependence: "MEDIUM",
        worksWithoutCommander: "MEDIUM",
        semanticConnections: [],
        oracleVerified: true,
        legalityVerified: true,
        colorIdentityVerified: true,
        criticStatus: "CHARTER_OK",
        status: "SELECTED",
        addedAtRevision: 1,
        lastReviewedRevision: 1,
        category: isLand ? "land" : "spell",
      };
    }
  }
  return {
    cardId: `card-${i}`,
    oracleId: null,
    name,
    proposedBy: "RESEARCH",
    origin: "ORACLE_SEARCH",
    proposalReason: "Imported",
    functions: ["land"],
    roles: ["land"],
    packages: [],
    engines: [],
    commanderDependence: "LOW",
    worksWithoutCommander: "HIGH",
    semanticConnections: [],
    oracleVerified: true,
    legalityVerified: true,
    colorIdentityVerified: true,
    criticStatus: "CHARTER_OK",
    status: "SELECTED",
    addedAtRevision: 1,
    lastReviewedRevision: 1,
    category: /^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(name) ? "land" : "spell",
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const catalog = await loadDeckResolutionCatalog();
  const raw = JSON.parse(readFileSync(V410_B4, "utf8"));
  const names: string[] = raw.deckStats.allCardNames;
  const buildPlan = buildBracketBuildPlanV49({
    bracket: 4,
    playStyle: "Sacrifice Engine",
    relationship: "Harmony",
    commanderName: "Korvold, Fae-Cursed King",
    pass1: pass1Stub,
  });
  const powerPlan = buildBracketPowerPlanV410({
    bracket: 4,
    commanderName: "Korvold, Fae-Cursed King",
    playStyle: "Sacrifice Engine",
    relationship: "Harmony",
    pass1: pass1Stub,
    buildPlan,
  });

  const councilState = {
    phase: "BUILDING",
    buildPhase: "PROVISIONAL_100",
    selectedCards: names.map((n, i) => cardFromName(catalog, n, i)),
    snapshots: [],
    deckNeeds: [],
    bracketBuildPlan: buildPlan,
    bracketPowerPlanV410: powerPlan,
    assemblyRevision: 99,
    checkpointsCompleted: [99],
    deckCharter: null,
    conversation: [],
    councilDecisions: [],
    cardDecisions: [],
    functionalProfiles: {},
    candidatePool: [],
    discoveryReports: [],
    legalityGate: null,
  } as unknown as ProfessorCouncilStateV47;

  const audit = resolveBenchmarkCommanderName(catalog, "Korvold, Fae-Cursed King");
  if (!audit.resolved || !audit.oracleId) throw new Error("Korvold not resolved");
  const golden = catalog.byOracleId.get(audit.oracleId)!;

  console.log("Running B4 upgrade mission on v4.10 final list…");
  const result = await runStandaloneBracketUpgradeMissionV411({
    commanderName: "Korvold, Fae-Cursed King",
    commanderOracleId: audit.oracleId,
    commanderColorIdentity: golden.colorIdentity ?? ["B", "R", "G"],
    bracket: 4,
    charter: null,
    councilState,
    catalog,
  });

  const snap = computeDeckSnapshotV47({ state: result.councilState, catalog });
  const fp = computeFinalDeckFingerprintV411({ state: result.councilState, catalog });

  const output = {
    requestedBracket: 4,
    initialPredicted: raw.headProfessor.predictedEffectiveBracket,
    finalPredicted: result.adjudication.predictedEffectiveBracket,
    missionStatus: result.mission.status,
    missionIteration: result.mission.iteration,
    deficits: result.mission.deficits,
    bracketDragCards: result.mission.bracketDragCards,
    tutorCandidatesTop5: result.mission.tutorCandidatesConsidered.slice(0, 5),
    gameChangersSelected: result.mission.gameChangersConsidered.filter((g) => g.selected).slice(0, 5),
    gameChangersRejected: result.mission.gameChangersConsidered.filter((g) => g.rejectionReason).slice(0, 5),
    proposedSwaps: result.mission.proposedSwaps,
    acceptedSwaps: result.mission.acceptedSwaps,
    rejectedSwaps: result.mission.rejectedSwaps,
    resultingDeck: result.councilState.selectedCards.map((c) => c.name),
    metrics: {
      lands: fp.landCount,
      avgMV: fp.avgManaValue,
      tutors: fp.tutorCount,
      ramp: fp.rampNonLandCount,
    },
    fingerprint: fp,
    adjudication: result.adjudication,
  };

  writeFileSync(resolve(OUT_DIR, "upgrade-result.json"), JSON.stringify(output, null, 2));

  const report = [
    "# v4.11 B4 Korvold Upgrade Mission",
    "",
    `- Requested: B4 | Initial (v4.10 stale): B${output.initialPredicted} | After mission: **B${output.finalPredicted}**`,
    `- Mission status: **${output.missionStatus}** (iteration ${output.missionIteration})`,
    `- Accepted swaps: ${output.acceptedSwaps.length} | Rejected: ${output.rejectedSwaps.length}`,
    "",
    "## Deficits",
    ...output.deficits.map((d) => `- [${d.severity}] ${d.category}: ${d.evidence.slice(0, 120)}`),
    "",
    "## Bracket drag cards (Sol)",
    ...output.bracketDragCards.map((d) => `- ${d.card} (${d.priority}): ${d.whyItDragsBracket.slice(0, 100)}`),
    "",
    "## Tutor candidates (top 5)",
    ...output.tutorCandidatesTop5.map((t) => `- ${t.name} (${t.classification}) score=${t.bracketScore}`),
    "",
    "## Accepted swaps",
    ...output.acceptedSwaps.map((s) => `- CUT ${s.cut} → ADD ${s.add}: ${s.reason.slice(0, 100)}`),
    "",
    "## Metrics after upgrade",
    `- lands=${output.metrics.lands} avgMV=${output.metrics.avgMV} tutors=${output.metrics.tutors} ramp=${output.metrics.ramp}`,
    "",
    output.finalPredicted >= 4 ? "**SUCCESS — B4 target reached**" : "**BRACKET_TARGET_UNRESOLVED** — see upgrade-result.json for details",
  ].join("\n");

  writeFileSync(resolve(OUT_DIR, "REPORT.md"), report);
  console.log(report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
