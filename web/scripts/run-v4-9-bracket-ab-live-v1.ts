/**
 * Live v4.9 Bracket A/B — B3 vs B4 through Professor brew API (same path as UI).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadCommanderGameChangerSnapshot, gameChangerOracleIdSet } from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { buildProfessorCouncilTranscriptV4 } from "../src/lib/deck-synthesis/professor-council-transcript-v4-v1";
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
const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-9-bracket-ab-live");

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
const GC_NAME_PATTERNS = /sol ring|mana crypt|dockside|thassa's oracle|cyclonic rift|force of will|force of negation|fierce guardianship|deflecting swat|deadly rollick|smothering tithe|rhystic study|mystic remora|necropotence|ad nauseam|demonic tutor|vampiric tutor|imperial seal|gamble|enlightened tutor|worldly tutor|mystical tutor|finale of devastation|craterhoof behemoth|underworld breach|seedborn muse|sylvan library|phyrexian arena|consecrated sphinx|teferi's protection|counterspell|swan song|mystical tutor|vampiric tutor|demonic tutor|enlightened tutor|worldly tutor|mystical tutor|gamble|imperial seal|necropotence|ad nauseam|thassa's oracle|dockside extortionist|mana vault|grim monolith|chrome mox|mox diamond|jeweled lotus|lotus petal|ancient tomb|city of traitors|cabal ritual|dark ritual|ritual|seething song|pyretic ritual|desperate ritual|rain of filth|tainted pact|doomsday|thoracle|consultation|thassa's oracle|underworld breach|brain freeze|isochron scepter|dramatic reversal|kiki-jiki|splinter twin|pestermite|deceiver exarch|intruder alarm|hushwing griff|grand abolisher|silence|autumn's veil|deflecting swat|deadly rollick|fierce guardianship|force of will|force of negation|pact of negation|flusterstorm|swan song|counterspell|mystical dispute|dispel|delay|mana drain|force of negation|force of will|fierce guardianship|deflecting swat|deadly rollick|smothering tithe|rhystic study|mystic remora|necropotence|ad nauseam|demonic tutor|vampiric tutor|imperial seal|gamble|enlightened tutor|worldly tutor|mystical tutor|finale of devastation|craterhoof behemoth|underworld breach|seedborn muse|sylvan library|phyrexian arena|consecrated sphinx|teferi's protection/i;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

async function waitForServer(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${BASE}/api/store/${SLUG}/professor/brew`, { signal: AbortSignal.timeout(5000) });
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
  const res = await fetch(`${API}?sessionId=${encodeURIComponent(sessionId)}`, {
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `GET failed ${res.status}`);
  return data as BrewSessionViewV42;
}

function defaultForkId(session: BrewSessionViewV42["session"]): string {
  return session.workingDeckTheory?.userDirectionForks?.[0]?.forkId ?? "fork-a";
}

async function runAutoBuildLoop(sid: string, label: string, onProgress?: (view: BrewSessionViewV42) => void) {
  let current = await get(sid);
  const session0 = current.session;
  if (session0.fixtureCase) {
    throw new Error(
      `${label}: ${session0.commanderName} hit fixtureCase=${session0.fixtureCase}. Meren/Chatterfang use offline replay — pick a non-fixture commander for v4.9 live council.`,
    );
  }
  if (!session0.councilState) {
    throw new Error(`${label}: councilState missing after configure — live council path did not activate`);
  }
  log(`${label}: council active — ${session0.councilState.selectedCards.length} cards, phase=${session0.councilState.buildPhase}`);

  await post({ sessionId: sid, action: { type: "SET_LIVE_STATUS", status: `${label}: building deck…` } });
  await sleep(400);

  const snapshotsCaptured: Record<number, unknown> = {};
  const targets = [25, 50, 75];

  for (let pass = 0; pass < 100; pass++) {
    const session = current.session;
    onProgress?.(current);

    for (const t of targets) {
      const cs = session.councilState;
      if (!cs || snapshotsCaptured[t]) continue;
      const count = cs.selectedCards?.length ?? 0;
      if (count >= t) {
        const snap = cs.snapshots?.find((s: { cardCount: number }) => s.cardCount >= t) ?? cs.snapshots?.[cs.snapshots.length - 1];
        snapshotsCaptured[t] = snap?.bracketGapAnalysis ?? null;
        log(`${label}: captured gap analysis at ~${t} cards (${count} selected)`);
      }
    }

    if (session.autoBuildComplete) break;

    if (session.discoveryInterrupt) {
      current = await post({ sessionId: sid, action: { type: "DISCOVERY_CHOICE", choiceId: "explore" } });
      await sleep(600);
      continue;
    }

    if (session.phase === "USER_FORK") {
      current = await post({ sessionId: sid, action: { type: "USER_FORK", forkId: defaultForkId(session) } });
      await sleep(600);
      continue;
    }

    const deckDone = session.fixtureCase
      ? session.deckListRevealCount >= session.deckList.length
      : !professorBrewShouldContinueAutoBuildV47(session);
    const treeDone = session.fixtureCase
      ? session.treeRevealStep >= BREW_TREE_MAX_REVEAL_STEP_V42 || session.phase === "COMPLETE"
      : (session.councilState?.selectedCards.length ?? 0) >= COMMANDER_DECK_LIBRARY_SIZE_V47;
    if (deckDone && treeDone) break;
    if (!session.workingDeckTheory) throw new Error(`${label}: missing deck theory`);

    current = await post({ sessionId: sid, action: { type: "ADVANCE_TREE" } });
    const n = current.session.councilState?.selectedCards.length ?? 0;
    if (pass % 5 === 0 || n >= 25) log(`${label}: pass ${pass + 1} — ${n} library cards — ${current.session.liveStatus ?? ""}`);
    await sleep(1200);
  }

  await post({ sessionId: sid, action: { type: "SET_LIVE_STATUS", status: null } });
  current = await get(sid);

  if (professorBrewNeedsManaBaseV48(current.session)) {
    log(`${label}: RUN_MANA_BASE`);
    current = await post({ sessionId: sid, action: { type: "RUN_MANA_BASE" } });
  }

  if (professorBrewNeedsFinalReviewV48(current.session)) {
    log(`${label}: RUN_FINAL_REVIEW (Head Professor — may take several minutes)`);
    current = await post({ sessionId: sid, action: { type: "RUN_FINAL_REVIEW" } });
    for (let i = 0; i < 450; i++) {
      await sleep(4000);
      current = await get(sid);
      const status = current.session.finalDeckDoctor?.status;
      log(`${label}: final review poll ${i + 1} — ${status ?? "pending"} — ${current.session.liveStatus ?? ""}`);
      if (status === "COMPLETE" || status === "FAILED") break;
    }
  }

  return { view: current, snapshotsCaptured };
}

function extractBracketStrategy(session: BrewSessionViewV42["session"]) {
  const cs = session.councilState;
  if (!cs) return null;
  const preBuild = cs.conversation?.filter((t: { phase: string }) => t.phase === "PRE_BUILD") ?? [];
  const decision = cs.councilDecisions?.find((d: { decisionId: string }) => d.decisionId === "dec-bracket-strategy");
  return {
    bracketBuildPlan: cs.bracketBuildPlan ?? null,
    preBuildTurns: preBuild.map((t: { speaker: string; message: string }) => ({ speaker: t.speaker, message: t.message })),
    decision: decision ?? null,
  };
}

function basicLandCounts(cards: { name: string }[]) {
  const basics = ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes", "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest"];
  const counts: Record<string, number> = {};
  for (const c of cards) {
    if (basics.includes(c.name)) counts[c.name] = (counts[c.name] ?? 0) + 1;
  }
  return counts;
}

function deckStats(session: BrewSessionViewV42["session"]) {
  const cs = session.councilState;
  const cards = cs?.selectedCards ?? [];
  const names = cards.map((c: { name: string }) => c.name);
  const lands = cards.filter((c: { category?: string; name: string }) => c.category === "land" || /\bland\b/i.test(c.name));
  const nonlands = cards.filter((c: { category?: string; name: string }) => !lands.includes(c));
  const avgMv =
    nonlands.length > 0
      ? nonlands.reduce((s: number, c: { manaValue?: number }) => s + (c.manaValue ?? 0), 0) / nonlands.length
      : 0;
  const ramp = cards.filter((c: { roles?: string[] }) => c.roles?.includes("ramp")).length;
  const interaction = cards.filter((c: { roles?: string[] }) => c.roles?.includes("interaction")).length;
  const protection = cards.filter((c: { roles?: string[] }) => c.roles?.includes("protection")).length;
  const draw = cards.filter((c: { roles?: string[] }) => c.roles?.includes("card-advantage")).length;
  const finishers = cards.filter((c: { roles?: string[] }) => c.roles?.includes("finisher")).length;
  const tutors = names.filter((n) => /tutor|diabolic|demonic|vampiric|imperial seal|gamble|worldly|enlightened|mystical|personal tutor|recruiter|survival of the fittest|finale of devastation|fabricate|merchant scroll|muddle the mixture|wishclaw|spellseeker|tribute mage|isochron scepter/i.test(n)).length;
  const gcs = cards.filter((c: { oracleId?: string | null; name: string }) => (c.oracleId && GC_ORACLE_IDS.has(c.oracleId)) || GC_NAME_PATTERNS.test(c.name));
  const lastSnap = cs?.snapshots?.[cs.snapshots.length - 1];
  return {
    landCount: lands.length,
    nonlandCount: nonlands.length,
    avgManaValue: Math.round(avgMv * 100) / 100,
    ramp,
    tutors,
    interaction,
    protection,
    cardAdvantage: draw,
    finishers,
    gameChangers: gcs.map((c: { name: string }) => c.name),
    basicLandCounts: basicLandCounts(cards),
    lastGap: lastSnap?.bracketGapAnalysis ?? null,
    allCardNames: names,
  };
}

function discoverySummary(session: BrewSessionViewV42["session"]) {
  const reports = session.councilState?.discoveryReports ?? [];
  return reports.map((r: { queries: { conceptText: string }[]; results: { name: string; score: number; reason: string }[] }, i: number) => ({
    batch: i + 1,
    queries: r.queries?.map((q) => q.conceptText) ?? [],
    topResults: (r.results ?? [])
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => ({ name: x.name, score: x.score, reason: x.reason?.slice(0, 120) })),
  }));
}

function headProfessorSummary(session: BrewSessionViewV42["session"]) {
  const hp = session.finalDeckDoctor?.headProfessorReview;
  const err = session.finalDeckDoctor?.headProfessorError ?? "";
  const miss = err.includes("Bracket target miss") || session.councilState?.buildPhase === "BRACKET_REFINEMENT";
  return {
    requestedBracket: session.bracket,
    headProfessorPredictedBracket: hp?.predictedEffectiveBracket ?? null,
    bracketAssessment: hp?.bracketAssessment ?? null,
    keyImprovements: hp?.keyImprovements ?? [],
    bracketTargetMiss: miss,
    buildPhase: session.councilState?.buildPhase ?? null,
    status: session.finalDeckDoctor?.status ?? null,
    error: err || null,
  };
}

async function runOne(bracket: 3 | 4, label: string) {
  log(`=== Starting ${label} (B${bracket}) ===`);
  const started = await post({ configureAndStart: { ...COMMON, bracket } });
  const sid = started.session.sessionId;
  log(`${label}: sessionId=${sid}`);

  // configureAndStart includes live creative pass — refresh for full councilState
  const configured = await get(sid);
  const strategy = extractBracketStrategy(configured.session);
  log(`${label}: BRACKET_STRATEGY captured (${strategy?.preBuildTurns.length ?? 0} PRE_BUILD turns)`);

  const { view, snapshotsCaptured } = await runAutoBuildLoop(sid, label);
  const grade = view.session.deckGrade ?? null;

  return {
    label,
    bracket,
    sessionId: sid,
    bracketStrategy: strategy,
    gapSnapshots: snapshotsCaptured,
    discovery: discoverySummary(view.session),
    deckStats: deckStats(view.session),
    headProfessor: headProfessorSummary(view.session),
    grade,
    councilTranscript: buildProfessorCouncilTranscriptV4({
      councilState: view.session.councilState ?? null,
      loopResult: view.session.loopResult ?? null,
      theory: view.session.workingDeckTheory ?? null,
      professorLines: view.session.professorLines ?? [],
    }),
  };
}

function compareRuns(b3: Awaited<ReturnType<typeof runOne>>, b4: Awaited<ReturnType<typeof runOne>>) {
  const onlyB3 = b3.deckStats.allCardNames.filter((n) => !b4.deckStats.allCardNames.includes(n));
  const onlyB4 = b4.deckStats.allCardNames.filter((n) => !b3.deckStats.allCardNames.includes(n));
  return {
    onlyB3,
    onlyB4,
    overlap: b3.deckStats.allCardNames.filter((n) => b4.deckStats.allCardNames.includes(n)).length,
    sideBySide: {
      landCount: { B3: b3.deckStats.landCount, B4: b4.deckStats.landCount },
      avgManaValue: { B3: b3.deckStats.avgManaValue, B4: b4.deckStats.avgManaValue },
      ramp: { B3: b3.deckStats.ramp, B4: b4.deckStats.ramp },
      tutors: { B3: b3.deckStats.tutors, B4: b4.deckStats.tutors },
      gameChangers: { B3: b3.deckStats.gameChangers, B4: b4.deckStats.gameChangers },
      interaction: { B3: b3.deckStats.interaction, B4: b4.deckStats.interaction },
      protection: { B3: b3.deckStats.protection, B4: b4.deckStats.protection },
      cardAdvantage: { B3: b3.deckStats.cardAdvantage, B4: b4.deckStats.cardAdvantage },
      finishers: { B3: b3.deckStats.finishers, B4: b4.deckStats.finishers },
      basicLandCounts: { B3: b3.deckStats.basicLandCounts, B4: b4.deckStats.basicLandCounts },
      finalEffectiveBracket: {
        B3: b3.headProfessor.headProfessorPredictedBracket,
        B4: b4.headProfessor.headProfessorPredictedBracket,
      },
      grade: { B3: b3.grade, B4: b4.grade },
    },
  };
}

function renderMarkdown(b3: Awaited<ReturnType<typeof runOne>>, b4: Awaited<ReturnType<typeof runOne>>, cmp: ReturnType<typeof compareRuns>) {
  const lines: string[] = [];
  lines.push("# v4.9 Live Bracket A/B Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Setup (identical except bracket)");
  lines.push(`- Commander: ${COMMON.commanderName} *(non-fixture — Meren/Chatterfang force offline replay and skip v4.9 live council)*`);
  lines.push(`- Play style: ${COMMON.archetypeIntent}`);
  lines.push(`- Commander dependence: ${COMMON.relationshipIntent}`);
  lines.push("- Combo / novelty / budget: **not exposed in current Professor setup UI** (only archetype + relationship + bracket)");
  lines.push(`- RUN A: B3 — session \`${b3.sessionId}\``);
  lines.push(`- RUN B: B4 — session \`${b4.sessionId}\``);
  lines.push("");

  for (const run of [b3, b4]) {
    lines.push(`## ${run.label} — BRACKET_STRATEGY`);
    for (const t of run.bracketStrategy?.preBuildTurns ?? []) {
      lines.push(`**${t.speaker}:** ${t.message}`);
      lines.push("");
    }
    if (run.bracketStrategy?.bracketBuildPlan) {
      const p = run.bracketStrategy.bracketBuildPlan;
      lines.push("**Power plan:**");
      for (const l of p.powerPlanSummary ?? []) lines.push(`- ${l}`);
      lines.push("");
    }
  }

  for (const run of [b3, b4]) {
    lines.push(`## ${run.label} — BracketGapAnalysis checkpoints`);
    for (const [cardCount, gap] of Object.entries(run.gapSnapshots)) {
      lines.push(`### ~${cardCount} cards`);
      if (!gap) {
        lines.push("_No gap analysis captured_");
        continue;
      }
      const g = gap as Record<string, unknown>;
      lines.push(`- requestedBracket: B${g.targetBracket}`);
      lines.push(`- predictedEffectiveBracket: B${g.currentlyEstimatedBracket}`);
      lines.push(`- speedGap: ${g.speedGap} | consistencyGap: ${g.consistencyGap} | manaGap: ${g.manaGap}`);
      lines.push(`- tutorGap: ${g.tutorGap} | interactionGap: ${g.interactionGap} | protectionGap: ${g.protectionGap}`);
      lines.push(`- winConditionGap: ${g.winConditionGap} | gameChangerUsage: ${g.gameChangerUsage}`);
      lines.push(`- recommendedPowerLevers: ${(g.recommendedPowerLevers as string[])?.join(", ") ?? "—"}`);
      lines.push(`- checkpointQuestion: ${g.checkpointQuestion}`);
      lines.push("");
    }
  }

  lines.push("## Candidate search comparison");
  lines.push("### B3 top discovery results (by batch)");
  for (const d of b3.discovery) {
    lines.push(`Batch ${d.batch} queries: ${d.queries.slice(0, 3).join(" | ")}`);
    for (const r of d.topResults.slice(0, 5)) lines.push(`  - ${r.name} (score ${r.score}) — ${r.reason}`);
  }
  lines.push("");
  lines.push("### B4 top discovery results (by batch)");
  for (const d of b4.discovery) {
    lines.push(`Batch ${d.batch} queries: ${d.queries.slice(0, 3).join(" | ")}`);
    for (const r of d.topResults.slice(0, 5)) lines.push(`  - ${r.name} (score ${r.score}) — ${r.reason}`);
  }
  lines.push("");

  lines.push("## Head Professor");
  for (const run of [b3, b4]) {
    lines.push(`### ${run.label}`);
    lines.push(`- requestedBracket: B${run.headProfessor.requestedBracket}`);
    lines.push(`- headProfessorPredictedBracket: B${run.headProfessor.headProfessorPredictedBracket ?? "?"}`);
    lines.push(`- bracketAssessment: ${run.headProfessor.bracketAssessment ?? "—"}`);
    lines.push(`- BRACKET_TARGET_MISS: ${run.headProfessor.bracketTargetMiss ? "YES" : "NO"}`);
    lines.push(`- status: ${run.headProfessor.status}`);
  }
  lines.push("");

  lines.push("## Mana regression (basic lands)");
  lines.push(`- B3 basic counts: ${JSON.stringify(cmp.sideBySide.basicLandCounts.B3)}`);
  lines.push(`- B4 basic counts: ${JSON.stringify(cmp.sideBySide.basicLandCounts.B4)}`);
  lines.push("");

  lines.push("## Final side-by-side");
  lines.push(JSON.stringify(cmp.sideBySide, null, 2));
  lines.push("");
  lines.push("## Cards only in B3");
  lines.push(onlyList(cmp.onlyB3));
  lines.push("");
  lines.push("## Cards only in B4");
  lines.push(onlyList(cmp.onlyB4));
  lines.push("");
  lines.push("## Primary acceptance");
  const diffCount = cmp.onlyB3.length + cmp.onlyB4.length;
  lines.push(`- Unique card delta: ${diffCount} cards differ between lists (${cmp.overlap} overlap)`);
  lines.push(`- B4 GC count: ${b4.deckStats.gameChangers.length} vs B3: ${b3.deckStats.gameChangers.length}`);
  lines.push(`- B4 ramp: ${b4.deckStats.ramp} vs B3: ${b3.deckStats.ramp}`);
  return lines.join("\n");
}

function onlyList(names: string[]) {
  return names.length ? names.map((n) => `- ${n}`).join("\n") : "_none_";
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  log(`Waiting for server at ${BASE}…`);
  await waitForServer();
  log("Server ready");

  const b3 = await runOne(3, "RUN-A-B3");
  writeFileSync(resolve(OUT_DIR, "run-a-b3.json"), JSON.stringify(b3, null, 2));

  const b4 = await runOne(4, "RUN-B-B4");
  writeFileSync(resolve(OUT_DIR, "run-b-b4.json"), JSON.stringify(b4, null, 2));

  const cmp = compareRuns(b3, b4);
  writeFileSync(resolve(OUT_DIR, "comparison.json"), JSON.stringify(cmp, null, 2));

  const md = renderMarkdown(b3, b4, cmp);
  writeFileSync(resolve(OUT_DIR, "REPORT.md"), md);
  log(`Report written to ${OUT_DIR}/REPORT.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
