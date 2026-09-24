/**
 * PROFESSOR v4.16.2 — Third unseen Commander prospective live test.
 * Decision: PROFESSOR_V4_16_2_THIRD_UNSEEN_COMMANDER_BRACKET_TRUTH_LIVE_V1_AUTHORIZED
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
import { listGameChangersInDeckV4162 } from "../src/lib/deck-synthesis/professor-game-changer-registry-v4-16-2-v1";
import { rankB4OpportunityCostCandidatesV4162 } from "../src/lib/deck-synthesis/professor-b4-opportunity-cost-v4-16-2-v1";
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
  resolve(process.cwd(), "data/milestones/deck-synthesis/v4-16-2-third-unseen-prospective"),
);
const RANDOM_SEED = Number(process.env.PROFESSOR_V4_16_2_SEED ?? "416203001");
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

function qualityFromState(cs: ProfessorCouncilStateV47) {
  const q = cs.bracketReadinessQualityV4162;
  const dims: Record<string, { pass: boolean; detail: string }> = {};
  for (const d of q?.dimensions ?? []) {
    dims[d.dimension] = { pass: d.pass, detail: d.detail };
  }
  const gcUtil = cs.bracketPowerUtilizationV4161?.entries.find((e) => e.dimension === "relevantGameChangerUtilization");
  return {
    dimensions: dims,
    qualityReady: q?.qualityReady ?? false,
    failingDimensions: q?.failingDimensions ?? [],
    relevantGCUtilization: gcUtil ?? null,
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
  const opp = rankB4OpportunityCostCandidatesV4162({
    selectedCards: cs.selectedCards,
    charter: charter ?? cs.deckCharter ?? null,
    requestedBracket: 4,
  });
  const gcRegistry = listGameChangersInDeckV4162({ selectedCards: cs.selectedCards });
  const gcState = cs.gameChangerReviewStateV4162;
  const gcTruth =
    JSON.stringify([...gcRegistry].sort()) ===
    JSON.stringify([...(gcState?.gameChangersInCurrentDeck ?? gcRegistry)].sort());

  return {
    target,
    libraryCount: cs.selectedCards.length,
    predictedEffectiveBracket:
      gap?.predictedBracket ?? gap?.currentlyEstimatedBracket ?? cs.bracketReadinessV416?.currentPredictedBracket ?? null,
    quality: qualityFromState(cs),
    readiness: cs.bracketReadinessV416,
    canEnterFinalization: cs.bracketReadinessV416?.canEnterFinalization ?? null,
    holdCourse: {
      proposedAction: holdValidation.allowed ? "HOLD_COURSE" : holdValidation.action,
      validatedAction: holdValidation.action,
      message: holdValidation.message,
    },
    winReadiness: cs.b4WinReadinessV4161,
    preFinalCritic: cs.preFinalQualityCriticV4162,
    gameChangerReview: {
      registryInDeck: gcRegistry,
      stateInDeck: gcState?.gameChangersInCurrentDeck ?? gcRegistry,
      considered: gcState?.relevantGameChangersConsidered ?? cs.bracketPowerSearchHistoryV416?.candidatesAlreadyConsidered ?? [],
      rejected: gcState?.relevantGameChangersRejected ?? [],
      reviewComplete: gcState?.gameChangerReviewComplete ?? cs.bracketPowerSearchHistoryV416?.gameChangerReviewComplete ?? false,
      registryTruthPass: gcTruth,
    },
    opportunityCostBottomFive: opp.bottomSlots,
    b4PowerUtilizationGap: opp.b4PowerUtilizationGap,
    portfolio: cs.bracketPowerPortfolioV416,
    cardNames: cs.selectedCards.map((c) => c.name),
  };
}

function comprehensivePreHp(session: BrewSessionViewV42["session"], commanderName: string) {
  const cs = session.councilState as ProfessorCouncilStateV47;
  const nonlands = cs.selectedCards.filter((c) => c.category !== "land");
  const lands = cs.selectedCards.filter((c) => c.category === "land");
  const tutors = nonlands.filter((c) =>
    /tutor|worldly|enlightened|survival|finale of devastation|recruiter|idyllic/i.test(c.name),
  );
  const opp = rankB4OpportunityCostCandidatesV4162({
    selectedCards: cs.selectedCards,
    charter: cs.deckCharter ?? null,
    requestedBracket: 4,
  });
  const gc = listGameChangersInDeckV4162({ selectedCards: cs.selectedCards });
  const avgMv =
    nonlands.reduce((s, c) => s + (c.manaValue ?? 3), 0) / Math.max(1, nonlands.length);
  return {
    libraryCount: cs.selectedCards.length,
    legality: cs.canonicalLegalityV4161,
    landCount: lands.length,
    manaPlan: cs.manaPlanV416,
    averageMv: Math.round(avgMv * 100) / 100,
    access: tutors.map((c) => c.name),
    acceleration: nonlands.filter((c) => c.roles.includes("ramp")).map((c) => c.name),
    interactionTagged: nonlands.filter((c) => c.roles.includes("interaction")).map((c) => c.name),
    protection: nonlands.filter((c) => c.roles.includes("protection")).map((c) => c.name),
    cardVelocity: nonlands.filter((c) => c.roles.includes("card-advantage")).map((c) => c.name),
    gameChangers: gc,
    primaryWinLine: {
      pattern: cs.b4WinReadinessV4161?.primaryWinPattern,
      concreteLineReady: cs.b4WinReadinessV4161?.concreteLineReady,
      concreteLineCards: cs.b4WinReadinessV4161?.concreteLineCards,
      threatWindow: cs.b4WinReadinessV4161?.threatWindow,
      summary: cs.b4WinReadinessV4161?.summary,
    },
    secondaryWinLine: cs.deckCharter?.intendedWinPaths?.[1] ?? null,
    bottomFiveOpportunityCost: opp.bottomSlots,
    charterCoherence: cs.preFinalQualityCriticV4162?.disconnectedPackages === false,
    preFinalCritic: cs.preFinalQualityCriticV4162,
    predictedEffectiveBracket: cs.bracketReadinessV416?.currentPredictedBracket,
    readiness: cs.bracketReadinessV416,
    utilization: cs.bracketPowerUtilizationV4161,
    quality: cs.bracketReadinessQualityV4162,
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

  const b4Exploitation = {
    commander: commander.name,
    primaryStrategy: charter.primaryStrategy,
    secondaryStrategy: charter.secondaryStrategy,
    contract: cs0.bracketConstructionContractV416,
    portfolio: cs0.bracketPowerPortfolioV416,
    manaPlan: cs0.manaPlanV416,
    winArchitecture: {
      primary: cs0.b4WinReadinessV4161?.primaryWinPattern ?? charter.intendedWinPaths?.[0],
      secondary: charter.intendedWinPaths?.[1],
      locked: cs0.winArchitectureLockedV416,
    },
    narrative: `B4 for ${commander.name}: maximize ${charter.primaryStrategy.toLowerCase()} via ${charter.secondaryStrategy.toLowerCase()} with reserved mana (${cs0.manaPlanV416?.reservedLandSlots} lands), premium access/acceleration, and charter-aligned win closure — not generic tutor soup.`,
  };

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
        log(`Checkpoint ~${t}: predicted B${checkpoints[t].predictedEffectiveBracket ?? "?"} qualityReady=${checkpoints[t].quality.qualityReady} canFinalize=${checkpoints[t].canEnterFinalization}`);
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
    const beforeReady = current.session.councilState?.bracketReadinessV416;
    log(`RUN_BRACKET_RESEARCH pass ${rp + 1} (canEnterFinalization=${beforeReady?.canEnterFinalization})`);
    current = await post({ sessionId: sid, action: { type: "RUN_BRACKET_RESEARCH" } });
    bracketResearchLog.push({
      pass: rp + 1,
      before: beforeReady,
      after: current.session.councilState?.bracketReadinessV416,
      mutations: current.session.councilState?.mutationRecordsV4161?.length ?? 0,
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
  let hpAttemptBlocked = false;
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
  } else if (!professorBrewCanEnterFinalizationV416(current.session)) {
    hpAttemptBlocked = true;
    log("FINAL_REVIEW blocked — canEnterFinalization=false (expected v4.16.2 behavior)");
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

  const builderPredicted = preHp.predictedEffectiveBracket;
  const solEffective =
    review?.predictedEffectiveBracket ??
    current.session.deckGrade?.bracketAlignment?.effectiveBracket ??
    null;

  const budget = resolveLiveProfessorBrewBudgetV416(true);
  const gcFinal = listGameChangersInDeckV4162({ selectedCards: finalCs?.selectedCards ?? [] });
  const gcPortfolioCount = finalCs?.bracketPowerPortfolioV416?.entries.find((e) => e.dimension === "GAME_CHANGERS")?.detail;

  const acceptance = {
    generalization: !current.session.fixtureCase ? "PASS" : "FAIL",
    charterTruth: charterProvenance.pass ? "PASS" : "FAIL",
    gcTruth:
      gcFinal.length > 0 &&
      (finalCs?.bracketPowerPortfolioV416?.criticalDeficits.includes("GAME_CHANGERS") ?? false)
        ? "FAIL"
        : checkpoints[85]?.gameChangerReview.registryTruthPass !== false
          ? "PASS"
          : "PARTIAL",
    bracketReadiness:
      finalizationGateViolations.length === 0 && (preHp.readiness?.canEnterFinalization || preHp.readiness?.carryForwardFlag)
        ? "PASS"
        : hpAttemptBlocked && !professorBrewNeedsFinalReviewV48({ ...current.session, councilState: finalCs } as never)
          ? "PASS"
          : "FAIL",
    qualityReadiness: preHp.quality?.qualityReady ? "PASS" : preHp.readiness?.carryForwardFlag ? "PARTIAL" : "FAIL/PARTIAL",
    winArchitecture: preHp.primaryWinLine.concreteLineReady ? "PASS" : "FAIL/PARTIAL",
    powerUtilization: preHp.bottomFiveOpportunityCost.filter((s) => s.score <= 25).length <= 1 ? "PASS" : "FAIL/PARTIAL",
    headProfessorAgreement:
      builderPredicted === 4 && (solEffective ?? 0) <= 2 && review?.requiresMajorRevision
        ? "FAIL"
        : Math.abs((builderPredicted ?? 0) - (solEffective ?? builderPredicted ?? 0)) <= 1
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
    decision: "PROFESSOR_V4_16_2_THIRD_UNSEEN_COMMANDER_BRACKET_TRUTH_LIVE_V1_AUTHORIZED",
    randomSeed: RANDOM_SEED,
    eligibleCommanderCount,
    commanderOracleId: commander.oracleId,
    commanderName: commander.name,
    commanderSlug: commander.slug,
    sessionId: sid,
    userSetup,
    lockedCharter: charter,
    charterProvenance,
    b4Exploitation,
    checkpoints,
    bracketResearchLog,
    readinessAudits,
    finalizationGateViolations,
    preHeadProfessor: preHp,
    headProfessorComparison: {
      builderPredictedBracket: builderPredicted,
      solEffectiveBracket: solEffective,
      builderWeakImplementations: preHp.preFinalCritic?.obviousWeakImplementations ?? [],
      solWeakCards: (review as { weakCards?: string[] })?.weakCards ?? review?.structuralProblems ?? [],
      builderArchitecture: preHp.preFinalCritic?.summary,
      solArchitecture: review?.structuralProblems ?? [],
      requiresMajorRevision: review?.requiresMajorRevision,
      refinementPlanPhases: (review as { refinementPlan?: { phases?: string[] } })?.refinementPlan?.phases,
      swapsRecommended: review?.swaps?.length ?? 0,
      swapsExecuted: swaps.length,
    },
    productionMode: {
      boundedLive: !process.env.PROFESSOR_BREW_LIVE_FULL_FINALIZATION,
      budget,
      note: "Production bounded live path unless PROFESSOR_BREW_LIVE_FULL_FINALIZATION=true",
    },
    constructionVsRescue: {
      classification: constructionClass,
      preHpEffectiveBracket: builderPredicted,
      finalEffectiveBracket: solEffective,
      preHpNonlandCount: preHpNonlandNames.length,
      pctNonlandsChangedAfterHp: pctChanged,
      hpSwapsExecuted: swaps.length,
      hpSwapsRecommended: review?.swaps?.length ?? 0,
    },
    deckStateC_final: {
      cards: finalCs?.selectedCards.map((c) => c.name) ?? [],
      legality: finalLegality,
      grade: current.session.deckGrade,
      gameChangersInDeck: gcFinal,
      gameChangersPortfolioDetail: gcPortfolioCount,
      finalDeckDoctor: {
        status: current.session.finalDeckDoctor?.status,
        headProfessorError: current.session.finalDeckDoctor?.headProfessorError,
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
    preHeadProfessor: { readiness?: { readiness?: string; currentPredictedBracket?: number }; predictedEffectiveBracket?: number };
    deckStateC_final: { legality?: { finalDeckLegal?: boolean }; grade?: { overallLetter?: string } };
    constructionVsRescue: { classification?: string; preHpEffectiveBracket?: number; finalEffectiveBracket?: number; pctNonlandsChangedAfterHp?: number };
    headProfessorComparison: { builderPredictedBracket?: number; solEffectiveBracket?: number };
  };
  return `# PROFESSOR v4.16.2 Third Unseen Prospective

- **Commander:** ${r.commanderName} (\`${r.commanderOracleId}\`)
- **Seed:** ${r.randomSeed} / ${r.eligibleCommanderCount} eligible
- **Pre-HP:** readiness=${r.preHeadProfessor?.readiness?.readiness}, predicted B${r.preHeadProfessor?.predictedEffectiveBracket ?? r.preHeadProfessor?.readiness?.currentPredictedBracket}
- **Builder vs Sol:** B${r.headProfessorComparison?.builderPredictedBracket} → B${r.headProfessorComparison?.solEffectiveBracket}
- **Construction vs rescue:** ${r.constructionVsRescue?.classification} (${r.constructionVsRescue?.pctNonlandsChangedAfterHp}% nonlands changed)
- **Final legal:** ${r.deckStateC_final?.legality?.finalDeckLegal}
- **Grade:** ${r.deckStateC_final?.grade?.overallLetter ?? "N/A"}

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
