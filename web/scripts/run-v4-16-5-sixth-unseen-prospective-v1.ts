/**
 * PROFESSOR v4.16.5 — Sixth unseen Commander structural-recovery prospective.
 * Decision: PROFESSOR_V4_16_5_SIXTH_UNSEEN_COMMANDER_STRUCTURAL_RECOVERY_LIVE_V1_AUTHORIZED
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
  professorBrewCanEnterFinalizationV416,
  professorBrewNeedsBracketResearchV416,
  professorBrewNeedsDeckCompletionV416,
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsManaBaseV48,
  professorBrewNeedsStructuralResearchV4165,
  professorBrewShouldContinueAutoBuildV47,
} from "../src/lib/deck-synthesis/professor-brew-progress-v4-7-v1";
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
import type {
  StructuralSearchMissionV4165,
  SearchDomainDiffV4165,
} from "../src/lib/deck-synthesis/professor-structural-search-planner-v4-16-5-v1";
import type { StructuralBuildTelemetryV4165 } from "../src/lib/deck-synthesis/professor-structural-build-telemetry-v4-16-5-v1";

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
  resolve(process.cwd(), "data/milestones/deck-synthesis/v4-16-5-sixth-unseen-prospective"),
);
const RANDOM_SEED = Number(process.env.PROFESSOR_V4_16_5_SEED ?? "416506001");
const CHECKPOINT_TARGETS = [25, 40, 55, 64, 70, 85] as const;

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
  ].map((n) => normalizeOracleName(n)),
);

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

function missionReport(m: StructuralSearchMissionV4165) {
  return {
    missionId: m.missionId,
    slotCount: m.slotCount,
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
  };
}

function escalationEvidence(missions: StructuralSearchMissionV4165[]) {
  const chains: {
    missionId: string;
    steps: SearchDomainDiffV4165[];
    genuineDomainChanges: number;
  }[] = [];
  for (const m of missions) {
    const genuine = m.domainDiffs.filter((d) => d.previousDomain !== d.nextDomain || d.previousQuery !== d.nextQuery);
    chains.push({
      missionId: m.missionId,
      steps: m.domainDiffs,
      genuineDomainChanges: genuine.length,
    });
  }
  return chains;
}

function structuralReportV4165(cs: ProfessorCouncilStateV47) {
  const sb = cs.deckSlotBudgetV4163;
  const tel = cs.structuralBuildTelemetryV4165;
  const missions = tel?.missions ?? cs.structuralCompletionPlanV4165?.missions ?? [];
  return {
    expectedLands: sb?.expectedLands,
    selectedLands: sb?.selectedLands,
    remainingLandSlots: sb?.expectedLands != null && sb?.selectedLands != null ? sb.expectedLands - sb.selectedLands : null,
    expectedNonlands: sb?.expectedNonlands,
    selectedNonlands: sb?.selectedNonlands,
    remainingNonlandSlots: sb?.remainingNonlandSlots,
    structurallyComplete: sb?.structurallyComplete,
    status: sb?.status,
    structuralCompletionPlan: cs.structuralCompletionPlanV4165,
    missions: missions.map(missionReport),
    candidateSupplyAggregate: missions.map((m) => m.candidateSupply).filter(Boolean),
    buildTelemetry: tel,
    termination: tel?.termination,
    exhaustionAudit: cs.structuralExhaustionAuditV4164,
    escalationEvidence: escalationEvidence(missions),
    needsStructuralResearch: professorBrewNeedsStructuralResearchV4165({ fixtureCase: false, councilState: cs } as never),
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
    legality: legalitySnapshot(cs),
    structural: structuralReportV4165(cs),
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
    structural: structuralReportV4165(cs),
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

function analyzeEscalationGenuine(tel: StructuralBuildTelemetryV4165 | null | undefined): boolean {
  if (!tel?.missions?.length) return false;
  return tel.missions.some((m) =>
    m.domainDiffs.some((d) => d.previousDomain !== d.nextDomain && d.previousQuery !== d.nextQuery),
  );
}

function analyzeNoOpFailure(tel: StructuralBuildTelemetryV4165 | null | undefined, buildPassLog: unknown[]): boolean {
  const maxConsecutive = tel?.consecutiveIdenticalPasses ?? 0;
  if (maxConsecutive >= 3) return true;
  const identicalPassCount = (buildPassLog as { consecutiveIdenticalPasses?: number }[]).filter(
    (p) => (p.consecutiveIdenticalPasses ?? 0) >= 2,
  ).length;
  return identicalPassCount >= 5;
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

  const checkpoints: Record<number, ReturnType<typeof captureCheckpoint>> = {};
  const buildPassLog: unknown[] = [];
  const noOpEvents: unknown[] = [];
  const finalFourSlotLog: unknown[] = [];
  const manaGateLog: unknown[] = [];
  let prevCount = 0;
  let manaBaseAttemptedBeforeStructural = false;
  let terminationObserved = false;

  for (let pass = 0; pass < 90; pass++) {
    const session = current.session;
    const cs = session.councilState as ProfessorCouncilStateV47;
    const countBefore = prevCount;
    const n = cs?.selectedCards.length ?? 0;
    const tel = cs.structuralBuildTelemetryV4165;
    const remaining = cs.deckSlotBudgetV4163?.remainingNonlandSlots ?? 99;

    for (const t of CHECKPOINT_TARGETS) {
      if (n >= t - 3 && !checkpoints[t]) {
        checkpoints[t] = captureCheckpoint(catalog, cs, t);
        log(`Checkpoint ~${t}: ${n} cards remainingNL=${checkpoints[t].structural.remainingNonlandSlots} phase=${cs.buildPhase}`);
      }
    }

    if (remaining <= 6 && remaining > 0) {
      finalFourSlotLog.push({
        pass: pass + 1,
        remainingNonlandSlots: remaining,
        missions: (tel?.missions ?? []).map(missionReport),
        selectedNonlands: cs.deckSlotBudgetV4163?.selectedNonlands,
      });
    }

    if (cs.buildPhase === "BUILD_FAILED_CANDIDATE_EXHAUSTION" || tel?.termination?.shouldTerminate) {
      terminationObserved = true;
      log(`Termination at pass ${pass + 1}: ${tel?.termination?.reason ?? cs.buildPhase}`);
      break;
    }

    if (!professorBrewShouldContinueAutoBuildV47(session)) {
      if (n >= COMMANDER_DECK_LIBRARY_SIZE_V47) break;
      if (terminationObserved || tel?.termination?.shouldTerminate) break;
      log(`Auto-build stopped at pass ${pass + 1} — ${n} cards phase=${cs.buildPhase}`);
      break;
    }
    if (!session.workingDeckTheory) break;

    if (professorBrewNeedsManaBaseV48(session) && !cs.deckSlotBudgetV4163?.structurallyComplete) {
      manaBaseAttemptedBeforeStructural = true;
      manaGateLog.push({ pass: pass + 1, event: "ORCHESTRATOR_WOULD_RUN_MANA_BASE", structurallyComplete: false, libraryCount: n });
    }

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
    const csAfter = current.session.councilState as ProfessorCouncilStateV47;
    const countAfter = csAfter?.selectedCards.length ?? 0;
    const telAfter = csAfter.structuralBuildTelemetryV4165;

    if ((telAfter?.consecutiveIdenticalPasses ?? 0) >= 1 && countAfter === countBefore) {
      noOpEvents.push({
        pass: pass + 1,
        selectedCount: countAfter,
        missionIds: telAfter?.buildFingerprint?.activeMissionIds ?? [],
        tier: telAfter?.buildFingerprint?.activeSearchTier ?? 1,
        candidateSetHash: telAfter?.candidatePoolHash ?? telAfter?.buildFingerprint?.candidateSetHash,
        consecutiveIdenticalPasses: telAfter?.consecutiveIdenticalPasses ?? 0,
        terminationPending: telAfter?.termination?.shouldTerminate ?? false,
      });
    }

    buildPassLog.push({
      pass: pass + 1,
      selectedCardCountBefore: countBefore,
      selectedCardCountAfter: countAfter,
      buildPhase: csAfter.buildPhase,
      remainingNonlandSlots: csAfter.deckSlotBudgetV4163?.remainingNonlandSlots,
      currentTier: telAfter?.buildFingerprint?.activeSearchTier ?? 1,
      consecutiveIdenticalPasses: telAfter?.consecutiveIdenticalPasses ?? 0,
      candidateSetHash: telAfter?.candidatePoolHash,
      activeMissionIds: telAfter?.buildFingerprint?.activeMissionIds ?? [],
      normalBuildDisabled: telAfter?.normalBuildDisabled ?? false,
      structuralResearchDisabled: telAfter?.structuralResearchDisabled ?? false,
      termination: telAfter?.termination?.terminalState ?? null,
      missionSnapshot: (telAfter?.missions ?? []).map((m) => ({
        missionId: m.missionId,
        status: m.status,
        tier: m.currentTier,
        domain: m.searchDomains.at(-1),
        query: m.searchQueries.at(-1),
        candidateSupply: m.candidateSupply,
      })),
    });

    if (pass % 8 === 0 || countAfter !== countBefore) {
      log(
        `pass ${pass + 1} — ${countAfter} cards remNL=${csAfter.deckSlotBudgetV4163?.remainingNonlandSlots} unchanged=${telAfter?.consecutiveIdenticalPasses ?? 0} phase=${csAfter.buildPhase}`,
      );
    }
    prevCount = countAfter;
    await sleep(1200);
  }

  const preManaStructural = structuralReportV4165(current.session.councilState as ProfessorCouncilStateV47);
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
  const telFinal = finalCs.structuralBuildTelemetryV4165;

  const invalidAccessRoutes = (preHp.accessArchitecture.routes ?? []).filter(
    (r) =>
      /mystical tutor/i.test(r.source) &&
      r.destination === "HAND" &&
      !/instant|sorcery/i.test(r.searchRestriction ?? ""),
  );
  const offColorOpp = (preHp.opportunityCost ?? []).filter((o) => o.replacementLegal === false && o.proposedReplacement);
  const genuineEscalation = analyzeEscalationGenuine(telFinal);
  const noOpFailure = analyzeNoOpFailure(telFinal, buildPassLog);
  const exhaustionTerminal =
    finalCs.buildPhase === "BUILD_FAILED_CANDIDATE_EXHAUSTION" || telFinal?.termination?.terminalState === "BUILD_FAILED_CANDIDATE_EXHAUSTION";

  const unrealizedCore = preHp.theoryRealization.filter((r) => r.realizationStatus === "UNREALIZED" || r.realizationStatus === "PARTIAL");
  const accessReady = preHp.accessArchitecture.accessReadiness === "READY";

  const acceptanceMatrix: Record<string, AcceptanceVerdictV4165> = {
    GENERALIZATION: gate(!current.session.fixtureCase),
    CHARTER_SUPPORT: gate(charterSupport.pass),
    CANONICAL_CARD_TRUTH: gate(preHp.canonicalTruth.cardTruthUnresolved === 0, preHp.canonicalTruth.cardTruthUnresolved < 3),
    THEORY_REALIZATION: gate(unrealizedCore.length === 0 || exhaustionTerminal, unrealizedCore.length > 0 && structuralComplete),
    ACCESS_MECHANICS: gate(invalidAccessRoutes.length === 0),
    ACCESS_QUALITY: gate(accessReady, preHp.accessArchitecture.accessReadiness === "THEORY_UNREALIZED" ? false : true),
    WIN_MECHANICS: gate(preHp.winArchitecture.mechanicallyVerified === true, preHp.winArchitecture.concreteLineReady !== true),
    STRUCTURAL_SEARCH_PLANNER: gate((telFinal?.missions?.length ?? 0) > 0 || structuralComplete),
    GENUINE_SEARCH_ESCALATION: gate(genuineEscalation || structuralComplete || completeDeck),
    REJECTION_DRIVEN_REFORMULATION: gate(
      (telFinal?.missions ?? []).some((m) => m.rejectionReasons.length > 0 && m.domainDiffs.length > 0) || structuralComplete,
    ),
    STRUCTURAL_COMPLETION: gate(structuralComplete || completeDeck),
    CANDIDATE_SUPPLY: gate(
      (telFinal?.missions ?? []).some((m) => (m.candidateSupply?.viableCandidateCount ?? 0) > 0) || exhaustionTerminal || structuralComplete,
    ),
    NO_OP_TERMINATION: gate(!noOpFailure || exhaustionTerminal || structuralComplete),
    EXHAUSTION_TRUTH: gate(exhaustionTerminal || structuralComplete || completeDeck, !exhaustionTerminal && !structuralComplete && (telFinal?.consecutiveIdenticalPasses ?? 0) >= 2),
    MANA_GATING: gate(!manaBaseAttemptedBeforeStructural || structuralComplete),
    OPPORTUNITY_COST: gate(offColorOpp.length === 0),
    "PARTIAL/FINAL_LEGALITY": gate(
      preHp.libraryCount < 99
        ? preHp.legalitySnapshot.completeDeckLegal === false && preHp.legalitySnapshot.gradeEligible === false
        : finalLegality.completeDeckLegal === true,
    ),
    REALIZED_POWER: gate((preHp.rawPowerCeiling ?? 0) >= (preHp.realizedEffectiveBracket ?? 0)),
    BRACKET_READINESS: gate(Boolean(preHp.readiness?.canEnterFinalization || preHp.readiness?.carryForwardFlag || completeDeck), true),
    "PRE-FINAL_CRITIC": gate(Boolean(preHp.preFinalCritic) || !structuralComplete, true),
    HEAD_PROFESSOR: hpCompleted ? gate(Math.abs((preHp.realizedEffectiveBracket ?? 0) - (review?.predictedEffectiveBracket ?? 0)) <= 1, true) : "NOT_EVALUATED",
    REFINEMENT: hpCompleted ? gate(!(review?.requiresMajorRevision && swaps.length === 0), true) : "NOT_EVALUATED",
    STATE: gate(finalLegality.selectedCardsLegalSoFar !== false, true),
    PRODUCT: completeDeck && current.session.deckGrade && hpCompleted ? "PASS" : completeDeck ? "PARTIAL" : "FAIL",
    B4_TARGET: current.session.deckGrade?.bracketAlignmentStatus === "TARGET_ACHIEVED" ? "PASS" : "FAIL",
    "CONSTRUCTION VS RESCUE": hpCompleted
      ? gate(classifyConstructionVsRescue(pctChanged) === "CONSTRUCTION_DOMINANT", classifyConstructionVsRescue(pctChanged) === "BALANCED")
      : "NOT_EVALUATED",
  };

  const semantics = assessProspectiveAcceptanceSemanticsV4165({
    headProfessorExecuted: hpCompleted,
    refinementExecuted: hpCompleted && Boolean(review),
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
    foundationSuccess:
      !noOpFailure &&
      (genuineEscalation || exhaustionTerminal) &&
      (telFinal?.missions?.length ?? 0) > 0,
    structuralSuccess: structuralComplete && (completeDeck || manaBaseRan),
    productSuccess: completeDeck && hpCompleted && Boolean(current.session.deckGrade),
    bracketSuccess: current.session.deckGrade?.bracketAlignmentStatus === "TARGET_ACHIEVED",
  };

  const report = {
    decision: "PROFESSOR_V4_16_5_SIXTH_UNSEEN_COMMANDER_STRUCTURAL_RECOVERY_LIVE_V1_AUTHORIZED",
    primaryQuestion:
      "Can Professor recover from candidate-supply stalls and complete the structural machine without lowering the B4 quality floor?",
    randomSeed: RANDOM_SEED,
    eligibleCommanderCount,
    commanderOracleId: commander.oracleId,
    commanderName: commander.name,
    commanderSlug: commander.slug,
    sessionId: sid,
    userSetup,
    lockedCharter: charter,
    charterProvenance,
    charterSupport,
    checkpoints,
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
      legality: finalLegality,
      grade: current.session.deckGrade,
      finalDeckDoctor: current.session.finalDeckDoctor,
      termination: telFinal?.termination,
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
    `# PROFESSOR v4.16.5 Sixth Unseen Prospective — Structural Recovery

- **Commander:** ${commander.name} (\`${commander.oracleId}\`)
- **Seed:** ${RANDOM_SEED} / ${eligibleCommanderCount} eligible
- **Session:** ${sid}
- **Library at pre-HP:** ${preHp.libraryCount} (${preHp.nonlandCount} nonlands / ${preHp.landCount} lands)
- **Structural:** complete=${structuralComplete} remainingNL=${preHp.structural.remainingNonlandSlots}
- **Build phase:** ${finalCs?.buildPhase}
- **Raw → Realized:** B${preHp.rawPowerCeiling ?? "?"} → B${preHp.realizedEffectiveBracket ?? "?"}
- **HP ran:** ${hpRan} completed: ${hpCompleted}
- **Termination:** ${exhaustionTerminal ? telFinal?.termination?.reason : "none"}

## Success Levels
- Foundation: ${successLevels.foundationSuccess}
- Structural: ${successLevels.structuralSuccess}
- Product: ${successLevels.productSuccess}
- Bracket: ${successLevels.bracketSuccess}

## Acceptance Matrix
${Object.entries(acceptanceMatrix)
  .map(([k, v]) => `- ${k}: **${v}**`)
  .join("\n")}

See prospective-report-v1.json for missions, domain diffs, and build pass log.
`,
  );

  log(`Report written to ${OUT_DIR}`);
  console.log(JSON.stringify({ acceptanceMatrix, commander: commander.name, sessionId: sid, successLevels }, null, 2));
}

void runProspective().catch((err) => {
  console.error(err);
  process.exit(1);
});
