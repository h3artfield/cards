/**
 * v4.13 — Deep refinement iteration 2 from post-v4.12 B3 Korvold deck.
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
import { runStandaloneDeepRefinementV413 } from "../src/lib/deck-synthesis/professor-finalization-pipeline-v4-13-v1";
import type { CreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import type { BracketUpgradeMissionV413 } from "../src/lib/deck-synthesis/professor-bracket-upgrade-mission-v4-13-v1";

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

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-13-b3-deep-refinement");
const V412_RESULT = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-12-b4-upgrade-mission/upgrade-result.json");
const EXPECTED_FP = "2db7afd1f8a240ce";

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
  mission: BracketUpgradeMissionV413;
  initialFingerprint: string;
  finalFingerprint: string;
  initialPredicted: number;
  finalPredicted: number;
  requested: number;
}) {
  const accepted = args.mission.acceptedSwaps.length;
  const oppSlots = args.mission.opportunityCostSlots?.length ?? 0;
  const pipelinePass = oppSlots > 0 && accepted > 0 && args.initialFingerprint !== args.finalFingerprint;
  const qualityPass =
    args.finalPredicted > args.initialPredicted ||
    (args.mission.afterMetrics?.tutorCount ?? 0) !== (args.mission.beforeMetrics?.tutorCount ?? 0) ||
    accepted >= 3;
  const productPass = args.finalPredicted >= args.requested;
  return { pipelinePass, qualityPass, productPass, accepted, oppSlots };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const catalog = await loadDeckResolutionCatalog();
  const v412 = JSON.parse(readFileSync(V412_RESULT, "utf8"));
  const names: string[] = v412.resultingDeck;

  if (v412.finalFingerprint !== EXPECTED_FP) {
    console.warn(`Warning: expected fingerprint ${EXPECTED_FP}, got ${v412.finalFingerprint}`);
  }

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
    assemblyRevision: 120,
    checkpointsCompleted: [120],
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

  console.log("v4.13 — Deep refinement from B3 Korvold (post-v4.12)…");
  console.log(`  Input fingerprint: ${v412.finalFingerprint} | tutors=${v412.iterations?.[0]?.afterMetrics?.tutorCount ?? 4}`);

  const result = await runStandaloneDeepRefinementV413({
    commanderName: "Korvold, Fae-Cursed King",
    commanderOracleId: audit.oracleId,
    commanderColorIdentity: golden.colorIdentity ?? ["B", "R", "G"],
    bracket: 4,
    charter: null,
    councilState,
    catalog,
    onProgress: (msg) => console.log(`  ${msg}`),
  });

  const levels = acceptanceLevels({
    mission: result.mission,
    initialFingerprint: result.initialFingerprint.finalDeckFingerprint,
    finalFingerprint: result.fingerprint.finalDeckFingerprint,
    initialPredicted: result.initialAdjudication.predictedEffectiveBracket,
    finalPredicted: result.adjudication.predictedEffectiveBracket,
    requested: 4,
  });

  const output = {
    version: "v4.13-b3-deep-refinement",
    inputFingerprint: result.initialFingerprint.finalDeckFingerprint,
    inputSolBracket: result.initialAdjudication.predictedEffectiveBracket,
    finalFingerprint: result.fingerprint.finalDeckFingerprint,
    finalSolBracket: result.adjudication.predictedEffectiveBracket,
    acceptance: levels,
    deficitPortfolio: result.mission.deficitPortfolio,
    remainingDeficits: result.mission.remainingBracketDeficits,
    opportunityCostSlots: result.mission.opportunityCostSlots,
    packageDrag: result.mission.packageDrag,
    tutorAudits: result.mission.tutorAudits,
    winArchitecture: result.mission.winArchitecture,
    proposedSwaps: result.mission.proposedSwaps,
    acceptedSwaps: result.mission.acceptedSwaps,
    rejectedSwaps: result.mission.rejectedSwaps,
    beforeMetrics: result.mission.beforeMetrics,
    afterMetrics: result.mission.afterMetrics,
    resultingDeck: result.councilState.selectedCards.map((c) => c.name),
    finalAdjudication: result.adjudication,
  };

  writeFileSync(resolve(OUT_DIR, "deep-refinement-result.json"), JSON.stringify(output, null, 2));

  const report = [
    "# v4.13 B3 Korvold Deep Refinement (Iteration 2 Logic)",
    "",
    "## Summary",
    `- Input: B${output.inputSolBracket} fingerprint \`${output.inputFingerprint.slice(0, 12)}…\``,
    `- Output: B${output.finalSolBracket} fingerprint \`${output.finalFingerprint.slice(0, 12)}…\``,
    `- Refinement mode: **${result.mission.refinementMode ?? "OPPORTUNITY_COST"}**`,
    `- Opportunity-cost slots: **${levels.oppSlots}** | Accepted swaps: **${levels.accepted}**`,
    "",
    "## Acceptance",
    `- **PIPELINE PASS**: ${levels.pipelinePass ? "YES" : "NO"}`,
    `- **QUALITY PASS**: ${levels.qualityPass ? "YES" : "NO"}`,
    `- **PRODUCT PASS (B4)**: ${levels.productPass ? "YES" : "NO"}`,
    "",
    "## Remaining Deficits (Sol)",
    ...(output.remainingDeficits ?? []).map(
      (d) => `- [${d.severity}] **${d.category}**: ${d.explanation.slice(0, 120)}`,
    ),
    "",
    "## Deficit Portfolio",
    ...(output.deficitPortfolio?.deficits ?? []).map(
      (d) => `- ${d.category} [${d.severity}] slots=${d.estimatedSlotsNeeded}: ${d.evidence.slice(0, 100)}`,
    ),
    "",
    "## Opportunity-Cost Slots",
    ...(output.opportunityCostSlots ?? []).map(
      (s) =>
        `- **${s.cardName}** (score=${s.opportunityCost}) → ${s.upgradeCategory}: ${s.whyInsufficientAtTargetBracket.slice(0, 80)}`,
    ),
    "",
    "## Package Drag",
    ...(output.packageDrag ?? []).map(
      (p) => `- **${p.packageName}** (${p.slotsConsumed} slots): ${p.reasonInsufficient.slice(0, 100)}`,
    ),
    "",
    "## Tutor Audits (iteration-1 swaps)",
    ...(output.tutorAudits ?? []).map(
      (t) => `- **${t.tutorName}** [${t.bracketContribution}]${t.recommendReplacement ? " ⚠ REPLACE" : ""}: ${t.auditVerdict}`,
    ),
    "",
    "## Win Architecture",
    output.winArchitecture
      ? `- Speed: ${output.winArchitecture.closingSpeed} | Compactness: ${output.winArchitecture.compactnessScore}/10`
      : "- (not analyzed)",
    output.winArchitecture?.primaryWeakness ? `- Weakness: ${output.winArchitecture.primaryWeakness}` : "",
    "",
    "## Proposed / Accepted / Rejected Swaps",
    ...(output.proposedSwaps ?? []).map((p) => `- PROPOSED: CUT **${p.cut}** → ADD **${p.add}**`),
    ...(output.acceptedSwaps ?? []).map((a) => `- ✓ ACCEPTED: CUT **${a.cut}** → ADD **${a.add}**`),
    ...(output.rejectedSwaps ?? []).map((r) => `- ✗ REJECTED: ${r.cut} → ${r.add}: ${r.criticRejectionReason}`),
    "",
    "## Metric Deltas",
    output.beforeMetrics && output.afterMetrics
      ? [
          `| metric | before | after |`,
          `|--------|--------|-------|`,
          `| Sol bracket | B${output.beforeMetrics.predictedBracket} | B${output.afterMetrics.predictedBracket} |`,
          `| avg MV | ${output.beforeMetrics.avgManaValue} | ${output.afterMetrics.avgManaValue} |`,
          `| tutors | ${output.beforeMetrics.tutorCount} | ${output.afterMetrics.tutorCount} |`,
          `| ramp | ${output.beforeMetrics.rampNonLandCount} | ${output.afterMetrics.rampNonLandCount} |`,
          `| interaction | ${output.beforeMetrics.interactionCount ?? "?"} | ${output.afterMetrics.interactionCount ?? "?"} |`,
          `| protection | ${output.beforeMetrics.protectionCount ?? "?"} | ${output.afterMetrics.protectionCount ?? "?"} |`,
        ].join("\n")
      : "",
  ].join("\n");

  writeFileSync(resolve(OUT_DIR, "REPORT.md"), report);
  console.log("\n" + report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
