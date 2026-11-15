/**
 * PROFESSOR v4.16.3 — Fourth unseen Commander realized-power prospective live test.
 * Decision: PROFESSOR_V4_16_3_FOURTH_UNSEEN_COMMANDER_REALIZED_POWER_LIVE_V1_AUTHORIZED
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
} from "./lib/load-deck-resolution-catalog";
import { assessCanonicalDeckLegalityV4161 } from "../src/lib/deck-synthesis/professor-canonical-legality-v4-16-1-v1";
import { validateHoldCourseV4161 } from "../src/lib/deck-synthesis/professor-hold-course-validator-v4-16-1-v1";
import { auditCharterProvenanceV4162 } from "../src/lib/deck-synthesis/professor-charter-provenance-v4-16-2-v1";
import { auditCharterConceptSupportV4163 } from "../src/lib/deck-synthesis/professor-charter-concept-support-v4-16-3-v1";
import { listGameChangersInDeckV4162 } from "../src/lib/deck-synthesis/professor-game-changer-registry-v4-16-2-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "../src/lib/deck-synthesis/professor-deck-completion-v4-7-v1";
import {
  professorBrewCanEnterFinalizationV416,
  professorBrewNeedsBracketResearchV416,
  professorBrewNeedsDeckCompletionV416,
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsManaBaseV48,
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
import type { DeckCharterV45 } from "../src/lib/deck-synthesis/professor-council-state-v4-5-v1";

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
  resolve(process.cwd(), "data/milestones/deck-synthesis/v4-16-3-fourth-unseen-prospective"),
);
const RANDOM_SEED = Number(process.env.PROFESSOR_V4_16_3_SEED ?? "416304001");
const CHECKPOINT_TARGETS = [25, 40, 55, 70, 85] as const;

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

function accessState(cs: ProfessorCouncilStateV47) {
  const a = cs.accessArchitectureV4163;
  return {
    criticalAccessFailure: a?.criticalAccessFailure ?? null,
    engineAccess: a?.engineAccess ?? 0,
    winAccess: a?.winAccess ?? 0,
    protectionAccess: a?.protectionAccess ?? 0,
    recoveryAccess: a?.recoveryAccess ?? 0,
    routes: a?.routes ?? [],
    summary: a?.summary ?? null,
  };
}

function dimensionSnapshot(cs: ProfessorCouncilStateV47) {
  const q = cs.bracketReadinessQualityV4162;
  const dims: Record<string, boolean> = {};
  for (const d of q?.dimensions ?? []) dims[d.dimension] = d.pass;
  return {
    accessQuality: dims.accessQuality ?? false,
    winArchitectureQuality: dims.winArchitectureQuality ?? false,
    interactionQuality: dims.interactionQuality ?? false,
    manaQuality: dims.manaQuality ?? false,
    concreteLineReady: cs.b4WinReadinessV4161?.concreteLineReady ?? false,
    structuralStatus: cs.deckSlotBudgetV4163?.status ?? null,
  };
}

function captureCheckpoint(cs: ProfessorCouncilStateV47, target: number, charter: DeckCharterV45 | null | undefined) {
  const gap = cs.snapshots?.[cs.snapshots.length - 1]?.bracketGapAnalysis;
  const holdValidation = validateHoldCourseV4161({
    portfolio: cs.bracketPowerPortfolioV416 ?? null,
    gap: gap ?? null,
    legality: cs.canonicalLegalityV4161 ?? null,
    utilization: cs.bracketPowerUtilizationV4161 ?? null,
    winReadiness: cs.b4WinReadinessV4161 ?? null,
    highDeficitCheckpointStreak: cs.highDeficitCheckpointStreakV416,
    primaryStrategy: cs.deckCharter?.primaryStrategy,
  });
  const power = cs.bracketPowerAssessmentV4163;
  const slotBudget = cs.deckSlotBudgetV4163;
  const opp = cs.opportunityCostV4163;
  const gcRegistry = listGameChangersInDeckV4162({ selectedCards: cs.selectedCards });
  const gcState = cs.gameChangerReviewStateV4162;
  const q = cs.bracketReadinessQualityV4162;
  const utilityLandsDuringStructural = cs.selectedCards
    .filter((c) => c.category === "land" && c.packages?.includes("Mana Base") === false)
    .map((c) => c.name);

  return {
    target,
    libraryCount: cs.selectedCards.length,
    rawPowerCeiling: power?.rawPowerCeiling ?? null,
    realizedEffectiveBracket: power?.realizedEffectiveBracket ?? cs.bracketReadinessV416?.currentPredictedBracket ?? null,
    predictedEffectiveBracket: cs.bracketReadinessV416?.currentPredictedBracket ?? power?.realizedEffectiveBracket ?? null,
    rawPowerSignals: power?.rawPowerSignals ?? [],
    realizedPowerEvidence: power?.realizedPowerEvidence ?? [],
    unrealizedPowerReasons: power?.unrealizedPowerReasons ?? [],
    slotBudget,
    utilityLandsDuringStructural: utilityLandsDuringStructural,
    accessArchitecture: {
      criticalEnginePieces: cs.accessArchitectureV4163?.criticalEnginePieces ?? [],
      primaryWinPieces: cs.accessArchitectureV4163?.primaryWinPieces ?? [],
      protectionPieces: cs.accessArchitectureV4163?.protectionPieces ?? [],
      routes: cs.accessArchitectureV4163?.routes ?? [],
      ...accessState(cs),
    },
    quality: {
      dimensions: Object.fromEntries((q?.dimensions ?? []).map((d) => [d.dimension, { pass: d.pass, detail: d.detail }])),
      qualityReady: q?.qualityReady ?? false,
      failingDimensions: q?.failingDimensions ?? [],
    },
    opportunityCostPressure: opp?.bottomSlots ?? [],
    readiness: cs.bracketReadinessV416,
    canEnterFinalization: cs.bracketReadinessV416?.canEnterFinalization ?? null,
    holdCourse: {
      proposedAction: holdValidation.allowed ? "HOLD_COURSE" : holdValidation.action,
      validatedAction: holdValidation.action,
      message: holdValidation.message,
    },
    winReadiness: cs.b4WinReadinessV4161,
    preFinalCritic: cs.preFinalQualityCriticV4163,
    gameChangerReview: {
      registryInDeck: gcRegistry,
      stateInDeck: gcState?.gameChangersInCurrentDeck ?? gcRegistry,
      reviewComplete: gcState?.gameChangerReviewComplete ?? false,
    },
    portfolio: cs.bracketPowerPortfolioV416,
    buildPhase: cs.buildPhase,
  };
}

function comprehensivePreHp(session: BrewSessionViewV42["session"], commanderName: string) {
  const cs = session.councilState as ProfessorCouncilStateV47;
  const nonlands = cs.selectedCards.filter((c) => c.category !== "land");
  const lands = cs.selectedCards.filter((c) => c.category === "land");
  const power = cs.bracketPowerAssessmentV4163;
  const avgMv = nonlands.reduce((s, c) => s + (c.manaValue ?? 3), 0) / Math.max(1, nonlands.length);
  return {
    libraryCount: cs.selectedCards.length,
    legality: cs.canonicalLegalityV4161,
    landCount: lands.length,
    nonlandCount: nonlands.length,
    manaPlan: cs.manaPlanV416,
    slotBudget: cs.deckSlotBudgetV4163,
    rawPowerCeiling: power?.rawPowerCeiling,
    realizedEffectiveBracket: power?.realizedEffectiveBracket,
    rawPowerSignals: power?.rawPowerSignals ?? [],
    realizedPowerEvidence: power?.realizedPowerEvidence ?? [],
    unrealizedPowerReasons: power?.unrealizedPowerReasons ?? [],
    averageMv: Math.round(avgMv * 100) / 100,
    accessArchitecture: cs.accessArchitectureV4163,
    primaryWinLine: {
      pattern: cs.b4WinReadinessV4161?.primaryWinPattern,
      concreteLineReady: cs.b4WinReadinessV4161?.concreteLineReady,
      concreteLineCards: cs.b4WinReadinessV4161?.concreteLineCards,
      threatWindow: cs.b4WinReadinessV4161?.threatWindow,
      summary: cs.b4WinReadinessV4161?.summary,
    },
    opportunityCostGaps: cs.opportunityCostV4163?.bottomSlots ?? [],
    preFinalCritic: cs.preFinalQualityCriticV4163,
    predictedEffectiveBracket: cs.bracketReadinessV416?.currentPredictedBracket,
    readiness: cs.bracketReadinessV416,
    utilization: cs.bracketPowerUtilizationV4161,
    quality: cs.bracketReadinessQualityV4162,
    gameChangers: listGameChangersInDeckV4162({ selectedCards: cs.selectedCards }),
    cards: cs.selectedCards.map((c) => ({ name: c.name, category: c.category, roles: c.roles })),
    commanderName,
  };
}

function pctNonlandsChanged(before: string[], after: string[]): number {
  const b = before.filter((n) => !after.includes(n));
  return Math.round((b.length / Math.max(1, before.length)) * 100);
}

function classifyConstructionVsRescue(pctChanged: number, hpSwaps: number): "CONSTRUCTION_DOMINANT" | "BALANCED" | "RESCUE_DOMINANT" {
  if (hpSwaps >= 12 || pctChanged >= 25) return "RESCUE_DOMINANT";
  if (hpSwaps <= 6 && pctChanged < 10) return "CONSTRUCTION_DOMINANT";
  return "BALANCED";
}

function researchPassSatisfied(before: ReturnType<typeof dimensionSnapshot>, after: ReturnType<typeof dimensionSnapshot>, target: string): boolean {
  if (target === "ACCESS") return after.accessQuality && !before.accessQuality;
  if (target === "WIN_ARCHITECTURE") return after.concreteLineReady && !before.concreteLineReady;
  if (target === "INTERACTION") return after.interactionQuality && !before.interactionQuality;
  if (target === "MANA_STRUCTURE") return after.manaQuality && !before.manaQuality;
  return false;
}

async function runProspective() {
  await waitForServer();

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
  const readinessAudits: unknown[] = [];
  const bracketResearchLog: unknown[] = [];
  const finalizationGateViolations: string[] = [];

  for (let pass = 0; pass < 120; pass++) {
    const session = current.session;
    const cs = session.councilState as ProfessorCouncilStateV47;
    const n = cs?.selectedCards.length ?? 0;

    for (const t of CHECKPOINT_TARGETS) {
      if (n >= t - 3 && !checkpoints[t]) {
        checkpoints[t] = captureCheckpoint(cs, t, charter);
        log(
          `Checkpoint ~${t}: raw B${checkpoints[t].rawPowerCeiling ?? "?"} realized B${checkpoints[t].realizedEffectiveBracket ?? "?"} structural=${checkpoints[t].slotBudget?.status ?? "?"} canFinalize=${checkpoints[t].canEnterFinalization}`,
        );
      }
    }

    if (!professorBrewShouldContinueAutoBuildV47(session) && n >= COMMANDER_DECK_LIBRARY_SIZE_V47) break;
    if (!session.workingDeckTheory) break;

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
    if (pass % 10 === 0) log(`pass ${pass + 1} — ${current.session.councilState?.selectedCards.length ?? 0} cards`);
    await sleep(1200);
  }

  if (professorBrewNeedsManaBaseV48(current.session) || professorBrewNeedsDeckCompletionV416(current.session)) {
    log("RUN_MANA_BASE");
    current = await post({ sessionId: sid, action: { type: "RUN_MANA_BASE" } });
  }

  for (let rp = 0; rp < 4 && professorBrewNeedsBracketResearchV416(current.session); rp++) {
    const csBefore = current.session.councilState as ProfessorCouncilStateV47;
    const beforeSnap = dimensionSnapshot(csBefore);
    const beforeAccess = accessState(csBefore);
    const beforeReady = csBefore.bracketReadinessV416;
    const lastMission = csBefore.bracketPowerSearchReportsV416?.[csBefore.bracketPowerSearchReportsV416.length - 1];
    log(`RUN_BRACKET_RESEARCH pass ${rp + 1} (canEnterFinalization=${beforeReady?.canEnterFinalization})`);
    current = await post({ sessionId: sid, action: { type: "RUN_BRACKET_RESEARCH" } });
    const csAfter = current.session.councilState as ProfessorCouncilStateV47;
    const afterSnap = dimensionSnapshot(csAfter);
    const afterAccess = accessState(csAfter);
    const targetDimension =
      !beforeSnap.accessQuality ? "ACCESS" : !beforeSnap.concreteLineReady ? "WIN_ARCHITECTURE" : !beforeSnap.interactionQuality ? "INTERACTION" : "MANA_STRUCTURE";
    const objectiveSatisfied = researchPassSatisfied(beforeSnap, afterSnap, targetDimension);
    bracketResearchLog.push({
      pass: rp + 1,
      targetDimension,
      beforeState: { readiness: beforeReady, dimensions: beforeSnap, access: beforeAccess },
      mission: lastMission?.mission ?? csAfter.bracketPowerSearchReportsV416?.slice(-1)[0]?.mission ?? null,
      candidatesConsidered: csAfter.bracketPowerSearchHistoryV416?.candidatesAlreadyConsidered?.slice(-20) ?? [],
      mutation: csAfter.mutationRecordsV4161?.slice(-1)[0] ?? null,
      afterState: { readiness: csAfter.bracketReadinessV416, dimensions: afterSnap, access: afterAccess },
      objectiveSatisfied,
      missionObjectiveNotSatisfied: !objectiveSatisfied,
    });
    await sleep(1500);
  }

  const preHp = comprehensivePreHp(current.session, commander.name);
  const preHpNonlandNames = preHp.cards.filter((c) => c.category !== "land").map((c) => c.name);

  readinessAudits.push({
    stage: "pre_head_professor",
    canEnterFinalization: preHp.readiness?.canEnterFinalization,
    readiness: preHp.readiness?.readiness,
    carryForwardFlag: preHp.readiness?.carryForwardFlag,
    needsFinalReviewAllowed: professorBrewNeedsFinalReviewV48(current.session),
    needsBracketResearch: professorBrewNeedsBracketResearchV416(current.session),
  });

  if (!professorBrewCanEnterFinalizationV416(current.session) && professorBrewNeedsFinalReviewV48(current.session)) {
    finalizationGateViolations.push("professorBrewNeedsFinalReview true while canEnterFinalization false");
  }

  const hpStart = Date.now();
  if (professorBrewNeedsFinalReviewV48(current.session)) {
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
    requireFullLibrary: true,
  });
  const review = current.session.finalDeckDoctor?.review;
  const swaps = current.session.finalDeckDoctor?.executedSwaps?.filter((s) => s.status === "ACCEPTED") ?? [];
  const finalNonlandNames = (finalCs?.selectedCards ?? []).filter((c) => c.category !== "land").map((c) => c.name);
  const pctChanged = pctNonlandsChanged(preHpNonlandNames, finalNonlandNames);
  const constructionClass = classifyConstructionVsRescue(pctChanged, swaps.length);

  const builderRealized = preHp.realizedEffectiveBracket ?? preHp.predictedEffectiveBracket;
  const builderRaw = preHp.rawPowerCeiling;
  const solEffective =
    review?.predictedEffectiveBracket ??
    current.session.deckGrade?.bracketAlignment?.effectiveBracket ??
    null;
  const budget = resolveLiveProfessorBrewBudgetV416(true);
  const finalPower = finalCs?.bracketPowerAssessmentV4163;

  const slotBudgetPass =
    preHp.slotBudget?.structurallyComplete !== false ||
    preHp.readiness?.readiness === "NEEDS_BUILD" ||
    preHp.buildPhase === "STRUCTURALLY_INCOMPLETE"
      ? preHp.landCount <= (preHp.manaPlan?.expectedLandCount ?? 35) + 2
      : false;

  const acceptance = {
    generalization: !current.session.fixtureCase ? "PASS" : "FAIL",
    charterSupport: charterSupport.pass ? "PASS" : "FAIL",
    structuralSlotBudget:
      preHp.slotBudget?.status !== "BUILD_STRUCTURALLY_INCOMPLETE" || preHp.landCount <= (preHp.manaPlan?.expectedLandCount ?? 35) + 2
        ? slotBudgetPass
          ? "PASS"
          : "FAIL"
        : preHp.landCount <= (preHp.manaPlan?.expectedLandCount ?? 35) + 2
          ? "PASS"
          : "FAIL",
    accessArchitecture:
      (preHp.accessArchitecture?.routes.length ?? 0) > 0 || (preHp.accessArchitecture?.engineAccess ?? 0) > 0 ? "PASS" : "FAIL/PARTIAL",
    opportunityCost:
      (preHp.opportunityCostGaps ?? []).every((s) => s.recommendation !== "REPLACE" || !/mana vault|chrome mox|mox diamond/i.test(s.currentCard))
        ? "PASS"
        : "FAIL/PARTIAL",
    winArchitecture: preHp.primaryWinLine.concreteLineReady ? "PASS" : "FAIL/PARTIAL",
    realizedPowerTruth:
      builderRaw !== undefined &&
      builderRealized !== undefined &&
      builderRaw > builderRealized + 1 &&
      preHp.unrealizedPowerReasons.length > 0
        ? "PASS"
        : builderRealized === builderRaw || Math.abs((builderRaw ?? 0) - (builderRealized ?? 0)) <= 1
          ? "PASS"
          : "PARTIAL",
    preFinalCritic:
      (preHp.preFinalCritic?.structuralFailures.length ?? 0) > 0 || preHp.preFinalCritic?.resemblesTargetBracket === false
        ? "PASS"
        : "FAIL/PARTIAL",
    bracketReadiness:
      finalizationGateViolations.length === 0 && (preHp.readiness?.canEnterFinalization || preHp.readiness?.carryForwardFlag)
        ? "PASS"
        : "FAIL/PARTIAL",
    headProfessorAgreement:
      (builderRaw ?? 0) >= 5 && (solEffective ?? 0) <= 3
        ? "FAIL"
        : Math.abs((builderRealized ?? 0) - (solEffective ?? builderRealized ?? 0)) <= 1
          ? "PASS"
          : "PARTIAL",
    refinement:
      review?.requiresMajorRevision && swaps.length === 0 && pctChanged < 3 ? "FAIL" : review?.requiresMajorRevision ? "PARTIAL" : "PASS",
    state: finalLegality.finalDeckLegal ? "PASS" : "FAIL",
    product:
      finalLegality.finalDeckLegal && current.session.deckGrade && current.session.finalDeckDoctor?.status === "COMPLETE"
        ? "PASS"
        : "FAIL",
    b4Target: current.session.deckGrade?.bracketAlignmentStatus === "TARGET_ACHIEVED" ? "ACHIEVED" : "MISSED",
    constructionVsRescueClass: constructionClass,
  };

  const report = {
    decision: "PROFESSOR_V4_16_3_FOURTH_UNSEEN_COMMANDER_REALIZED_POWER_LIVE_V1_AUTHORIZED",
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
    bracketResearchLog,
    readinessAudits,
    finalizationGateViolations,
    preHeadProfessor: preHp,
    headProfessorComparison: {
      builderRawPowerCeiling: builderRaw,
      builderRealizedBracket: builderRealized,
      solEffectiveBracket: solEffective,
      builderStructuralFailures: preHp.preFinalCritic?.structuralFailures ?? [],
      solStructuralProblems: review?.structuralProblems ?? [],
      builderWeakCards: preHp.preFinalCritic?.obviousWeakImplementations ?? [],
      solWeakCards: (review as { weakCards?: string[] })?.weakCards ?? review?.structuralProblems ?? [],
      builderWinArchitecture: preHp.primaryWinLine,
      solWinAssessment: review?.structuralProblems?.filter((p) => /win|finisher|closure/i.test(p)) ?? [],
      requiresMajorRevision: review?.requiresMajorRevision,
      swapsRecommended: review?.swaps?.length ?? 0,
      swapsExecuted: swaps.length,
    },
    productionMode: {
      boundedLive: !process.env.PROFESSOR_BREW_LIVE_FULL_FINALIZATION,
      budget,
      note: "Production bounded live — v4.16.3 did not expand finalization",
    },
    constructionVsRescue: {
      classification: constructionClass,
      preHpRawPowerCeiling: builderRaw,
      preHpRealizedBracket: builderRealized,
      finalEffectiveBracket: solEffective,
      finalRawPowerCeiling: finalPower?.rawPowerCeiling,
      preHpNonlandCount: preHpNonlandNames.length,
      pctNonlandsChangedAfterHp: pctChanged,
      hpSwapsExecuted: swaps.length,
      hpSwapsRecommended: review?.swaps?.length ?? 0,
    },
    deckStateC_final: {
      cards: finalCs?.selectedCards.map((c) => c.name) ?? [],
      legality: finalLegality,
      grade: current.session.deckGrade,
      rawPowerCeiling: finalPower?.rawPowerCeiling,
      effectiveBracket: current.session.deckGrade?.bracketAlignment?.effectiveBracket,
      finalDeckDoctor: {
        status: current.session.finalDeckDoctor?.status,
        executedSwaps: swaps,
      },
      bracketAlignment: current.session.deckGrade?.bracketAlignment,
      bracketAlignmentStatus: current.session.deckGrade?.bracketAlignmentStatus,
      fingerprints: {
        grade: current.session.deckGrade?.deckFingerprint,
        doctor: current.session.finalDeckDoctor?.finalDeckFingerprint,
      },
    },
    acceptance,
    spentAfterRun: commander.name,
  };

  writeFileSync(resolve(OUT_DIR, "prospective-report-v1.json"), JSON.stringify(report, null, 2));
  writeFileSync(resolve(OUT_DIR, "prospective-summary-v1.md"), buildMarkdown(report));
  log(`Report written to ${OUT_DIR}`);
  console.log(JSON.stringify({ acceptance, commander: commander.name, sessionId: sid }, null, 2));
}

function buildMarkdown(report: Record<string, unknown>): string {
  const r = report as {
    commanderName: string;
    commanderOracleId: string;
    randomSeed: number;
    eligibleCommanderCount: number;
    acceptance: Record<string, string>;
    preHeadProfessor: {
      rawPowerCeiling?: number;
      realizedEffectiveBracket?: number;
      slotBudget?: { status?: string };
    };
    constructionVsRescue: { classification?: string; pctNonlandsChangedAfterHp?: number };
    headProfessorComparison: { builderRealizedBracket?: number; solEffectiveBracket?: number; builderRawPowerCeiling?: number };
  };
  return `# PROFESSOR v4.16.3 Fourth Unseen Prospective

- **Commander:** ${r.commanderName} (\`${r.commanderOracleId}\`)
- **Seed:** ${r.randomSeed} / ${r.eligibleCommanderCount} eligible
- **Pre-HP:** raw B${r.preHeadProfessor?.rawPowerCeiling ?? "?"} → realized B${r.preHeadProfessor?.realizedEffectiveBracket ?? "?"}
- **Builder vs Sol:** realized B${r.headProfessorComparison?.builderRealizedBracket} → Sol B${r.headProfessorComparison?.solEffectiveBracket}
- **Structural:** ${r.preHeadProfessor?.slotBudget?.status ?? "?"}
- **Construction vs rescue:** ${r.constructionVsRescue?.classification} (${r.constructionVsRescue?.pctNonlandsChangedAfterHp}% nonlands changed)

## Acceptance
${Object.entries(r.acceptance)
  .map(([k, v]) => `- ${k}: **${v}**`)
  .join("\n")}

See \`prospective-report-v1.json\` for full data.
`;
}

void runProspective().catch((err) => {
  console.error(err);
  process.exit(1);
});
