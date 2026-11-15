/**
 * v4.12 — Bracket upgrade swap execution on existing B4 Korvold final list.
 * Acceptance: PIPELINE / QUALITY / PRODUCT target levels reported separately.
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
import { runStandaloneBracketUpgradeMissionV412 } from "../src/lib/deck-synthesis/professor-finalization-pipeline-v4-12-v1";
import type { CreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import type { BracketUpgradeMissionV412 } from "../src/lib/deck-synthesis/professor-bracket-upgrade-mission-v4-12-v1";

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

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-12-b4-upgrade-mission");
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

function acceptanceLevels(args: {
  missions: BracketUpgradeMissionV412[];
  initialFingerprint: string;
  finalFingerprint: string;
  initialPredicted: number;
  finalPredicted: number;
  requested: number;
  hpReviewedFinal: boolean;
}) {
  const totalAccepted = args.missions.reduce((n, m) => n + m.acceptedSwaps.length, 0);
  const dragSlotsFound = args.missions.some((m) => m.bracketDragSlots.length > 0);
  const candidatesFound = args.missions.some(
    (m) => m.tutorCandidates.length > 0 || m.gameChangerCandidates.length > 0,
  );
  const fingerprintChanged = args.initialFingerprint !== args.finalFingerprint;

  const pipelinePass =
    dragSlotsFound &&
    candidatesFound &&
    totalAccepted > 0 &&
    fingerprintChanged &&
    args.hpReviewedFinal;

  const qualityPass = args.finalPredicted > args.initialPredicted;
  const productPass = args.finalPredicted >= args.requested;

  return { pipelinePass, qualityPass, productPass, totalAccepted };
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

  console.log("v4.12 — B4 Korvold upgrade mission (no pre-cut rebalance)…");
  const result = await runStandaloneBracketUpgradeMissionV412({
    commanderName: "Korvold, Fae-Cursed King",
    commanderOracleId: audit.oracleId,
    commanderColorIdentity: golden.colorIdentity ?? ["B", "R", "G"],
    bracket: 4,
    charter: null,
    councilState,
    catalog,
    onProgress: (msg) => console.log(`  ${msg}`),
  });

  const hpReviewedFinal =
    result.adjudication.headProfessorReviewedDeckFingerprint === result.fingerprint.finalDeckFingerprint;

  const levels = acceptanceLevels({
    missions: result.missions,
    initialFingerprint: result.initialFingerprint.finalDeckFingerprint,
    finalFingerprint: result.fingerprint.finalDeckFingerprint,
    initialPredicted: result.initialAdjudication.predictedEffectiveBracket,
    finalPredicted: result.adjudication.predictedEffectiveBracket,
    requested: 4,
    hpReviewedFinal,
  });

  const output = {
    version: "v4.12-b4-upgrade-mission",
    requestedBracket: 4,
    originalFingerprint: result.initialFingerprint.finalDeckFingerprint,
    originalSolBracket: result.initialAdjudication.predictedEffectiveBracket,
    finalFingerprint: result.fingerprint.finalDeckFingerprint,
    finalSolBracket: result.adjudication.predictedEffectiveBracket,
    fingerprintChanged: result.initialFingerprint.finalDeckFingerprint !== result.fingerprint.finalDeckFingerprint,
    hpReviewedFinal,
    acceptance: levels,
    iterations: result.missions.map((m) => ({
      iteration: m.iteration,
      status: m.status,
      dragSlots: m.bracketDragSlots,
      tutorCandidatesTop8: m.tutorCandidates.slice(0, 8),
      gameChangerCandidates: m.gameChangerCandidates.filter((g) => g.selected || g.currentCardToReplace).slice(0, 8),
      proposedSwaps: m.proposedSwaps,
      acceptedSwaps: m.acceptedSwaps,
      rejectedSwaps: m.rejectedSwaps,
      beforeMetrics: m.beforeMetrics,
      afterMetrics: m.afterMetrics,
    })),
    resultingDeck: result.councilState.selectedCards.map((c) => c.name),
    finalAdjudication: result.adjudication,
  };

  writeFileSync(resolve(OUT_DIR, "upgrade-result.json"), JSON.stringify(output, null, 2));

  const report = [
    "# v4.12 B4 Korvold Upgrade Mission — Swap Execution",
    "",
    "## Summary",
    `- Requested: **B4**`,
    `- Original Sol bracket: **B${output.originalSolBracket}** (fingerprint \`${output.originalFingerprint.slice(0, 12)}…\`)`,
    `- Final Sol bracket: **B${output.finalSolBracket}** (fingerprint \`${output.finalFingerprint.slice(0, 12)}…\`)`,
    `- Fingerprint changed: **${output.fingerprintChanged}**`,
    `- Total accepted swaps: **${levels.totalAccepted}**`,
    `- Iterations run: **${result.missions.length}**`,
    "",
    "## Acceptance Levels",
    `- **PIPELINE PASS**: ${levels.pipelinePass ? "YES" : "NO"}`,
    `- **QUALITY IMPROVEMENT PASS** (bracket increased): ${levels.qualityPass ? "YES" : "NO"} (${output.originalSolBracket} → ${output.finalSolBracket})`,
    `- **PRODUCT TARGET PASS** (reached B4): ${levels.productPass ? "YES" : "NO"}`,
    "",
  ];

  for (const iter of output.iterations) {
    report.push(`## Iteration ${iter.iteration} (${iter.status})`);
    report.push("");
    report.push("### Drag slots (Sol)");
    for (const s of iter.dragSlots) {
      report.push(`- **${s.cardName}** [${s.priority}]: ${s.dragReason.slice(0, 120)}`);
      report.push(`  - desired: ${s.desiredReplacementRole.join(", ")}`);
      report.push(`  - deficits: ${s.bracketDeficitAddressed.join(", ")}`);
    }
    report.push("");
    report.push("### Tutor candidates (top 8, deck-ranked)");
    for (const t of iter.tutorCandidatesTop8) {
      report.push(`- ${t.name} score=${t.deckScore} (${t.reason})`);
    }
    report.push("");
    report.push("### GC candidates (mapped slots)");
    for (const g of iter.gameChangerCandidates) {
      report.push(
        `- ${g.card} → replace ${g.currentCardToReplace ?? "?"} | selected=${g.selected} | ${g.reasonToReject ?? g.reasonRelevant}`,
      );
    }
    report.push("");
    report.push("### Proposed swaps");
    for (const p of iter.proposedSwaps) {
      report.push(`- CUT **${p.cut}** → ADD **${p.add}** | ${p.cutReason.slice(0, 80)}`);
    }
    report.push("");
    report.push("### Accepted swaps");
    for (const a of iter.acceptedSwaps) {
      report.push(`- ✓ CUT **${a.cut}** → ADD **${a.add}**`);
    }
    report.push("");
    report.push("### Rejected swaps");
    for (const r of iter.rejectedSwaps) {
      report.push(`- ✗ CUT **${r.cut}** → ADD **${r.add}**: ${r.criticRejectionReason ?? "unknown"}`);
    }
    report.push("");
    if (iter.beforeMetrics && iter.afterMetrics) {
      report.push("### Metric deltas");
      report.push(`| metric | before | after |`);
      report.push(`|--------|--------|-------|`);
      report.push(`| fingerprint | \`${iter.beforeMetrics.fingerprint.slice(0, 10)}…\` | \`${iter.afterMetrics.fingerprint.slice(0, 10)}…\` |`);
      report.push(`| Sol bracket | B${iter.beforeMetrics.predictedBracket} | B${iter.afterMetrics.predictedBracket} |`);
      report.push(`| lands | ${iter.beforeMetrics.landCount} | ${iter.afterMetrics.landCount} |`);
      report.push(`| avg MV | ${iter.beforeMetrics.avgManaValue} | ${iter.afterMetrics.avgManaValue} |`);
      report.push(`| tutors | ${iter.beforeMetrics.tutorCount} | ${iter.afterMetrics.tutorCount} |`);
      report.push(`| ramp | ${iter.beforeMetrics.rampNonLandCount} | ${iter.afterMetrics.rampNonLandCount} |`);
      report.push("");
    }
  }

  writeFileSync(resolve(OUT_DIR, "REPORT.md"), report.join("\n"));
  console.log("\n" + report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
