import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import {
  loadRc8OracleTextByName,
  normalizeCardNameKey,
} from "@/lib/card-oracle-text/rc8-oracle-text-index";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import {
  loadStoreStockIndex,
  suggestSwapsForCard,
} from "@/lib/deck-swap/v1/suggest-swaps-server";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import type { BracketRubricCard, CommanderBracket } from "@/lib/commander-bracket-rubric/v1";
import type { SwapRankBy, SwapStock } from "@/lib/deck-swap/v1";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = (await req.json()) as {
      commander?: string;
      commanderColorIdentity?: string[];
      cards?: Array<{ name?: string; copies?: number }>;
      swapOut?: string;
      rankBy?: SwapRankBy;
      requireInStock?: boolean;
      maxPriceUsd?: number | null;
      maxBracket?: number | null;
    };

    const commanderName = (body.commander ?? "").trim();
    const swapOut = (body.swapOut ?? "").trim();
    const requested = Array.isArray(body.cards) ? body.cards : [];
    if (!commanderName || !swapOut || requested.length === 0) {
      return jsonOk({ suggestions: [], rejected: [], unresolved: [] });
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
      if (name) push(name, card.copies ?? 1, false);
    }

    const outgoing = cards.find(
      (card) => normalizeCardNameKey(card.name) === normalizeCardNameKey(swapOut),
    );
    if (!outgoing) {
      return jsonOk({
        suggestions: [],
        rejected: [],
        unresolved,
        error: `"${swapOut}" could not be read from the decklist.`,
      });
    }

    // Stock is best-effort: a swap list is still useful without prices, so a
    // store lookup failure must not fail the request.
    let stockByOracleId: Map<string, SwapStock> | undefined;
    try {
      const store = await resolveStoreBySlug(slug);
      if (store) {
        stockByOracleId = await loadStoreStockIndex({ storeId: store.id, storeSlug: slug });
      }
    } catch {
      stockByOracleId = undefined;
    }

    const result = await suggestSwapsForCard({
      deck: cards,
      outgoingOracleId: outgoing.oracleId,
      gameChangerOracleIds: gameChangerOracleIdSet(loadCommanderGameChangerSnapshot()),
      constraints: {
        commanderColorIdentity: body.commanderColorIdentity ?? [],
        maxBracket: (body.maxBracket ?? null) as CommanderBracket | null,
        requireInStock: body.requireInStock ?? false,
        maxPriceUsd: body.maxPriceUsd ?? null,
      },
      stockByOracleId,
      rankBy: body.rankBy ?? "play_rate",
      suggestionLimit: 8,
    });

    return jsonOk({ ...result, unresolved, stockAvailable: Boolean(stockByOracleId) });
  } catch (err) {
    return handleRouteError(err);
  }
}
