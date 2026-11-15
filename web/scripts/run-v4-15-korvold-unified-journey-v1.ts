/**
 * v4.15 Korvold unified acceptance — post-v4.14 canonical B3 deck.
 * Decision: PROFESSOR_V4_15_KORVOLD_UNIFIED_JOURNEY_V1_AUTHORIZED
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-6-v1";
import type { ProfessorCouncilStateV47 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-7-v1";
import { buildFunctionalCardProfileV47 } from "../src/lib/deck-synthesis/professor-functional-profile-v4-7-v1";
import { computeFinalDeckFingerprintV411 } from "../src/lib/deck-synthesis/professor-deck-fingerprint-v4-11-v1";
import { computeVerifiedDeckSnapshotV414 } from "../src/lib/deck-synthesis/professor-verified-final-snapshot-v4-14-v1";
import { auditDeckTutorsV413 } from "../src/lib/deck-synthesis/professor-tutor-audit-v4-13-v1";
import { deckListSha } from "../src/lib/deck-synthesis/professor-final-deck-doctor-v4-8-v1";
import { resolveBenchmarkCommanderName } from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";
import { buildBracketBuildPlanV49 } from "../src/lib/deck-synthesis/professor-bracket-build-plan-v4-9-v1";
import { buildBracketPowerPlanV410 } from "../src/lib/deck-synthesis/professor-bracket-power-plan-v4-10-v1";
import type { CreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { runProfessorFinalizationPipelineV415 } from "../src/lib/deck-synthesis/professor-finalization-pipeline-v4-15-v1";

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

const OUT = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-15-korvold-unified-journey");
const JOURNEY = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-14-full-korvold-journey/journey-result.json");

function sha256File(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const pass1Stub: CreativeProfessorPass1V4 = {
  strategicThesis: "Sacrifice engine with token fodder",
  packages: [{ concept: "Sacrifice Engine", likelyCardsOrEffects: [], role: "ENGINE" }],
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
    category: /^(Plains|Island|Swamp|Mountain|Forest)$/.test(name) ? "land" : "spell",
  };
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    FILLER_V412: "v4.12 filler/card replacement",
    OPPORTUNITY_V413: "v4.13 opportunity-cost replacement",
    PACKAGE_V414: "v4.14 package transformation",
    ARCHITECTURE_V415: "v4.15 win-architecture transformation",
  };
  return map[phase] ?? phase;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const startedAt = new Date().toISOString();
  const catalog = await loadDeckResolutionCatalog();

  const journey = JSON.parse(readFileSync(JOURNEY, "utf8"));
  const inputNames: string[] = journey.resultingDeck;
  if (!inputNames?.length) throw new Error("Missing resultingDeck in v4.14 journey fixture");

  const inputFingerprint = deckListSha(inputNames);
  const selectedCards = inputNames.map((name, i) => cardFromName(catalog, name, i));
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

  const audit = resolveBenchmarkCommanderName(catalog, "Korvold, Fae-Cursed King");
  const golden = catalog.byOracleId.get(audit.oracleId!)!;

  const korvoldCharter = {
    commander: "Korvold, Fae-Cursed King",
    requestedBracket: 4 as const,
    playStyle: "Sacrifice Engine",
    commanderRelationship: "Harmony",
    deckIdentity: "Sacrifice engine with token fodder",
    playerIntentSummary: "Bracket 4 sacrifice engine; combos secondary",
    primaryStrategy: "Sacrifice engine",
    secondaryStrategy: "Token fodder pressure",
    commanderDependentEngine: "Korvold sacrifice draws and pump",
    independentEngine: "Blood Artist / Pitiless Plunderer value",
    harmonyPlan: "Commander amplifies sacrifice payoffs",
    intendedWinPaths: ["Sacrifice value loop", "Combat pressure via tokens"],
    expectedPlayPattern: "Develop fodder, sacrifice for value, close with aristocrats or combat",
    bracketConstraints: "B4 optimized — tutors and interaction without cEDH combo density",
    comboPolicy: "Combos fine but not the center",
    tutorPolicy: "Find engine pieces and protection; win lines should be tutor-accessible",
    designRules: [],
    avoidPatterns: [],
    researchPriorities: [],
  };

  const councilState = {
    phase: "BUILDING",
    buildPhase: "PROVISIONAL_100",
    selectedCards,
    snapshots: [],
    deckNeeds: [],
    bracketBuildPlan: buildPlan,
    bracketPowerPlanV410: powerPlan,
    assemblyRevision: 99,
    checkpointsCompleted: [99],
    functionalProfiles: {},
    conversation: [
      {
        turnId: "t-harness-seed-0",
        phase: "BUILDING",
        speaker: "RESEARCH",
        intent: "PROPOSE",
        respondsToTurnIds: [],
        message: "v4.15 acceptance harness — post-v4.14 canonical deck loaded (98-card fixture; mana-base fill may run).",
      },
    ],
    councilDecisions: [],
    cardDecisions: [],
    candidatePool: [],
    discoveryReports: [],
    legalityGate: { pass: true, failures: [] },
    deckCharter: korvoldCharter,
  } as unknown as ProfessorCouncilStateV47;

  console.info("[v4.15] Korvold unified acceptance — input fingerprint:", inputFingerprint.slice(0, 16));
  console.info("[v4.15] Input deck size:", inputNames.length, "(post-v4.14 canonical fixture)");
  console.info("[v4.15] Running unified pipeline (multiple GPT-5.6 Sol calls expected)…");

  const progressLog: Array<{ at: string; stage: string; message: string }> = [];
  const result = await runProfessorFinalizationPipelineV415({
    commanderName: "Korvold, Fae-Cursed King",
    commanderOracleId: audit.oracleId,
    commanderColorIdentity: golden.colorIdentity ?? ["B", "R", "G"],
    bracket: 4,
    userIntent: ["Sacrifice Engine", "Combos are fine but not the center — COMBOS_SECONDARY", "Bracket 4"],
    relationshipLens: "HARMONY",
    charter: councilState.deckCharter ?? null,
    theory: null,
    councilState,
    catalog,
    onProgress: (p) => {
      progressLog.push({ at: new Date().toISOString(), stage: p.stage, message: p.message });
      console.info(`  [${p.stage}] ${p.message}`);
    },
  });

  const finalFingerprint = result.finalDeckDoctor.finalDeckFingerprint ?? "";
  const gradeFingerprint = result.deckGrade.deckFingerprint ?? "";
  const playReportFingerprint = result.finalReport.deckFingerprint ?? "";
  const hpReviewedFingerprint = result.finalDeckDoctor.headProfessorReviewedDeckFingerprint ?? "";

  const verifiedSnapshot = computeVerifiedDeckSnapshotV414({
    state: result.councilState,
    catalog,
  });
  const fingerprintMetrics = computeFinalDeckFingerprintV411({ state: result.councilState, catalog });
  const tutorAudits = auditDeckTutorsV413({ selectedCards: result.councilState.selectedCards, catalog });

  const hp = result.fullHeadProfessorReview;
  const plan = result.refinementPlan;
  const accepted = (result.finalDeckDoctor.executedSwaps ?? []).filter((s) => s.status === "ACCEPTED");
  const rejected = (result.finalDeckDoctor.executedSwaps ?? []).filter((s) => s.status === "REJECTED");
  const finalAdjudication = result.finalDeckDoctor.bracketAdjudicationV411;

  const statePass =
    finalFingerprint === gradeFingerprint &&
    finalFingerprint === playReportFingerprint &&
    finalFingerprint === hpReviewedFingerprint;

  const headProfessorPass =
    hp.headProfessorCallCompleted &&
    Boolean(hp.overallAssessment) &&
    Boolean(hp.deckIdentityAssessment || hp.commanderAssessment || hp.strategyAssessment) &&
    (hp.weakCards.length > 0 || hp.opportunityCostCards.length > 0 || hp.swaps.length > 0 || hp.b3ToB4GapExplanation.length > 0);

  const refinementPass = accepted.length > 0 || plan.phases.length > 0;
  const architecturePass =
    Boolean(hp.currentWinArchitecture || hp.targetWinArchitecture) ||
    plan.winArchitectureTransformation.required;

  const productPass =
    Boolean(result.deckGrade.overallLetter) &&
    Boolean(result.deckGrade.bracketAlignment) &&
    Boolean(result.deckGrade.bracketAlignmentStatus) &&
    result.finalReport.status === "COMPLETE";

  const solCallEstimate =
    1 + // full HP review
    (plan.winArchitectureTransformation.required ? 1 : 0) + // architecture analysis
    (plan.phases.includes("FILLER_V412") || plan.phases.includes("OPPORTUNITY_V413") ? 2 : 0) + // drag/deep + re-adj (approx)
    (plan.phases.includes("PACKAGE_V414") ? 1 : 0) +
    1; // final adjudication

  const acceptance = {
    decision: "PROFESSOR_V4_15_KORVOLD_UNIFIED_JOURNEY_V1_AUTHORIZED",
    startedAt,
    completedAt: new Date().toISOString(),
    inputDeckFingerprint: inputFingerprint,
    finalCanonicalDeckFingerprint: finalFingerprint,
    fingerprintBinding: {
      finalHeadProfessorReviewedFingerprint: hpReviewedFingerprint,
      gradeDeckFingerprint: gradeFingerprint,
      playReportDeckFingerprint: playReportFingerprint,
      finalCanonicalDeckFingerprint: finalFingerprint,
      statePass,
    },
    headProfessorReview: {
      model: hp.model,
      overallAssessment: hp.overallAssessment,
      deckIdentityAssessment: hp.deckIdentityAssessment,
      commanderAssessment: hp.commanderAssessment,
      strategyAssessment: hp.strategyAssessment,
      bracketAssessment: hp.bracketAssessment,
      preserveAtAllCosts: hp.preserveAtAllCosts,
      weakCards: hp.weakCards,
      opportunityCostCards: hp.opportunityCostCards,
      weakPackages: hp.weakPackages,
      missingFunctions: hp.missingFunctions,
      missingPowerLevers: hp.missingPowerLevers,
      currentWinArchitecture: hp.currentWinArchitecture,
      targetWinArchitecture: hp.targetWinArchitecture,
      specificCardSuggestions: hp.specificCardSuggestions,
      researchRequests: hp.researchRequests,
      requiresMinorRefinement: hp.requiresMinorRefinement,
      requiresMajorRefinement: hp.requiresMajorRevision,
      b3ToB4GapExplanation: hp.b3ToB4GapExplanation,
      predictedEffectiveBracketInitial: hp.predictedEffectiveBracket,
      adjudicationConfidence: hp.adjudicationConfidence,
      adjudicationReasons: hp.adjudicationReasons,
      keyImprovements: hp.keyImprovements,
      swapsRecommended: hp.swaps,
    },
    refinementPlan: {
      ...plan,
      phaseLabels: plan.phases.map(phaseLabel),
      prescription:
        `Head Professor prescribed: ${plan.summary} → Council routes: ${plan.phases.map(phaseLabel).join(", ") || "none"}`,
    },
    mutations: {
      accepted,
      rejected,
      inputDeckSize: inputNames.length,
      finalDeckSize: result.deckList.length,
      finalDeckNames: result.deckList.map((c) => c.name),
    },
    tutorPurposeAudit: tutorAudits,
    finalAdjudication: finalAdjudication
      ? {
          requestedBracket: finalAdjudication.requestedBracket,
          predictedEffectiveBracket: finalAdjudication.predictedEffectiveBracket,
          confidence: finalAdjudication.confidence,
          reasons: finalAdjudication.reasons,
          bracketAssessment: finalAdjudication.playsLikeBecause,
          powerDeficits: finalAdjudication.powerDeficits,
        }
      : null,
    professorGrade: {
      letter: result.deckGrade.overallLetter,
      score: result.deckGrade.overallScore,
      requestedBracket: result.deckGrade.bracketAlignment?.requestedBracket,
      effectiveBracket: result.deckGrade.bracketAlignment?.effectiveBracket,
      bracketAlignmentStatus: result.bracketAlignmentStatus,
      bracketAlignmentExplanation: result.deckGrade.bracketAlignment?.explanation,
      bestArea: result.deckGrade.bestArea.label,
      weakestArea: result.deckGrade.weakestArea.label,
    },
    playReport: result.finalReport,
    verifiedSnapshot: {
      interaction: verifiedSnapshot.interaction,
      protection: verifiedSnapshot.protection,
      tutors: verifiedSnapshot.tutorCount,
      acceleration: verifiedSnapshot.acceleration,
    },
    metrics: fingerprintMetrics,
    modelAccounting: result.modelUsage ?? {
      gpt56SolCallEstimate: solCallEstimate,
      playReportModel: process.env.PROFESSOR_BREW_PLAY_REPORT_MODEL?.trim() || "gpt-4o",
      playReportCalls: 1,
      headProfessorModelCallsRecorded: result.finalDeckDoctor.modelCalls?.headProfessor ?? 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      note: "Token usage not yet wired through pipeline return — call count estimated from refinement phases",
    },
    acceptance: {
      HEAD_PROFESSOR_PASS: headProfessorPass,
      REFINEMENT_PASS: refinementPass,
      ARCHITECTURE_PASS: architecturePass,
      STATE_PASS: statePass,
      PRODUCT_PASS: productPass,
    },
    progressLog,
  };

  writeFileSync(resolve(OUT, "acceptance-result.json"), JSON.stringify(acceptance, null, 2));
  writeFileSync(resolve(OUT, "head-professor-review.json"), JSON.stringify(acceptance.headProfessorReview, null, 2));
  writeFileSync(resolve(OUT, "refinement-plan.json"), JSON.stringify(acceptance.refinementPlan, null, 2));
  writeFileSync(resolve(OUT, "mutations.json"), JSON.stringify(acceptance.mutations, null, 2));
  writeFileSync(resolve(OUT, "tutor-audit.json"), JSON.stringify(tutorAudits, null, 2));
  writeFileSync(resolve(OUT, "play-report.json"), JSON.stringify(result.finalReport, null, 2));

  const md = [
    "# PROFESSOR v4.15 — Korvold Unified Acceptance",
    "",
    `**Decision:** PROFESSOR_V4_15_KORVOLD_UNIFIED_JOURNEY_V1_AUTHORIZED`,
    `**Completed:** ${acceptance.completedAt}`,
    "",
    "## Acceptance results",
    "",
    "| Gate | Result |",
    "|------|--------|",
    `| HEAD PROFESSOR PASS | ${headProfessorPass ? "**PASS**" : "FAIL"} |`,
    `| REFINEMENT PASS | ${refinementPass ? "**PASS**" : "FAIL"} |`,
    `| ARCHITECTURE PASS | ${architecturePass ? "**PASS**" : "FAIL"} |`,
    `| STATE PASS | ${statePass ? "**PASS**" : "FAIL"} |`,
    `| PRODUCT PASS | ${productPass ? "**PASS**" : "FAIL"} |`,
    "",
    "## Product summary",
    "",
    "```",
    `PROFESSOR GRADE     ${result.deckGrade.overallLetter} / ${result.deckGrade.overallScore}`,
    `REQUESTED           B${result.deckGrade.bracketAlignment?.requestedBracket} · Optimized`,
    `EFFECTIVE           B${result.deckGrade.bracketAlignment?.effectiveBracket}`,
    `BRACKET ALIGNMENT   ${result.bracketAlignmentStatus}`,
    "```",
    "",
    "## Fingerprint binding",
    "",
    "| Field | SHA (prefix) | Match |",
    "|-------|--------------|-------|",
    `| Input (post-v4.14) | ${inputFingerprint.slice(0, 16)} | — |`,
    `| Final canonical | ${finalFingerprint.slice(0, 16)} | — |`,
    `| Grade | ${gradeFingerprint.slice(0, 16)} | ${gradeFingerprint === finalFingerprint ? "✓" : "✗"} |`,
    `| Play report list | ${playReportFingerprint.slice(0, 16)} | ${playReportFingerprint === finalFingerprint ? "✓" : "✗"} |`,
    `| HP reviewed | ${hpReviewedFingerprint.slice(0, 16)} | ${hpReviewedFingerprint === finalFingerprint ? "✓" : "✗"} |`,
    "",
    "## 1. Head Professor review",
    "",
    hp.overallAssessment,
    "",
    "**Why B3 despite infrastructure?**",
    "",
    hp.b3ToB4GapExplanation || hp.bracketAssessment,
    "",
    "**Smallest strategic transformation:**",
    "",
    hp.targetWinArchitecture?.transformationNeeded ?? hp.targetWinArchitecture?.summary ?? "(see targetWinArchitecture in head-professor-review.json)",
    "",
    `- Commander: ${hp.commanderAssessment.slice(0, 200) || "(see artifact)"}`,
    `- Strategy: ${hp.strategyAssessment.slice(0, 200) || "(see artifact)"}`,
    `- Preserve: ${hp.preserveAtAllCosts.slice(0, 8).join(", ") || "none listed"}`,
    `- Weak cards: ${hp.weakCards.slice(0, 8).join(", ") || "none"}`,
    `- Opportunity cost: ${hp.opportunityCostCards.slice(0, 8).join(", ") || "none"}`,
    "",
    "## 2. Unified refinement plan",
    "",
    acceptance.refinementPlan.prescription,
    "",
    plan.phases.map((p) => `- **${phaseLabel(p)}**`).join("\n"),
    "",
    "## 3. Mutations",
    "",
    `Accepted: **${accepted.length}** · Rejected: **${rejected.length}**`,
    "",
    ...accepted.map(
      (s) =>
        `- **CUT** ${s.cut} → **ADD** ${s.add} (${s.approvedBy}/${s.verifiedBy}) — ${s.reason.slice(0, 120)}`,
    ),
    "",
    ...rejected.slice(0, 10).map((s) => `- REJECTED ${s.cut} → ${s.add}: ${s.rejectionReason ?? "rejected"}`),
    "",
    "## 4. Win architecture",
    "",
    "**Current:**",
    "",
    hp.currentWinArchitecture?.summary ?? "(see artifact)",
    "",
    "**Target:**",
    "",
    hp.targetWinArchitecture?.summary ?? "(see artifact)",
    "",
    `Threat window (current): ${hp.currentWinArchitecture?.threatWindow ?? "?"}`,
    `Threat window (target): ${hp.targetWinArchitecture?.threatWindow ?? "?"}`,
    "",
    "## 5. Tutor purpose",
    "",
    ...tutorAudits.map(
      (t) =>
        `- **${t.tutorName}** (${t.bracketContribution}): finds ${t.reliablyFinds.join(", ") || "general targets"} — ${t.auditVerdict.slice(0, 100)}`,
    ),
    "",
    "## 6. Final adjudication",
    "",
    finalAdjudication
      ? `Requested B${finalAdjudication.requestedBracket} · Effective B${finalAdjudication.predictedEffectiveBracket} · Confidence ${finalAdjudication.confidence}`
      : "N/A",
    "",
    ...(finalAdjudication?.reasons ?? []).map((r) => `- ${r}`),
    "",
    "## 7. Verified metrics (final)",
    "",
    `- Interaction: ${verifiedSnapshot.interaction.rawCount}`,
    `- Protection: ${verifiedSnapshot.protection.rawCount}`,
    `- Tutors: ${verifiedSnapshot.tutorCount}`,
    `- Lands: ${fingerprintMetrics.landCount}`,
    "",
    "## 8. Model accounting",
    "",
    `- GPT-5.6 Sol calls (estimated): ${solCallEstimate}`,
    `- Play report (${acceptance.modelAccounting.playReportModel}): 1`,
    `- Token totals: not captured in pipeline return`,
    "",
    "## Artifacts",
    "",
    `- acceptance-result.json (${sha256File(JSON.stringify(acceptance)).slice(0, 16)}…)`,
    `- head-professor-review.json`,
    `- refinement-plan.json`,
    `- mutations.json`,
    `- tutor-audit.json`,
    `- play-report.json`,
    "",
    "**Korvold regression: SPENT after this run.**",
  ];

  writeFileSync(resolve(OUT, "REPORT.md"), md.join("\n"));
  console.info("\n" + md.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
