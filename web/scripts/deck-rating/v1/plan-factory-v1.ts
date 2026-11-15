/**
 * One commander at a time: Professor builds the deck, then the checker plays the plan.
 * The queue starts with Fynn. The next commander is not started from here.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "../../lib/load-deck-resolution-catalog";
import { normalizeOracleName } from "../../../src/lib/deck-builder/golden-catalog/normalize-name";
import type { GoldenCatalogOracleCard } from "../../../src/lib/deck-builder/golden-catalog/schemas";
import { runSolDirectedCommanderBuild } from "../../../src/lib/deck-synthesis/professor-sol-directed-commander-build-service-v1-1-1";
import { assertProfessorSolDirectedP0Truth } from "../../../src/lib/deck-synthesis/professor-sol-directed-p0-truth-v1-1-1";
import { planFromBuiltDeck } from "../../../src/lib/deck-rating/v1/plan-from-built-deck-v1";
import { runPlanChecker } from "../../../src/lib/deck-rating/v1/plan-checker-v1";
import type { PlanCardV1, WinPlanV1 } from "../../../src/lib/deck-rating/v1/plan-schema-v1";
import type { PlanCheckResultV1 } from "../../../src/lib/deck-rating/v1/plan-checker-v1";

const FYNN = {
  oracleId: "c0b1fba1-4338-4671-934b-098689ad2085",
  name: "Fynn, the Fangbearer",
  bracket: 4,
  playstyle: "balanced",
  commanderStyle: "unique",
};

const OUT_DIR = resolve(process.cwd(), "data/milestones/deck-rating/v1/plan-factory");

type FactoryStatus = {
  factory: "plan-factory-1.0.0";
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
  deck: {
    title: string;
    note: string;
    cards: PlanCardV1[];
    commanders: PlanCardV1[];
    plan: WinPlanV1;
    result: PlanCheckResultV1;
  } | null;
};

const status: FactoryStatus = {
  factory: "plan-factory-1.0.0",
  updatedAt: new Date().toISOString(),
  note: "Play is one silent opponent. Ten poison removes that one seat. It is not a four-player win.",
  queue: [{ name: FYNN.name, oracleId: FYNN.oracleId, state: "building" }],
  stage: "starting",
  buildId: null,
  buildStatus: null,
  activity: [],
  failure: null,
  plan: null,
  planReason: null,
  deck: null,
};

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

function publish(patch: Partial<FactoryStatus>) {
  Object.assign(status, patch, { updatedAt: new Date().toISOString() });
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(OUT_DIR, "status.json");
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(status));
  renameSync(tmp, path);
  console.log(`[factory] ${status.stage}${status.buildStatus ? ` · ${status.buildStatus}` : ""}`);
}

function powerOf(card: GoldenCatalogOracleCard): number {
  const raw = card.cardFaces?.[0]?.power ?? "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function toPlanCard(card: GoldenCatalogOracleCard, quantity: number): PlanCardV1 {
  return {
    oracleId: card.oracleId,
    name: card.canonicalName,
    cmc: card.manaValue ?? card.cmc ?? 0,
    power: powerOf(card),
    typeLine: card.typeLine ?? "",
    text: card.oracleText ?? card.cardFaces?.map((face) => face.oracleText ?? "").join("\n") ?? "",
    quantity,
  };
}

async function main() {
  loadEnvLocal();
  process.env.PROFESSOR_SOL_DIRECTED_LIVE = process.env.PROFESSOR_SOL_DIRECTED_LIVE ?? "1";
  publish({ stage: "loading-catalog", activity: ["Loading the card catalog."] });
  const catalog = await loadDeckResolutionCatalog();
  let p0 = false;
  try {
    assertProfessorSolDirectedP0Truth(catalog);
    p0 = true;
    publish({ activity: [...status.activity, "Professor truth check passed."] });
  } catch (err) {
    publish({
      stage: "failed",
      failure: err instanceof Error ? err.message : String(err),
      queue: [{ name: FYNN.name, oracleId: FYNN.oracleId, state: "failed" }],
    });
    process.exitCode = 1;
    return;
  }

  const result = await runSolDirectedCommanderBuild({
    commanderOracleId: FYNN.oracleId,
    commanderName: FYNN.name,
    bracket: FYNN.bracket,
    playstyle: FYNN.playstyle,
    commanderStyle: FYNN.commanderStyle,
    storeId: "plan-factory",
    storeSlug: "plan-factory",
    userId: null,
    catalog,
    p0TruthPass: p0,
    onStatus: (buildStatus) => {
      publish({
        stage: "building",
        buildId: status.buildId,
        buildStatus,
        activity: [...status.activity, buildStatus].slice(-40),
      });
    },
  });

  publish({
    buildId: result.buildId,
    buildStatus: result.status,
    activity: [...status.activity, `build ${result.status}`].slice(-40),
  });

  if (result.status !== "COMPLETE" || !result.constructedDeck) {
    publish({
      stage: "failed",
      failure: result.failureMessage ?? result.failureCode ?? "build failed",
      queue: [{ name: FYNN.name, oracleId: FYNN.oracleId, state: "failed" }],
    });
    process.exitCode = 1;
    return;
  }

  publish({ stage: "writing-plan" });
  const deck = result.constructedDeck;
  const commanderOracle = catalog.byOracleId.get(deck.commander.oracleId);
  const commander = commanderOracle
    ? toPlanCard(commanderOracle, 1)
    : {
        oracleId: deck.commander.oracleId,
        name: deck.commander.name,
        cmc: deck.commander.manaValue ?? 0,
        power: 0,
        typeLine: "Legendary Creature",
        text: deck.commander.oracleText ?? "",
        quantity: 1,
      };
  const cards: PlanCardV1[] = [];
  for (const land of deck.lands) {
    const hits = catalog.byNormalizedName.get(normalizeOracleName(land.name)) ?? [];
    const row = hits[0];
    if (!row) continue;
    cards.push(toPlanCard(row, land.copies));
  }
  for (const card of deck.nonlands) {
    const row = catalog.byOracleId.get(card.oracleId);
    if (!row) continue;
    cards.push(toPlanCard(row, 1));
  }

  const named = planFromBuiltDeck({ commander, cards });
  if (!named.plan) {
    publish({
      stage: "plan-unwritten",
      planReason: named.reason,
      queue: [{ name: FYNN.name, oracleId: FYNN.oracleId, state: "built" }],
      activity: [...status.activity, named.reason],
    });
    return;
  }

  publish({ stage: "playing", plan: named.plan, planReason: null });
  const played = runPlanChecker({
    cards,
    commanders: [commander],
    plan: named.plan,
    comboDb: "none",
  });
  publish({
    stage: "done",
    queue: [{ name: FYNN.name, oracleId: FYNN.oracleId, state: "played" }],
    deck: {
      title: FYNN.name,
      note: "Professor built this deck. The checker then played the poison plan against one silent opponent.",
      cards,
      commanders: [commander],
      plan: named.plan,
      result: played,
    },
    activity: [
      ...status.activity,
      `played ${played.successes} of ${played.trials}, speed ${played.speed ?? "empty"}`,
    ].slice(-40),
  });
  writeFileSync(resolve(OUT_DIR, `${result.buildId}.json`), JSON.stringify(status, null, 2));
}

main().catch((err) => {
  publish({
    stage: "failed",
    failure: err instanceof Error ? err.message : String(err),
    queue: [{ name: FYNN.name, oracleId: FYNN.oracleId, state: "failed" }],
  });
  console.error(err);
  process.exitCode = 1;
});
