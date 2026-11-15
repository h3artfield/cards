/**
 * PROFESSOR v4.16.6.2 — Ninth unseen Commander structural-dispatch + strategic progress prospective.
 * Decision: PROFESSOR_V4_16_6_2_NINTH_UNSEEN_COMMANDER_STRUCTURAL_DISPATCH_AND_STRATEGIC_PROGRESS_LIVE_V1_AUTHORIZED
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureProspectiveOutputDirectory } from "./lib/ensure-prospective-output-directory-v1";
import { deriveCommanderClassification } from "../src/lib/deck-builder/commander-classification";
import { normalizeOracleName } from "../src/lib/deck-builder/golden-catalog/normalize-name";
import { commanderNameToSlug } from "../src/lib/deck-builder/edhrec-client";
import { resolveBenchmarkCommanderName } from "../src/lib/deck-synthesis/benchmark-commander-resolver-v1";
import {
  isCompetitiveDeckOracle,
  isCurrentlyCommanderLegal,
  loadDeckResolutionCatalog,
  paperMetaForOracle,
  type DeckResolutionCatalog,
} from "./lib/load-deck-resolution-catalog";
import { assessCanonicalDeckLegalityV4161 } from "../src/lib/deck-synthesis/professor-canonical-legality-v4-16-1-v1";
import { auditCharterProvenanceV4162 } from "../src/lib/deck-synthesis/professor-charter-provenance-v4-16-2-v1";
import { auditCharterConceptSupportV4163 } from "../src/lib/deck-synthesis/professor-charter-concept-support-v4-16-3-v1";
import { listGameChangersInDeckV4162 } from "../src/lib/deck-synthesis/professor-game-changer-registry-v4-16-2-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "../src/lib/deck-synthesis/professor-deck-completion-v4-7-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "../src/lib/deck-synthesis/professor-canonical-card-truth-v4-16-4-v1";
import {
  assessProspectiveAcceptanceSemanticsV4165,
  type AcceptanceVerdictV4165,
} from "../src/lib/deck-synthesis/professor-acceptance-semantics-v4-16-5-v1";
import {
  professorBrewNeedsBracketResearchV416,
  professorBrewNeedsDeckCompletionV416,
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsManaBaseV48,
  professorBrewNeedsStructuralResearchV4166,
  professorBrewShouldContinueAutoBuildV47,
  resolveProfessorBuildControlFromSessionV41661,
  resolveProfessorNextActionFromSessionV41662,
} from "../src/lib/deck-synthesis/professor-brew-progress-v4-7-v1";
import { STRATEGIC_CHECKPOINT_RATIOS_V41662 } from "../src/lib/deck-synthesis/professor-strategic-progress-v4-16-6-2-v1";
import type { ProfessorNextActionDecisionV41662 } from "../src/lib/deck-synthesis/professor-next-action-dispatch-v4-16-6-2-v1";
import { reconcileCandidateSupplyV4166 } from "../src/lib/deck-synthesis/professor-structural-search-execution-v4-16-6-v1";
import type { ProfessorBuildControlV41661 } from "../src/lib/deck-synthesis/professor-build-control-v4-16-6-1-v1";
import { resolveLiveProfessorBrewBudgetV416 } from "../src/lib/deck-synthesis/professor-live-finalization-budget-v4-16-v1";
import {
  DEFAULT_ARCHETYPE_CHOICE_V42,
  DEFAULT_RELATIONSHIP_CHOICE_V42,
  MEREN_ARCHETYPE_CHOICES_V42,
  RELATIONSHIP_CHOICES_V42,
} from "../src/lib/deck-synthesis/professor-brew-fixtures-v4-2-v1";
import { DEFAULT_WIN_PREFERENCE_V415, WIN_PREFERENCE_CHOICES_V415 } from "../src/lib/deck-synthesis/professor-win-preference-v4-15-v1";
import type { BrewSessionViewV42 } from "../src/lib/deck-synthesis/professor-brew-session-v4-2-v1";
import type { ProfessorCouncilStateV47 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-7-v1";
import type { BuildPhaseV4166 } from "../src/lib/deck-synthesis/professor-structural-search-planner-v4-16-6-v1";
import type { AggregatedStructuralMissionV4166 } from "../src/lib/deck-synthesis/professor-structural-search-planner-v4-16-6-v1";
import type { StructuralSearchExecutionV4166 } from "../src/lib/deck-synthesis/professor-structural-search-execution-v4-16-6-v1";
import type { StructuralBuildTelemetryV4166 } from "../src/lib/deck-synthesis/professor-structural-build-telemetry-v4-16-6-v1";

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

const BASE = process.env.PROFESSOR_AB_BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.PROFESSOR_AB_STORE_SLUG ?? "the-game-lodge";
const API = `${BASE}/api/store/${SLUG}/professor/brew`;
const OUT_DIR = ensureProspectiveOutputDirectory(
  resolve(process.cwd(), "data/milestones/deck-synthesis/v4-16-6-2-ninth-unseen-prospective"),
);
const RANDOM_SEED = Number(process.env.PROFESSOR_V4_16_6_2_SEED ?? "416609001");
const CHECKPOINT_TARGETS = [25, 40, 55, 64, 70, 85] as const;
const STRATEGIC_CHECKPOINTS = [...STRATEGIC_CHECKPOINT_RATIOS_V41662];

const SPENT_NORMALIZED = new Set(
  [
    "Korvold, Fae-Cursed King",
    "Longshot, Rifle's Edge",
    "Longshot",
    "Mogis, God of Slaughter",
    "Meren of Clan Nel Toth",
    "Chatterfang, Squirrel General",
    "Massacre Girl",
    "Nylea, Keen-Eyed",
    "Nylea, God of the Hunt",
    "Thassa, Deep-Dwelling",
    "Thassa, God of the Sea",
    "Baylen, the Haymaker",
    "Kiki-Jiki, Mirror Breaker",
    "Aerith Gainsborough",
    "Zada, Hedron Grinder",
    "Yuriko, the Tiger's Shadow",
    "Muldrotha, the Gravetide",
    "Smaug, Dragon of Destruction",
    "Smaug",
    "Serah Farron // Crystallized Serah",
    "Serah Farron",
    "Sigarda, Font of Blessings",
    "Reyav, Smith of the Road",
    "Captain Lannery Storm",
    "Thrakkus the Butcher",
    "Marchesa, the Black Rose",
    "Brago, King Eternal",
    "Obeka, Brute Chronologist",
    "Mizzix of the Izmagnus",
    "Omarthis, Ghostfire Initiate",
    "Teferi, Temporal Archmage",
    "Jennifer Walters // The Sensational She-Hulk",
    "Jennifer Walters",
    "Beledros Witherbloom",
    "Beledros",
    "Jessica Jones, Private Eye",
    "Jessica Jones",
    "Viper, Cruel Conspirator",
    "Viper",
  ].map((n) => normalizeOracleName(n)),
);

type RecoveryEpisodeV41661 = {
  episodeId: string;
  stallPass: number;
  recoveryPass: number;
  resumePass: number | null;
  before: { libraryCount: number; selectedNonlands: number; deficits: { function: string; deficit: number }[] };
  executions: ReturnType<typeof executionReport>[];
  cardsAdded: number;
  after: { libraryCount: number; selectedNonlands: number; deficits: { function: string; deficit: number }[] };
  resumedNormalAssembly: boolean;
};

function authoritativeGateSnapshot(session: BrewSessionViewV42["session"]) {
  const cs = session.councilState as ProfessorCouncilStateV47 | undefined;
  const tel4165 = cs?.structuralBuildTelemetryV4165;
  const tel4166 = cs?.structuralBuildTelemetryV4166;
  const buildControl = cs?.professorBuildControlV41661 ?? resolveProfessorBuildControlFromSessionV41661(session);
  return {
    v4165LegacyTermination: tel4165?.termination ?? null,
    v4166Phase: tel4166?.buildPhase ?? null,
    v4166Action: tel4166?.completionPlan?.action ?? null,
    v4166ShouldTerminate: tel4166?.termination?.shouldTerminate ?? null,
    professorBuildControlV41661: buildControl,
    authoritativeVersion: buildControl.authoritativeVersion,
    legacyConflict:
      tel4165?.termination?.shouldTerminate === true && tel4166?.termination?.shouldTerminate === false,
    shouldContinueAutoBuild: professorBrewShouldContinueAutoBuildV47(session),
    buildControlDecisionLog: cs?.buildControlDecisionLogV41661 ?? [],
  };
}

function deficitSnapshot(cs: ProfessorCouncilStateV47) {
  return (cs.structuralBuildTelemetryV4166?.completionPlan?.coverage ?? [])
    .filter((c) => c.deficit > 0)
    .map((c) => ({ function: c.function, deficit: c.deficit }));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function waitForServer(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${BASE}/api/store/${SLUG}/professor/brew`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(2000);
  }
  throw new Error(`Server not ready at ${BASE}`);
}

async function post(body: Record<string, unknown>): Promise<BrewSessionViewV42> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(900_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `POST failed ${res.status}`);
  return data as BrewSessionViewV42;
}

async function get(sessionId: string): Promise<BrewSessionViewV42> {
  const res = await fetch(`${API}?sessionId=${encodeURIComponent(sessionId)}`, { signal: AbortSignal.timeout(120_000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `GET failed ${res.status}`);
  return data as BrewSessionViewV42;
}

function defaultForkId(session: BrewSessionViewV42["session"]): string {
  return session.workingDeckTheory?.userDirectionForks?.[0]?.forkId ?? "fork-a";
}

type EligibleCommander = { oracleId: string; name: string; slug: string };

async function selectUnseenCommander(seed: number): Promise<{ commander: EligibleCommander; eligibleCommanderCount: number }> {
  const catalog = await loadDeckResolutionCatalog();
  const eligible: EligibleCommander[] = [];
  for (const [oracleId, card] of catalog.byOracleId.entries()) {
    const norm = normalizeOracleName(card.canonicalName);
    if (SPENT_NORMALIZED.has(norm)) continue;
    const paper = paperMetaForOracle(catalog, oracleId);
    if (!paper.paperEligible) continue;
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!isCompetitiveDeckOracle(catalog, oracleId)) continue;
    const classification = deriveCommanderClassification({
      name: card.canonicalName,
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      colorIdentity: card.colorIdentity,
      legalities: card.legalities,
    });
    if (!classification.canOccupyCommandZone) continue;
    if (classification.commanderFormatStatus !== "legal") continue;
    const resolved = resolveBenchmarkCommanderName(catalog, card.canonicalName);
    if (!resolved.resolved || !resolved.oracleId) continue;
    eligible.push({
      oracleId: resolved.oracleId,
      name: resolved.canonicalName ?? card.canonicalName,
      slug: commanderNameToSlug(resolved.canonicalName ?? card.canonicalName),
    });
  }
  eligible.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  if (eligible.length === 0) throw new Error("No eligible unseen commanders");
  const idx = seed % eligible.length;
  return { commander: eligible[idx]!, eligibleCommanderCount: eligible.length };
}

function executionReportFull(e: StructuralSearchExecutionV4166) {
  const supply = reconcileCandidateSupplyV4166({
    execution: e,
    considered: e.candidatesConsidered,
    neededSlots: Math.max(1, e.selectedCountAfter - e.selectedCountBefore),
  });
  return {
    ...executionReport(e),
    retrievedCanonicalIds: e.retrievedCanonicalIds,
    legalCandidateIds: e.legalCandidateIds,
    qualityPassedIds: e.qualityPassedIds,
    selectedIds: e.selectedIds,
    rejected: e.rejected.map((r) => ({
      oracleId: r.oracleId,
      name: r.name,
      reason: r.rejectionReason,
      score: r.compositeScore,
    })),
    candidateSupply: supply,
    candidatesConsideredSample: e.candidatesConsidered.slice(0, 8).map((c) => ({
      oracleId: c.oracleId,
      name: c.name,
      accepted: c.accepted,
      score: c.compositeScore,
      reason: c.rejectionReason,
    })),
  };
}

function nextActionSnapshot(session: BrewSessionViewV42["session"]): ProfessorNextActionDecisionV41662 {
  return (
    (session.councilState as ProfessorCouncilStateV47 | undefined)?.professorNextActionV41662 ??
    resolveProfessorNextActionFromSessionV41662(session)
  );
}

function strategicCheckpointReport(cs: ProfessorCouncilStateV47) {
  const sp = cs.strategicProgressV41662;
  const sb = cs.deckSlotBudgetV4163;
  const ratio = sb?.expectedNonlands ? (sb.selectedNonlands ?? 0) / sb.expectedNonlands : 0;
  const realizations = cs.theoryRealizationGovernanceV41662 ?? cs.accessArchitectureV4165?.theoryRealizations ?? [];
  const coverage = cs.structuralBuildTelemetryV4166?.completionPlan?.coverage ?? [];
  return {
    structuralFillPct: Math.round(ratio * 100),
    strategicProgress: sp,
    primaryCore: realizations[0] ?? null,
    secondaryCore: realizations[1] ?? null,
    allCorePackages: realizations.map((r) => ({
      packageId: r.packageId,
      verifiedMembers: "candidateCards" in r ? r.candidateCards : [],
      selectedMembers: r.selectedMembers,
      requiredMinimumMembers: r.requiredMinimumMembers,
      realizationStatus: r.realizationStatus,
      realizationDeadlinePhase: "realizationDeadlinePhase" in r ? r.realizationDeadlinePhase : null,
      lastProgressIteration: "lastProgressIteration" in r ? r.lastProgressIteration : null,
      blockingReason: "blockingReason" in r ? r.blockingReason : null,
      verificationDecision: "verificationDecision" in r ? r.verificationDecision : null,
    })),
    winArchitectureProgress: sp?.winArchitectureProgress ?? null,
    accessTargetProgress: sp?.accessTargetProgress ?? null,
    interactionBaseline: coverage.find((c) => c.function === "interaction") ?? null,
    protectionBaseline: coverage.find((c) => c.function === "protection") ?? null,
    strategicRecoveryRequired: sp?.strategicRecoveryRequired ?? false,
    nextAction: cs.professorNextActionV41662 ?? null,
    closureExecutionState: cs.closureExecutionStateV41662 ?? null,
  };
}

function captureStrategicCheckpoint(catalog: DeckResolutionCatalog, cs: ProfessorCouncilStateV47, ratio: number) {
  return {
    ratio,
    thresholdNonlands: Math.ceil((cs.deckSlotBudgetV4163?.expectedNonlands ?? 64) * ratio),
    ...strategicCheckpointReport(cs),
    ...captureCheckpoint(catalog, cs, cs.selectedCards.length),
  };
}

function closureLoopDetected(
  buildPassLog: unknown[],
  tel: StructuralBuildTelemetryV4166 | null | undefined,
  closureState: ProfessorCouncilStateV47["closureExecutionStateV41662"],
): boolean {
  if (tel?.buildPhase !== "STRUCTURAL_CLOSURE") return false;
  const closurePasses = buildPassLog.filter(
    (p) => (p as { buildPhase?: string }).buildPhase === "STRUCTURAL_CLOSURE",
  ).length;
  return closurePasses >= 10 && (tel?.structuralSearchExecutionCount ?? 0) === 0 && (closureState?.executionsSinceClosure ?? 0) === 0;
}

function dispatchInvariantViolations(
  dispatchLog: { pass: number; nextAction: string; execCountBefore: number; execCountAfter: number }[],
): unknown[] {
  const violations: unknown[] = [];
  for (const row of dispatchLog) {
    if (row.nextAction === "RUN_STRUCTURAL_RESEARCH" && row.execCountAfter <= row.execCountBefore) {
      violations.push({ pass: row.pass, reason: "RUN_STRUCTURAL_RESEARCH without StructuralSearchExecution increment" });
    }
  }
  return violations;
}

function executionReport(e: StructuralSearchExecutionV4166) {
  return {
    executionId: e.executionId,
    missionId: e.missionId,
    tier: e.tier,
    retriever: e.retriever,
    compiledQuery: e.compiledQuery,
    searchOutcome: e.searchOutcome,
    selectedCountBefore: e.selectedCountBefore,
    selectedCountAfter: e.selectedCountAfter,
    retrievedCount: e.retrievedCanonicalIds.length,
    legalCount: e.legalCandidateIds.length,
    qualityPassedCount: e.qualityPassedIds.length,
    rejectedCount: e.rejected.length,
    consideredCount: e.candidatesConsidered.length,
    selectedIds: e.selectedIds,
    candidateSetHash: e.candidateSetHash,
  };
}

function missionReportV4166(m: AggregatedStructuralMissionV4166) {
  return {
    missionId: m.missionId,
    deficitFunction: m.deficitFunction,
    desiredSlots: m.desiredSlots,
    need: m.need,
    strategicPurpose: m.strategicPurpose,
    minimumRequirements: m.minimumRequirements,
    preferredProperties: m.preferredProperties,
    forbiddenProperties: m.forbiddenProperties,
    acceptableCardTypes: m.acceptableCardTypes,
    mechanicRelations: m.mechanicRelations,
    targetPackages: m.targetPackages,
    currentCoverage: m.currentCoverage,
    desiredCoverage: m.desiredCoverage,
    status: m.status,
    currentTier: m.currentTier,
    searchQueries: m.searchQueries,
    searchDomains: m.searchDomains,
    domainDiffs: m.domainDiffs,
    rejectionReasons: m.rejectionReasons,
    candidatesConsidered: m.candidatesConsidered,
    candidateSupply: m.candidateSupply,
    roleConstraint: m.roleConstraint,
    priority: m.priority,
  };
}

function escalationEvidenceFromExecutions(executions: StructuralSearchExecutionV4166[]) {
  const tierSteps: { executionId: string; tier: number; retriever: string; query: string }[] = executions.map((e) => ({
    executionId: e.executionId,
    tier: e.tier,
    retriever: e.retriever,
    query: e.compiledQuery,
  }));
  let genuineTierEscalations = 0;
  for (let i = 1; i < executions.length; i++) {
    const prev = executions[i - 1]!;
    const cur = executions[i]!;
    if (cur.tier > prev.tier || cur.compiledQuery !== prev.compiledQuery) genuineTierEscalations += 1;
  }
  return { tierSteps, genuineTierEscalations };
}

function structuralReportV4166(cs: ProfessorCouncilStateV47) {
  const sb = cs.deckSlotBudgetV4163;
  const tel = cs.structuralBuildTelemetryV4166;
  const plan = tel?.completionPlan;
  const missions = plan?.missions ?? [];
  return {
    buildPhase: tel?.buildPhase,
    recomputeCount: tel?.recomputeCount,
    structuralSearchExecutionCount: tel?.structuralSearchExecutionCount,
    consecutiveNormalNoAdds: tel?.consecutiveNormalNoAdds,
    consecutiveExecutionNoOps: tel?.consecutiveExecutionNoOps,
    completionPlan: plan,
    coverage: plan?.coverage,
    accessSplit: plan?.accessSplit,
    expectedLands: sb?.expectedLands,
    selectedLands: sb?.selectedLands,
    remainingLandSlots: sb?.expectedLands != null && sb?.selectedLands != null ? sb.expectedLands - sb.selectedLands : null,
    expectedNonlands: sb?.expectedNonlands,
    selectedNonlands: sb?.selectedNonlands,
    remainingNonlandSlots: sb?.remainingNonlandSlots,
    structurallyComplete: sb?.structurallyComplete,
    status: sb?.status,
    missions: missions.map(missionReportV4166),
    executions: (tel?.executions ?? []).map(executionReport),
    candidateSupplyAggregate: missions.map((m) => m.candidateSupply).filter(Boolean),
    buildTelemetry: tel,
    termination: tel?.termination,
    exhaustionAudit: tel?.exhaustionAudit,
    escalationEvidence: escalationEvidenceFromExecutions(tel?.executions ?? []),
    needsStructuralResearch: professorBrewNeedsStructuralResearchV4166({ fixtureCase: false, councilState: cs } as never),
  };
}

function theoryRealizationReport(cs: ProfessorCouncilStateV47) {
  const realizations = cs.accessArchitectureV4165?.theoryRealizations ?? [];
  return realizations.map((r) => ({
    packageId: r.packageId,
    intendedFunction: r.intendedFunction,
    candidateCards: r.candidateCards,
    selectedMembers: r.selectedMembers,
    requiredMinimumMembers: r.requiredMinimumMembers,
    realizationStatus: r.realizationStatus,
  }));
}

function accessReportV4165(cs: ProfessorCouncilStateV47) {
  const a = cs.accessArchitectureV4165 ?? cs.accessArchitectureV4164;
  return {
    accessReadiness: cs.accessArchitectureV4165?.accessReadiness ?? "UNKNOWN",
    unrealizedPackageCount: cs.accessArchitectureV4165?.unrealizedPackageCount ?? 0,
    theoryRealizations: theoryRealizationReport(cs),
    criticalEnginePieces: a?.criticalEnginePieces ?? [],
    primaryWinPieces: a?.primaryWinPieces ?? [],
    routes: (a?.routes ?? []).map((r) => ({
      source: r.sourceName,
      target: r.targetName,
      searchRestriction: r.searchRestriction,
      destination: r.destination,
      directness: r.directness,
      repeatable: r.repeatable,
      reliability: r.confidence,
    })),
    engineAccess: a?.engineAccess ?? cs.accessArchitectureV4163?.engineAccess ?? 0,
    winAccess: a?.winAccess ?? cs.accessArchitectureV4163?.winAccess ?? 0,
    summary: a?.summary ?? cs.accessArchitectureV4163?.summary,
  };
}

function canonicalTruthAudit(catalog: DeckResolutionCatalog, cs: ProfessorCouncilStateV47) {
  const cards = cs.selectedCards;
  let hydrated = 0;
  let unresolved = 0;
  const samples: unknown[] = [];
  for (const c of cards) {
    const truth = resolveCanonicalCardTruthV4164({ name: c.name, oracleId: c.oracleId, catalog });
    if (cardTruthAllowsIntelligenceParticipation(truth)) hydrated += 1;
    else unresolved += 1;
    if (samples.length < 8) {
      samples.push({
        name: c.name,
        status: truth.status,
        oracleId: truth.oracleId,
        manaValue: truth.manaValue,
        typeLine: truth.typeLine,
      });
    }
  }
  return { cardsHydrated: hydrated, cardTruthUnresolved: unresolved, representativeSamples: samples };
}

function legalitySnapshot(cs: ProfessorCouncilStateV47) {
  const l = cs.canonicalLegalityV4161;
  return {
    selectedCardsLegalSoFar: l?.selectedCardsLegalSoFar,
    completeDeckLegal: l?.completeDeckLegal ?? l?.finalDeckLegal,
    gradeEligible: l?.gradeEligible,
    draftReadyEligible: l?.draftReadyEligible,
    libraryCardCount: l?.libraryCardCount,
  };
}

function winReport(cs: ProfessorCouncilStateV47) {
  const w = cs.b4WinReadinessV4164;
  return {
    concreteLineReady: w?.concreteLineReady,
    mechanicallyVerified: w?.mechanicallyVerified ?? false,
    verifiedWinLine: w?.verifiedWinLine,
    summary: w?.summary,
  };
}

function opportunityReport(cs: ProfessorCouncilStateV47, catalog: DeckResolutionCatalog, commanderColorIdentity: string[]) {
  const opp = cs.opportunityCostV4164;
  return (opp?.bottomSlots ?? cs.opportunityCostV4163?.bottomSlots ?? []).slice(0, 6).map((slot) => {
    const replacement = slot.bestKnownReplacement;
    const repTruth = replacement ? resolveCanonicalCardTruthV4164({ name: replacement, catalog }) : null;
    return {
      currentCard: slot.currentCard,
      proposedReplacement: replacement,
      colorIdentityLegal: repTruth ? repTruth.colorIdentity.every((c) => commanderColorIdentity.includes(c)) : null,
      replacementLegal: slot.replacementLegal ?? true,
    };
  });
}

function captureCheckpoint(catalog: DeckResolutionCatalog, cs: ProfessorCouncilStateV47, target: number) {
  const power = cs.bracketPowerAssessmentV4163;
  const commanderCi = cs.deckCharter?.commander
    ? resolveCanonicalCardTruthV4164({ name: cs.deckCharter.commander, catalog }).colorIdentity
    : [];
  return {
    target,
    libraryCount: cs.selectedCards.length,
    buildPhase: cs.buildPhase,
    telemetryBuildPhase: cs.structuralBuildTelemetryV4166?.buildPhase,
    legality: legalitySnapshot(cs),
    structural: structuralReportV4166(cs),
    theoryRealization: theoryRealizationReport(cs),
    canonicalTruth: canonicalTruthAudit(catalog, cs),
    rawPowerCeiling: power?.rawPowerCeiling ?? null,
    realizedEffectiveBracket: power?.realizedEffectiveBracket ?? null,
    unrealizedPowerReasons: power?.unrealizedPowerReasons ?? [],
    accessArchitecture: accessReportV4165(cs),
    winArchitecture: winReport(cs),
    opportunityCost: opportunityReport(cs, catalog, commanderCi),
  };
}

function comprehensivePreHp(session: BrewSessionViewV42["session"], catalog: DeckResolutionCatalog, commanderName: string) {
  const cs = session.councilState as ProfessorCouncilStateV47;
  const power = cs.bracketPowerAssessmentV4163;
  const commanderCi = resolveCanonicalCardTruthV4164({ name: commanderName, catalog }).colorIdentity;
  const nonlands = cs.selectedCards.filter((c) => c.category !== "land");
  const lands = cs.selectedCards.filter((c) => c.category === "land");
  let avgMv = 0;
  if (nonlands.length > 0) {
    let total = 0;
    for (const c of nonlands) {
      const t = resolveCanonicalCardTruthV4164({ name: c.name, oracleId: c.oracleId, catalog });
      total += t.manaValue;
    }
    avgMv = Math.round((total / nonlands.length) * 100) / 100;
  }
  return {
    libraryCount: cs.selectedCards.length,
    nonlandCount: nonlands.length,
    landCount: lands.length,
    averageNonlandMv: avgMv,
    legality: cs.canonicalLegalityV4161,
    legalitySnapshot: legalitySnapshot(cs),
    structural: structuralReportV4166(cs),
    theoryRealization: theoryRealizationReport(cs),
    canonicalTruth: canonicalTruthAudit(catalog, cs),
    rawPowerCeiling: power?.rawPowerCeiling,
    realizedEffectiveBracket: power?.realizedEffectiveBracket,
    unrealizedPowerReasons: power?.unrealizedPowerReasons ?? [],
    accessArchitecture: accessReportV4165(cs),
    winArchitecture: winReport(cs),
    opportunityCost: opportunityReport(cs, catalog, commanderCi),
    preFinalCritic: cs.preFinalQualityCriticV4163,
    readiness: cs.bracketReadinessV416,
    quality: cs.bracketReadinessQualityV4162,
    gameChangers: listGameChangersInDeckV4162({ selectedCards: cs.selectedCards }),
    deckList: cs.selectedCards.map((c) => ({ name: c.name, category: c.category, roles: c.roles.slice(0, 4) })),
  };
}

function pctNonlandsChanged(before: string[], after: string[]): number {
  const b = before.filter((n) => !after.includes(n));
  return Math.round((b.length / Math.max(1, before.length)) * 100);
}

function classifyConstructionVsRescue(pct: number): "CONSTRUCTION_DOMINANT" | "BALANCED" | "RESCUE_DOMINANT" | "NOT_APPLICABLE_BUILD_STALLED" {
  if (pct < 10) return "CONSTRUCTION_DOMINANT";
  if (pct < 25) return "BALANCED";
  return "RESCUE_DOMINANT";
}

function gate(pass: boolean, partial = false, notEvaluated = false): AcceptanceVerdictV4165 {
  if (notEvaluated) return "NOT_EVALUATED";
  if (pass) return "PASS";
  if (partial) return "PARTIAL";
  return "FAIL";
}

function isNormalAssemblyPhase(phase: BuildPhaseV4166 | string | undefined): boolean {
  return phase === "EARLY_ASSEMBLY" || phase === "NORMAL_ASSEMBLY" || phase === "BUILDING";
}

function analyzeEscalationGenuineV4166(tel: StructuralBuildTelemetryV4166 | null | undefined): boolean {
  const executions = tel?.executions ?? [];
  if (executions.length < 2) return executions.some((e) => e.tier > 1);
  return escalationEvidenceFromExecutions(executions).genuineTierEscalations > 0;
}

function analyzeNoOpFailureV4166(tel: StructuralBuildTelemetryV4166 | null | undefined): boolean {
  if ((tel?.recomputeNoOpCount ?? 0) > 0) return true;
  if (tel?.exhaustionAudit?.invalidExhaustionClaim) return true;
  return (tel?.consecutiveExecutionNoOps ?? 0) >= 3;
}

function nonlandFillRatio(cs: ProfessorCouncilStateV47): number {
  const sb = cs.deckSlotBudgetV4163;
  if (!sb?.expectedNonlands || sb.expectedNonlands <= 0) return 0;
  return (sb.selectedNonlands ?? 0) / sb.expectedNonlands;
}

async function runProspective() {
  await waitForServer();
  const catalog = await loadDeckResolutionCatalog();

  const { commander, eligibleCommanderCount } = await selectUnseenCommander(RANDOM_SEED);
  log(`Selected commander [${RANDOM_SEED % eligibleCommanderCount}/${eligibleCommanderCount}]: ${commander.name} (${commander.oracleId})`);

  const userSetup = {
    bracket: 4 as const,
    bracketLabel: "B4 · Optimized",
    archetypePresented: MEREN_ARCHETYPE_CHOICES_V42.map((c) => ({ id: c.id, label: c.label })),
    relationshipPresented: RELATIONSHIP_CHOICES_V42.map((c) => ({ id: c.id, label: c.label })),
    winPreferencePresented: WIN_PREFERENCE_CHOICES_V415.map((c) => ({ id: c.id, label: c.label })),
    selected: {
      archetype: DEFAULT_ARCHETYPE_CHOICE_V42,
      relationship: DEFAULT_RELATIONSHIP_CHOICE_V42,
      winPreference: DEFAULT_WIN_PREFERENCE_V415,
    },
  };

  const started = await post({
    configureAndStart: {
      mode: "live",
      commanderName: commander.name,
      commanderSlug: commander.slug,
      bracket: 4,
    },
  });

  const sid = started.session.sessionId;
  if (started.session.fixtureCase) throw new Error(`Fixture path detected: ${started.session.fixtureCase}`);

  let current = await get(sid);
  const cs0 = current.session.councilState as ProfessorCouncilStateV47;
  const charter = cs0.deckCharter!;
  const charterProvenance = auditCharterProvenanceV4162(charter);
  const charterSupport = auditCharterConceptSupportV4163(charter);

  const authoritativeGateAtCreativeComplete = authoritativeGateSnapshot(current.session);
  log(
    `Authoritative gate after creative pass — phase=${authoritativeGateAtCreativeComplete.v4166Phase} shouldContinue=${authoritativeGateAtCreativeComplete.shouldContinueAutoBuild} legacyConflict=${authoritativeGateAtCreativeComplete.legacyConflict}`,
  );

  const checkpoints: Record<number, ReturnType<typeof captureCheckpoint>> = {};
  const strategicCheckpoints: Record<string, ReturnType<typeof captureStrategicCheckpoint>> = {};
  const buildPassLog: unknown[] = [];
  const nextActionDispatchLog: {
    pass: number;
    phase: string | undefined;
    buildControl: ProfessorBuildControlV41661 | null;
    nextAction: ProfessorNextActionDecisionV41662;
    execCountBefore: number;
    execCountAfter: number;
    selectedNonlands: number | undefined;
  }[] = [];
  const phaseTransitionLog: unknown[] = [];
  const normalAssemblyExecutions: unknown[] = [];
  const recomputeSafety: unknown[] = [];
  const structuralExecutions: unknown[] = [];
  const recoveryEpisodes: RecoveryEpisodeV41661[] = [];
  const noOpEvents: unknown[] = [];
  const finalFourSlotLog: unknown[] = [];
  const manaGateLog: unknown[] = [];
  const seenExecutionIds = new Set<string>();
  let prevCount = current.session.councilState?.selectedCards.length ?? 0;
  let prevBuildPhase: BuildPhaseV4166 | undefined;
  let manaBaseAttemptedBeforeStructural = false;
  let terminationObserved = false;
  let advanceTreeCount = 0;
  let stallEpisode: Partial<RecoveryEpisodeV41661> | null = null;
  let recoveryEpisodeCounter = 0;

  for (let pass = 0; pass < 100; pass++) {
    const session = current.session;
    const cs = session.councilState as ProfessorCouncilStateV47;
    const countBefore = prevCount;
    const n = cs?.selectedCards.length ?? 0;
    const tel = cs.structuralBuildTelemetryV4166;
    const buildPhase = tel?.buildPhase;
    const remaining = cs.deckSlotBudgetV4163?.remainingNonlandSlots ?? 99;

    if (prevBuildPhase !== undefined && buildPhase && buildPhase !== prevBuildPhase) {
      const sb = cs.deckSlotBudgetV4163;
      const gate = cs.professorBuildControlV41661 ?? resolveProfessorBuildControlFromSessionV41661(session);
      phaseTransitionLog.push({
        pass: pass + 1,
        from: prevBuildPhase,
        to: buildPhase,
        libraryCount: n,
        selectedNonlands: sb?.selectedNonlands,
        expectedNonlands: sb?.expectedNonlands,
        selectedLands: sb?.selectedLands,
        expectedLands: sb?.expectedLands,
        triggeringEvent: "buildPhaseChange",
        controllingAction: tel?.completionPlan?.action ?? gate.action,
        buildControl: gate,
        recomputeCount: tel?.recomputeCount,
        structuralSearchExecutionCount: tel?.structuralSearchExecutionCount,
      });
      if (buildPhase === "STALLED_RECOVERY" && !stallEpisode) {
        stallEpisode = {
          episodeId: `recovery-${++recoveryEpisodeCounter}`,
          stallPass: pass + 1,
          before: {
            libraryCount: n,
            selectedNonlands: sb?.selectedNonlands ?? 0,
            deficits: deficitSnapshot(cs),
          },
          executions: [],
          cardsAdded: 0,
        };
      }
      if (
        stallEpisode &&
        prevBuildPhase === "STALLED_RECOVERY" &&
        (buildPhase === "NORMAL_ASSEMBLY" || buildPhase === "EARLY_ASSEMBLY")
      ) {
        stallEpisode.resumePass = pass + 1;
        stallEpisode.resumedNormalAssembly = true;
        stallEpisode.after = {
          libraryCount: n,
          selectedNonlands: sb?.selectedNonlands ?? 0,
          deficits: deficitSnapshot(cs),
        };
        recoveryEpisodes.push(stallEpisode as RecoveryEpisodeV41661);
        stallEpisode = null;
      }
    }
    if (buildPhase) prevBuildPhase = buildPhase;

    for (const t of CHECKPOINT_TARGETS) {
      if (n >= t - 3 && !checkpoints[t]) {
        checkpoints[t] = captureCheckpoint(catalog, cs, t);
        log(
          `Checkpoint ~${t}: ${n} cards remainingNL=${checkpoints[t].structural.remainingNonlandSlots} phase=${buildPhase ?? cs.buildPhase}`,
        );
      }
    }

    const fillRatioNow = nonlandFillRatio(cs);
    for (const ratio of STRATEGIC_CHECKPOINTS) {
      const key = `${Math.round(ratio * 100)}pct`;
      if (fillRatioNow >= ratio - 0.02 && !strategicCheckpoints[key]) {
        strategicCheckpoints[key] = captureStrategicCheckpoint(catalog, cs, ratio);
        log(
          `Strategic checkpoint ${key}: fill=${Math.round(fillRatioNow * 100)}% recoveryRequired=${strategicCheckpoints[key].strategicRecoveryRequired} next=${strategicCheckpoints[key].nextAction?.action}`,
        );
      }
    }

    if (remaining <= 6 && remaining > 0) {
      finalFourSlotLog.push({
        pass: pass + 1,
        remainingNonlandSlots: remaining,
        missions: (tel?.completionPlan?.missions ?? []).map(missionReportV4166),
        selectedNonlands: cs.deckSlotBudgetV4163?.selectedNonlands,
      });
    }

    if (n >= COMMANDER_DECK_LIBRARY_SIZE_V47) {
      log(`Library complete at pass ${pass + 1}: ${n} cards`);
      break;
    }

    if (cs.buildPhase === "BUILD_FAILED_CANDIDATE_EXHAUSTION" || tel?.termination?.shouldTerminate) {
      terminationObserved = true;
      log(`Termination at pass ${pass + 1}: ${tel?.termination?.reason ?? cs.buildPhase}`);
      break;
    }

    if (!professorBrewShouldContinueAutoBuildV47(session)) {
      if (terminationObserved || tel?.termination?.shouldTerminate) break;
      log(`Auto-build stopped at pass ${pass + 1} — ${n} cards phase=${buildPhase ?? cs.buildPhase}`);
      break;
    }
    if (!session.workingDeckTheory) break;

    if (professorBrewNeedsManaBaseV48(session) && !cs.deckSlotBudgetV4163?.structurallyComplete) {
      manaBaseAttemptedBeforeStructural = true;
      manaGateLog.push({
        pass: pass + 1,
        event: "ORCHESTRATOR_WOULD_RUN_MANA_BASE",
        structurallyComplete: false,
        libraryCount: n,
        nextAction: nextActionSnapshot(session).action,
      });
    }

    const nextBefore = nextActionSnapshot(session);
    const execCountBefore = tel?.structuralSearchExecutionCount ?? 0;

    if (session.discoveryInterrupt) {
      current = await post({ sessionId: sid, action: { type: "DISCOVERY_CHOICE", choiceId: "explore" } });
      await sleep(700);
      continue;
    }
    if (session.phase === "USER_FORK") {
      current = await post({ sessionId: sid, action: { type: "USER_FORK", forkId: defaultForkId(session) } });
      await sleep(700);
      continue;
    }

    current = await post({ sessionId: sid, action: { type: "ADVANCE_TREE" } });
    advanceTreeCount += 1;
    const csAfter = current.session.councilState as ProfessorCouncilStateV47;
    const countAfter = csAfter?.selectedCards.length ?? 0;
    const telAfter = csAfter.structuralBuildTelemetryV4166;
    const planAfter = telAfter?.completionPlan;
    const nextAfter = nextActionSnapshot(current.session);
    const execCountAfter = telAfter?.structuralSearchExecutionCount ?? 0;

    nextActionDispatchLog.push({
      pass: pass + 1,
      phase: telAfter?.buildPhase ?? csAfter.buildPhase,
      buildControl: csAfter.professorBuildControlV41661 ?? resolveProfessorBuildControlFromSessionV41661(current.session),
      nextAction: nextBefore,
      execCountBefore,
      execCountAfter,
      selectedNonlands: csAfter.deckSlotBudgetV4163?.selectedNonlands,
    });

    for (const ex of telAfter?.executions ?? []) {
      if (!seenExecutionIds.has(ex.executionId)) {
        seenExecutionIds.add(ex.executionId);
        const exReport = { pass: pass + 1, ...executionReportFull(ex) };
        structuralExecutions.push(exReport);
        if (stallEpisode) {
          stallEpisode.executions = [...(stallEpisode.executions ?? []), executionReportFull(ex)];
        }
      }
    }

    recomputeSafety.push({
      pass: pass + 1,
      recomputeCount: telAfter?.recomputeCount ?? 0,
      structuralSearchExecutionCount: telAfter?.structuralSearchExecutionCount ?? 0,
      recomputePerExecution:
        (telAfter?.structuralSearchExecutionCount ?? 0) > 0
          ? (telAfter?.recomputeCount ?? 0) / (telAfter?.structuralSearchExecutionCount ?? 1)
          : null,
      consecutiveExecutionNoOps: telAfter?.consecutiveExecutionNoOps ?? 0,
      recomputeNoOpCount: telAfter?.recomputeNoOpCount ?? 0,
      invalidExhaustionClaim: telAfter?.exhaustionAudit?.invalidExhaustionClaim ?? false,
    });

    if (countAfter > countBefore) {
      const phaseAfter = telAfter?.buildPhase ?? csAfter.buildPhase;
      if (stallEpisode) stallEpisode.cardsAdded = (stallEpisode.cardsAdded ?? 0) + (countAfter - countBefore);
      if (isNormalAssemblyPhase(phaseAfter)) {
        normalAssemblyExecutions.push({
          pass: pass + 1,
          executionId: `normal-${pass + 1}`,
          cardsBefore: countBefore,
          cardsAfter: countAfter,
          cardsAdded: countAfter - countBefore,
          selectedNonlandsBefore: cs.deckSlotBudgetV4163?.selectedNonlands,
          selectedNonlandsAfter: csAfter.deckSlotBudgetV4163?.selectedNonlands,
          buildPhase: phaseAfter,
          deckNeedsAddressed: (csAfter.deckNeeds ?? [])
            .filter((d) => d.status !== "SATISFIED")
            .slice(0, 6)
            .map((d) => ({ needId: d.needId, status: d.status, label: d.label })),
          buildControl: csAfter.professorBuildControlV41661 ?? resolveProfessorBuildControlFromSessionV41661(current.session),
        });
      }
    }

    if ((telAfter?.consecutiveExecutionNoOps ?? 0) >= 1 && countAfter === countBefore) {
      noOpEvents.push({
        pass: pass + 1,
        selectedCount: countAfter,
        consecutiveExecutionNoOps: telAfter?.consecutiveExecutionNoOps ?? 0,
        consecutiveNormalNoAdds: telAfter?.consecutiveNormalNoAdds ?? 0,
        completionPlanAction: planAfter?.action,
        terminationPending: telAfter?.termination?.shouldTerminate ?? false,
      });
    }

    buildPassLog.push({
      pass: pass + 1,
      advanceTreeNumber: advanceTreeCount,
      selectedCardCountBefore: countBefore,
      selectedCardCountAfter: countAfter,
      buildPhase: telAfter?.buildPhase,
      councilBuildPhase: csAfter.buildPhase,
      buildControl: csAfter.professorBuildControlV41661 ?? resolveProfessorBuildControlFromSessionV41661(current.session),
      nextActionBefore: nextBefore,
      nextActionAfter: nextAfter,
      strategicProgress: csAfter.strategicProgressV41662 ?? null,
      closureExecutionState: csAfter.closureExecutionStateV41662 ?? null,
      recomputeCount: telAfter?.recomputeCount,
      structuralSearchExecutionCount: telAfter?.structuralSearchExecutionCount,
      consecutiveNormalNoAdds: telAfter?.consecutiveNormalNoAdds,
      consecutiveExecutionNoOps: telAfter?.consecutiveExecutionNoOps,
      completionPlanAction: planAfter?.action,
      remainingNonlandSlots: csAfter.deckSlotBudgetV4163?.remainingNonlandSlots,
      coverageSummary: (planAfter?.coverage ?? []).map((c) => ({
        function: c.function,
        deficit: c.deficit,
        currentQuality: c.currentQuality,
        currentCount: c.currentCount,
      })),
      accessSplit: planAfter?.accessSplit,
      missionSnapshot: (planAfter?.missions ?? []).map((m) => ({
        missionId: m.missionId,
        deficitFunction: m.deficitFunction,
        status: m.status,
        tier: m.currentTier,
        domain: m.searchDomains.at(-1),
        query: m.searchQueries.at(-1),
        candidateSupply: m.candidateSupply,
      })),
      normalBuildDisabled: telAfter?.normalBuildDisabled ?? false,
      structuralResearchDisabled: telAfter?.structuralResearchDisabled ?? false,
      termination: telAfter?.termination?.terminalState ?? null,
      exhaustionAuditEmitted: telAfter?.exhaustionAudit?.emitted ?? false,
    });

    if (pass % 8 === 0 || countAfter !== countBefore) {
      log(
        `pass ${pass + 1} — ${countAfter} cards remNL=${csAfter.deckSlotBudgetV4163?.remainingNonlandSlots} execNoOps=${telAfter?.consecutiveExecutionNoOps ?? 0} phase=${telAfter?.buildPhase ?? csAfter.buildPhase}`,
      );
    }
    prevCount = countAfter;
    await sleep(1200);
  }

  const preManaStructural = structuralReportV4166(current.session.councilState as ProfessorCouncilStateV47);
  let manaBaseRan = false;
  if (professorBrewNeedsManaBaseV48(current.session) || professorBrewNeedsDeckCompletionV416(current.session)) {
    if (!preManaStructural.structurallyComplete) {
      manaBaseAttemptedBeforeStructural = true;
      manaGateLog.push({
        event: "RUN_MANA_BASE_ATTEMPTED_WHILE_INCOMPLETE",
        structural: preManaStructural,
      });
    }
    try {
      log("RUN_MANA_BASE");
      current = await post({ sessionId: sid, action: { type: "RUN_MANA_BASE" } });
      manaBaseRan = true;
      manaGateLog.push({
        event: "RUN_MANA_BASE_COMPLETED",
        structuralBefore: preManaStructural,
        libraryAfter: (current.session.councilState as ProfessorCouncilStateV47)?.selectedCards.length,
        landsAfter: (current.session.councilState as ProfessorCouncilStateV47)?.selectedCards.filter((c) => c.category === "land")
          .length,
      });
    } catch (err) {
      manaGateLog.push({ event: "RUN_MANA_BASE_THROWN", error: err instanceof Error ? err.message : String(err) });
    }
  }

  for (let rp = 0; rp < 4 && professorBrewNeedsBracketResearchV416(current.session); rp++) {
    log(`RUN_BRACKET_RESEARCH pass ${rp + 1}`);
    current = await post({ sessionId: sid, action: { type: "RUN_BRACKET_RESEARCH" } });
    await sleep(1500);
  }

  const preHp = comprehensivePreHp(current.session, catalog, commander.name);
  const preHpNonlandNames = (current.session.councilState as ProfessorCouncilStateV47).selectedCards
    .filter((c) => c.category !== "land")
    .map((c) => c.name);

  const hpRan = professorBrewNeedsFinalReviewV48(current.session);
  const hpStart = Date.now();
  if (hpRan) {
    log("RUN_FINAL_REVIEW");
    current = await post({ sessionId: sid, action: { type: "RUN_FINAL_REVIEW" } });
    for (let i = 0; i < 180; i++) {
      await sleep(4000);
      current = await get(sid);
      const st = current.session.finalDeckDoctor?.status;
      if (i % 5 === 0) log(`HP poll ${i + 1} — ${st} (${Math.round((Date.now() - hpStart) / 1000)}s)`);
      if (st === "COMPLETE" || st === "FAILED") break;
    }
  }

  const finalCs = current.session.councilState as ProfessorCouncilStateV47;
  const finalLegality = assessCanonicalDeckLegalityV4161({
    selectedCards: finalCs?.selectedCards ?? [],
    commanderName: commander.name,
    catalog,
    requireFullLibrary: true,
  });
  const review = current.session.finalDeckDoctor?.review;
  const swaps = current.session.finalDeckDoctor?.executedSwaps?.filter((s) => s.status === "ACCEPTED") ?? [];
  const finalNonlandNames = (finalCs?.selectedCards ?? []).filter((c) => c.category !== "land").map((c) => c.name);
  const pctChanged = pctNonlandsChanged(preHpNonlandNames, finalNonlandNames);
  const hpCompleted = current.session.finalDeckDoctor?.status === "COMPLETE";
  const completeDeck = finalLegality.completeDeckLegal;
  const structuralComplete = preHp.structural.structurallyComplete === true;
  const telFinal = finalCs.structuralBuildTelemetryV4166;
  const planFinal = telFinal?.completionPlan;
  const missionsFinal = planFinal?.missions ?? [];
  const executionsFinal = telFinal?.executions ?? [];

  const invalidAccessRoutes = (preHp.accessArchitecture.routes ?? []).filter(
    (r) =>
      /mystical tutor/i.test(r.source) &&
      r.destination === "HAND" &&
      !/instant|sorcery/i.test(r.searchRestriction ?? ""),
  );
  const offColorOpp = (preHp.opportunityCost ?? []).filter((o) => o.replacementLegal === false && o.proposedReplacement);
  const genuineEscalation = analyzeEscalationGenuineV4166(telFinal);
  const noOpFailure = analyzeNoOpFailureV4166(telFinal);
  const exhaustionTerminal =
    finalCs.buildPhase === "BUILD_FAILED_CANDIDATE_EXHAUSTION" ||
    telFinal?.termination?.terminalState === "BUILD_FAILED_CANDIDATE_EXHAUSTION";

  const unrealizedCore = preHp.theoryRealization.filter((r) => r.realizationStatus === "UNREALIZED" || r.realizationStatus === "PARTIAL");
  const accessReady = preHp.accessArchitecture.accessReadiness === "READY";
  const fillRatio = nonlandFillRatio(finalCs);
  const earlyBuildPhases = phaseTransitionLog.every(
    (e) =>
      !("from" in (e as object)) ||
      (e as { from: string }).from !== "EARLY_ASSEMBLY" ||
      ["NORMAL_ASSEMBLY", "STALLED_RECOVERY", "STRUCTURAL_CLOSURE", "BUILD_FAILED_CANDIDATE_EXHAUSTION"].includes(
        (e as { to: string }).to,
      ),
  );
  const buildPhaseTruth =
    fillRatio < 0.5
      ? telFinal?.buildPhase === "EARLY_ASSEMBLY" ||
        telFinal?.buildPhase === "NORMAL_ASSEMBLY" ||
        structuralComplete ||
        completeDeck
      : earlyBuildPhases;
  const coverageDeficits = planFinal?.coverage?.filter((c) => c.deficit > 0) ?? [];
  const accessSplitFinal = planFinal?.accessSplit;
  const hasRejectionEvidence = executionsFinal.some((e) => e.rejected.length > 0);
  const hasRetrieverExecution =
    executionsFinal.length === 0 || executionsFinal.every((e) => Boolean(e.retriever) && e.startedAt.length > 0);
  const supplyReconciled =
    missionsFinal.length === 0 ||
    missionsFinal.every((m) => m.candidateSupply != null || executionsFinal.some((e) => e.missionId === m.missionId));
  const rejectionReformulation =
    missionsFinal.some((m) => m.rejectionReasons.length > 0 && m.domainDiffs.length > 0) ||
    executionsFinal.length >= 2;

  const firstAdvancePass = buildPassLog.length >= 1 && advanceTreeCount >= 1;
  const authoritativeGateLive =
    authoritativeGateAtCreativeComplete.shouldContinueAutoBuild &&
    (!authoritativeGateAtCreativeComplete.legacyConflict || firstAdvancePass);
  const meaningfulConstruction = normalAssemblyExecutions.length >= 2 || fillRatio >= 0.5 || structuralComplete;

  const dispatchViolations = dispatchInvariantViolations(nextActionDispatchLog);
  const viperShape =
    fillRatio >= 0.9 &&
    unrealizedCore.length >= 2 &&
    (telFinal?.structuralSearchExecutionCount ?? 0) === 0;
  const closureSpin = closureLoopDetected(buildPassLog, telFinal, finalCs.closureExecutionStateV41662);
  const retrieverTypes = new Set(executionsFinal.map((e) => e.retriever));
  const hasRealRetriever =
    executionsFinal.length > 0 &&
    [...retrieverTypes].some((r) =>
      ["GOLDEN_CATALOG", "SEMANTIC_ORACLE", "PACKAGE_RAG", "STRATEGY_RAG", "MODEL_PRIOR", "EXISTING_CANDIDATE_POOL"].includes(r),
    );
  const structuralDispatchWorked =
    executionsFinal.length > 0 && dispatchViolations.length === 0 && !closureSpin;
  const strategicRecoveryObserved = Object.values(strategicCheckpoints).some((c) => c.strategicRecoveryRequired);
  const strategicRecoveryChangedAction = nextActionDispatchLog.some(
    (r) => r.nextAction.strategicRecoveryRequired && r.nextAction.action === "RUN_STRUCTURAL_RESEARCH",
  );
  const recoveryToNormal = recoveryEpisodes.some((e) => e.resumedNormalAssembly) ||
    phaseTransitionLog.some(
      (p) =>
        (p as { from?: string; to?: string }).from === "STALLED_RECOVERY" &&
        ["NORMAL_ASSEMBLY", "EARLY_ASSEMBLY"].includes((p as { to?: string }).to ?? ""),
    );
  const closureUsedStructural =
    phaseTransitionLog.some(
      (p) =>
        (p as { to?: string }).to === "STRUCTURAL_CLOSURE" &&
        (p as { controllingAction?: string }).controllingAction === "RUN_STRUCTURAL_RESEARCH",
    ) || (telFinal?.buildPhase === "STRUCTURAL_CLOSURE" && executionsFinal.length > 0);
  const packageVerificationLogged = (finalCs.theoryRealizationGovernanceV41662 ?? []).some(
    (r) => r.verificationDecision != null,
  );

  const acceptanceMatrix: Record<string, AcceptanceVerdictV4165> = {
    GENERALIZATION: gate(!current.session.fixtureCase),
    CHARTER_SUPPORT: gate(charterSupport.pass),
    CANONICAL_CARD_TRUTH: gate(preHp.canonicalTruth.cardTruthUnresolved === 0, preHp.canonicalTruth.cardTruthUnresolved < 3),
    AUTHORITATIVE_BUILD_CONTROL: gate(authoritativeGateLive, !authoritativeGateAtCreativeComplete.shouldContinueAutoBuild),
    NEXT_ACTION_DISPATCH: gate(structuralDispatchWorked || structuralComplete || completeDeck, dispatchViolations.length > 0),
    FIRST_ADVANCE: gate(firstAdvancePass),
    BUILD_PHASE_TRUTH: gate(buildPhaseTruth && !viperShape, viperShape),
    NORMAL_ASSEMBLY: gate(firstAdvancePass && meaningfulConstruction, !firstAdvancePass),
    STRATEGIC_PROGRESS_GOVERNANCE: gate(
      !strategicRecoveryObserved || strategicRecoveryChangedAction || executionsFinal.length > 0,
      strategicRecoveryObserved && !strategicRecoveryChangedAction,
    ),
    THEORY_REALIZATION: gate(unrealizedCore.length === 0 || exhaustionTerminal, unrealizedCore.length > 0 && structuralComplete),
    PACKAGE_VERIFICATION: gate(packageVerificationLogged || executionsFinal.length === 0, !packageVerificationLogged && executionsFinal.length > 0),
    STRUCTURAL_COVERAGE: gate(coverageDeficits.length === 0 || structuralComplete || completeDeck, coverageDeficits.length <= 2),
    ACCESS_TOOL_TARGET_TRUTH: gate(
      Boolean(accessSplitFinal) &&
        (accessSplitFinal!.accessToolCoverage >= 1 || accessSplitFinal!.accessTargetsRealized.length >= 1 || structuralComplete),
      accessSplitFinal?.accessTargetRealization === "PARTIAL",
    ),
    STRUCTURAL_ACTION_DISPATCH: gate(structuralDispatchWorked || structuralComplete || completeDeck, dispatchViolations.length > 0 || closureSpin),
    QUERY_COMPILATION: gate(
      executionsFinal.every((e) => e.compiledQuery.length > 0) || executionsFinal.length === 0,
      missionsFinal.some((m) => m.searchQueries.length === 0) && executionsFinal.length === 0,
    ),
    SEARCH_EXECUTION: gate(
      executionsFinal.length > 0 || structuralComplete || completeDeck,
      executionsFinal.length === 0 && !structuralComplete && !completeDeck,
    ),
    RETRIEVER_EXECUTION: gate(hasRealRetriever, executionsFinal.length === 0, executionsFinal.length === 0),
    CANDIDATE_SUPPLY_RECONCILIATION: gate(
      executionsFinal.every((e) => {
        const s = reconcileCandidateSupplyV4166({ execution: e, considered: e.candidatesConsidered, neededSlots: 1 });
        return s.retrieved === e.retrievedCanonicalIds.length;
      }) || executionsFinal.length === 0,
      executionsFinal.length > 0 && !supplyReconciled,
    ),
    REJECTION_EVIDENCE: gate(hasRejectionEvidence || executionsFinal.length === 0 || structuralComplete),
    SEARCH_REFORMULATION: gate(rejectionReformulation || structuralComplete || completeDeck),
    RECOVERY_TO_NORMAL: gate(recoveryToNormal || structuralComplete || completeDeck, executionsFinal.length > 0 && !recoveryToNormal),
    CLOSURE_EXECUTION: gate(!closureSpin && (executionsFinal.length > 0 || telFinal?.buildPhase !== "STRUCTURAL_CLOSURE"), closureSpin),
    NO_OP_TRUTH: gate(!noOpFailure || exhaustionTerminal || structuralComplete),
    EXHAUSTION_TRUTH: gate(
      exhaustionTerminal
        ? Boolean(telFinal?.exhaustionAudit?.emitted) && !telFinal?.exhaustionAudit?.invalidExhaustionClaim
        : !telFinal?.exhaustionAudit?.invalidExhaustionClaim,
      !exhaustionTerminal && (telFinal?.consecutiveExecutionNoOps ?? 0) >= 2,
    ),
    STRUCTURAL_COMPLETION: gate(structuralComplete || completeDeck),
    MANA_GATING: gate(!manaBaseAttemptedBeforeStructural || structuralComplete),
    ACCESS_MECHANICS: gate(invalidAccessRoutes.length === 0),
    ACCESS_QUALITY: gate(accessReady, preHp.accessArchitecture.accessReadiness === "THEORY_UNREALIZED" ? false : true),
    WIN_MECHANICS: gate(preHp.winArchitecture.mechanicallyVerified === true, preHp.winArchitecture.concreteLineReady !== true),
    OPPORTUNITY_COST: gate(offColorOpp.length === 0),
    REALIZED_POWER: gate((preHp.rawPowerCeiling ?? 0) >= (preHp.realizedEffectiveBracket ?? 0)),
    BRACKET_READINESS: gate(Boolean(preHp.readiness?.canEnterFinalization || preHp.readiness?.carryForwardFlag || completeDeck), true),
    PRE_FINAL_CRITIC: gate(
      Boolean(preHp.preFinalCritic) && buildPassLog.length > 0,
      false,
      buildPassLog.length === 0 || !preHp.preFinalCritic,
    ),
    HEAD_PROFESSOR: hpCompleted
      ? gate(Math.abs((preHp.realizedEffectiveBracket ?? 0) - (review?.predictedEffectiveBracket ?? 0)) <= 1, true)
      : "NOT_EVALUATED",
    REFINEMENT: hpCompleted ? gate(!(review?.requiresMajorRevision && swaps.length === 0), true) : "NOT_EVALUATED",
    STATE: gate(finalLegality.selectedCardsLegalSoFar !== false, true),
    PRODUCT: completeDeck && current.session.deckGrade && hpCompleted ? "PASS" : completeDeck ? "PARTIAL" : firstAdvancePass ? "FAIL" : "FAIL",
    B4_TARGET: current.session.deckGrade?.bracketAlignmentStatus === "TARGET_ACHIEVED" ? "PASS" : "FAIL",
    CONSTRUCTION_VS_RESCUE: hpCompleted
      ? gate(classifyConstructionVsRescue(pctChanged) === "CONSTRUCTION_DOMINANT", classifyConstructionVsRescue(pctChanged) === "BALANCED")
      : "NOT_EVALUATED",
  };

  const semantics = assessProspectiveAcceptanceSemanticsV4165({
    headProfessorExecuted: hpCompleted,
    refinementExecuted: hpCompleted && Boolean(review),
    preFinalCriticExecuted: buildPassLog.length > 0 && Boolean(preHp.preFinalCritic),
    buildStalled: !completeDeck && !hpRan,
    canonicalTruthResolved: preHp.canonicalTruth.cardTruthUnresolved === 0,
    accessMechanicallyVerified: invalidAccessRoutes.length === 0,
    accessReadinessReady: accessReady,
    accessTheoryUnrealized: preHp.accessArchitecture.accessReadiness === "THEORY_UNREALIZED",
    winMechanicallyVerified: preHp.winArchitecture.mechanicallyVerified === true,
    winCorrectlyBlocked: !preHp.winArchitecture.concreteLineReady && !preHp.winArchitecture.mechanicallyVerified,
    opportunityCostLegal: offColorOpp.length === 0,
    structuralComplete,
    searchEscalationGenuine: genuineEscalation,
    noOpTerminationEnforced: !noOpFailure || exhaustionTerminal,
    manaGatingEnforced: !manaBaseAttemptedBeforeStructural,
    realizedPowerTruthPass: (preHp.rawPowerCeiling ?? 0) >= (preHp.realizedEffectiveBracket ?? 0),
    productComplete: completeDeck && Boolean(current.session.deckGrade),
  });

  const successLevels = {
    dispatchSuccess: structuralDispatchWorked,
    strategicSuccess: unrealizedCore.length === 0 || executionsFinal.some((e) => e.selectedCountAfter > e.selectedCountBefore),
    searchExecutionSuccess:
      executionsFinal.length > 0 && executionsFinal.some((e) => e.retrievedCanonicalIds.length > 0 || e.candidatesConsidered.length > 0),
    recoverySuccess:
      recoveryToNormal ||
      structuralComplete ||
      (executionsFinal.some((e) => e.selectedCountAfter > e.selectedCountBefore) ?? false),
    structuralSuccess: structuralComplete && (completeDeck || manaBaseRan),
    productSuccess: completeDeck && hpCompleted && Boolean(current.session.deckGrade),
    bracketSuccess: current.session.deckGrade?.bracketAlignmentStatus === "TARGET_ACHIEVED",
  };

  const report = {
    decision: "PROFESSOR_V4_16_6_2_NINTH_UNSEEN_COMMANDER_STRUCTURAL_DISPATCH_AND_STRATEGIC_PROGRESS_LIVE_V1_AUTHORIZED",
    primaryQuestion:
      "When Professor reaches a strategic or structural deficit, does the next-action dispatcher execute targeted research, select useful cards, update theory realization, and continue construction?",
    secondaryQuestion: "Can that process reach structural completion → mana → legal 99 → Head Professor?",
    randomSeed: RANDOM_SEED,
    eligibleCommanderCount,
    commanderOracleId: commander.oracleId,
    commanderName: commander.name,
    commanderSlug: commander.slug,
    sessionId: sid,
    advanceTreeCount,
    firstAdvanceProof: firstAdvancePass
      ? {
          advanceTreeCount,
          firstPass: buildPassLog[0] ?? null,
          cardsAfterFirstAdvance: (buildPassLog[0] as { selectedCardCountAfter?: number })?.selectedCardCountAfter ?? null,
        }
      : { advanceTreeCount, diagnosis: "Zero ADVANCE_TREE — controlling gate blocked before tree execution" },
    authoritativeGateAtCreativeComplete,
    authoritativeGateAfterFirstAdvance:
      buildPassLog.length > 0
        ? (buildPassLog[0] as { buildControl?: ProfessorBuildControlV41661 })?.buildControl ?? null
        : null,
    userSetup,
    lockedCharter: charter,
    charterProvenance,
    charterSupport,
    checkpoints,
    strategicCheckpoints,
    nextActionDispatchLog,
    dispatchInvariantViolations: dispatchViolations,
    closureLoopDetected: closureSpin,
    viperShapeDetected: viperShape,
    phaseTransitionLog,
    recoveryEpisodes,
    normalAssemblyExecutions,
    recomputeSafety,
    structuralExecutions,
    buildPassLog,
    noOpEvents,
    finalFourSlotLog,
    manaGateLog,
    preHeadProfessor: preHp,
    headProfessorRan: hpRan,
    headProfessorCompleted: hpCompleted,
    headProfessorComparison: hpCompleted
      ? {
          builderRealizedBracket: preHp.realizedEffectiveBracket,
          solEffectiveBracket: review?.predictedEffectiveBracket ?? null,
          swapsRecommended: review?.swaps?.length ?? 0,
          swapsExecuted: swaps.length,
          pctNonlandsChanged: pctChanged,
          constructionVsRescue: classifyConstructionVsRescue(pctChanged),
        }
      : { note: "NOT_APPLICABLE_BUILD_STALLED" },
    deckStateFinal: {
      libraryCount: finalCs?.selectedCards.length,
      buildPhase: finalCs?.buildPhase,
      telemetryBuildPhase: telFinal?.buildPhase,
      legality: finalLegality,
      grade: current.session.deckGrade,
      finalDeckDoctor: current.session.finalDeckDoctor,
      termination: telFinal?.termination,
      exhaustionAudit: telFinal?.exhaustionAudit,
    },
    acceptanceMatrix,
    acceptanceSemantics: semantics,
    successLevels,
    productionMode: {
      boundedLive: !process.env.PROFESSOR_BREW_LIVE_FULL_FINALIZATION,
      budget: resolveLiveProfessorBrewBudgetV416(true),
    },
    spentAfterRun: commander.name,
  };

  writeFileSync(resolve(OUT_DIR, "prospective-report-v1.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(OUT_DIR, "prospective-summary-v1.md"),
    `# PROFESSOR v4.16.6.2 Ninth Unseen Prospective — Structural Dispatch & Strategic Progress

- **Commander:** ${commander.name} (\`${commander.oracleId}\`)
- **Seed:** ${RANDOM_SEED} / ${eligibleCommanderCount} eligible
- **Session:** ${sid}
- **ADVANCE_TREE count:** ${advanceTreeCount}
- **First advance:** ${firstAdvancePass ? "YES" : "NO"}
- **Dispatch violations:** ${dispatchViolations.length}
- **Closure loop (Viper regression):** ${closureSpin}
- **Viper shape (61/64 UNREALIZED CORE, 0 exec):** ${viperShape}
- **Library at pre-HP:** ${preHp.libraryCount} (${preHp.nonlandCount} nonlands / ${preHp.landCount} lands)
- **Structural:** complete=${structuralComplete} remainingNL=${preHp.structural.remainingNonlandSlots}
- **Telemetry phase:** ${telFinal?.buildPhase ?? "?"}
- **Executions:** ${executionsFinal.length}
- **Recovery episodes:** ${recoveryEpisodes.length}
- **Raw → Realized:** B${preHp.rawPowerCeiling ?? "?"} → B${preHp.realizedEffectiveBracket ?? "?"}
- **HP ran:** ${hpRan} completed: ${hpCompleted}

## Success Levels
- Dispatch: ${successLevels.dispatchSuccess}
- Strategic: ${successLevels.strategicSuccess}
- Search execution: ${successLevels.searchExecutionSuccess}
- Recovery: ${successLevels.recoverySuccess}
- Structural: ${successLevels.structuralSuccess}
- Product: ${successLevels.productSuccess}
- Bracket: ${successLevels.bracketSuccess}

## Acceptance Matrix
${Object.entries(acceptanceMatrix)
  .map(([k, v]) => `- ${k}: **${v}**`)
  .join("\n")}

See prospective-report-v1.json for authoritative gate proof, recovery episodes, and build pass log.
`,
  );

  log(`Report written to ${OUT_DIR}`);
  console.log(
    JSON.stringify(
      { acceptanceMatrix, commander: commander.name, sessionId: sid, advanceTreeCount, successLevels },
      null,
      2,
    ),
  );
}

void runProspective().catch((err) => {
  console.error(err);
  process.exit(1);
});
