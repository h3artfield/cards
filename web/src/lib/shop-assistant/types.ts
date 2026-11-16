import type {
  ConditionEstimate,
  Customer,
  InventoryItem,
  StoreRule,
  StoreSettings,
  TradeCreditEntry,
} from "../types";

/**
 * The shop assistant answers staff questions from the store's own data.
 *
 * The model only ever picks one of these tools and its arguments. The server
 * runs the tool and fills a fixed template, so no store data is sent to the
 * model and the model never writes a number.
 */
export const SHOP_TOOL_IDS = [
  "sales_summary",
  "cards_to_move",
  "shelf_performance",
  "find_card",
  "buy_estimate",
  "store_credit",
] as const;

export type ShopToolId = (typeof SHOP_TOOL_IDS)[number];

export type ShopFinishArg = "foil" | "nonfoil";

export type ShopSalesPeriod =
  | "today"
  | "yesterday"
  | "date"
  | "month_to_date"
  | "last_7_days";

export type ShopToolArgs = {
  sales_summary: { period: ShopSalesPeriod; date?: string };
  cards_to_move: Record<string, never>;
  shelf_performance: {
    rank: "slowest" | "fastest";
    kind: "case" | "binder" | "any";
    limit: number;
  };
  find_card: { name: string; finish?: ShopFinishArg };
  buy_estimate: {
    name: string;
    condition: ConditionEstimate;
    finish?: ShopFinishArg;
  };
  store_credit: Record<string, never>;
};

/**
 * What the box shows. Plain strings only: no markdown, so nothing renders as
 * stray asterisks.
 */
export type ShopAnswer = {
  title: string;
  lines: string[];
  columns?: string[];
  rows?: string[][];
  /** How the answer was worked out, or what was left out. */
  note?: string;
  href?: string;
  hrefLabel?: string;
  /** ISO time the underlying data was read. */
  asOf: string;
};

/** Only the customer fields an answer may show. Never email or phone. */
export type ShopCustomerName = Pick<Customer, "id" | "firstName" | "lastName">;

/** Everything a tool may read. `load.ts` fills only what the tool asks for. */
export type ShopToolData = {
  storeId: string;
  inventory: InventoryItem[];
  customers: ShopCustomerName[];
  creditEntries: TradeCreditEntry[];
  /** Buy percentages and condition multipliers. Null when the store has none yet. */
  settings: StoreSettings | null;
  /** The store's buy rules, active or not. */
  rules: StoreRule[];
};

export type ShopToolNeed =
  | "inventory"
  | "customers"
  | "creditEntries"
  | "settings"
  | "rules";

export type ShopToolContext = {
  /** Injected so tests are repeatable. */
  now: Date;
};

export type ShopArgsResult<T> =
  | { ok: true; args: T }
  | { ok: false; error: string };

export type ShopTool<Id extends ShopToolId = ShopToolId> = {
  id: Id;
  /** One line for the chooser prompt. Describes the question, holds no data. */
  describe: string;
  /**
   * The answer lists customers. The box asks for a confirming Enter before it
   * shows one, so it cannot appear on a counter screen unasked.
   */
  sensitive: boolean;
  needs: ReadonlyArray<ShopToolNeed>;
  validateArgs(raw: unknown): ShopArgsResult<ShopToolArgs[Id]>;
  run(
    args: ShopToolArgs[Id],
    data: ShopToolData,
    ctx: ShopToolContext,
  ): ShopAnswer;
};
