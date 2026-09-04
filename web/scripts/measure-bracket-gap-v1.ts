/**
 * A/B measurement — does the requested bracket actually move the bracket the
 * rubric measures once bracket-aware power ranking is on?
 *
 * Runs the live Sol-directed build twice per commander, once with
 * PROFESSOR_SOL_DIRECTED_BRACKET_POWER_RANKING_ENABLED off and once on, then
 * classifies each finished deck with the deterministic bracket rubric. The
 * commander inputs match the earlier speed-test requests so the "off" arm is
 * comparable to the baseline gap we measured before.
 *
 * Costs real OpenAI calls: up to MAX_MODEL_CALLS (10) per build.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveCommanderBlueprintFromCatalogV417 } from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { runSolDirectedCommanderBuild } from "../src/lib/deck-synthesis/professor-sol-directed-commander-build-service-v1-1-1";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { classifyCommanderBracketV1 } from "../src/lib/commander-bracket-rubric/v1";
import { comboSummaryForDeck } from "../src/lib/commander-bracket-rubric/v1/combos-server";
import type { BracketRubricCard } from "../src/lib/commander-bracket-rubric/v1";
import type { SolDirectedConstructedDeckV11 } from "../src/lib/deck-synthesis/professor-sol-directed-types-v1-1";

const RC8_PATH = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz";
const OUT_DIR = "data/milestones/deck-synthesis/bracket-power-ranking-v1";
const STORE_SLUG = "the-game-lodge";

const SPECS = [
  {
    commanderName: "Chatterfang, Squirrel General",
    bracket: 3,
    playstyle: "tokens and sacrifice value",
  },
  {
    commanderName: "Omnath, Locus of Rage",
    bracket: 4,
    playstyle: "balanced value with meaningful interaction",
  },
  {
    commanderName: "Kodama of the West Tree",
    bracket: 4,
    playstyle: "balanced value with meaningful interaction",
  },
] as const;

const COMMANDER_STYLE = "lean into what makes this commander unique";

type OracleEntry = { oracleId: string; name: string; text: string };

type ArmOutcome = {
  arm: "off" | "on";
  status: string;
  validationPass: boolean | null;
  failureCode: string | null;
  assignedBracket: number | null;
  gameChangerCount: number | null;
  determiningSignals: string[];
  unresolvedCards: number | null;
  totalCombos: number | null;
  twoCardCombos: number | null;
  elapsedMs: number;
};

function loadEnvLocal(): void {
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

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The rubric's detectors read names and oracle text only, so RC8 suffices. */
async function loadOracleTextIndex(): Promise<Map<string, OracleEntry>> {
  const byName = new Map<string, OracleEntry>();
  const rl = createInterface({
    input: createReadStream(resolve(process.cwd(), RC8_PATH)).pipe(createGunzip()),
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      oracleId?: string;
      canonicalName?: string;
      semantic?: { abilities?: Array<{ abilitySpan?: { text?: string } }> };
    };
    if (!rec.oracleId || !rec.canonicalName) continue;
    const text = (rec.semantic?.abilities ?? [])
      .map((ability) => ability.abilitySpan?.text ?? "")
      .filter(Boolean)
      .join(" ");
    byName.set(normalize(rec.canonicalName), { oracleId: rec.oracleId, name: rec.canonicalName, text });
  }
  return byName;
}

function rubricCards(
  deck: SolDirectedConstructedDeckV11,
  oracleByName: Map<string, OracleEntry>,
): { cards: BracketRubricCard[]; unresolved: number } {
  const cards: BracketRubricCard[] = [];
  let unresolved = 0;

  const push = (row: { name: string; copies?: number }, isCommander: boolean) => {
    const hit = oracleByName.get(normalize(row.name));
    if (!hit) {
      unresolved += 1;
      return;
    }
    cards.push({
      oracleId: hit.oracleId,
      name: hit.name,
      typeLine: "",
      oracleText: hit.text,
      quantity: row.copies ?? 1,
      isCommander,
    });
  };

  push({ name: deck.commander.name }, true);
  for (const row of deck.nonlands ?? []) push(row, false);
  for (const row of deck.lands ?? []) push(row, false);
  return { cards, unresolved };
}

async function runArm(args: {
  arm: "off" | "on";
  spec: (typeof SPECS)[number];
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>;
  storeId: string;
  oracleByName: Map<string, OracleEntry>;
  gcSet: ReadonlySet<string>;
}): Promise<ArmOutcome> {
  // Read at build time, so flipping it between runs in one process is enough.
  process.env.PROFESSOR_SOL_DIRECTED_BRACKET_POWER_RANKING_ENABLED =
    args.arm === "on" ? "true" : "false";

  const blueprint = resolveCommanderBlueprintFromCatalogV417({
    catalog: args.catalog,
    commanderName: args.spec.commanderName,
  });

  const startedAt = Date.now();
  const result = await runSolDirectedCommanderBuild({
    commanderOracleId: blueprint.oracleId,
    commanderName: args.spec.commanderName,
    bracket: args.spec.bracket,
    playstyle: args.spec.playstyle,
    commanderStyle: COMMANDER_STYLE,
    storeId: args.storeId,
    storeSlug: STORE_SLUG,
    userId: null,
    catalog: args.catalog,
    p0TruthPass: true,
  });
  const elapsedMs = Date.now() - startedAt;

  const base: ArmOutcome = {
    arm: args.arm,
    status: result.status,
    validationPass: result.validation?.pass ?? null,
    failureCode: result.failureCode ?? null,
    assignedBracket: null,
    gameChangerCount: null,
    determiningSignals: [],
    unresolvedCards: null,
    totalCombos: null,
    twoCardCombos: null,
    elapsedMs,
  };

  if (!result.constructedDeck) return base;

  const { cards, unresolved } = rubricCards(result.constructedDeck, args.oracleByName);
  const combos = await comboSummaryForDeck({ cards });
  const classified = classifyCommanderBracketV1({
    cards,
    gameChangerOracleIds: args.gcSet,
    combos,
  });
  const gcSignal = classified.signals.find((signal) => signal.id === "game_changers");

  return {
    ...base,
    assignedBracket: classified.assignedBracket,
    gameChangerCount: gcSignal?.count ?? 0,
    determiningSignals: classified.determiningSignals.map((signal) => signal.label),
    unresolvedCards: unresolved,
    totalCombos: combos.totalCombos,
    twoCardCombos: combos.twoCardCombos,
  };
}

async function main(): Promise<void> {
  loadEnvLocal();
  process.env.PROFESSOR_SOL_DIRECTED_LIVE = process.env.PROFESSOR_SOL_DIRECTED_LIVE ?? "1";
  process.env.PROFESSOR_SOL_DIRECTED_GUI_ENABLED =
    process.env.PROFESSOR_SOL_DIRECTED_GUI_ENABLED ?? "true";

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY required — this measurement runs real builds.");
  }

  const { resolveStoreBySlug } = await import("../src/lib/deck-builder/deck-builder-service");
  const store = await resolveStoreBySlug(STORE_SLUG);
  if (!store) throw new Error(`Store ${STORE_SLUG} not found`);

  const [catalog, oracleByName] = await Promise.all([
    loadDeckResolutionCatalog(),
    loadOracleTextIndex(),
  ]);
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  console.log(`${oracleByName.size} cards indexed; ${gcSet.size} Game Changers\n`);

  const rows: Array<{
    commanderName: string;
    requestedBracket: number;
    arms: ArmOutcome[];
  }> = [];

  // Model calls time out occasionally, so allow re-running a single cell
  // instead of paying for the whole grid again.
  const onlyCommander = process.env.BRACKET_GAP_ONLY_COMMANDER?.trim().toLowerCase();
  const onlyArm = process.env.BRACKET_GAP_ONLY_ARM?.trim().toLowerCase();
  const specs = onlyCommander
    ? SPECS.filter((spec) => spec.commanderName.toLowerCase().includes(onlyCommander))
    : SPECS;
  const armsToRun = (["off", "on"] as const).filter((arm) => !onlyArm || arm === onlyArm);
  if (specs.length === 0) throw new Error(`No commander matched ${onlyCommander}`);

  for (const spec of specs) {
    const arms: ArmOutcome[] = [];
    for (const arm of armsToRun) {
      console.log(`--- ${spec.commanderName} (requested ${spec.bracket}) — power ranking ${arm}`);
      try {
        const outcome = await runArm({ arm, spec, catalog, storeId: store.id, oracleByName, gcSet });
        arms.push(outcome);
        console.log(
          `    status=${outcome.status} assigned=${outcome.assignedBracket ?? "-"} ` +
            `gameChangers=${outcome.gameChangerCount ?? "-"} combos=${outcome.totalCombos ?? "-"} ` +
            `${(outcome.elapsedMs / 1000).toFixed(0)}s`,
        );
        if (outcome.failureCode) console.log(`    failure: ${outcome.failureCode}`);
      } catch (err) {
        console.log(`    threw: ${err instanceof Error ? err.message : String(err)}`);
        arms.push({
          arm,
          status: "THREW",
          validationPass: null,
          failureCode: err instanceof Error ? err.message : String(err),
          assignedBracket: null,
          gameChangerCount: null,
          determiningSignals: [],
          unresolvedCards: null,
          totalCombos: null,
          twoCardCombos: null,
          elapsedMs: 0,
        });
      }
    }
    rows.push({ commanderName: spec.commanderName, requestedBracket: spec.bracket, arms });
    console.log("");
  }

  console.log("=========== bracket gap: requested vs measured ===========");
  console.log("commander                        req  off   on   gc off/on");
  for (const row of rows) {
    const off = row.arms.find((a) => a.arm === "off");
    const on = row.arms.find((a) => a.arm === "on");
    console.log(
      `${row.commanderName.slice(0, 32).padEnd(32)} ${String(row.requestedBracket).padStart(3)} ` +
        `${String(off?.assignedBracket ?? "-").padStart(4)} ${String(on?.assignedBracket ?? "-").padStart(4)}   ` +
        `${off?.gameChangerCount ?? "-"}/${on?.gameChangerCount ?? "-"}`,
    );
  }

  const gapOf = (arm: ArmOutcome | undefined, requested: number): number | null =>
    arm?.assignedBracket == null ? null : requested - arm.assignedBracket;
  const gaps = rows.map((row) => ({
    commanderName: row.commanderName,
    off: gapOf(
      row.arms.find((a) => a.arm === "off"),
      row.requestedBracket,
    ),
    on: gapOf(
      row.arms.find((a) => a.arm === "on"),
      row.requestedBracket,
    ),
  }));
  const measured = gaps.filter((g) => g.off != null && g.on != null);
  if (measured.length > 0) {
    const meanOff = measured.reduce((s, g) => s + (g.off ?? 0), 0) / measured.length;
    const meanOn = measured.reduce((s, g) => s + (g.on ?? 0), 0) / measured.length;
    console.log(
      `\nmean shortfall (requested - measured): off ${meanOff.toFixed(2)} → on ${meanOn.toFixed(2)} ` +
        `across ${measured.length} commander(s)`,
    );
  }

  mkdirSync(resolve(process.cwd(), OUT_DIR), { recursive: true });
  const suffix = onlyCommander || onlyArm ? `-${onlyCommander ?? "all"}-${onlyArm ?? "all"}` : "";
  const outPath = resolve(process.cwd(), OUT_DIR, `bracket-gap-ab-v1${suffix}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      { measuredAt: new Date().toISOString(), commanderStyle: COMMANDER_STYLE, rows, gaps },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
