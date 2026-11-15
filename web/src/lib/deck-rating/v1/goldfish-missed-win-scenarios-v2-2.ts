/**
 * Fixed-hand scenarios captured from v2.1 missed-win / planner-disagreement
 * states (fixtures/goldfish-missed-win-scenarios-v2-2.json). Each replays the
 * captured hand, battlefield, graveyard, library order and commanders as the
 * next turn and must finish with no missed win and no invariant violation.
 */
import { classifyGoldfishCard, playGoldfishFromOpening, type GoldfishSimCard } from "./goldfish-sim-v1";
import type { CompiledVariant } from "./goldfish-resource-graph-v2";

export type MissedWinFixture = {
  version: string;
  decks: Record<
    string,
    {
      commander: string;
      cards: Array<Parameters<typeof classifyGoldfishCard>[0]>;
      variants: CompiledVariant[];
      templates: Record<string, string[]>;
    }
  >;
  scenarios: Array<{
    id: string;
    deckId: string;
    commander: string;
    seed: number;
    v21Turn: number;
    v21Kind: string;
    v21Target: string | null;
    hand: string[];
    battlefield: string[];
    grave: string[];
    libraryBottomFirst: string[];
    commanders: string[];
  }>;
};

export type MissedWinScenarioResult = {
  id: string;
  commander: string;
  v21Kind: string;
  ok: boolean;
  tWin: number | null;
  tFirst: number;
  line: string;
  missedWin: boolean;
  invariantA: number;
  invariantB: number;
  detail: string;
};

export function runMissedWinScenarioFixtures(fx: MissedWinFixture): MissedWinScenarioResult[] {
  const out: MissedWinScenarioResult[] = [];
  for (const s of fx.scenarios) {
    const deck = fx.decks[s.deckId];
    if (!deck) continue;
    const byId = new Map<string, GoldfishSimCard>(deck.cards.map((c) => [c.oracleId, classifyGoldfishCard(c)]));
    const get = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is GoldfishSimCard => Boolean(c));
    const library = get(s.libraryBottomFirst);
    const hand = get(s.hand);
    if (library.length) hand.push(library.pop()!);
    const play = playGoldfishFromOpening({
      hand,
      library,
      battlefield: get(s.battlefield),
      grave: get(s.grave),
      commanders: get(s.commanders),
      variants: deck.variants,
      templateSatisfied: (tid, _names, ids) => (deck.templates[String(tid)] ?? []).some((id) => ids.has(id)),
      traceId: s.id,
    });
    const ok = play.invariants.a === 0 && play.invariants.b === 0 && !play.missedWin;
    out.push({
      id: s.id,
      commander: s.commander,
      v21Kind: s.v21Kind,
      ok,
      tWin: play.tWin,
      tFirst: play.tFirst,
      line: play.line,
      missedWin: play.missedWin,
      invariantA: play.invariants.a,
      invariantB: play.invariants.b,
      detail: ok ? "" : play.log.filter((l) => /INVARIANT|missed-win|target=/.test(l)).slice(0, 12).join(" | "),
    });
  }
  return out;
}
