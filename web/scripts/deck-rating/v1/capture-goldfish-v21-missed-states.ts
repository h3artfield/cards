#!/usr/bin/env npx tsx
/**
 * Replays the v2.1 B5 reference traces (seeds 1–3) on a frozen copy of the
 * v2.1 engine (DR_V21_ENGINE_DIR, with STATE dumps added) and writes every
 * missed-win / dist=0-with-missing / unused-tutor state as a fixed-hand
 * scenario fixture for goldfish-sim-v1.selftest.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { snapshotRoot } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";
import { loadFrozenGoldfishIndex } from "./load-goldfish-policy-index";
import { loadFieldDecks, type FieldDeck } from "./load-field-decks-v2";
import { buildableVariantsForDeck } from "../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2";

const REF_NAMES = [
  "Kraum, Ludevic's Opus / Tymna the Weaver",
  "Kinnan, Bonder Prodigy",
  "Rograkh, Son of Rohgahh / Thrasios, Triton Hero",
  "Rograkh, Son of Rohgahh / Silas Renn, Seeker Adept",
  "Sisay, Weatherlight Captain",
  "Thrasios, Triton Hero / Tymna the Weaver",
  "Etali, Primal Conqueror // Etali, Primal Sickness",
  "Ral, Monsoon Mage // Ral, Leyline Prodigy",
  "Dargo, the Shipwrecker / Tymna the Weaver",
  "Kefka, Court Mage // Kefka, Ruler of Ruin",
];
const SEEDS = [1, 2, 3];
const OUT = join(__dirname, "../../../src/lib/deck-rating/v1/fixtures/goldfish-missed-win-scenarios-v2-2.json");

type State = {
  turn: number;
  kind: string;
  target?: string;
  mana: number;
  hand: string[];
  bf: string[];
  grave: string[];
  lib: string[];
  cmd: string[];
  libraryExiled: boolean;
};

async function main() {
  const engineDir = process.env.DR_V21_ENGINE_DIR;
  if (!engineDir) throw new Error("set DR_V21_ENGINE_DIR to the frozen v2.1 deck-rating/v1 copy");
  const old = (await import(pathToFileURL(join(engineDir, "goldfish-sim-v1.ts")).href)) as typeof import("../../../src/lib/deck-rating/v1/goldfish-sim-v1");
  const snap = snapshotRoot();
  const oracle = await loadSnapshotOracleNameMap(snap);
  const index = await loadFrozenGoldfishIndex(snap);
  const bands = await loadFieldDecks(oracle);
  const byCmd = new Map<string, FieldDeck>();
  for (const d of bands.B5 ?? []) if (!byCmd.has(d.commander)) byCmd.set(d.commander, d);

  const decks: Record<string, { commander: string; cards: unknown[]; variants: unknown[]; templates: Record<string, string[]> }> = {};
  const scenarios: Array<Record<string, unknown>> = [];
  for (const name of REF_NAMES) {
    const deck = byCmd.get(name);
    if (!deck) continue;
    const cmdIds = new Set(deck.commanderIds);
    const cardInputs = deck.oracleIds
      .map((id) => ({ id, info: oracle.byId.get(id) }))
      .filter((x) => x.info)
      .map(({ id, info }) => ({
        oracleId: id,
        name: info!.name,
        typeLine: info!.typeLine,
        text: info!.text,
        cmc: info!.cmc,
        power: info!.power,
        isCommander: cmdIds.has(id),
      }));
    const cards = cardInputs.map((c) => old.classifyGoldfishCard(c));
    const deckIds = new Set(deck.oracleIds);
    const useful = new Set(["WIN", "INF_MANA", "INF_STORM", "DRAW_LIBRARY", "LIBRARY_EMPTY", "INF_CAST", "INF_DRAW", "INF_DAMAGE_EACH_OPP", "INF_LIFELOSS_EACH_OPP", "INF_MILL_EACH_OPP"]);
    const variants = buildableVariantsForDeck(index, deckIds)
      .filter((v) => v.uses.length <= 4 && v.tokens.some((t) => useful.has(t.kind)))
      .sort((a, b) => Number(b.terminal) - Number(a.terminal) || a.uses.length - b.uses.length)
      .slice(0, 48);
    const templates: Record<string, string[]> = {};
    for (const v of variants) {
      for (const tid of v.templateIds) {
        const tpl = index.templates.get(tid);
        templates[String(tid)] = (tpl?.oracleIds ?? []).filter((id) => deckIds.has(id));
      }
    }
    decks[deck.id] = { commander: name, cards: cardInputs, variants, templates };
    for (const seed of SEEDS) {
      const sim = old.simulateGoldfish({ cards, games: 1, traces: 1, seed, diagnostics: true, spellbook: index });
      const log = sim.traces?.[0]?.log ?? [];
      const seen = new Set<string>();
      for (const line of log) {
        if (!line.startsWith("STATE ")) continue;
        const s = JSON.parse(line.slice(6)) as State;
        const kind = s.kind.startsWith("dist0-missing0") ? "dist0-missing0" : s.kind.startsWith("dist0") ? "dist0-missing" : s.kind;
        if (seen.has(kind)) continue;
        seen.add(kind);
        scenarios.push({
          id: `${name.split(/[,/]/)[0]!.trim()}-seed${seed}-T${s.turn}-${kind}`,
          deckId: deck.id,
          commander: name,
          seed,
          v21Turn: s.turn,
          v21Kind: kind,
          v21Target: s.target ?? null,
          v21Mana: s.mana,
          v21TFirst: sim.traces?.[0]?.tFirst ?? null,
          hand: s.hand,
          battlefield: s.bf,
          grave: s.grave,
          libraryBottomFirst: s.lib,
          commanders: s.cmd,
          libraryExiled: s.libraryExiled,
        });
      }
      console.log(`${name} seed=${seed} tFirst=${sim.traces?.[0]?.tFirst} states=${seen.size}`);
    }
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        version: "goldfish-missed-win-scenarios-v2-2",
        source: "v2.1 engine replay of B5 reference traces (seeds 1–3), frozen copy with STATE dumps",
        replay: "state at end of the failing v2.1 turn, replayed as the next turn (top library card drawn)",
        decks,
        scenarios,
      },
      null,
      0,
    ),
  );
  console.log(`wrote ${scenarios.length} scenarios → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
