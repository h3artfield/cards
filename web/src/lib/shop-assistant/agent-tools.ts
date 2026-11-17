import { SHOP_PERIODS } from "./period";
import { listShopTools } from "./registry";
import type { AgentToolDefinition } from "./openai-tools";
import type { ShopToolId } from "./types";

/**
 * The tool menu as the conversation model sees it: the registry's own
 * descriptions plus a JSON Schema for each tool's arguments. The schemas are
 * guidance for the model only. The registry's validators remain the check.
 */

const FINISH = { type: "string", enum: ["foil", "nonfoil"], description: "Only if the person said foil or non-foil." };
const CARD_NAME = { type: "string", description: "The card name as the person typed it, without condition or the word foil." };

const PERIOD = {
  period: { type: "string", enum: [...SHOP_PERIODS] },
  date: { type: "string", description: 'YYYY-MM-DD. Required when period is "date".' },
  from: { type: "string", description: 'YYYY-MM-DD, first day. Required when period is "range".' },
  to: { type: "string", description: 'YYYY-MM-DD, last day. Required when period is "range".' },
};

const PARAMETERS: Record<ShopToolId, Record<string, unknown>> = {
  sales_summary: { type: "object", properties: PERIOD, required: ["period"] },
  top_sellers: {
    type: "object",
    properties: { ...PERIOD, by: { type: "string", enum: ["revenue", "units"] }, limit: { type: "integer", minimum: 1, maximum: 20 } },
    required: ["period"],
  },
  sales_by_shelf: {
    type: "object",
    properties: { ...PERIOD, kind: { type: "string", enum: ["case", "binder", "any"] } },
    required: ["period"],
  },
  slow_stock: {
    type: "object",
    properties: {
      minPrice: { type: "number", minimum: 0 },
      olderThanDays: { type: "integer", minimum: 14, maximum: 365 },
      limit: { type: "integer", minimum: 1, maximum: 25 },
    },
  },
  cards_to_move: { type: "object", properties: {} },
  shelf_performance: {
    type: "object",
    properties: {
      rank: { type: "string", enum: ["slowest", "fastest"] },
      kind: { type: "string", enum: ["case", "binder", "any"] },
      limit: { type: "integer", minimum: 1, maximum: 5 },
    },
    required: ["rank"],
  },
  find_card: {
    type: "object",
    properties: { name: CARD_NAME, finish: FINISH },
    required: ["name"],
  },
  buy_estimate: {
    type: "object",
    properties: {
      name: CARD_NAME,
      condition: { type: "string", enum: ["NM", "LP", "MP", "HP", "DMG"] },
      finish: FINISH,
    },
    required: ["name"],
  },
  store_credit: { type: "object", properties: {} },
};

export function agentToolDefinitions(): AgentToolDefinition[] {
  return listShopTools().map((tool) => ({
    name: tool.id,
    description: tool.describe,
    parameters: PARAMETERS[tool.id],
  }));
}
