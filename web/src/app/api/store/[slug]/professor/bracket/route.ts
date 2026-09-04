import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import {
  loadRc8OracleTextByName,
  normalizeCardNameKey,
} from "@/lib/card-oracle-text/rc8-oracle-text-index";
import { classifyCommanderBracketV1 } from "@/lib/commander-bracket-rubric/v1";
import { comboSummaryForDeck } from "@/lib/commander-bracket-rubric/v1/combos-server";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import type { BracketRubricCard } from "@/lib/commander-bracket-rubric/v1";

export const maxDuration = 60;

type BracketRequestCard = { name?: string; copies?: number };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await params;
    const body = (await req.json()) as {
      commander?: string;
      cards?: BracketRequestCard[];
    };

    const commanderName = (body.commander ?? "").trim();
    const requested = Array.isArray(body.cards) ? body.cards : [];
    if (!commanderName || requested.length === 0) {
      return jsonOk({ bracket: null, unresolved: [] });
    }

    const byName = await loadRc8OracleTextByName();
    const cards: BracketRubricCard[] = [];
    const unresolved: string[] = [];

    const push = (name: string, copies: number, isCommander: boolean) => {
      const entry = byName.get(normalizeCardNameKey(name));
      if (!entry) {
        unresolved.push(name);
        return;
      }
      cards.push({
        oracleId: entry.oracleId,
        name: entry.name,
        typeLine: "",
        oracleText: entry.oracleText,
        quantity: copies,
        isCommander,
      });
    };

    push(commanderName, 1, true);
    for (const card of requested) {
      const name = (card.name ?? "").trim();
      if (!name) continue;
      push(name, card.copies ?? 1, false);
    }

    if (cards.length === 0) return jsonOk({ bracket: null, unresolved });

    const combos = await comboSummaryForDeck({ cards });
    const bracket = classifyCommanderBracketV1({
      cards,
      gameChangerOracleIds: gameChangerOracleIdSet(loadCommanderGameChangerSnapshot()),
      combos,
    });

    return jsonOk({ bracket, unresolved });
  } catch (err) {
    return handleRouteError(err);
  }
}
