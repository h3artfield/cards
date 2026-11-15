/**
 * Keeps building one Professor deck at a time and recording SCRIS plus the four-digit score.
 * The formula does not change as the field grows. A larger field is what makes the number comparable.
 * Fynn is recorded from the deck already on file and is not built again.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "../../lib/load-deck-resolution-catalog";
import { runSolDirectedCommanderBuild } from "../../../src/lib/deck-synthesis/professor-sol-directed-commander-build-service-v1-1-1";
import { assertProfessorSolDirectedP0Truth } from "../../../src/lib/deck-synthesis/professor-sol-directed-p0-truth-v1-1-1";
import { measureConstructedDeck } from "../../../src/lib/deck-rating/v1/score-constructed-deck-v1";
import type { DeckScoreV1 } from "../../../src/lib/deck-rating/v1/plan-score-v1";
import { PLAN_PILOT_VERSION } from "../../../src/lib/deck-rating/v1/plan-schema-v1";

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-rating/v1/plan-factory");
const STATUS_PATH = resolve(OUT_DIR, "status.json");
const FIELD_PATH = resolve(OUT_DIR, "field.json");
const PLAY_RATE_PATH = resolve(process.cwd(), "data/milestones/commander-strategy/topdeck-card-play-rate-v1.json");
const FYNN_ID = "c0b1fba1-4338-4671-934b-098689ad2085";

type ScrisV1 = {
  speed: number | null;
  consistency: number | null;
  resilience: null;
  interaction: null;
  synergy: number | null;
  resilienceReason: string;
  interactionReason: string;
};

type FieldEntry = {
  oracleId: string;
  name: string;
  buildId: string | null;
  measuredAt: string;
  winType: string | null;
  gaps: string[];
  pilot: string;
  score: DeckScoreV1;
  scris: ScrisV1;
};

type FieldFile = { schema: "plan-field-1.0"; entries: FieldEntry[] };

const RESILIENCE_REASON = "Scripted disruption is specified and not run, so resilience is not in the score.";
const INTERACTION_REASON = "The other seat does not act, so interaction is not in the score.";

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
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
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sleepSync(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* The page and the checker can hold status.json for a moment. */
  }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(OUT_DIR, { recursive: true });
  const body = JSON.stringify(value);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, body);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      renameSync(tmp, path);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY") throw err;
      sleepSync(250);
    }
  }
  writeFileSync(path, body);
  try {
    unlinkSync(tmp);
  } catch {
    /* The temporary file can stay until the next write. */
  }
}

function patchStatus(partial: Record<string, unknown>) {
  const current = readJson<Record<string, unknown>>(STATUS_PATH) ?? {};
  const activity = Array.isArray(current.activity) ? (current.activity as string[]) : [];
  const extra = Array.isArray(partial.activity) ? (partial.activity as string[]) : null;
  writeJson(STATUS_PATH, {
    ...current,
    ...partial,
    activity: extra ?? activity,
    updatedAt: new Date().toISOString(),
    stage: partial.stage ?? "factory-running",
  });
}

function loadField(): FieldFile {
  return readJson<FieldFile>(FIELD_PATH) ?? { schema: "plan-field-1.0", entries: [] };
}

function saveField(field: FieldFile) {
  writeJson(FIELD_PATH, field);
}

function seedFynn(field: FieldFile): FieldFile {
  if (field.entries.some((entry) => entry.oracleId === FYNN_ID)) return field;
  const status = readJson<{
    score?: DeckScoreV1;
    deck?: { result?: { speed?: number | null; synergy?: { score?: number } } };
  }>(STATUS_PATH);
  if (!status?.score) return field;
  field.entries.push({
    oracleId: FYNN_ID,
    name: "Fynn, the Fangbearer",
    buildId: null,
    measuredAt: new Date().toISOString(),
    winType: "poison-combat",
    gaps: [],
    pilot: PLAN_PILOT_VERSION,
    score: status.score,
    scris: {
      speed: status.deck?.result?.speed ?? null,
      consistency: status.score.planRate,
      resilience: null,
      interaction: null,
      synergy: status.deck?.result?.synergy?.score ?? null,
      resilienceReason: RESILIENCE_REASON,
      interactionReason: INTERACTION_REASON,
    },
  });
  saveField(field);
  console.log("[factory] recorded the Fynn score already on file");
  return field;
}

function playRates(): Map<string, number> {
  const artifact = readJson<{ cards?: Record<string, { rate?: number }> }>(PLAY_RATE_PATH);
  const rates = new Map<string, number>();
  for (const [oracleId, stat] of Object.entries(artifact?.cards ?? {})) {
    if (typeof stat?.rate === "number") rates.set(oracleId, stat.rate);
  }
  return rates;
}

function nextCommanders(
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  done: Set<string>,
): Array<{ oracleId: string; name: string; rate: number }> {
  const rates = playRates();
  const rows: Array<{ oracleId: string; name: string; rate: number }> = [];
  for (const card of catalog.byOracleId.values()) {
    const classification = card.commanderClassification;
    const sole = classification
      ? classification.canBeSoleCommander && classification.commanderFormatStatus === "legal" && !classification.requiresCompatiblePair
      : /\blegendary creature\b/i.test(card.typeLine) && card.legalities?.commander === "legal";
    if (!sole) continue;
    if (done.has(card.oracleId)) continue;
    rows.push({ oracleId: card.oracleId, name: card.canonicalName, rate: rates.get(card.oracleId) ?? 0 });
  }
  rows.sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));
  return rows.slice(0, 40);
}

function fieldSummary(field: FieldFile, building: string | null, queue: Array<{ name: string; oracleId: string }>) {
  return {
    measured: field.entries.length,
    building,
    recent: field.entries.slice(-8).map((entry) => ({
      name: entry.name,
      display: entry.score.display,
      speed: entry.scris.speed,
      consistency: entry.scris.consistency,
      synergy: entry.scris.synergy,
    })),
    next: queue.slice(0, 8).map((row) => row.name),
  };
}

async function main() {
  loadEnvLocal();
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");
  process.env.PROFESSOR_SOL_DIRECTED_LIVE = process.env.PROFESSOR_SOL_DIRECTED_LIVE ?? "1";
  mkdirSync(OUT_DIR, { recursive: true });
  let field = seedFynn(loadField());
  patchStatus({
    stage: "loading-catalog",
    factoryLoop: fieldSummary(field, null, []),
    activity: ["Factory is loading the card catalog."],
  });
  console.log("[factory] loading catalog");
  const catalog = await loadDeckResolutionCatalog();
  let p0 = false;
  try {
    assertProfessorSolDirectedP0Truth(catalog);
    p0 = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchStatus({ stage: "factory-running", failure: message, activity: [`Factory truth check failed: ${message}`] });
    throw err;
  }

  for (;;) {
    field = loadField();
    const done = new Set(field.entries.map((entry) => entry.oracleId));
    const queue = nextCommanders(catalog, done);
    const current = queue[0];
    if (!current) {
      patchStatus({
        stage: "factory-running",
        factoryLoop: fieldSummary(field, null, []),
        activity: ["Factory measured every sole commander in this play-rate window. It will look again shortly."],
      });
      console.log("[factory] queue empty, waiting");
      await new Promise((resolveWait) => setTimeout(resolveWait, 60_000));
      continue;
    }
    console.log(`[factory] building ${current.name}`);
    try {
      patchStatus({
        stage: "factory-running",
        failure: null,
        factoryLoop: fieldSummary(field, current.name, queue),
        queue: queue.slice(0, 12).map((row, index) => ({
          name: row.name,
          oracleId: row.oracleId,
          state: index === 0 ? "building" : "waiting",
        })),
        activity: [`Building ${current.name}.`],
      });
      const result = await runSolDirectedCommanderBuild({
        commanderOracleId: current.oracleId,
        commanderName: current.name,
        bracket: 4,
        playstyle: "balanced",
        commanderStyle: "unique",
        storeId: "plan-factory",
        storeSlug: "plan-factory",
        userId: null,
        catalog,
        p0TruthPass: p0,
        onStatus: (buildStatus) => {
          const latest = readJson<{ activity?: string[] }>(STATUS_PATH);
          patchStatus({
            stage: "factory-running",
            buildStatus,
            factoryLoop: fieldSummary(field, current.name, queue),
            activity: [...(latest?.activity ?? []), buildStatus].slice(-40),
          });
          console.log(`[factory] ${current.name} ${buildStatus}`);
        },
      });
      if (result.status !== "COMPLETE" || !result.constructedDeck) {
        throw new Error(result.failureMessage ?? result.failureCode ?? "build failed");
      }
      patchStatus({
        stage: "factory-running",
        buildId: result.buildId,
        activity: [`${current.name} is built. The Professor is handing the line to the checker.`],
      });
      const measured = await measureConstructedDeck({ catalog, deck: result.constructedDeck });
      if (measured.strategy) {
        writeJson(resolve(OUT_DIR, "strategy.json"), { model: "factory-loop", strategy: measured.strategy });
      }
      const entry: FieldEntry = {
        oracleId: current.oracleId,
        name: current.name,
        buildId: result.buildId,
        measuredAt: new Date().toISOString(),
        winType: measured.strategy?.win.type ?? null,
        gaps: measured.gaps,
        pilot: measured.played?.pilot ?? PLAN_PILOT_VERSION,
        score: measured.score,
        scris: {
          speed: measured.played?.speed ?? null,
          consistency: measured.score.planRate,
          resilience: null,
          interaction: null,
          synergy: measured.played?.synergy.score ?? null,
          resilienceReason: RESILIENCE_REASON,
          interactionReason: INTERACTION_REASON,
        },
      };
      field = loadField();
      field.entries.push(entry);
      saveField(field);
      writeJson(resolve(OUT_DIR, `${result.buildId}.json`), { entry, deck: result.constructedDeck });
      const latest = readJson<{ activity?: string[] }>(STATUS_PATH);
      patchStatus({
        stage: "factory-running",
        buildId: result.buildId,
        buildStatus: "COMPLETE",
        failure: null,
        score: measured.score,
        plan: null,
        planReason: measured.gaps.length ? measured.gaps.join(" ") : null,
        factoryLoop: fieldSummary(field, null, queue.slice(1)),
        activity: [...(latest?.activity ?? []), `${current.name} scored ${measured.score.display}`].slice(-40),
      });
      console.log(`[factory] ${current.name} scored ${measured.score.display}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[factory] ${current.name} failed: ${message}`);
      field = loadField();
      field.entries.push({
        oracleId: current.oracleId,
        name: current.name,
        buildId: null,
        measuredAt: new Date().toISOString(),
        winType: null,
        gaps: [message],
        pilot: PLAN_PILOT_VERSION,
        score: {
          schema: "plan-score-1.0",
          bracket: 4,
          w: null,
          display: "4",
          planRate: null,
          namedLineWins: null,
          trials: null,
          reason: message,
        },
        scris: {
          speed: null,
          consistency: null,
          resilience: null,
          interaction: null,
          synergy: null,
          resilienceReason: RESILIENCE_REASON,
          interactionReason: INTERACTION_REASON,
        },
      });
      saveField(field);
      patchStatus({
        stage: "factory-running",
        failure: `${current.name}: ${message}`,
        factoryLoop: fieldSummary(field, null, queue.slice(1)),
        activity: [`${current.name} was not scored: ${message}`],
      });
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[factory] ${message}`);
  process.exit(1);
});
