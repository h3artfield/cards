/**
 * How does the attainment pass behave across the bracket range?
 *
 * The single live verification proved one case: a bracket 4 request that needed
 * two Game Changers reached 4 and validated. That says nothing about how often
 * the pass fires, whether it overshoots a low request, or whether the decks it
 * touches come out looking sensible. This runs each commander at brackets 2, 3
 * and 4 with the flag on and reports, per build:
 *
 *  - the bracket the rubric measures against the bracket requested
 *  - whether the terminal validator accepted the deck
 *  - which cards the pass cut and added, so a mangled deck is visible
 *
 * Bracket 2 is included deliberately. The pass only ever adds power, so it can
 * never pull an over-powered deck back down to Core — a bracket 2 request that
 * measures 3 is a gap this pass does not address, and it should be recorded
 * rather than assumed away.
 *
 * Costs real OpenAI calls: roughly 7 minutes and up to 10 model calls per build.
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
import type { CommanderBracket } from "../src/lib/bracket-policy/bracket-policy-v1";

const RC8_PATH = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz";
const OUT_DIR = "data/milestones/deck-synthesis/bracket-attainment-v1";
const OUT_FILE = "attainment-spread-v1.json";
const STORE_SLUG = "the-game-lodge";
const COMMANDER_STYLE = "lean into what makes this commander unique";

const COMMANDERS = [
  { name: "Chatterfang, Squirrel General", playstyle: "tokens and sacrifice value" },
  { name: "Omnath, Locus of Rage", playstyle: "balanced value with meaningful interaction" },
  { name: "Kodama of the West Tree", playstyle: "balanced value with meaningful interaction" },
] as const;

const BRACKETS: CommanderBracket[] = [2, 3, 4];

type Row = {
  commander: string;
  requestedBracket: number;
  status: string;
  failureCode: string | null;
  validationPass: boolean | null;
  candidateTracePass: boolean | null;
  architectCountsPass: boolean | null;
  measuredBracket: number | null;
  measuredName: string | null;
  gameChangers: string[];
  determiningSignals: string[];
  attainmentFired: boolean;
  attainmentChanges: string[];
  ceilingFired: boolean;
  ceilingChanges: string[];
  attainmentSkipped: string[];
  nonlandCount: number | null;
  landCount: number | null;
  elapsedMs: number;
};

type OracleEntry = { oracleId: string; name: string; text: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

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
      .map((a) => a.abilitySpan?.text ?? "")
      .filter(Boolean)
      .join(" ");
    byName.set(norm(rec.canonicalName), { oracleId: rec.oracleId, name: rec.canonicalName, text });
  }
  return byName;
}

async function main(): Promise<void> {
  loadEnvLocal();
  process.env.PROFESSOR_SOL_DIRECTED_LIVE = process.env.PROFESSOR_SOL_DIRECTED_LIVE ?? "1";
  process.env.PROFESSOR_SOL_DIRECTED_GUI_ENABLED =
    process.env.PROFESSOR_SOL_DIRECTED_GUI_ENABLED ?? "true";
  process.env.PROFESSOR_SOL_DIRECTED_BRACKET_ATTAINMENT_ENABLED = "true";
  process.env.PROFESSOR_SOL_DIRECTED_BRACKET_CEILING_ENABLED =
    process.env.PROFESSOR_SOL_DIRECTED_BRACKET_CEILING_ENABLED ?? "true";

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

  // The pass reports what it did through a console warning or the activity feed,
  // neither of which comes back in the build result. Capturing console output is
  // the least invasive way to see whether it fired without threading a new
  // field through the whole build service.
  const attainmentLog: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...parts: unknown[]) => {
    const line = parts.map(String).join(" ");
    if (line.includes("[bracket-attainment]") || line.includes("[bracket-ceiling]")) {
      attainmentLog.push(line);
    }
    originalWarn(...parts);
  };

  const rows: Row[] = [];
  const onlyCommander = process.env.SPREAD_ONLY_COMMANDER?.trim().toLowerCase();
  const onlyBracket = process.env.SPREAD_ONLY_BRACKET?.trim();

  for (const commander of COMMANDERS) {
    if (onlyCommander && !commander.name.toLowerCase().includes(onlyCommander)) continue;
    for (const bracket of BRACKETS) {
      if (onlyBracket && String(bracket) !== onlyBracket) continue;

      const blueprint = resolveCommanderBlueprintFromCatalogV417({
        catalog,
        commanderName: commander.name,
      });
      console.log(`\n=== ${commander.name} @ bracket ${bracket}`);
      attainmentLog.length = 0;
      const startedAt = Date.now();

      let result: Awaited<ReturnType<typeof runSolDirectedCommanderBuild>>;
      try {
        result = await runSolDirectedCommanderBuild({
          commanderOracleId: blueprint.oracleId,
          commanderName: commander.name,
          bracket,
          playstyle: commander.playstyle,
          commanderStyle: COMMANDER_STYLE,
          storeId: store.id,
          storeSlug: STORE_SLUG,
          userId: null,
          catalog,
          p0TruthPass: true,
        });
      } catch (err) {
        console.log(`  build threw: ${err instanceof Error ? err.message : String(err)}`);
        rows.push({
          commander: commander.name,
          requestedBracket: bracket,
          status: "THREW",
          failureCode: err instanceof Error ? err.message.slice(0, 120) : null,
          validationPass: null,
          candidateTracePass: null,
          architectCountsPass: null,
          measuredBracket: null,
          measuredName: null,
          gameChangers: [],
          determiningSignals: [],
          attainmentFired: false,
          attainmentChanges: [],
          ceilingFired: false,
          ceilingChanges: [],
          attainmentSkipped: [],
          nonlandCount: null,
          landCount: null,
          elapsedMs: Date.now() - startedAt,
        });
        continue;
      }
      const elapsedMs = Date.now() - startedAt;

      const row: Row = {
        commander: commander.name,
        requestedBracket: bracket,
        status: result.status,
        failureCode: result.failureCode ?? null,
        validationPass: result.validation?.pass ?? null,
        candidateTracePass: result.validation?.candidateTracePass ?? null,
        architectCountsPass: result.validation?.architectRequirementRealization?.pass ?? null,
        measuredBracket: null,
        measuredName: null,
        gameChangers: [],
        determiningSignals: [],
        attainmentFired: false,
        attainmentChanges: [],
        ceilingFired: false,
        ceilingChanges: [],
        attainmentSkipped: [...attainmentLog],
        nonlandCount: result.constructedDeck?.nonlands.length ?? null,
        landCount: result.constructedDeck?.lands.reduce((s, l) => s + l.copies, 0) ?? null,
        elapsedMs,
      };

      if (result.constructedDeck) {
        const cards: BracketRubricCard[] = [];
        const push = (r: { name: string; copies?: number }, isCommander: boolean) => {
          const hit = oracleByName.get(norm(r.name));
          if (!hit) return;
          cards.push({
            oracleId: hit.oracleId,
            name: hit.name,
            typeLine: "",
            oracleText: hit.text,
            quantity: r.copies ?? 1,
            isCommander,
          });
        };
        push({ name: result.constructedDeck.commander.name }, true);
        for (const c of result.constructedDeck.nonlands) push(c, false);
        for (const l of result.constructedDeck.lands) push(l, false);

        const combos = await comboSummaryForDeck({ cards });
        const classified = classifyCommanderBracketV1({
          cards,
          gameChangerOracleIds: gcSet,
          combos,
        });
        row.measuredBracket = classified.assignedBracket;
        row.measuredName = classified.assignedBracketName;
        row.gameChangers =
          classified.signals
            .find((s) => s.id === "game_changers")
            ?.evidence.map((e) => e.name) ?? [];
        row.determiningSignals = classified.determiningSignals.map((s) => s.label);

        // Both passes write their changes into whyInThisDeck, so what they did
        // is identifiable from the shipped deck itself.
        row.attainmentChanges = result.constructedDeck.nonlands
          .filter(
            (c) =>
              c.whyInThisDeck?.includes("raises the deck toward bracket") ||
              c.whyInThisDeck?.includes("to reach bracket"),
          )
          .map((c) => c.name);
        row.ceilingChanges = result.constructedDeck.nonlands
          .filter((c) => c.whyInThisDeck?.includes("to keep the deck at bracket"))
          .map((c) => c.name);
        row.attainmentFired = row.attainmentChanges.length > 0;
        row.ceilingFired = row.ceilingChanges.length > 0;
      }

      console.log(
        `  status=${row.status} valid=${row.validationPass} requested=${bracket} measured=${row.measuredBracket} attained=${row.attainmentFired} trimmed=${row.ceilingFired}`,
      );
      if (row.attainmentChanges.length) console.log(`  added: ${row.attainmentChanges.join(", ")}`);
      if (row.ceilingChanges.length) console.log(`  trimmed in: ${row.ceilingChanges.join(", ")}`);
      if (row.determiningSignals.length) console.log(`  determined by: ${row.determiningSignals.join(" | ")}`);
      if (row.attainmentSkipped.length) console.log(`  ${row.attainmentSkipped.join("\n  ")}`);
      rows.push(row);
    }
  }

  console.warn = originalWarn;

  console.log(`\n${"=".repeat(96)}`);
  console.log("commander                  req  measured  valid  attain  trim  changes");
  for (const r of rows) {
    const changes = [...r.attainmentChanges, ...r.ceilingChanges].join(", ") || "-";
    console.log(
      `${r.commander.slice(0, 24).padEnd(24)}  ${String(r.requestedBracket).padStart(3)}  ${String(r.measuredBracket ?? "-").padStart(8)}  ${String(r.validationPass ?? "-").padStart(5)}  ${String(r.attainmentFired).padStart(6)}  ${String(r.ceilingFired).padStart(4)}  ${changes}`,
    );
  }

  const completed = rows.filter((r) => r.measuredBracket !== null);
  const shortfall = completed.reduce(
    (sum, r) => sum + Math.max(0, r.requestedBracket - (r.measuredBracket ?? 0)),
    0,
  );
  const overshoot = completed.reduce(
    (sum, r) => sum + Math.max(0, (r.measuredBracket ?? 0) - r.requestedBracket),
    0,
  );
  const onTarget = completed.filter((r) => r.measuredBracket === r.requestedBracket).length;
  console.log(`\ncompleted builds:   ${completed.length}/${rows.length}`);
  console.log(`validator accepted: ${rows.filter((r) => r.validationPass === true).length}`);
  console.log(`exactly on target:  ${onTarget}/${completed.length}`);
  console.log(`attainment fired:   ${rows.filter((r) => r.attainmentFired).length}`);
  console.log(`ceiling fired:      ${rows.filter((r) => r.ceilingFired).length}`);
  console.log(
    `mean shortfall:     ${(shortfall / (completed.length || 1)).toFixed(2)}  (requested above measured)`,
  );
  console.log(
    `mean overshoot:     ${(overshoot / (completed.length || 1)).toFixed(2)}  (measured above requested)`,
  );

  mkdirSync(resolve(process.cwd(), OUT_DIR), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), OUT_DIR, OUT_FILE),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
  );
  console.log(`\nwrote ${OUT_DIR}/${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
