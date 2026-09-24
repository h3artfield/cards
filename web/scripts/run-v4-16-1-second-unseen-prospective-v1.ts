/**
 * PROFESSOR v4.16.1 — Second unseen Commander prospective live test.
 * Decision: PROFESSOR_V4_16_1_SECOND_UNSEEN_COMMANDER_BRACKET_NATIVE_LIVE_V1_AUTHORIZED
 */
import { createHash } from "node:crypto";
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
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "../src/lib/deck-synthesis/professor-deck-completion-v4-7-v1";
import {
  professorBrewNeedsDeckCompletionV416,
  professorBrewNeedsBracketResearchV416,
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsManaBaseV48,
  professorBrewShouldContinueAutoBuildV47,
} from "../src/lib/deck-synthesis/professor-brew-progress-v4-7-v1";
import {
  DEFAULT_ARCHETYPE_CHOICE_V42,
  DEFAULT_RELATIONSHIP_CHOICE_V42,
  MEREN_ARCHETYPE_CHOICES_V42,
  RELATIONSHIP_CHOICES_V42,
} from "../src/lib/deck-synthesis/professor-brew-fixtures-v4-2-v1";
import { DEFAULT_WIN_PREFERENCE_V415, WIN_PREFERENCE_CHOICES_V415 } from "../src/lib/deck-synthesis/professor-win-preference-v4-15-v1";
import type { BrewSessionViewV42 } from "../src/lib/deck-synthesis/professor-brew-session-v4-2-v1";
import type { ProfessorCouncilStateV47 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-7-v1";

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
  resolve(process.cwd(), "data/milestones/deck-synthesis/v4-16-1-second-unseen-prospective"),
);
const RANDOM_SEED = Number(process.env.PROFESSOR_V4_16_1_SEED ?? "416102001");

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
  ].map((n) => normalizeOracleName(n)),
);

const CHECKPOINT_TARGETS = [22, 37, 52, 67, 82] as const;

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

function captureCheckpoint(cs: ProfessorCouncilStateV47, target: number) {
  const snap = cs.snapshots?.find((s) => (s as { cardCount?: number }).cardCount >= target) ?? cs.snapshots?.[cs.snapshots.length - 1];
  const gap = (snap as { bracketGapAnalysis?: { predictedBracket?: number; currentlyEstimatedBracket?: number } })?.bracketGapAnalysis;
  const holdValidation = validateHoldCourseV4161({
    portfolio: cs.bracketPowerPortfolioV416 ?? null,
    gap: (gap as import("../src/lib/deck-synthesis/professor-bracket-gap-analysis-v4-10-v1").BracketGapAnalysisV410) ?? null,
    legality: cs.canonicalLegalityV4161 ?? null,
    utilization: cs.bracketPowerUtilizationV4161 ?? null,
    winReadiness: cs.b4WinReadinessV4161 ?? null,
    highDeficitCheckpointStreak: cs.highDeficitCheckpointStreakV416,
    primaryStrategy: cs.deckCharter?.primaryStrategy,
  });
  const creativeTurns = (cs.conversation ?? [])
    .filter((t) => t.phase === "CHECKPOINT" && t.speaker === "CREATIVE")
    .slice(-3)
    .map((t) => t.message);
  return {
    target,
    libraryCount: cs.selectedCards.length,
    cardNames: cs.selectedCards.map((c) => c.name),
    predictedEffectiveBracket: gap?.predictedBracket ?? gap?.currentlyEstimatedBracket ?? null,
    bracketPowerUtilization: cs.bracketPowerUtilizationV4161 ?? null,
    portfolio: cs.bracketPowerPortfolioV416 ?? null,
    readiness: cs.bracketReadinessV416 ?? null,
    winReadiness: cs.b4WinReadinessV4161 ?? null,
    legality: cs.canonicalLegalityV4161 ?? null,
    holdCourseValidation: holdValidation,
    recentCreativeMessages: creativeTurns,
    powerSearchReports: cs.bracketPowerSearchReportsV416 ?? [],
    unresolvedDeficits: cs.bracketPowerPortfolioV416?.criticalDeficits ?? [],
  };
}

function preHeadProfessorSnapshot(session: BrewSessionViewV42["session"]) {
  const cs = session.councilState!;
  return {
    libraryCount: cs.selectedCards.length,
    cards: cs.selectedCards.map((c) => ({ name: c.name, category: c.category, roles: c.roles })),
    readiness: cs.bracketReadinessV416,
    utilization: cs.bracketPowerUtilizationV4161,
    winReadiness: cs.b4WinReadinessV4161,
    portfolio: cs.bracketPowerPortfolioV416,
    manaPlan: cs.manaPlanV416,
    legality: cs.canonicalLegalityV4161,
    gap: cs.snapshots?.[cs.snapshots.length - 1]?.bracketGapAnalysis ?? null,
  };
}

function bottomFiveAudit(cards: { name: string; category?: string }[]) {
  const DRAFT_RE =
    /akki rockspeaker|dakmor lancer|dirtwater wraith|goblin flotilla|keldon raider|lich's caress|whispering shade|zodiac goat|vanilla|doorman|pummeler|wei strike|guul draz|inquisitive puppet|ma chao|ogre arsonist/i;
  return cards
    .filter((c) => c.category !== "land")
    .filter((c) => DRAFT_RE.test(c.name) || c.name.length < 4)
    .slice(0, 8)
    .map((c) => c.name);
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
      note: "Production defaults when user selects commander + B4 only (same as ProfessorBrewSetupApp with unset optional fields)",
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

  const constructionContract = {
    bracketConstructionContractV416: cs0.bracketConstructionContractV416,
    manaPlanV416: cs0.manaPlanV416,
    deckNeeds: cs0.deckNeeds,
    initialPortfolio: cs0.bracketPowerPortfolioV416,
    initialReadiness: cs0.bracketReadinessV416,
    charter: cs0.deckCharter,
    winArchitectureLocked: cs0.winArchitectureLockedV416,
  };

  const checkpoints: Record<number, ReturnType<typeof captureCheckpoint>> = {};
  const cardCountLog: { pass: number; count: number }[] = [];
  const holdCourseAudits: unknown[] = [];

  await post({ sessionId: sid, action: { type: "SET_LIVE_STATUS", status: "v4.16.1 prospective build…" } });

  for (let pass = 0; pass < 120; pass++) {
    const session = current.session;
    const cs = session.councilState as ProfessorCouncilStateV47;
    const n = cs?.selectedCards.length ?? 0;
    cardCountLog.push({ pass, count: n });

    for (const t of CHECKPOINT_TARGETS) {
      if (n >= t && !checkpoints[t]) {
        checkpoints[t] = captureCheckpoint(cs, t);
        holdCourseAudits.push({ at: n, target: t, ...checkpoints[t].holdCourseValidation });
        log(`Checkpoint ~${t}: predicted B${checkpoints[t].predictedEffectiveBracket ?? "?"} hold=${checkpoints[t].holdCourseValidation.action}`);
      }
    }

    const deckDone = !professorBrewShouldContinueAutoBuildV47(session);
    const treeDone = n >= COMMANDER_DECK_LIBRARY_SIZE_V47;
    if (deckDone && treeDone) break;
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

  if (
    professorBrewNeedsManaBaseV48(current.session) ||
    professorBrewNeedsDeckCompletionV416(current.session)
  ) {
    log("RUN_MANA_BASE");
    current = await post({ sessionId: sid, action: { type: "RUN_MANA_BASE" } });
  }

  for (let researchPass = 0; researchPass < 4 && professorBrewNeedsBracketResearchV416(current.session); researchPass++) {
    log(`RUN_BRACKET_RESEARCH pass ${researchPass + 1}`);
    current = await post({ sessionId: sid, action: { type: "RUN_BRACKET_RESEARCH" } });
    await sleep(1500);
  }

  const preHp = preHeadProfessorSnapshot(current.session);
  log(
    `Pre-HP: ${preHp.libraryCount} cards, readiness=${preHp.readiness?.readiness}, predicted B${(preHp.gap as { predictedBracket?: number })?.predictedBracket ?? "?"}`,
  );

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
  const emergencyRepairCount = (review?.swaps?.length ?? 0) + swaps.length;

  const acceptance = {
    generalization: !current.session.fixtureCase && commander.oracleId ? "PASS" : "FAIL",
    legality: finalLegality.finalDeckLegal ? "PASS" : "FAIL",
    bracketNativeConstruction:
      (preHp.readiness?.currentPredictedBracket ?? 0) >= 3 &&
      (preHp.readiness?.readiness === "READY" || preHp.readiness?.readiness === "BUILD_BRACKET_TARGET_UNRESOLVED")
        ? "PASS"
        : (preHp.gap as { predictedBracket?: number })?.predictedBracket === 4
          ? "PASS"
          : (preHp.gap as { predictedBracket?: number })?.predictedBracket === 3
            ? "PARTIAL"
            : "FAIL",
    powerUtilization: preHp.utilization?.bracketReady ? "PASS" : "PARTIAL",
    headProfessor:
      emergencyRepairCount <= 8 && current.session.finalDeckDoctor?.status === "COMPLETE" ? "PASS" : "PARTIAL",
    state: finalLegality.finalDeckLegal ? "PASS" : "FAIL",
    product:
      finalLegality.finalDeckLegal &&
      current.session.deckGrade &&
      current.session.finalDeckDoctor?.status === "COMPLETE"
        ? "PASS"
        : "FAIL",
    b4TargetAchieved:
      current.session.deckGrade?.bracketAlignmentStatus === "TARGET_ACHIEVED" ? "ACHIEVED" : "MISSED",
  };

  const report = {
    decision: "PROFESSOR_V4_16_1_SECOND_UNSEEN_COMMANDER_BRACKET_NATIVE_LIVE_V1_AUTHORIZED",
    randomSeed: RANDOM_SEED,
    eligibleCommanderCount,
    commanderOracleId: commander.oracleId,
    commanderName: commander.name,
    commanderSlug: commander.slug,
    sessionId: sid,
    userSetup,
    constructionContract,
    powerSearchReports: finalCs?.bracketPowerSearchReportsV416 ?? [],
    checkpoints,
    holdCourseAudits,
    cardCountLog,
    deckStateA_midConstruction: checkpoints[52] ?? checkpoints[37] ?? null,
    deckStateB_preHeadProfessor: preHp,
    deckStateC_final: {
      cards: finalCs?.selectedCards.map((c) => c.name) ?? [],
      legality: finalLegality,
      grade: current.session.deckGrade,
      finalDeckDoctor: {
        status: current.session.finalDeckDoctor?.status,
        error: current.session.finalDeckDoctor?.headProfessorError,
        weakCards: review?.structuralProblems ?? [],
        hpWeakCards: (review as { weakCards?: string[] })?.weakCards ?? [],
        swapsRecommended: review?.swaps?.length ?? 0,
        swapsExecuted: swaps.length,
        emergencyRepairCount,
        requiresMajorRevision: review?.requiresMajorRevision ?? null,
      },
      bracketAlignment: current.session.deckGrade?.bracketAlignment,
      bracketAlignmentStatus: current.session.deckGrade?.bracketAlignmentStatus,
    },
    bottomFiveAudit: bottomFiveAudit(preHp.cards),
    hpWeakCards: (review as { weakCards?: string[] })?.weakCards ?? [],
    b4PowerUtilizationGap:
      bottomFiveAudit(preHp.cards).length > 0 &&
      ((review as { weakCards?: string[] })?.weakCards?.length ?? 0) === 0
        ? true
        : false,
    constructionVsRescue: {
      preHpLibraryCount: preHp.libraryCount,
      preHpPredictedBracket: (preHp.gap as { predictedBracket?: number })?.predictedBracket,
      hpSwapsExecuted: swaps.length,
      hpSwapsRecommended: review?.swaps?.length ?? 0,
      narrative:
        swaps.length >= 10
          ? "Head Professor performed emergency rescue — construction did not deliver B4-shaped deck"
          : swaps.length <= 6
            ? "Head Professor refined a mostly-built deck"
            : "Mixed — moderate rescue",
    },
    liveFinalizationMode: "production bounded live path (resolveLiveProfessorBrewBudgetV416 default unless PROFESSOR_BREW_LIVE_FULL_FINALIZATION=true)",
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
    deckStateB_preHeadProfessor: { readiness?: { readiness?: string; currentPredictedBracket?: number }; libraryCount?: number };
    deckStateC_final: { legality?: { finalDeckLegal?: boolean }; grade?: { overallLetter?: string } };
    constructionVsRescue: { narrative?: string };
  };
  return `# PROFESSOR v4.16.1 Second Unseen Prospective

- **Commander:** ${r.commanderName} (\`${r.commanderOracleId}\`)
- **Seed:** ${r.randomSeed} / ${r.eligibleCommanderCount} eligible
- **Pre-HP readiness:** ${r.deckStateB_preHeadProfessor?.readiness?.readiness} (predicted B${r.deckStateB_preHeadProfessor?.readiness?.currentPredictedBracket})
- **Final legal:** ${r.deckStateC_final?.legality?.finalDeckLegal}
- **Grade:** ${r.deckStateC_final?.grade?.overallLetter ?? "N/A"}
- **Construction vs rescue:** ${r.constructionVsRescue?.narrative}

## Acceptance
${Object.entries(r.acceptance)
  .map(([k, v]) => `- ${k}: **${v}**`)
  .join("\n")}

See \`prospective-report-v1.json\` for full checkpoint data.
`;
}

void runProspective().catch((err) => {
  console.error(err);
  process.exit(1);
});
