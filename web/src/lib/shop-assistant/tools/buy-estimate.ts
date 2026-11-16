import { CONDITION_LABELS } from "../../constants";
import { inventoryItemMatchesFinishFilter } from "../../inventory/inventory-finish-v1";
import { shelfCustomerName } from "../../inventory/shelf-row-edit";
import { isCatalogImportItem } from "../../inventory/status";
import { tcgplayerConditionToGrade } from "../../inventory/tcg-low-price";
import { splitTcgplayerConditionV1 } from "../../pricing/justtcg-client";
import { applyConditionPricing } from "../../processing/condition-ladder";
import {
  applyStoreRules,
  normalizeRuleCategory,
  ruleNeedsResaleAnalysis,
  rulePricingOptions,
} from "../../processing/rules-engine";
import { STORE_TIME_ZONE } from "../../reports/daily-reports";
import type {
  CardCategory,
  ConditionEstimate,
  InventoryItem,
  StoreRule,
  StoreSettings,
  VisionResult,
} from "../../types";
import { formatMoney, plural } from "../format";
import type { ShopAnswer, ShopToolArgs } from "../types";
import { rankNameMatch } from "./find-card";

export const BUY_ESTIMATE_MAX_ROWS = 5;

/**
 * Inventory rows carry TCGplayer's product line ("Magic", "Pokemon
 * International", "YuGiOh"); buy rules are written against the scan's
 * categories. Anything not listed here is "other".
 */
export function ruleCategoryForProductLine(productLine: string | undefined): CardCategory {
  const line = (productLine ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (line.includes("magic")) return "magic";
  if (line.includes("pokemon")) return "pokemon";
  if (/yu-?gi-?oh/.test(line)) return "yugioh";
  return "other";
}

export type BuyOfferInput = {
  /** The price the offer is taken from. */
  basisPrice: number;
  /** True when `basisPrice` is already for the asked condition. */
  skipConditionMultiplier: boolean;
  /** The card-level (Near Mint) price the buy rules look at. */
  rulesPrice: number;
  condition: ConditionEstimate;
  vision: VisionResult;
  settings: StoreSettings;
  rules: StoreRule[];
};

export type BuyOffer = {
  marketValue: number;
  cashOffer: number;
  tradeOffer: number;
  cashPercent: number;
  tradePercent: number;
  doNotBuy: boolean;
  matchedRules: string[];
};

/**
 * The scan's offer formula for a raw card (`applyMarketPricing`), given a
 * price: store percents, buy rules, then condition, minimum offer and rounding.
 */
export function estimateBuyOffer(input: BuyOfferInput): BuyOffer {
  const { settings } = input;
  const ruleResult = applyStoreRules(input.rules, input.vision, input.rulesPrice);
  const cashPercent = ruleResult.cashPercentOverride ?? settings.defaultCashPercent;
  const tradePercent = ruleResult.tradePercentOverride ?? settings.defaultTradePercent;
  const { marketValue, cashOffer, tradeOffer } = applyConditionPricing(
    input.basisPrice,
    input.condition,
    settings,
    cashPercent,
    tradePercent,
    {
      skipConditionMultiplier: input.skipConditionMultiplier,
      ...rulePricingOptions(ruleResult),
    },
  );
  return {
    marketValue,
    cashOffer: ruleResult.doNotBuy ? 0 : cashOffer,
    tradeOffer: ruleResult.doNotBuy ? 0 : tradeOffer,
    cashPercent,
    tradePercent,
    doNotBuy: ruleResult.doNotBuy,
    matchedRules: ruleResult.matchedRules,
  };
}

function hasValue(value: unknown): boolean {
  return value != null && value !== "" && !(Array.isArray(value) && value.length === 0);
}

/**
 * Active rules this estimate cannot honour, by title. An inventory row has no
 * print year and no resale analysis, so a rule that filters on year, or one
 * the engine says needs resale analysis, is reported instead of silently passed.
 */
export function rulesNotChecked(rules: StoreRule[], vision: VisionResult): string[] {
  const titles: string[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    // Same test the engine makes: no categories means every card, and a
    // do-not-buy rule worded "any card" ignores its categories.
    const applies =
      !rule.appliesToCategories.length ||
      rule.appliesToCategories.some((c) => normalizeRuleCategory(c) === vision.category) ||
      (rule.ruleType === "do_not_buy" &&
        /\bany card\b|\ball cards\b|\bevery card\b/.test(`${rule.title} ${rule.ruleText}`.toLowerCase()));
    if (!applies) continue;

    const filters = rule.structuredFilters ?? {};
    const usesYear = hasValue(filters.years) || hasValue(filters.year);
    const slowMover = ruleNeedsResaleAnalysis(rule);
    if (usesYear || slowMover) titles.push(rule.title);
  }
  return titles;
}

type PricedRow = { item: InventoryItem; grade: ConditionEstimate; price: number };

export type BuyEstimateRow = {
  name: string;
  /** "Reality Fracture · #321 · Foil". */
  printing: string;
  /** Null when there is no price on file for the asked condition. */
  offer: BuyOffer | null;
  /** How the price was reached: "LP price, Nov 15" or "NM price × 0.85, Nov 15". */
  basis: string;
  basisPrice: number | null;
  basisAt: string;
  basisSource: InventoryItem["marketPriceSource"];
  notChecked: string[];
};

export type BuyEstimateResult = {
  /** One row per printing, priced ones first, highest market value first. */
  rows: BuyEstimateRow[];
};

const shortDate = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIME_ZONE,
  month: "short",
  day: "numeric",
});

function priceDate(iso: string | undefined): string {
  const at = iso ? new Date(iso) : null;
  return at && Number.isFinite(at.getTime()) ? shortDate.format(at) : "date unknown";
}

function printingLabel(item: InventoryItem, printing: string, language: string): string {
  const number = item.cardNumber?.trim();
  return [
    item.setName?.trim(),
    number ? `#${number.replace(/^#/, "")}` : "",
    printing === "Normal" ? "" : printing,
    language === "English" ? "" : language,
  ]
    .filter(Boolean)
    .join(" · ");
}

function newest(a: PricedRow | undefined, b: PricedRow): PricedRow {
  return !a || (b.item.marketPriceAt ?? "") > (a.item.marketPriceAt ?? "") ? b : a;
}

/**
 * What the store would offer for a named card in a condition, per printing,
 * from the nightly market price on its inventory rows.
 *
 * A row's `tcgMarketPrice` is already for that row's own condition and
 * printing, so a row in the asked condition is used as it stands. Failing
 * that, the Near Mint row's price is scaled by the store's condition
 * multiplier. A Near Mint price is never backed out of a played row.
 */
export function estimateBuy(
  inventory: InventoryItem[],
  args: ShopToolArgs["buy_estimate"],
  settings: StoreSettings,
  rules: StoreRule[],
): BuyEstimateResult {
  type Group = {
    name: string;
    printing: string;
    language: string;
    sample: InventoryItem;
    byGrade: Partial<Record<ConditionEstimate, PricedRow>>;
  };
  const groups = new Map<string, Group>();
  let best = 0;
  const ranked: Array<{ rank: number; key: string }> = [];

  for (const item of inventory) {
    if (!isCatalogImportItem(item)) continue;
    if (!inventoryItemMatchesFinishFilter(item, args.finish)) continue;
    const name = shelfCustomerName(item);
    const rank = rankNameMatch(name, args.name);
    if (rank < 2) continue;
    const split = splitTcgplayerConditionV1(item.tcgplayerCondition ?? "");
    const product = item.tcgplayerProductId ?? `${name}|${item.setName ?? ""}|${item.cardNumber ?? ""}`;
    const key = `${product}|${split.printing}|${split.language}`.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { name, printing: split.printing, language: split.language, sample: item, byGrade: {} };
      groups.set(key, group);
      ranked.push({ rank, key });
      if (rank > best) best = rank;
    }
    const price = item.tcgMarketPrice;
    if (price != null && price > 0) {
      const grade = tcgplayerConditionToGrade(item.tcgplayerCondition);
      group.byGrade[grade] = newest(group.byGrade[grade], { item, grade, price });
    }
  }

  // An exact name hides looser matches, as in find_card.
  const floor = best === 4 ? 4 : 2;
  const rows: BuyEstimateRow[] = [];
  for (const { rank, key } of ranked) {
    if (rank < floor) continue;
    const group = groups.get(key)!;
    const asked = group.byGrade[args.condition];
    const nearMint = group.byGrade.NM;
    const from = asked ?? nearMint;
    const label = printingLabel(group.sample, group.printing, group.language);

    if (!from) {
      rows.push({
        name: group.name,
        printing: label,
        offer: null,
        basis: "No price on file",
        basisPrice: null,
        basisAt: "",
        basisSource: undefined,
        notChecked: [],
      });
      continue;
    }

    const rulesPrice = (nearMint ?? from).price;
    const vision: VisionResult = {
      category: ruleCategoryForProductLine(group.sample.productLine),
      itemType: "raw",
      cardName: group.name,
      setName: group.sample.setName,
      cardNumber: group.sample.cardNumber,
      conditionEstimate: args.condition,
      confidence: 1,
      rarity: group.sample.rarity ?? group.sample.catalogRarity,
    };
    const offer = estimateBuyOffer({
      basisPrice: from.price,
      skipConditionMultiplier: Boolean(asked),
      rulesPrice,
      condition: args.condition,
      vision,
      settings,
      rules,
    });
    const date = priceDate(from.item.marketPriceAt);
    const multiplier = settings.conditionMultipliers[args.condition] ?? 1;
    rows.push({
      name: group.name,
      printing: label,
      offer,
      basis: asked ? `${args.condition} price, ${date}` : `NM price × ${multiplier}, ${date}`,
      basisPrice: from.price,
      basisAt: date,
      basisSource: from.item.marketPriceSource,
      notChecked: rulesNotChecked(rules, vision),
    });
  }

  rows.sort(
    (a, b) =>
      Number(Boolean(b.offer)) - Number(Boolean(a.offer)) ||
      (b.offer?.marketValue ?? 0) - (a.offer?.marketValue ?? 0) ||
      a.name.localeCompare(b.name) ||
      a.printing.localeCompare(b.printing),
  );
  return { rows };
}

function sourceWords(source: InventoryItem["marketPriceSource"]): string {
  return source === "tcgplayer_csv" ? "the market price from our TCGplayer import" : "our nightly market price";
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

/** "What would we pay for <card> in <condition>?" */
export function buyEstimateAnswer(
  inventory: InventoryItem[],
  args: ShopToolArgs["buy_estimate"],
  settings: StoreSettings | null,
  rules: StoreRule[],
  now: Date,
): ShopAnswer {
  const conditionName = CONDITION_LABELS[args.condition];
  const base = {
    title: `Buy estimate: ${args.name} (${args.condition})`,
    href: "/admin/pricing?section=buy",
    hrefLabel: "Open Buy %",
    asOf: now.toISOString(),
  };
  const closing = "Estimate. The scan sets the real offer.";

  if (!settings) {
    return { ...base, lines: ["This store has no buy settings yet, so there is nothing to estimate from."] };
  }

  const { rows } = estimateBuy(inventory, args, settings, rules);
  const priced = rows.filter((row) => row.offer);
  if (!priced.length) {
    return {
      ...base,
      lines: [
        rows.length
          ? `No price on file for "${args.name}" in ${conditionName} or Near Mint. Scan it.`
          : `No price on file for "${args.name}". Scan it.`,
      ],
      note: "Estimates come from cards the store has stocked. " + closing,
    };
  }

  const shown = rows.slice(0, BUY_ESTIMATE_MAX_ROWS);
  const top = priced[0]!;
  const offer = top.offer!;
  const lines: string[] = [];
  if (priced.length === 1) {
    lines.push(
      offer.doNotBuy
        ? `${conditionName}: a store rule says not to buy this one (${offer.matchedRules.join(", ")}).`
        : `${conditionName}: about ${formatMoney(offer.cashOffer)} cash or ${formatMoney(offer.tradeOffer)} in trade.`,
    );
    lines.push(
      `Based on ${sourceWords(top.basisSource)} (${formatMoney(top.basisPrice)}, ${top.basisAt}` +
        `${top.basis.startsWith("NM price ×") && args.condition !== "NM" ? `, Near Mint, scaled to ${conditionName}` : ""}` +
        `), not the scan's live TCGplayer low.`,
    );
  } else {
    lines.push(`${plural(priced.length, "printing", "printings")} with a price on file. Offers for ${conditionName}:`);
    lines.push(`Based on ${sourceWords(top.basisSource)}, not the scan's live TCGplayer low.`);
  }

  const applied = [...new Set(shown.flatMap((row) => row.offer?.matchedRules ?? []))];
  const unchecked = [...new Set(shown.flatMap((row) => row.notChecked))];
  for (const title of unchecked) lines.push(`Not checked: ${title}`);

  const notes: string[] = [];
  if (rows.length > shown.length) notes.push(`Showing ${shown.length} of ${rows.length} printings.`);
  notes.push(`Cash ${percent(offer.cashPercent)}, trade ${percent(offer.tradePercent)} of market.`);
  if (applied.length) notes.push(`Rules applied: ${applied.join(", ")}.`);
  if (unchecked.length) notes.push("Rules marked Not checked need the card's year or sales history, which only the scan has.");
  notes.push(closing);

  return {
    ...base,
    lines,
    columns: ["Card", "Printing", "Market", "Cash", "Trade", "Based on"],
    rows: shown.map((row) => [
      row.name,
      row.printing,
      row.offer ? formatMoney(row.offer.marketValue) : "—",
      !row.offer ? "Scan it" : row.offer.doNotBuy ? "Don't buy" : formatMoney(row.offer.cashOffer),
      !row.offer ? "Scan it" : row.offer.doNotBuy ? "Don't buy" : formatMoney(row.offer.tradeOffer),
      row.offer ? row.basis : "No price on file for that condition",
    ]),
    note: notes.join(" "),
  };
}
