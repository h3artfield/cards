import { tidy } from "./format";
import { buyEstimateAnswer } from "./tools/buy-estimate";
import { cardsToMoveAnswer } from "./tools/cards-to-move";
import { findCardAnswer } from "./tools/find-card";
import { readPeriodArgs } from "./period";
import { salesByShelfAnswer, topSellersAnswer } from "./tools/sales-breakdown";
import { salesSummaryAnswer } from "./tools/sales-summary";
import { slowStockAnswer } from "./tools/slow-stock";
import { shelfPerformanceAnswer } from "./tools/shelf-performance";
import { storeCreditAnswer } from "./tools/store-credit";
import type { ConditionEstimate } from "../types";
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

const CONDITION_WORDS: Record<string, ConditionEstimate> = {
  nm: "NM",
  "near mint": "NM",
  mint: "NM",
  lp: "LP",
  "lightly played": "LP",
  "light play": "LP",
  mp: "MP",
  "moderately played": "MP",
  "moderate play": "MP",
  hp: "HP",
  "heavily played": "HP",
  "heavy play": "HP",
  dmg: "DMG",
  damaged: "DMG",
};

/** Staff and the model both say "LP" or "lightly played". Anything else is Near Mint. */
function conditionArg(raw: unknown): ConditionEstimate {
  return (typeof raw === "string" && CONDITION_WORDS[tidy(raw).toLowerCase()]) || "NM";
}

/** A whole number from untrusted input, held inside a range. */
function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : fallback;
  return Math.min(max, Math.max(min, value));
}

const noArgs = (): ShopArgsResult<Record<string, never>> => ({ ok: true, args: {} });

const PERIOD_ARGS_HELP =
  'Args: period "today", "yesterday", "date", "last_7_days", "month_to_date", "last_week" (last full Monday to Sunday), ' +
  '"last_month" (last full calendar month) or "range"; for "date" also date; for "range" also from and to. Days are YYYY-MM-DD. ' +
  "Sales are kept for 90 days.";

const salesSummary: ShopTool<"sales_summary"> = {
  id: "sales_summary",
  describe:
    "How much the store sold: cards and dollars, in store and online, by day. " + PERIOD_ARGS_HELP,
  sensitive: false,
  needs: ["inventory"],
  validateArgs: (raw) => readPeriodArgs(asRecord(raw)),
  run: (args, data, ctx) => salesSummaryAnswer(data.inventory, args, ctx.now),
};

const topSellersTool: ShopTool<"top_sellers"> = {
  id: "top_sellers",
  describe:
    "Which cards sold best over a period, with what is left in stock. " +
    PERIOD_ARGS_HELP +
    ' Also optional by "revenue" or "units", and limit 1 to 20.',
  sensitive: false,
  needs: ["inventory"],
  validateArgs(raw) {
    const input = asRecord(raw);
    const period = readPeriodArgs(input);
    if (!period.ok) return period;
    const by = input.by === "units" ? "units" : "revenue";
    return { ok: true, args: { ...period.args, by, limit: clampInt(input.limit, 1, 20, 10) } };
  },
  run: (args, data, ctx) => topSellersAnswer(data.inventory, args, ctx.now),
};

const salesByShelfTool: ShopTool<"sales_by_shelf"> = {
  id: "sales_by_shelf",
  describe:
    "Which case shelves and binders a period's sales came from. " +
    PERIOD_ARGS_HELP +
    ' Also optional kind "case", "binder" or "any".',
  sensitive: false,
  needs: ["inventory"],
  validateArgs(raw) {
    const input = asRecord(raw);
    const period = readPeriodArgs(input);
    if (!period.ok) return period;
    const kind = input.kind === "case" || input.kind === "binder" ? input.kind : "any";
    return { ok: true, args: { ...period.args, kind } };
  },
  run: (args, data, ctx) => salesByShelfAnswer(data.inventory, args, ctx.now),
};

const slowStockTool: ShopTool<"slow_stock"> = {
  id: "slow_stock",
  describe:
    "Cards that have sat in stock without selling, most money tied up first. Use for what to review for a markdown. It lists cards; it does not suggest prices. " +
    "Args, all optional: minPrice in dollars (default 2), olderThanDays 14 to 365 (default 60), limit 1 to 25.",
  sensitive: false,
  needs: ["inventory"],
  validateArgs(raw) {
    const input = asRecord(raw);
    const price = typeof input.minPrice === "number" && Number.isFinite(input.minPrice) ? input.minPrice : 2;
    return {
      ok: true,
      args: {
        minPrice: Math.min(10_000, Math.max(0, Math.round(price * 100) / 100)),
        olderThanDays: clampInt(input.olderThanDays, 14, 365, 60),
        limit: clampInt(input.limit, 1, 25, 15),
      },
    };
  },
  run: (args, data, ctx) => slowStockAnswer(data.inventory, args, ctx.now),
};

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

const buyEstimate: ShopTool<"buy_estimate"> = {
  id: "buy_estimate",
  describe:
    "Roughly what the store would pay, in cash or trade, for a named card a customer brings in. " +
    'Args: name (the card name as typed); optional condition "NM", "LP", "MP", "HP" or "DMG"; ' +
    'optional finish "foil" or "nonfoil".',
  sensitive: false,
  needs: ["inventory", "settings", "rules"],
  validateArgs(raw) {
    const input = asRecord(raw);
    const name = nameArg(input.name);
    if (!name) {
      return { ok: false, error: `name must be ${NAME_ARG_MIN} to ${NAME_ARG_MAX} characters` };
    }
    const condition = conditionArg(input.condition);
    const finish = finishArg(input.finish);
    return { ok: true, args: finish ? { name, condition, finish } : { name, condition } };
  },
  run: (args, data, ctx) =>
    buyEstimateAnswer(data.inventory, args, data.settings, data.rules, ctx.now),
};

const storeCredit: ShopTool<"store_credit"> = {
  id: "store_credit",
  describe:
    "Store credit (trade credit): which customers hold a balance, how much each, and the total outstanding.",
  sensitive: true,
  needs: ["customers", "creditEntries"],
  validateArgs: noArgs,
  run: (_args, data, ctx) =>
    storeCreditAnswer(data.storeId, data.creditEntries, data.customers, ctx.now),
};

/** One member per tool id, each keeping its own argument type. */
export type AnyShopTool = { [Id in ShopToolId]: ShopTool<Id> }[ShopToolId];

/** Every tool, in the order the chooser is shown them. */
const SHOP_TOOLS: ReadonlyArray<AnyShopTool> = [
  salesSummary,
  cardsToMove,
  shelfPerformance,
  findCard,
  buyEstimate,
  storeCredit,
  topSellersTool,
  salesByShelfTool,
  slowStockTool,
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
