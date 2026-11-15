/**
 * B5 win reachability and B5 W composition (policy v2.2).
 *
 * Reachable = all cards + commanders available, unlimited finite mana,
 * resolveWin finds a lethal plan. B5 field statistics use reachable decks
 * only; a B5 deck with no reachable win has W withheld. B2–B4 are combat
 * decks for which "no combo win" is normal, so this applies to B5 only.
 */
import { emptyMana, resolveWin, type GraphCard } from "./goldfish-resource-graph-v2";
import { speedConsistencyW, type GoldfishSimCard, type GoldfishSimResult } from "./goldfish-sim-v1";
import type { SpellbookIndex } from "./goldfish-spellbook-index-v2";
import { DR_W_WITHHELD_NO_REACHABLE_WIN } from "./publish";

export const DR_B5_REACHABILITY_V2_2 = "deck-rating-goldfish-b5-reachability-v2.2";

const USEFUL = new Set([
  "WIN",
  "INF_MANA",
  "INF_STORM",
  "DRAW_LIBRARY",
  "LIBRARY_EMPTY",
  "INF_CAST",
  "INF_DRAW",
  "INF_DAMAGE_EACH_OPP",
  "INF_LIFELOSS_EACH_OPP",
  "INF_MILL_EACH_OPP",
]);

export function deckWinReachable(cards: GoldfishSimCard[], index: SpellbookIndex): { win: boolean; line: string | null } {
  const graph: GraphCard[] = cards.map((c, i) => ({
    instanceId: `H:${i}:${c.oracleId}`,
    oracleId: c.oracleId,
    name: c.name,
    cmc: c.cmc,
    zone: c.isCommander ? "C" : "H",
    isCommander: c.isCommander,
    typeLine: c.typeLine,
    text: c.text,
    power: c.power,
    producedMana: c.producedMana,
    manaCost: c.manaCost,
    colors: c.colors,
  }));
  const mana = emptyMana();
  mana.total = 99;
  mana.any = 99;
  mana.W = 20;
  mana.U = 20;
  mana.B = 20;
  mana.R = 20;
  mana.G = 20;
  mana.C = 20;
  const deckIds = new Set(cards.map((c) => c.oracleId));
  const variants = index.variants
    .filter((v) => v.uses.every((u) => !u.oracleId || deckIds.has(u.oracleId)))
    .filter((v) => v.uses.length <= 4 && v.tokens.some((t) => USEFUL.has(t.kind)))
    .slice(0, 64);
  const plan = resolveWin({
    cards: graph,
    mana,
    libraryCount: 99,
    variants,
    templateSatisfied: (tid) => {
      const tpl = index.templates.get(tid);
      return Boolean(tpl?.oracleIds.some((id) => deckIds.has(id)));
    },
  });
  return { win: Boolean(plan), line: plan?.line ?? null };
}

export type B5FieldRow = Pick<GoldfishSimResult, "rmst15" | "iqr"> & { reachable: boolean };

export type BandW =
  | { withheld: false; W: number; speedPct: number; consistencyPct: number; fieldN: number; fieldExcluded: number }
  | { withheld: true; W: null; reason: string; fieldN: number; fieldExcluded: number };

/** Speed/consistency W; for band 5 the field is reachable-only and unreachable decks are withheld. */
export function composeBandW(
  band: 2 | 3 | 4 | 5,
  deck: GoldfishSimResult,
  deckReachable: boolean,
  field: B5FieldRow[],
): BandW {
  const use = band === 5 ? field.filter((r) => r.reachable) : field;
  const excluded = field.length - use.length;
  if (band === 5 && !deckReachable) {
    return { withheld: true, W: null, reason: DR_W_WITHHELD_NO_REACHABLE_WIN, fieldN: use.length, fieldExcluded: excluded };
  }
  const w = speedConsistencyW(deck, use as GoldfishSimResult[]);
  return { withheld: false, W: w.W, speedPct: w.speedPct, consistencyPct: w.consistencyPct, fieldN: use.length, fieldExcluded: excluded };
}
