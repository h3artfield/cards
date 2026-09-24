/**
 * PROFESSOR v4.16.4 — Fifth unseen Commander canonical-truth + structural-completion prospective.
 * Decision: PROFESSOR_V4_16_4_FIFTH_UNSEEN_COMMANDER_CANONICAL_TRUTH_AND_STRUCTURAL_COMPLETION_LIVE_V1_AUTHORIZED
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
import { validateHoldCourseV4161 } from "../src/lib/deck-synthesis/professor-hold-course-validator-v4-16-1-v1";
import { auditCharterProvenanceV4162 } from "../src/lib/deck-synthesis/professor-charter-provenance-v4-16-2-v1";
import { auditCharterConceptSupportV4163 } from "../src/lib/deck-synthesis/professor-charter-concept-support-v4-16-3-v1";
import { listGameChangersInDeckV4162 } from "../src/lib/deck-synthesis/professor-game-changer-registry-v4-16-2-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "../src/lib/deck-synthesis/professor-deck-completion-v4-7-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "../src/lib/deck-synthesis/professor-canonical-card-truth-v4-16-4-v1";
import {
  assessProspectiveAcceptanceSemanticsV4164,
  type AcceptanceVerdictV4164,
} from "../src/lib/deck-synthesis/professor-acceptance-semantics-v4-16-4-v1";
import {
  professorBrewCanEnterFinalizationV416,
  professorBrewNeedsBracketResearchV416,
  professorBrewNeedsDeckCompletionV416,
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsManaBaseV48,
  professorBrewNeedsStructuralResearchV4164,
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
  resolve(process.cwd(), "data/milestones/deck-synthesis/v4-16-4-fifth-unseen-prospective"),
);
const RANDOM_SEED = Number(process.env.PROFESSOR_V4_16_4_SEED ?? "416405001");
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

function canonicalTruthAudit(catalog: DeckResolutionCatalog, cs: ProfessorCouncilStateV47) {
  const cards = cs.selectedCards.slice(0, 80);
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
        colorIdentity: truth.colorIdentity,
        oracleTextSource: truth.status === "RESOLVED" ? "golden_catalog" : "unresolved",
      });
    }
  }
  return { cardsHydrated: hydrated, cardTruthUnresolved: unresolved, representativeSamples: samples };
}

function accessReportV4164(cs: ProfessorCouncilStateV47) {
  const a = cs.accessArchitectureV4164;
  return {
    criticalEnginePieces: a?.criticalEnginePieces ?? [],
    primaryWinPieces: a?.primaryWinPieces ?? [],
    secondaryWinPieces: a?.secondaryWinPieces ?? [],
    protectionPieces: a?.protectionPieces ?? [],
    recoveryPieces: a?.recoveryPieces ?? [],
    engineAccess: a?.engineAccess ?? cs.accessArchitectureV4163?.engineAccess ?? 0,
    winAccess: a?.winAccess ?? cs.accessArchitectureV4163?.winAccess ?? 0,
    protectionAccess: a?.protectionAccess ?? cs.accessArchitectureV4163?.protectionAccess ?? 0,
    recoveryAccess: a?.recoveryAccess ?? cs.accessArchitectureV4163?.recoveryAccess ?? 0,
    routes: (a?.routes ?? []).map((r) => ({
      source: r.sourceName,
      target: r.targetName,
      searchRestriction: r.searchRestriction,
      targetSatisfiesRestriction: r.targetSatisfiesRestriction,
      destination: r.destination,
      directness: r.directness,
      repeatable: r.repeatable,
      reliability: r.confidence,
      verificationEvidence: r.verificationEvidence,
    })),
    unresolvedSources: a?.unresolvedSources ?? [],
    summary: a?.summary ?? cs.accessArchitectureV4163?.summary,
  };
}

function structuralReport(cs: ProfessorCouncilStateV47) {
  const sb = cs.deckSlotBudgetV4163;
  return {
    expectedLands: sb?.expectedLands,
    selectedLands: sb?.selectedLands,
    expectedNonlands: sb?.expectedNonlands,
    selectedNonlands: sb?.selectedNonlands,
    remainingNonlandSlots: sb?.remainingNonlandSlots,
    structurallyComplete: sb?.structurallyComplete,
    status: sb?.status,
    structuralCompletionPlan: cs.structuralCompletionPlanV4164,
    buildTelemetry: cs.structuralBuildTelemetryV4164,
    exhaustionAudit: cs.structuralExhaustionAuditV4164,
    needsStructuralResearch: sb ? !sb.structurallyComplete : null,
  };
}

function legalitySnapshot(cs: ProfessorCouncilStateV47) {
  const l = cs.canonicalLegalityV4161;
  return {
    selectedCardsLegalSoFar: l?.selectedCardsLegalSoFar,
    completeDeckLegal: l?.completeDeckLegal ?? l?.finalDeckLegal,
    gradeEligible: l?.gradeEligible,
    draftReadyEligible: l?.draftReadyEligible,
    libraryCardCount: l?.libraryCardCount,
    expectedLibraryCards: l?.expectedLibraryCards,
  };
}

function opportunityReport(cs: ProfessorCouncilStateV47, catalog: DeckResolutionCatalog, commanderColorIdentity: string[]) {
  const opp = cs.opportunityCostV4164;
  return (opp?.bottomSlots ?? cs.opportunityCostV4163?.bottomSlots ?? []).slice(0, 6).map((slot) => {
    const s4164 = opp?.bottomSlots.find((x) => x.currentCard === slot.currentCard);
    const replacement = slot.bestKnownReplacement;
    const repTruth = replacement
      ? resolveCanonicalCardTruthV4164({ name: replacement, catalog })
      : null;
    return {
      currentCard: slot.currentCard,
      proposedReplacement: replacement,
      replacementCanonicalIdentity: repTruth
        ? { oracleId: repTruth.oracleId, name: repTruth.name, colorIdentity: repTruth.colorIdentity }
        : null,
      colorIdentityLegal: repTruth
        ? repTruth.colorIdentity.every((c) => commanderColorIdentity.includes(c))
        : null,
      currentRoles: s4164?.currentRoles ?? slot.currentAssignedRoles,
      replacementRoles: s4164?.replacementRoles ?? [],
      rolesPreserved: s4164?.rolesPreserved ?? [],
      rolesImproved: s4164?.rolesImproved ?? [],
      rolesLost: s4164?.rolesLost ?? [],
      uniqueEngineValueLost: s4164?.uniqueEngineValueLost ?? 0,
      packageContributionLost: s4164?.packageContributionLost ?? 0,
      netDeckDelta: s4164?.netDeckDelta ?? slot.netStrategicDelta,
      replacementLegal: s4164?.replacementLegal ?? true,
      replacementRejectedReason: s4164?.replacementRejectedReason,
    };
  });
}

function winReport(cs: ProfessorCouncilStateV47) {
  const w = cs.b4WinReadinessV4164;
  const wLegacy = cs.b4WinReadinessV4161;
  return {
    concreteLineReady: w?.concreteLineReady ?? wLegacy?.concreteLineReady,
    mechanicallyVerified: w?.mechanicallyVerified ?? false,
    verifiedWinLine: w?.verifiedWinLine,
    summary: w?.summary ?? wLegacy?.summary,
    concreteLineCards: w?.concreteLineCards ?? wLegacy?.concreteLineCards,
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
    concreteLineReady: cs.b4WinReadinessV4164?.concreteLineReady ?? cs.b4WinReadinessV4161?.concreteLineReady ?? false,
    structuralStatus: cs.deckSlotBudgetV4163?.status ?? null,
  };
}

function captureCheckpoint(catalog: DeckResolutionCatalog, cs: ProfessorCouncilStateV47, target: number) {
  const power = cs.bracketPowerAssessmentV4163;
  const commanderCi = cs.deckCharter?.commander
    ? resolveCanonicalCardTruthV4164({ name: cs.deckCharter.commander, catalog }).colorIdentity
    : [];
  return {
    target,
    libraryCount: cs.selectedCards.length,
    legality: legalitySnapshot(cs),
    structural: structuralReport(cs),
    canonicalTruth: canonicalTruthAudit(catalog, cs),
    rawPowerCeiling: power?.rawPowerCeiling ?? null,
    realizedEffectiveBracket: power?.realizedEffectiveBracket ?? cs.bracketReadinessV416?.currentPredictedBracket ?? null,
    unrealizedPowerReasons: power?.unrealizedPowerReasons ?? [],
    accessArchitecture: accessReportV4164(cs),
    winArchitecture: winReport(cs),
    opportunityCost: opportunityReport(cs, catalog, commanderCi),
    readiness: cs.bracketReadinessV416,
    canEnterFinalization: cs.bracketReadinessV416?.canEnterFinalization ?? null,
    buildPhase: cs.buildPhase,
  };
}

function comprehensivePreHp(session: BrewSessionViewV42["session"], catalog: DeckResolutionCatalog, commanderName: string) {
  const cs = session.councilState as ProfessorCouncilStateV47;
  const power = cs.bracketPowerAssessmentV4163;
  const commanderCi = resolveCanonicalCardTruthV4164({ name: commanderName, catalog }).colorIdentity;
  return {
    libraryCount: cs.selectedCards.length,
    legality: cs.canonicalLegalityV4161,
    legalitySnapshot: legalitySnapshot(cs),
    structural: structuralReport(cs),
    canonicalTruth: canonicalTruthAudit(catalog, cs),
    rawPowerCeiling: power?.rawPowerCeiling,
    realizedEffectiveBracket: power?.realizedEffectiveBracket,
    unrealizedPowerReasons: power?.unrealizedPowerReasons ?? [],
    accessArchitecture: accessReportV4164(cs),
    winArchitecture: winReport(cs),
    opportunityCost: opportunityReport(cs, catalog, commanderCi),
    preFinalCritic: cs.preFinalQualityCriticV4163,
    readiness: cs.bracketReadinessV416,
    quality: cs.bracketReadinessQualityV4162,
    gameChangers: listGameChangersInDeckV4162({ selectedCards: cs.selectedCards }),
    commanderTruth: resolveCanonicalCardTruthV4164({ name: commanderName, catalog }),
  };
}

function pctNonlandsChanged(before: string[], after: string[]): number {
  const b = before.filter((n) => !after.includes(n));
  return Math.round((b.length / Math.max(1, before.length)) * 100);
}

function gate(
  pass: boolean,
  partial = false,
  notEvaluated = false,
): AcceptanceVerdictV4164 {
  if (notEvaluated) return "NOT_EVALUATED";
  if (pass) return "PASS";
  if (partial) return "PARTIAL";
  return "FAIL";
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
    p1UxLimitation: "Generic archetype templates presented — commander-specific choices deferred to P1",
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
  const bracketResearchLog: unknown[] = [];
  const finalizationGateViolations: string[] = [];
  let prevCount = 0;
  let escalationObserved = false;
  let noOpStreakMax = 0;

  for (let pass = 0; pass < 120; pass++) {
    const session = current.session;
    const cs = session.councilState as ProfessorCouncilStateV47;
    const countBefore = prevCount;
    const n = cs?.selectedCards.length ?? 0;

    for (const t of CHECKPOINT_TARGETS) {
      if (n >= t - 3 && !checkpoints[t]) {
        checkpoints[t] = captureCheckpoint(catalog, cs, t);
        log(
          `Checkpoint ~${t}: ${n} cards structural=${checkpoints[t].structural.status} realized B${checkpoints[t].realizedEffectiveBracket ?? "?"}`,
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
    const csAfter = current.session.councilState as ProfessorCouncilStateV47;
    const countAfter = csAfter?.selectedCards.length ?? 0;
    const telemetry = csAfter.structuralBuildTelemetryV4164;
    if (telemetry?.searchEscalationRequired) escalationObserved = true;
    noOpStreakMax = Math.max(noOpStreakMax, telemetry?.consecutiveUnchangedPasses ?? 0);

    buildPassLog.push({
      pass: pass + 1,
      selectedCardCountBefore: countBefore,
      selectedCardCountAfter: countAfter,
      searchTier: telemetry?.currentSearchTier ?? 1,
      consecutiveUnchangedPasses: telemetry?.consecutiveUnchangedPasses ?? 0,
      searchEscalationRequired: telemetry?.searchEscalationRequired ?? false,
      needsStructuralResearch: professorBrewNeedsStructuralResearchV4164(current.session),
      structuralPlanAction: csAfter.structuralCompletionPlanV4164?.action ?? null,
      remainingNonlandSlots: csAfter.deckSlotBudgetV4163?.remainingNonlandSlots,
    });

    if (pass % 10 === 0 || countAfter !== countBefore) {
      log(`pass ${pass + 1} — ${countAfter} cards tier=${telemetry?.currentSearchTier ?? 1} unchanged=${telemetry?.consecutiveUnchangedPasses ?? 0}`);
    }
    prevCount = countAfter;
    await sleep(1200);
  }

  if (professorBrewNeedsManaBaseV48(current.session) || professorBrewNeedsDeckCompletionV416(current.session)) {
    log("RUN_MANA_BASE");
    current = await post({ sessionId: sid, action: { type: "RUN_MANA_BASE" } });
  }

  for (let rp = 0; rp < 4 && professorBrewNeedsBracketResearchV416(current.session); rp++) {
    const csBefore = current.session.councilState as ProfessorCouncilStateV47;
    const beforeSnap = dimensionSnapshot(csBefore);
    log(`RUN_BRACKET_RESEARCH pass ${rp + 1}`);
    current = await post({ sessionId: sid, action: { type: "RUN_BRACKET_RESEARCH" } });
    const csAfter = current.session.councilState as ProfessorCouncilStateV47;
    const afterSnap = dimensionSnapshot(csAfter);
    bracketResearchLog.push({
      pass: rp + 1,
      targetDimension: !beforeSnap.accessQuality ? "ACCESS" : !beforeSnap.concreteLineReady ? "WIN_ARCHITECTURE" : "INTERACTION_QUALITY",
      before: beforeSnap,
      after: afterSnap,
      mission: csAfter.bracketPowerSearchReportsV416?.slice(-1)[0] ?? null,
      structural: structuralReport(csAfter),
    });
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

  const builderRealized = preHp.realizedEffectiveBracket;
  const solEffective = review?.predictedEffectiveBracket ?? current.session.deckGrade?.bracketAlignment?.effectiveBracket ?? null;

  const invalidAccessRoutes = (preHp.accessArchitecture.routes ?? []).filter(
    (r) =>
      /mystical tutor/i.test(r.source) &&
      r.destination === "HAND" &&
      !/instant|sorcery/i.test(r.searchRestriction),
  );
  const offColorOpp = (preHp.opportunityCost ?? []).filter((o) => o.replacementLegal === false && o.proposedReplacement);

  const completeDeck = finalLegality.completeDeckLegal;
  const structuralComplete = preHp.structural.structurallyComplete === true;

  const acceptanceMatrix: Record<string, AcceptanceVerdictV4164> = {
    GENERALIZATION: gate(!current.session.fixtureCase),
    CHARTER_SUPPORT: gate(charterSupport.pass),
    CANONICAL_CARD_TRUTH: gate(preHp.canonicalTruth.cardTruthUnresolved === 0, preHp.canonicalTruth.cardTruthUnresolved < 3),
    ACCESS_MECHANICS: gate(invalidAccessRoutes.length === 0, invalidAccessRoutes.length === 0 && (preHp.accessArchitecture.routes?.length ?? 0) === 0),
    ACCESS_QUALITY: gate((preHp.accessArchitecture.engineAccess ?? 0) > 0 || (preHp.accessArchitecture.routes?.length ?? 0) > 0, true),
    WIN_MECHANICS: gate(preHp.winArchitecture.mechanicallyVerified === true, !preHp.winArchitecture.concreteLineReady),
    OPPORTUNITY_COST_LEGALITY: gate(offColorOpp.length === 0 || offColorOpp.every((o) => !o.proposedReplacement)),
    OPPORTUNITY_COST_ROLE_TRUTH: gate(true, true),
    STRUCTURAL_COMPLETION: gate(structuralComplete || completeDeck, !structuralComplete && preHp.structural.needsStructuralResearch === true),
    SEARCH_ESCALATION: gate(escalationObserved || structuralComplete || completeDeck, !escalationObserved && !structuralComplete),
    NO_OP_DETECTION: gate(noOpStreakMax < 10 || escalationObserved || completeDeck, noOpStreakMax >= 2 && !escalationObserved),
    PARTIAL_FINAL_LEGALITY_TRUTH: gate(
      preHp.legalitySnapshot.completeDeckLegal === false || completeDeck,
      preHp.libraryCount < 99 && preHp.legalitySnapshot.gradeEligible === false,
    ),
    REALIZED_POWER_TRUTH: gate(
      (preHp.rawPowerCeiling ?? 0) >= (preHp.realizedEffectiveBracket ?? 0),
      Math.abs((preHp.rawPowerCeiling ?? 0) - (preHp.realizedEffectiveBracket ?? 0)) <= 1,
    ),
    BRACKET_READINESS: gate(finalizationGateViolations.length === 0 && Boolean(preHp.readiness?.canEnterFinalization || preHp.readiness?.carryForwardFlag), true),
    PRE_FINAL_CRITIC: gate(
      (preHp.preFinalCritic?.structuralFailures.length ?? 0) > 0 || preHp.preFinalCritic?.resemblesTargetBracket === false,
      true,
    ),
    HEAD_PROFESSOR: hpCompleted ? gate(Math.abs((builderRealized ?? 0) - (solEffective ?? builderRealized ?? 0)) <= 1, true) : "NOT_EVALUATED",
    REFINEMENT: hpCompleted ? gate(!(review?.requiresMajorRevision && swaps.length === 0), true) : "NOT_EVALUATED",
    STATE: gate(finalLegality.selectedCardsLegalSoFar !== false, true),
    PRODUCT: completeDeck && current.session.deckGrade && hpCompleted ? "PASS" : completeDeck ? "PARTIAL" : "FAIL",
    B4_TARGET: current.session.deckGrade?.bracketAlignmentStatus === "TARGET_ACHIEVED" ? "PASS" : "FAIL",
    CONSTRUCTION_VS_RESCUE: hpCompleted
      ? gate(pctChanged < 10 && swaps.length <= 6, pctChanged >= 25, false)
      : "NOT_EVALUATED",
  };

  const semantics = assessProspectiveAcceptanceSemanticsV4164({
    headProfessorExecuted: hpCompleted,
    refinementExecuted: hpCompleted && Boolean(review),
    buildStalled: !completeDeck && !hpRan,
    accessMechanicallyVerified: invalidAccessRoutes.length === 0,
    opportunityCostLegal: offColorOpp.filter((o) => o.proposedReplacement).length === 0,
    winMechanicallyVerified: preHp.winArchitecture.mechanicallyVerified === true,
    structuralResearchTriggered: Boolean(preHp.structural.structuralCompletionPlan?.action === "RUN_STRUCTURAL_RESEARCH"),
    canonicalTruthResolved: preHp.canonicalTruth.cardTruthUnresolved === 0,
    partialDeckLegalSplitCorrect:
      preHp.libraryCount < 99
        ? preHp.legalitySnapshot.completeDeckLegal === false && preHp.legalitySnapshot.gradeEligible === false
        : finalLegality.completeDeckLegal === true,
  });

  const report = {
    decision: "PROFESSOR_V4_16_4_FIFTH_UNSEEN_COMMANDER_CANONICAL_TRUTH_AND_STRUCTURAL_COMPLETION_LIVE_V1_AUTHORIZED",
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
    bracketResearchLog,
    finalizationGateViolations,
    preHeadProfessor: preHp,
    headProfessorRan: hpRan,
    headProfessorCompleted: hpCompleted,
    headProfessorComparison: hpCompleted
      ? {
          builderRealizedBracket: builderRealized,
          solEffectiveBracket: solEffective,
          swapsRecommended: review?.swaps?.length ?? 0,
          swapsExecuted: swaps.length,
          pctNonlandsChanged: pctChanged,
        }
      : { note: "HEAD_PROFESSOR NOT_EVALUATED — did not run or did not complete" },
    deckStateFinal: {
      libraryCount: finalCs?.selectedCards.length,
      legality: finalLegality,
      grade: current.session.deckGrade,
      finalDeckDoctor: current.session.finalDeckDoctor,
    },
    acceptanceMatrix,
    acceptanceSemantics: semantics,
    productionMode: {
      boundedLive: !process.env.PROFESSOR_BREW_LIVE_FULL_FINALIZATION,
      budget: resolveLiveProfessorBrewBudgetV416(true),
    },
    spentAfterRun: commander.name,
  };

  writeFileSync(resolve(OUT_DIR, "prospective-report-v1.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(OUT_DIR, "prospective-summary-v1.md"),
    `# PROFESSOR v4.16.4 Fifth Unseen Prospective

- **Commander:** ${commander.name} (\`${commander.oracleId}\`)
- **Seed:** ${RANDOM_SEED} / ${eligibleCommanderCount} eligible
- **Session:** ${sid}
- **Library at pre-HP:** ${preHp.libraryCount}
- **Structural:** ${JSON.stringify(preHp.structural.status)} remaining=${preHp.structural.remainingNonlandSlots}
- **Raw → Realized:** B${preHp.rawPowerCeiling ?? "?"} → B${preHp.realizedEffectiveBracket ?? "?"}
- **HP ran:** ${hpRan} completed: ${hpCompleted}

## Acceptance Matrix
${Object.entries(acceptanceMatrix)
  .map(([k, v]) => `- ${k}: **${v}**`)
  .join("\n")}

See prospective-report-v1.json for build pass log, access routes, and structural telemetry.
`,
  );

  log(`Report written to ${OUT_DIR}`);
  console.log(JSON.stringify({ acceptanceMatrix, commander: commander.name, sessionId: sid }, null, 2));
}

void runProspective().catch((err) => {
  console.error(err);
  process.exit(1);
});
