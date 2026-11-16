import { tidy } from "./format";
import { cardsToMoveAnswer } from "./tools/cards-to-move";
import { findCardAnswer } from "./tools/find-card";
import { shelfPerformanceAnswer } from "./tools/shelf-performance";
import { storeCreditAnswer } from "./tools/store-credit";
import type {
  ShopAnswer,
  ShopArgsResult,
  ShopFinishArg,
  ShopTool,
  ShopToolArgs,
  ShopToolContext,
  ShopToolData,
  ShopToolId,
} from "./types";

/**
 * The menu the chooser picks from. Arguments arrive from a model (or the
 * keyword fallback), so every validator treats its input as untrusted: wrong
 * shapes are rejected, unknown keys are ignored, and nothing here can widen
 * what a tool reads. The store always comes from the session, never from here.
 */

export const NAME_ARG_MIN = 2;
export const NAME_ARG_MAX = 80;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function nameArg(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = tidy(raw);
  return name.length >= NAME_ARG_MIN && name.length <= NAME_ARG_MAX ? name : null;
}

function finishArg(raw: unknown): ShopFinishArg | undefined {
  return raw === "foil" || raw === "nonfoil" ? raw : undefined;
}

const noArgs = (): ShopArgsResult<Record<string, never>> => ({ ok: true, args: {} });

const cardsToMove: ShopTool<"cards_to_move"> = {
  id: "cards_to_move",
  describe:
    "Cards that a price change has put in the wrong place and that staff should re-shelve.",
  sensitive: false,
  needs: ["inventory"],
  validateArgs: noArgs,
  run: (_args, data, ctx) => cardsToMoveAnswer(data.inventory, ctx.now),
};

const shelfPerformance: ShopTool<"shelf_performance"> = {
  id: "shelf_performance",
  describe:
    "Which case shelves or binders sell slowest or fastest. " +
    'Args: rank "slowest" or "fastest"; optional kind "case", "binder" or "any"; optional limit 1 to 5.',
  sensitive: false,
  needs: ["inventory"],
  validateArgs(raw) {
    const input = asRecord(raw);
    if (input.rank !== "slowest" && input.rank !== "fastest") {
      return { ok: false, error: 'rank must be "slowest" or "fastest"' };
    }
    const kind = input.kind === "case" || input.kind === "binder" ? input.kind : "any";
    const asked = typeof input.limit === "number" && Number.isFinite(input.limit) ? input.limit : 3;
    const limit = Math.min(5, Math.max(1, Math.trunc(asked)));
    return { ok: true, args: { rank: input.rank, kind, limit } };
  },
  run: (args, data, ctx) => shelfPerformanceAnswer(data.inventory, args, ctx.now),
};

const findCard: ShopTool<"find_card"> = {
  id: "find_card",
  describe:
    "Whether a named card is in stock: how many copies, which printings, where on the shelf. " +
    'Args: name (the card name as typed); optional finish "foil" or "nonfoil".',
  sensitive: false,
  needs: ["inventory"],
  validateArgs(raw) {
    const input = asRecord(raw);
    const name = nameArg(input.name);
    if (!name) {
      return { ok: false, error: `name must be ${NAME_ARG_MIN} to ${NAME_ARG_MAX} characters` };
    }
    const finish = finishArg(input.finish);
    return { ok: true, args: finish ? { name, finish } : { name } };
  },
  run: (args, data, ctx) => findCardAnswer(data.inventory, args, ctx.now),
};

const storeCredit: ShopTool<"store_credit"> = {
  id: "store_credit",
  describe: "Which customers hold store credit (trade credit) and how much.",
  sensitive: true,
  needs: ["customers", "creditEntries"],
  validateArgs: noArgs,
  run: (_args, data, ctx) =>
    storeCreditAnswer(data.storeId, data.creditEntries, data.customers, ctx.now),
};

/** One member per tool id, each keeping its own argument type. */
export type AnyShopTool = { [Id in ShopToolId]: ShopTool<Id> }[ShopToolId];

/**
 * Tools that are built. `sales_summary` and `buy_estimate` join in step 2;
 * until then the chooser is not offered them and `runShopTool` refuses them.
 */
const SHOP_TOOLS: ReadonlyArray<AnyShopTool> = [
  cardsToMove,
  shelfPerformance,
  findCard,
  storeCredit,
];

export function listShopTools(): ReadonlyArray<AnyShopTool> {
  return SHOP_TOOLS;
}

export function getShopTool(id: unknown): AnyShopTool | undefined {
  return typeof id === "string" ? SHOP_TOOLS.find((tool) => tool.id === id) : undefined;
}

export type ShopToolRun =
  | { ok: true; tool: ShopToolId; sensitive: boolean; answer: ShopAnswer }
  | { ok: false; reason: "unknown_tool" | "bad_args"; error: string };

/** Validate the chooser's pick, then run it. The only place a tool is called. */
export function runShopTool(
  id: unknown,
  rawArgs: unknown,
  data: ShopToolData,
  ctx: ShopToolContext,
): ShopToolRun {
  const tool = getShopTool(id);
  if (!tool) return { ok: false, reason: "unknown_tool", error: "No such tool" };
  const checked = tool.validateArgs(rawArgs);
  if (!checked.ok) return { ok: false, reason: "bad_args", error: checked.error };
  const run = tool.run as (
    args: ShopToolArgs[ShopToolId],
    data: ShopToolData,
    ctx: ShopToolContext,
  ) => ShopAnswer;
  return {
    ok: true,
    tool: tool.id,
    sensitive: tool.sensitive,
    answer: run(checked.args, data, ctx),
  };
}
