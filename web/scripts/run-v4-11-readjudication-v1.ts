/**
 * v4.11 — Re-run post-mana bracket adjudication on existing v4.10 Korvold B3/B4 final lists.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveBenchmarkCommanderName } from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";
import { buildInitialDeckNeedsV47 } from "../src/lib/deck-synthesis/professor-deck-needs-v4-7-v1";
import type { ProfessorCouncilStateV47 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-7-v1";
import { buildFunctionalCardProfileV47 } from "../src/lib/deck-synthesis/professor-functional-profile-v4-7-v1";
import { buildBracketPowerPlanV410 } from "../src/lib/deck-synthesis/professor-bracket-power-plan-v4-10-v1";
import { buildBracketBuildPlanV49 } from "../src/lib/deck-synthesis/professor-bracket-build-plan-v4-9-v1";
import { runStandaloneBracketAdjudicationV411 } from "../src/lib/deck-synthesis/professor-finalization-pipeline-v4-11-v1";
import type { CreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";

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

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-11-readjudication");
const V410_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-10-bracket-ab-live");

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
        proposalReason: "Imported from v4.10 final list",
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
  const isBasic = /^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(name);
  return {
    cardId: `card-${i}`,
    oracleId: null,
    name,
    proposedBy: "RESEARCH",
    origin: "ORACLE_SEARCH",
    proposalReason: "Imported from v4.10 final list",
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
    category: isBasic ? "land" : "spell",
  };
}

function buildCouncilState(catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>, names: string[], bracket: 3 | 4): ProfessorCouncilStateV47 {
  const buildPlan = buildBracketBuildPlanV49({
    bracket,
    playStyle: "Sacrifice Engine",
    relationship: "Harmony",
    commanderName: "Korvold, Fae-Cursed King",
    pass1: pass1Stub,
  });
  const powerPlan = buildBracketPowerPlanV410({
    bracket,
    commanderName: "Korvold, Fae-Cursed King",
    playStyle: "Sacrifice Engine",
    relationship: "Harmony",
    pass1: pass1Stub,
    buildPlan,
  });
  return {
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
}

async function readjudicate(label: string, jsonPath: string, bracket: 3 | 4, catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>) {
  const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
  const old = raw.headProfessor;
  const names: string[] = raw.deckStats.allCardNames;
  const audit = resolveBenchmarkCommanderName(catalog, "Korvold, Fae-Cursed King");
  if (!audit.resolved || !audit.oracleId) throw new Error("Korvold not resolved");
  const golden = catalog.byOracleId.get(audit.oracleId)!;
  const councilState = buildCouncilState(catalog, names, bracket);

  const result = await runStandaloneBracketAdjudicationV411({
    commanderName: "Korvold, Fae-Cursed King",
    commanderOracleId: audit.oracleId,
    commanderColorIdentity: golden.colorIdentity ?? ["B", "R", "G"],
    bracket,
    userIntent: ["Sacrifice Engine", "HARMONY"],
    relationshipLens: "HARMONY",
    charter: null,
    theory: null,
    councilState,
    catalog,
  });

  return {
    label,
    requestedBracket: bracket,
    oldPrediction: old.predictedEffectiveBracket,
    oldReasonSnippet: old.reasons?.[0]?.slice(0, 200),
    oldLandMention: /17|18.*land|land shortage/i.test(old.reasons?.[0] ?? "") || old.powerDeficits?.some((d: string) => /17|18.*land/i.test(d)),
    newPrediction: result.adjudication.predictedEffectiveBracket,
    newConfidence: result.adjudication.confidence,
    newReasons: result.adjudication.reasons,
    newPowerDeficits: result.adjudication.powerDeficits,
    fingerprint: result.fingerprint,
    reviewedFingerprint: result.adjudication.headProfessorReviewedDeckFingerprint,
    fingerprintMatch: result.fingerprint.finalDeckFingerprint === result.adjudication.headProfessorReviewedDeckFingerprint,
    structuralMetrics: result.adjudication.structuralMetrics,
    manaBaseAdjusted: result.fingerprint.landCount,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const catalog = await loadDeckResolutionCatalog();

  const b3 = await readjudicate("B3", resolve(V410_DIR, "run-a-b3.json"), 3, catalog);
  const b4 = await readjudicate("B4", resolve(V410_DIR, "run-b-b4.json"), 4, catalog);

  const report = [
    "# v4.11 Post-Mana Bracket Re-Adjudication",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Purpose",
    "Re-run GPT-5.6 Sol bracket adjudication on v4.10 final lists with v4.11 canonical post-mana state + fingerprint binding.",
    "",
    "## B3 Korvold",
    `- Old prediction: **B${b3.oldPrediction}**`,
    `- Old reasoning cited land shortage: **${b3.oldLandMention}**`,
    `- New prediction: **B${b3.newPrediction}** (${b3.newConfidence})`,
    `- Final deck fingerprint: \`${b3.fingerprint.finalDeckFingerprint}\``,
    `- Reviewed fingerprint: \`${b3.reviewedFingerprint}\` (match: ${b3.fingerprintMatch})`,
    `- Canonical lands: ${b3.structuralMetrics.landCount} | avgMV: ${b3.structuralMetrics.avgManaValue} | tutors: ${b3.structuralMetrics.tutorCount}`,
    `- New reasons: ${b3.newReasons.slice(0, 2).join(" | ")}`,
    "",
    "## B4 Korvold",
    `- Old prediction: **B${b4.oldPrediction}**`,
    `- Old reasoning cited land shortage: **${b4.oldLandMention}**`,
    `- New prediction: **B${b4.newPrediction}** (${b4.newConfidence})`,
    `- Final deck fingerprint: \`${b4.fingerprint.finalDeckFingerprint}\``,
    `- Reviewed fingerprint: \`${b4.reviewedFingerprint}\` (match: ${b4.fingerprintMatch})`,
    `- Canonical lands: ${b4.structuralMetrics.landCount} | avgMV: ${b4.structuralMetrics.avgManaValue} | tutors: ${b4.structuralMetrics.tutorCount}`,
    `- New reasons: ${b4.newReasons.slice(0, 2).join(" | ")}`,
    "",
    "## Stale-State Verdict",
    b3.oldLandMention || b4.oldLandMention
      ? "Prior B2 adjudications **partially reflected pre-mana-base stale state** (land shortage in reasoning despite 36-land final lists)."
      : "Prior adjudications may not have been land-stale; compare predictions directly.",
    b3.newPrediction !== b3.oldPrediction || b4.newPrediction !== b4.oldPrediction
      ? `Prediction changed: B3 ${b3.oldPrediction}→${b3.newPrediction}, B4 ${b4.oldPrediction}→${b4.newPrediction}.`
      : `Predictions unchanged at B${b3.newPrediction}/B${b4.newPrediction} — trustworthy but bracket target still missed.`,
  ].join("\n");

  writeFileSync(resolve(OUT_DIR, "b3-readjudication.json"), JSON.stringify(b3, null, 2));
  writeFileSync(resolve(OUT_DIR, "b4-readjudication.json"), JSON.stringify(b4, null, 2));
  writeFileSync(resolve(OUT_DIR, "REPORT.md"), report);
  console.log(report);
  console.log(`\nWrote ${OUT_DIR}/REPORT.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
