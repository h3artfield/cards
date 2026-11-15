/**
 * Stays up and scores a deck only from a Professor strategy file.
 * It does not invent a plan, and it does not ask the Professor to build another commander.
 * A new deck dropped in the inbox is scored the same way once strategy.json is present.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildExecutionReport, type ExecutionReportV1 } from "../../../src/lib/deck-rating/v1/execution-report-v1";
import { measurePlanBracket } from "../../../src/lib/deck-rating/v1/plan-bracket-v1";
import { deckScoreFromPlan, type DeckScoreV1 } from "../../../src/lib/deck-rating/v1/plan-score-v1";
import { runPlanChecker, type PlanCheckResultV1 } from "../../../src/lib/deck-rating/v1/plan-checker-v1";
import type { ProfessorStrategyV1 } from "../../../src/lib/deck-rating/v1/professor-strategy-v1";
import { verifyProfessorStrategy } from "../../../src/lib/deck-rating/v1/professor-strategy-verify-v1";
import { PLAN_PILOT_VERSION, type PlanCardV1, type WinPlanV1 } from "../../../src/lib/deck-rating/v1/plan-schema-v1";

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-rating/v1/plan-factory");
const INBOX = resolve(OUT_DIR, "inbox");
const STATUS_PATH = resolve(OUT_DIR, "status.json");
const WATCHER_PATH = resolve(OUT_DIR, "watcher.json");

type SavedDeck = {
  title: string;
  note: string;
  cards: PlanCardV1[];
  commanders: PlanCardV1[];
  plan: WinPlanV1;
  result: PlanCheckResultV1;
};

type FactoryStatus = {
  factory: string;
  updatedAt: string;
  note: string;
  queue: Array<{ name: string; oracleId: string; state: string }>;
  stage: string;
  buildId: string | null;
  buildStatus: string | null;
  activity: string[];
  failure: string | null;
  plan: WinPlanV1 | null;
  planReason: string | null;
  execution: ExecutionReportV1 | null;
  score: DeckScoreV1 | null;
  deck: SavedDeck | null;
};

let lastKey = "";

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readStatus(): FactoryStatus | null {
  if (!existsSync(STATUS_PATH)) return null;
  return JSON.parse(readFileSync(STATUS_PATH, "utf8")) as FactoryStatus;
}

function sleepSync(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* Windows can lock status.json while the page is reading it. */
  }
}

function publish(status: FactoryStatus) {
  mkdirSync(OUT_DIR, { recursive: true });
  const tmp = `${STATUS_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }));
  let last: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      renameSync(tmp, STATUS_PATH);
      return;
    } catch (err) {
      last = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY") throw err;
      sleepSync(100 * (attempt + 1));
    }
  }
  throw last;
}

function beat(deckTitle: string | null, speed: number | null) {
  writeFileSync(
    WATCHER_PATH,
    JSON.stringify({
      running: true,
      pid: process.pid,
      beatAt: new Date().toISOString(),
      deckTitle,
      speed,
    }),
  );
}

function cardStamp(card: PlanCardV1): string {
  let hash = 0;
  const text = card.text ?? "";
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) | 0;
  return `${card.oracleId}:${card.quantity}:${card.cmc}:${card.power}:${hash}`;
}

function strategyStamp(): string {
  const path = resolve(OUT_DIR, "strategy.json");
  if (!existsSync(path)) return "no-strategy";
  const text = readFileSync(path, "utf8");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) | 0;
  return String(hash);
}

function deckKey(deck: SavedDeck): string {
  const commanders = deck.commanders.map(cardStamp).sort().join(",");
  const cards = deck.cards.map(cardStamp).sort().join("|");
  return `${PLAN_PILOT_VERSION}#${strategyStamp()}#${commanders}#${cards}`;
}

function histogram(result: PlanCheckResultV1): string {
  const counts = new Map<string, number>();
  for (const trial of result.trialsDetail) {
    const key = trial.winTurn == null ? "miss" : String(trial.winTurn);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([turn, count]) => `${turn}:${count}`)
    .join(" ");
}

async function score(status: FactoryStatus, deck: SavedDeck) {
  const commander = deck.commanders[0];
  if (!commander) return;
  const strategyPath = resolve(OUT_DIR, "strategy.json");
  if (!existsSync(strategyPath)) {
    beat(deck.title, deck.result?.speed ?? null);
    console.log("[checker] waiting for a Professor strategy");
    return;
  }
  const saved = JSON.parse(readFileSync(strategyPath, "utf8")) as { strategy: ProfessorStrategyV1; model?: string };
  const verified = verifyProfessorStrategy({ strategy: saved.strategy, commander, cards: deck.cards });
  const execution = buildExecutionReport({
    strategy: saved.strategy,
    verified,
    model: saved.model ?? null,
  });
  const bracket = await measurePlanBracket(deck.commanders, deck.cards);
  if (!verified.accepted || !verified.plan) {
    const withheld = deckScoreFromPlan({ bracket, accepted: false, gap: verified.gaps.join(" ") });
    publish({
      ...status,
      stage: "strategy-gap",
      plan: null,
      planReason: verified.gaps.join(" "),
      failure: null,
      execution: { ...execution, played: null },
      score: withheld,
      activity: [...status.activity, "Professor strategy was not verified"].slice(-40),
    });
    beat(deck.title, null);
    writeFileSync(resolve(OUT_DIR, "execution-report.json"), JSON.stringify(execution, null, 2));
    console.log(`[checker] strategy gap: ${verified.gaps.join(" | ")}`);
    return;
  }
  const played = runPlanChecker({
    cards: deck.cards,
    commanders: deck.commanders,
    plan: verified.plan,
    comboDb: "none",
  });
  const report = buildExecutionReport({
    strategy: saved.strategy,
    verified,
    model: saved.model ?? null,
    trials: played.trialsDetail,
    speed: played.speed,
    consistency: played.consistency,
    successes: played.successes,
  });
  const rated = deckScoreFromPlan({
    bracket,
    accepted: true,
    trials: played.trialsDetail,
    requiredNames: saved.strategy.win.requiredCards,
    commanderName: commander.name,
  });
  const line = `professor strategy, speed ${played.speed ?? "empty"}, score ${rated.display}, ${histogram(played)}`;
  const next: FactoryStatus = {
    ...status,
    stage: "watching",
    plan: verified.plan,
    planReason: null,
    failure: null,
    execution: report,
    score: rated,
    queue: [{ name: commander.name, oracleId: commander.oracleId, state: "played" }],
    activity: [...status.activity, line].slice(-40),
    deck: {
      ...deck,
      title: commander.name,
      note: `${saved.strategy.win.summary} ${saved.strategy.win.howTheyWin}`,
      plan: verified.plan,
      result: played,
    },
  };
  publish(next);
  writeFileSync(resolve(OUT_DIR, "execution-report.json"), JSON.stringify(report, null, 2));
  if (status.buildId) writeFileSync(resolve(OUT_DIR, `${status.buildId}.json`), JSON.stringify(next, null, 2));
  beat(commander.name, played.speed);
  console.log(`[checker] ${line}`);
}

async function takeInbox(status: FactoryStatus): Promise<boolean> {
  if (!existsSync(INBOX)) return false;
  const file = readdirSync(INBOX).find((name) => name.endsWith(".json"));
  if (!file) return false;
  const path = resolve(INBOX, file);
  const body = JSON.parse(readFileSync(path, "utf8")) as SavedDeck;
  if (!Array.isArray(body.cards) || !Array.isArray(body.commanders)) {
    renameSync(path, resolve(INBOX, "done", file));
    return false;
  }
  const deck: SavedDeck = {
    title: body.title || body.commanders[0]?.name || "Inbox deck",
    note: body.note ?? "",
    cards: body.cards,
    commanders: body.commanders,
    plan: body.plan,
    result: body.result,
  };
  lastKey = deckKey(deck);
  await score({ ...status, activity: [...status.activity, `inbox ${file}`].slice(-40) }, deck);
  mkdirSync(resolve(INBOX, "done"), { recursive: true });
  renameSync(path, resolve(INBOX, "done", file));
  return true;
}

let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const status = readStatus();
    beat(status?.deck?.title ?? null, status?.deck?.result?.speed ?? null);
    if (!status?.deck) return;
    if (["building", "playing", "loading-catalog", "writing-plan", "starting", "requesting-strategy", "factory-running"].includes(status.stage)) return;
    if (await takeInbox(status)) return;
    const key = deckKey(status.deck);
    const settled = status.stage === "watching" || status.stage === "strategy-gap";
    if (key === lastKey && settled) return;
    await score(status, status.deck);
    lastKey = key;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[checker] ${message}`);
  } finally {
    ticking = false;
  }
}

function main() {
  mkdirSync(INBOX, { recursive: true });
  if (existsSync(WATCHER_PATH)) {
    const previous = JSON.parse(readFileSync(WATCHER_PATH, "utf8")) as { pid?: number };
    if (previous.pid && previous.pid !== process.pid && pidAlive(previous.pid)) {
      console.log(`[checker] already running as pid ${previous.pid}`);
      return;
    }
  }
  console.log(`[checker] watching ${OUT_DIR}`);
  tick();
  setInterval(tick, 5000);
}

main();
