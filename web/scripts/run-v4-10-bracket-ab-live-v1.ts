/**
 * Live v4.10 Bracket A/B — Korvold B3 vs B4 through Professor brew API.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadCommanderGameChangerSnapshot, gameChangerOracleIdSet } from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "../src/lib/deck-synthesis/professor-deck-completion-v4-7-v1";
import {
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsManaBaseV48,
  professorBrewShouldContinueAutoBuildV47,
} from "../src/lib/deck-synthesis/professor-brew-progress-v4-7-v1";
import { BREW_TREE_MAX_REVEAL_STEP_V42 } from "../src/lib/deck-synthesis/professor-brew-session-v4-2-v1";
import type { BrewSessionViewV42 } from "../src/lib/deck-synthesis/professor-brew-session-v4-2-v1";

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
const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-10-bracket-ab-live");

const COMMON = {
  mode: "live" as const,
  commanderName: "Korvold, Fae-Cursed King",
  commanderSlug: "korvold-fae-cursed-king",
  archetypeChoiceId: "sacrifice",
  archetypeIntent: "Sacrifice Engine",
  relationshipChoiceId: "harmony",
  relationshipLens: "HARMONY",
  relationshipIntent: "Interlocking Systems — HARMONY",
};

const GC_ORACLE_IDS = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
const GC_RE = /sol ring|mana crypt|dockside|demonic tutor|vampiric tutor|imperial seal|gamble|enlightened tutor|worldly tutor|mystical tutor|force of will|cyclonic rift|rhystic study|mystic remora|smothering tithe|necropotence|underworld breach|doubling season|pitiless plunderer|boseiju|takenuma|craterhoof|thassa's oracle/i;
const TUTOR_RE = /tutor|diabolic|demonic|vampiric|imperial seal|gamble|worldly|enlightened|mystical|personal tutor|recruiter|survival of the fittest|finale of devastation|fabricate|merchant scroll|wishclaw|spellseeker|tribute mage|isochron scepter/i;
const FILLER_RE = /doorman|puppet|pummeler|line breaker|wei strike|guul draz|keldon raider|inquisitive puppet|ma chao|ogre arsonist/i;
const PREMIUM_RE = /sol ring|mana crypt|dockside|demonic tutor|vampiric|imperial seal|gamble|force of will|cyclonic rift|boseiju|takenuma|pitiless plunderer|doubling season|abrupt decay|heroic intervention|prismatic vista|fabled passage|skullclamp|professional face-breaker|academy manufactor|thassa's oracle|underworld breach|jeweled lotus|chrome mox|mox diamond|ancient tomb|city of traitors|mana vault|grim monolith|lotus petal|three visits|nature's lore|farseek|rampant growth|kodama's reach|skyshroud claim|cultivate|kodama's reach|skyshroud claim|nature's lore|farseek|three visits|lotus petal|jeweled lotus|chrome mox|mox diamond|ancient tomb|city of traitors|mana vault|grim monolith|lotus petal|three visits|nature's lore|farseek|rampant growth|kodama's reach|skyshroud claim|cultivate|kodama's reach|skyshroud claim|nature's lore|farseek|three visits|lotus petal|jeweled lotus|chrome mox|mox diamond|ancient tomb|city of traitors|mana vault|grim monolith/i;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function waitForServer(maxMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${BASE}/api/store/${SLUG}/professor/brew`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(2500);
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

type GapSnap = Record<number, unknown>;

function extractGapAtCheckpoints(cs: NonNullable<BrewSessionViewV42["session"]["councilState"]>): GapSnap {
  const targets = [25, 40, 55, 70];
  const out: GapSnap = {};
  for (const t of targets) {
    const snap = cs.snapshots?.find((s) => (s as { cardCount?: number }).cardCount >= t);
    const gap = (snap as { bracketGapAnalysis?: unknown })?.bracketGapAnalysis ?? null;
    out[t] = gap;
  }
  return out;
}

function extractPowerPlan(cs: NonNullable<BrewSessionViewV42["session"]["councilState"]>) {
  return {
    bracketBuildPlan: cs.bracketBuildPlan ?? null,
    bracketPowerPlanV410: cs.bracketPowerPlanV410 ?? null,
    bracketPowerDecisionV410: cs.bracketPowerDecisionV410 ?? null,
    powerDecisionCouncilTurns: cs.conversation
      ?.filter((t) => t.phase === "PRE_BUILD" && /power budget|Spend B|prioritize|reject expensive/i.test(t.message))
      .map((t) => ({ speaker: t.speaker, message: t.message })),
  };
}

function holdCourseBlockedExamples(cs: NonNullable<BrewSessionViewV42["session"]["councilState"]>) {
  return (cs.conversation ?? [])
    .filter((t) => /HOLD_COURSE forbidden|UNRESOLVED|over-invested|still develops like|tutors were part|Stop adding/i.test(t.message))
    .map((t) => ({ speaker: t.speaker, phase: t.phase, message: t.message, detail: t.developerDetail }));
}

function deckAtCount(cs: NonNullable<BrewSessionViewV42["session"]["councilState"]>, count: number): string[] {
  const snap = cs.snapshots?.find((s) => (s as { cardCount?: number }).cardCount >= count);
  if (!snap) return cs.selectedCards.slice(0, count).map((c) => c.name);
  return ((snap as { selectedCardsSummary?: { name: string }[] }).selectedCardsSummary ?? []).map((c) => c.name);
}

function classifyCard(name: string): string {
  if (GC_ORACLE_IDS.has(name) || GC_RE.test(name)) return "game-changer-candidate";
  if (TUTOR_RE.test(name)) return "tutor-access";
  if (/sol ring|mana crypt|dockside|lotus|mox|vault|crypt|ritual|seething|pyretic|nature's lore|farseek|rampant|cultivate|kodama|skyshroud|three visits|ancient tomb|city of traitors|jeweled lotus|chrome mox|mox diamond|mana vault|grim monolith|lotus petal/i.test(name)) return "acceleration";
  if (/counterspell|abrupt|terminate|bolt|path|swords|destroy|exile|kill|remove|decay|trophy|assassin|murder|go for the throat|dismember|unsummon|negate|swan song|mystical dispute|cyclonic rift|force of/i.test(name)) return "interaction";
  if (/heroic intervention|deflecting|fierce guardianship|deadly rollick|teferi's protection|veil of summer|autumn's veil|silence|grand abolisher|defender|protection/i.test(name)) return "protection";
  if (/doubling season|craterhoof|pitiless|finale|exsanguinate|torment|triumph|hellkite|overrun|finisher|win/i.test(name)) return "finisher";
  if (/skullclamp|rhystic|mystic remora|phyrexian arena|necropotence|sylvan library|consecrated sphinx|greater good|moldervine|reclamation|draw|impulse|brainstorm|ponder|preordain|cantrip|plunder|tireless provisioner|deadly dispute|village rites/i.test(name)) return "card-advantage";
  if (FILLER_RE.test(name)) return "filler";
  if (PREMIUM_RE.test(name)) return "premium";
  return "synergy";
}

function deckStats(session: BrewSessionViewV42["session"]) {
  const cs = session.councilState;
  const cards = cs?.selectedCards ?? [];
  const names = cards.map((c) => c.name);
  const lands = cards.filter((c) => c.category === "land");
  const lastSnap = cs?.snapshots?.[cs.snapshots.length - 1] as {
    avgManaValue?: number;
    rampNonLandCount?: number;
    tutorCount?: number;
    rampCoverage?: number;
    cardAdvantageCoverage?: number;
    interactionCoverage?: number;
    protectionCoverage?: number;
    roleCoverage?: Record<string, number>;
  } | undefined;

  const gcs = cards.filter((c) => (c.oracleId && GC_ORACLE_IDS.has(c.oracleId)) || GC_RE.test(c.name)).map((c) => c.name);
  const basics: Record<string, number> = {};
  for (const n of ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]) {
    const c = names.filter((x) => x === n).length;
    if (c) basics[n] = c;
  }

  return {
    landCount: lands.length,
    avgManaValue: lastSnap?.avgManaValue ?? null,
    rampNonLandCount: lastSnap?.rampNonLandCount ?? lastSnap?.rampCoverage ?? null,
    tutorCount: lastSnap?.tutorCount ?? names.filter((n) => TUTOR_RE.test(n)).length,
    interaction: lastSnap?.interactionCoverage ?? cards.filter((c) => c.roles?.includes("interaction")).length,
    protection: lastSnap?.protectionCoverage ?? cards.filter((c) => c.roles?.includes("protection")).length,
    cardAdvantage: lastSnap?.cardAdvantageCoverage ?? cards.filter((c) => c.roles?.includes("card-advantage")).length,
    finishers: lastSnap?.roleCoverage?.finisher ?? cards.filter((c) => c.roles?.includes("finisher")).length,
    gameChangers: gcs,
    premiumCount: names.filter((n) => classifyCard(n) === "premium" || classifyCard(n) === "game-changer-candidate").length,
    fillerCount: names.filter((n) => classifyCard(n) === "filler").length,
    basicLandCounts: basics,
    allCardNames: names,
    depHigh: cards.filter((c) => c.commanderDependence === "HIGH").length,
  };
}

function headProfessorBlock(session: BrewSessionViewV42["session"]) {
  const fd = session.finalDeckDoctor;
  const review = fd?.review;
  const adj = fd?.bracketAdjudicationV410 ?? null;
  const miss = fd?.status === "FAILED" && (fd.headProfessorError?.includes("Bracket target miss") || session.councilState?.buildPhase === "BRACKET_REFINEMENT");
  return {
    requestedBracket: session.bracket,
    predictedEffectiveBracket: review?.predictedEffectiveBracket ?? adj?.predictedEffectiveBracket ?? null,
    confidence: adj?.confidence ?? null,
    reasons: adj?.reasons ?? (review?.bracketAssessment ? [review.bracketAssessment] : []),
    powerStrengths: adj?.powerStrengths ?? review?.strengths ?? [],
    powerDeficits: adj?.powerDeficits ?? [
      ...(review?.manaProblems ?? []),
      ...(review?.interactionProblems ?? []),
      ...(review?.winPathProblems ?? []),
    ],
    bracketAssessment: review?.bracketAssessment ?? null,
    bracketTargetMiss: miss,
    bracketUpgradeMission: session.councilState?.bracketUpgradeMissionV410 ?? null,
    status: fd?.status ?? null,
    error: fd?.headProfessorError ?? null,
    fixtureCase: session.fixtureCase,
  };
}

async function runAutoBuildLoop(sid: string, label: string) {
  let current = await get(sid);
  if (current.session.fixtureCase) {
    throw new Error(`${label}: fixtureCase=${current.session.fixtureCase} — not live path`);
  }
  if (!current.session.councilState) {
    throw new Error(`${label}: councilState missing`);
  }

  const gapLive: GapSnap = {};
  const cardCountLog: { pass: number; count: number }[] = [];

  await post({ sessionId: sid, action: { type: "SET_LIVE_STATUS", status: `${label}: building…` } });

  for (let pass = 0; pass < 120; pass++) {
    const session = current.session;
    const cs = session.councilState!;
    const n = cs.selectedCards.length;
    cardCountLog.push({ pass, count: n });

    for (const t of [25, 40, 55, 70]) {
      if (n >= t && !gapLive[t]) {
        const snap = cs.snapshots?.find((s) => (s as { cardCount?: number }).cardCount >= t);
        gapLive[t] = (snap as { bracketGapAnalysis?: unknown })?.bracketGapAnalysis ?? null;
        if (gapLive[t]) log(`${label}: gap @${t} predicted=${(gapLive[t] as { predictedBracket?: number }).predictedBracket} holdForbidden=${(gapLive[t] as { holdCourseForbidden?: boolean }).holdCourseForbidden}`);
      }
    }

    const deckDone = !professorBrewShouldContinueAutoBuildV47(session);
    const treeDone = cs.selectedCards.length >= COMMANDER_DECK_LIBRARY_SIZE_V47;
    if (deckDone && treeDone) break;
    if (!session.workingDeckTheory) break;

    if (session.discoveryInterrupt) {
      current = await post({ sessionId: sid, action: { type: "DISCOVERY_CHOICE", choiceId: "explore" } });
      await sleep(800);
      continue;
    }
    if (session.phase === "USER_FORK") {
      current = await post({ sessionId: sid, action: { type: "USER_FORK", forkId: defaultForkId(session) } });
      await sleep(800);
      continue;
    }

    current = await post({ sessionId: sid, action: { type: "ADVANCE_TREE" } });
    if (pass % 8 === 0) log(`${label}: pass ${pass + 1} — ${current.session.councilState?.selectedCards.length ?? 0} cards`);
    await sleep(1400);
  }

  current = await get(sid);
  if (professorBrewNeedsManaBaseV48(current.session)) {
    log(`${label}: RUN_MANA_BASE`);
    current = await post({ sessionId: sid, action: { type: "RUN_MANA_BASE" } });
  }
  if (professorBrewNeedsFinalReviewV48(current.session)) {
    log(`${label}: RUN_FINAL_REVIEW`);
    current = await post({ sessionId: sid, action: { type: "RUN_FINAL_REVIEW" } });
    for (let i = 0; i < 450; i++) {
      await sleep(4000);
      current = await get(sid);
      const st = current.session.finalDeckDoctor?.status;
      if (i % 5 === 0) log(`${label}: HP poll ${i + 1} — ${st}`);
      if (st === "COMPLETE" || st === "FAILED") break;
    }
  }

  return { view: current, gapLive, cardCountLog };
}

async function runOne(bracket: 3 | 4, label: string) {
  log(`=== ${label} B${bracket} ===`);
  const started = await post({ configureAndStart: { ...COMMON, bracket } });
  const sid = started.session.sessionId;
  if (started.session.fixtureCase) throw new Error("Fixture path — abort");

  const configured = await get(sid);
  const cs0 = configured.session.councilState!;
  const powerPlan = extractPowerPlan(cs0);
  log(`${label}: power plan levers=${JSON.stringify(powerPlan.bracketPowerPlanV410?.powerLevers ?? {})}`);

  const { view, gapLive } = await runAutoBuildLoop(sid, label);
  const cs = view.session.councilState!;

  return {
    label,
    bracket,
    sessionId: sid,
    powerPlan,
    gapSnapshots: { ...extractGapAtCheckpoints(cs), ...gapLive },
    holdCourseBlocked: holdCourseBlockedExamples(cs),
    searchComparisonTelemetry: cs.searchComparisonTelemetryV410 ?? [],
    discoveryReports: cs.discoveryReports?.map((r) => ({
      bracketScoringApplied: r.bracketScoringApplied,
      searchComparisons: r.searchComparisons,
      queryCount: r.queries?.length ?? 0,
      resultCount: r.results?.length ?? 0,
    })),
    deckEvolution: {
      at25: { b3side: deckAtCount(cs, 25) },
      at50: { cards: deckAtCount(cs, 50) },
      at75: { cards: deckAtCount(cs, 75) },
    },
    deckStats: deckStats(view.session),
    headProfessor: headProfessorBlock(view.session),
    grade: view.session.deckGrade ?? null,
    checkpointDecisions: cs.councilDecisions?.filter((d) => d.decisionId?.includes("checkpoint")).map((d) => ({
      id: d.decisionId,
      decision: d.decision,
      reasoning: d.reasoning,
    })),
  };
}

function classifyDiffReason(name: string, bracket: "B3-only" | "B4-only"): string {
  const c = classifyCard(name);
  const map: Record<string, string> = {
    "game-changer-candidate": "B4 premium/GC inclusion",
    "tutor-access": "B4 tutor/access upgrade",
    acceleration: "B4 acceleration upgrade",
    interaction: "B4 interaction upgrade",
    protection: "B4 protection upgrade",
    finisher: bracket === "B4-only" ? "B4 compact win upgrade" : "B3 thematic finisher",
    "card-advantage": bracket === "B4-only" ? "B4 card velocity" : "B3 synergy/value",
    filler: "Catalog noise / filler",
    premium: "B4 premium efficiency",
    synergy: bracket === "B3-only" ? "B3 thematic/synergy inclusion" : "B4 engine piece",
  };
  return map[c] ?? "synergy difference";
}

function renderReport(b3: Awaited<ReturnType<typeof runOne>>, b4: Awaited<ReturnType<typeof runOne>>) {
  const onlyB3 = b3.deckStats.allCardNames.filter((n) => !b4.deckStats.allCardNames.includes(n));
  const onlyB4 = b4.deckStats.allCardNames.filter((n) => !b3.deckStats.allCardNames.includes(n));

  const gapOk = [25, 40, 55, 70].every((t) => b3.gapSnapshots[t] && b4.gapSnapshots[t]);
  const telemetryOk = (b3.searchComparisonTelemetry?.length ?? 0) > 0 && (b4.searchComparisonTelemetry?.length ?? 0) > 0;
  const holdBlockedOk = b3.holdCourseBlocked.length + b4.holdCourseBlocked.length > 0 ||
    [25, 40, 55, 70].some((t) => (b4.gapSnapshots[t] as { holdCourseForbidden?: boolean })?.holdCourseForbidden);
  const archDiff = onlyB3.length + onlyB4.length >= 15;
  const hpB3 = b3.headProfessor.predictedEffectiveBracket;
  const hpB4 = b4.headProfessor.predictedEffectiveBracket;
  const level1 = gapOk && telemetryOk && holdBlockedOk && archDiff;
  const level2 = hpB3 !== null && hpB4 !== null && hpB3 >= 3 && hpB4 >= 4;

  const lines: string[] = [];
  lines.push("# v4.10 Live Korvold B3/B4 A/B Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Acceptance");
  lines.push(`- LEVEL 1 Construction Controller: **${level1 ? "PASS" : "FAIL"}**`);
  lines.push(`- LEVEL 2 Product Target (HP B3-ish / B4): **${level2 ? "PASS" : "FAIL"}**`);
  if (level1 && !level2) lines.push("- Verdict: **CONSTRUCTION_CONTROL_PASS / BRACKET_TARGET_FAIL**");
  lines.push("");

  for (const run of [b3, b4]) {
    lines.push(`## ${run.label} — Power Plan (pre-cards)`);
    lines.push("### BracketPowerPlanV410 spend");
    for (const s of run.powerPlan.bracketPowerPlanV410?.spendSummary ?? []) lines.push(`- ${s}`);
    lines.push("### BracketPowerDecisionV410");
    lines.push(`- spendOn: ${run.powerPlan.bracketPowerDecisionV410?.spendOn?.join(", ") ?? "—"}`);
    lines.push(`- doNotSpendOn: ${run.powerPlan.bracketPowerDecisionV410?.doNotSpendOn?.join("; ") ?? "—"}`);
    for (const t of run.powerPlan.powerDecisionCouncilTurns ?? []) {
      lines.push(`**${t.speaker}:** ${t.message}`);
    }
    lines.push("");
  }

  for (const run of [b3, b4]) {
    lines.push(`## ${run.label} — BracketGapAnalysisV410`);
    for (const t of [25, 40, 55, 70]) {
      const g = run.gapSnapshots[t] as Record<string, unknown> | null;
      lines.push(`### ~${t} cards`);
      if (!g) { lines.push("_missing_"); continue; }
      lines.push(`- requestedBracket: B${g.requestedBracket ?? g.targetBracket}`);
      lines.push(`- predictedBracket: B${g.predictedBracket ?? g.currentlyEstimatedBracket}`);
      lines.push(`- acceleration: ${g.accelerationStatus} | tutors: ${g.tutorStatus} | cardVelocity: ${g.cardVelocityStatus}`);
      lines.push(`- interaction: ${g.interactionStatus} | protection: ${g.protectionStatus} | mana: ${g.manaQualityStatus}`);
      lines.push(`- winSpeed: ${g.winSpeedStatus} | compactness: ${g.compactnessStatus}`);
      lines.push(`- currentPowerDeficits: ${JSON.stringify(g.currentPowerDeficits)}`);
      lines.push(`- recommendedPowerLevers: ${JSON.stringify(g.recommendedPowerLevers)}`);
      lines.push(`- holdCourseForbidden: ${g.holdCourseForbidden}`);
      lines.push("");
    }
  }

  lines.push("## HOLD_COURSE blocked examples");
  for (const run of [b3, b4]) {
    lines.push(`### ${run.label}`);
    if (!run.holdCourseBlocked.length) lines.push("_none captured in conversation_");
    for (const h of run.holdCourseBlocked) lines.push(`- **${h.speaker}:** ${h.message}`);
  }
  lines.push("");

  lines.push("## Search comparison telemetry");
  for (const run of [b3, b4]) {
    lines.push(`### ${run.label}`);
    for (const comp of run.searchComparisonTelemetry.slice(0, 4)) {
      lines.push(`**Need:** ${comp.needCategory} — ${comp.queryConcept}`);
      for (const c of comp.topCandidates.slice(0, 5)) {
        lines.push(`  - ${c.name} score=${c.finalScore} bracketFit=${c.bracketPowerFit}`);
      }
    }
  }
  lines.push("");

  lines.push("## Head Professor");
  for (const run of [b3, b4]) {
    const hp = run.headProfessor;
    lines.push(`### ${run.label}`);
    lines.push(`- requestedBracket: B${hp.requestedBracket}`);
    lines.push(`- predictedEffectiveBracket: B${hp.predictedEffectiveBracket ?? "?"}`);
    lines.push(`- confidence: ${hp.confidence ?? "—"}`);
    lines.push(`- BRACKET_TARGET_MISS: ${hp.bracketTargetMiss}`);
    lines.push(`- reasons: ${hp.reasons.slice(0, 2).join(" | ") || "—"}`);
  }
  lines.push("");

  lines.push("## Side-by-side");
  lines.push(JSON.stringify({
    B3: b3.deckStats,
    B4: b4.deckStats,
    hp: { B3: b3.headProfessor.predictedEffectiveBracket, B4: b4.headProfessor.predictedEffectiveBracket },
  }, null, 2));
  lines.push("");
  lines.push("## Cards only in B3");
  for (const n of onlyB3) lines.push(`- ${n} — ${classifyDiffReason(n, "B3-only")}`);
  lines.push("## Cards only in B4");
  for (const n of onlyB4) lines.push(`- ${n} — ${classifyDiffReason(n, "B4-only")}`);
  lines.push("");
  lines.push("## Blind test");
  lines.push("Without labels, B4 should show more premium/acceleration/tutor/access and fewer filler pieces.");
  lines.push(`Unique delta: ${onlyB3.length + onlyB4.length} cards (${b3.deckStats.allCardNames.filter(n => b4.deckStats.allCardNames.includes(n)).length} overlap)`);

  return lines.join("\n");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  log("Waiting for server…");
  await waitForServer();
  log("Server ready");

  const b3 = await runOne(3, "RUN-A-B3");
  writeFileSync(resolve(OUT_DIR, "run-a-b3.json"), JSON.stringify(b3, null, 2));

  const b4 = await runOne(4, "RUN-B-B4");
  writeFileSync(resolve(OUT_DIR, "run-b-b4.json"), JSON.stringify(b4, null, 2));

  const report = renderReport(b3, b4);
  writeFileSync(resolve(OUT_DIR, "REPORT.md"), report);
  log(`Report: ${OUT_DIR}/REPORT.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
