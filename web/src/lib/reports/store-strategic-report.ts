import type {
  BuybackOrder,
  BuybackTransaction,
  CardCategory,
  InventoryItem,
  ScannedCard,
  StoreRule,
  StoreSettings,
} from "@/lib/types";
import { isInventoryAvailable } from "@/lib/shopify/inventory-status";

export interface StoreStrategicReport {
  generatedAt: string;
  store: {
    id: string;
    name: string;
    slug: string;
  };
  orders: {
    total: number;
    open: number;
    completed: number;
    pipelineMarket: number;
    pipelineCash: number;
    byStatus: Record<string, number>;
  };
  purchases: {
    cashTotal: number;
    tradeTotal: number;
    cashCount: number;
    tradeCount: number;
    cancelledCount: number;
    totalSpent: number;
    avgCashOrder: number;
    avgCardsPerPurchase: number;
  };
  inventory: {
    count: number;
    totalPaid: number;
    totalMarket: number;
    avgMarginPercent: number | null;
    byCategory: CategoryBucket[];
  };
  buyingTrends: {
    analyzedCards: number;
    buyCount: number;
    passCount: number;
    reviewCount: number;
    avgMarginPercent: number | null;
    avgOfferToMarketRatio: number | null;
    sentiment: { bullish: number; bearish: number; neutral: number };
    turnover: { high: number; medium: number; low: number; unknown: number };
    byCategory: CategoryBucket[];
    topSets: { name: string; count: number }[];
  };
  pricingConfig: {
    defaultCashPercent: number;
    defaultTradePercent: number;
    slabCashPercent: number;
    slabTradePercent: number;
    minimumOffer: number;
    manualReviewThreshold: number;
    conditionMultipliers: StoreSettings["conditionMultipliers"];
  };
  activeRules: {
    id: string;
    title: string;
    ruleType: string;
    categories: CardCategory[];
  }[];
  insights: string[];
  highlights: {
    recentPurchases: Pick<
      BuybackTransaction,
      "orderNumber" | "type" | "amount" | "cardCount" | "createdAt"
    >[];
    topInventoryItems: Pick<
      InventoryItem,
      "displayName" | "purchasePrice" | "marketPrice" | "category"
    >[];
  };
}

type CategoryBucket = {
  category: string;
  count: number;
  marketTotal: number;
  paidTotal: number;
};

const OPEN_STATUSES = new Set([
  "draft",
  "scanning",
  "submitted",
  "processing",
  "under_review",
  "offer_ready",
]);

const COMPLETED_STATUSES = new Set(["accepted", "paid", "declined"]);

function categoryLabel(c?: CardCategory | string): string {
  if (!c) return "other";
  return c;
}

function bumpCategory(
  map: Map<string, CategoryBucket>,
  category: string,
  market = 0,
  paid = 0,
) {
  const existing = map.get(category) ?? {
    category,
    count: 0,
    marketTotal: 0,
    paidTotal: 0,
  };
  existing.count += 1;
  existing.marketTotal += market;
  existing.paidTotal += paid;
  map.set(category, existing);
}

function topBuckets(map: Map<string, CategoryBucket>, limit = 5): CategoryBucket[] {
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function buildInsights(input: {
  settings: StoreSettings;
  orders: BuybackOrder[];
  purchases: StoreStrategicReport["purchases"];
  inventory: StoreStrategicReport["inventory"];
  trends: StoreStrategicReport["buyingTrends"];
  rules: StoreRule[];
}): string[] {
  const insights: string[] = [];
  const { settings, orders, purchases, inventory, trends, rules } = input;

  if (orders.length === 0) {
    insights.push(
      "No orders yet — share your store QR so customers can start submitting cards.",
    );
    return insights;
  }

  if (trends.analyzedCards > 0) {
    const buyRate = Math.round((trends.buyCount / trends.analyzedCards) * 100);
    insights.push(
      `${buyRate}% of analyzed cards received a buy recommendation (${trends.buyCount} buy · ${trends.passCount} pass).`,
    );

    const topCat = trends.byCategory[0];
    if (topCat && topCat.count >= 2) {
      insights.push(
        `${topCat.category.charAt(0).toUpperCase()}${topCat.category.slice(1)} is your busiest category (${topCat.count} cards, $${topCat.marketTotal.toFixed(0)} market volume).`,
      );
    }

    if (trends.avgOfferToMarketRatio != null) {
      insights.push(
        `Average suggested offer is ${Math.round(trends.avgOfferToMarketRatio * 100)}% of market — your default cash buy is ${settings.defaultCashPercent}%.`,
      );
    }

    if (trends.turnover.low > trends.turnover.high && trends.turnover.low >= 3) {
      insights.push(
        "Several slow movers flagged — consider tighter pass rules or lower offers on low-liquidity items.",
      );
    } else if (trends.turnover.high >= 3) {
      insights.push(
        "Strong high-turnover volume detected — good candidates for aggressive buy targets.",
      );
    }

    if (trends.sentiment.bearish > trends.sentiment.bullish && trends.sentiment.bearish >= 2) {
      insights.push(
        "Bearish sentiment dominates recent analysis — market may be softening in submitted categories.",
      );
    }
  } else {
    insights.push(
      "Submit and process orders to unlock card-level buying trend analysis.",
    );
  }

  if (purchases.totalSpent > 0) {
    insights.push(
      `You've deployed $${purchases.totalSpent.toFixed(2)} in buybacks (${purchases.cashCount} cash · ${purchases.tradeCount} trade).`,
    );
  }

  if (inventory.count > 0 && inventory.avgMarginPercent != null) {
    insights.push(
      `Inventory on hand: ${inventory.count} cards with ~${inventory.avgMarginPercent.toFixed(0)}% average market margin vs purchase price.`,
    );
  }

  const activeRules = rules.filter((r) => r.active);
  const dnb = activeRules.filter((r) => r.ruleType === "do_not_buy");
  if (dnb.length) {
    insights.push(
      `${dnb.length} active do-not-buy rule${dnb.length === 1 ? "" : "s"} — review if pass rate is higher than expected.`,
    );
  }

  const open = orders.filter((o) => OPEN_STATUSES.has(o.status)).length;
  if (open > 0) {
    insights.push(
      `${open} open order${open === 1 ? "" : "s"} in pipeline — $${orders.reduce((s, o) => s + (o.totalCashOffer ?? 0), 0).toFixed(0)} in outstanding cash offers.`,
    );
  }

  return insights.slice(0, 8);
}

export async function buildStoreStrategicReport(
  storeId: string,
  deps: {
    getStore: (id: string) => Promise<StoreSettings | null>;
    getOrders: (id: string) => Promise<BuybackOrder[]>;
    getCardsByOrder: (orderId: string) => Promise<ScannedCard[]>;
    getTransactions: (id: string) => Promise<BuybackTransaction[]>;
    getInventory: (id: string) => Promise<InventoryItem[]>;
    getRules: (id: string) => Promise<StoreRule[]>;
  },
): Promise<StoreStrategicReport | null> {
  const store = await deps.getStore(storeId);
  if (!store) return null;

  const [orders, transactions, inventory, rules] = await Promise.all([
    deps.getOrders(storeId),
    deps.getTransactions(storeId),
    deps.getInventory(storeId),
    deps.getRules(storeId),
  ]);

  const byStatus: Record<string, number> = {};
  let pipelineMarket = 0;
  let pipelineCash = 0;
  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
    if (OPEN_STATUSES.has(order.status)) {
      pipelineMarket += order.totalMarketEstimate ?? 0;
      pipelineCash += order.totalCashOffer ?? 0;
    }
  }

  const purchaseTotals = transactions.reduce(
    (acc, tx) => {
      if (tx.type === "cash") {
        acc.cashTotal += tx.amount;
        acc.cashCount += 1;
        acc.totalCards += tx.cardCount;
      } else if (tx.type === "trade") {
        acc.tradeTotal += tx.amount;
        acc.tradeCount += 1;
        acc.totalCards += tx.cardCount;
      } else if (tx.type === "cancelled") {
        acc.cancelledCount += 1;
      }
      return acc;
    },
    {
      cashTotal: 0,
      tradeTotal: 0,
      cashCount: 0,
      tradeCount: 0,
      cancelledCount: 0,
      totalCards: 0,
    },
  );

  const purchaseCount = purchaseTotals.cashCount + purchaseTotals.tradeCount;
  const purchases = {
    cashTotal: purchaseTotals.cashTotal,
    tradeTotal: purchaseTotals.tradeTotal,
    cashCount: purchaseTotals.cashCount,
    tradeCount: purchaseTotals.tradeCount,
    cancelledCount: purchaseTotals.cancelledCount,
    totalSpent: purchaseTotals.cashTotal + purchaseTotals.tradeTotal,
    avgCashOrder:
      purchaseTotals.cashCount > 0
        ? purchaseTotals.cashTotal / purchaseTotals.cashCount
        : 0,
    avgCardsPerPurchase:
      purchaseCount > 0 ? purchaseTotals.totalCards / purchaseCount : 0,
  };

  const onHandInventory = inventory.filter((item) => isInventoryAvailable(item));

  const invCategoryMap = new Map<string, CategoryBucket>();
  let invPaid = 0;
  let invMarket = 0;
  let marginSum = 0;
  let marginCount = 0;
  for (const item of onHandInventory) {
    const paid = item.purchasePrice ?? 0;
    invPaid += paid;
    const market = item.marketPrice ?? item.listPrice;
    if (market != null) {
      invMarket += market;
      if (paid > 0) {
        marginSum += ((market - paid) / paid) * 100;
        marginCount += 1;
      }
    }
    bumpCategory(
      invCategoryMap,
      categoryLabel(item.category),
      market ?? 0,
      paid,
    );
  }

  const allCards: ScannedCard[] = [];
  for (const order of orders) {
    const cards = await deps.getCardsByOrder(order.id);
    allCards.push(...cards);
  }

  const trendCategoryMap = new Map<string, CategoryBucket>();
  const setCounts = new Map<string, number>();
  let buyCount = 0;
  let passCount = 0;
  let reviewCount = 0;
  let marginTrendSum = 0;
  let marginTrendCount = 0;
  let offerRatioSum = 0;
  let offerRatioCount = 0;
  const sentiment = { bullish: 0, bearish: 0, neutral: 0 };
  const turnover = { high: 0, medium: 0, low: 0, unknown: 0 };

  for (const card of allCards) {
    const analysis = card.resaleAnalysis;
    if (!analysis) continue;

    if (analysis.recommendation === "buy" || analysis.recommendation === "negotiate") {
      buyCount += 1;
    } else if (analysis.recommendation === "pass") {
      passCount += 1;
    } else {
      reviewCount += 1;
    }

    sentiment[analysis.sentiment] += 1;
    turnover[analysis.salesFrequency] += 1;

    if (analysis.estimatedMarginPercent != null) {
      marginTrendSum += analysis.estimatedMarginPercent;
      marginTrendCount += 1;
    }

    const market = card.marketPrice ?? analysis.latestSaleEstimate ?? 0;
    const offer =
      analysis.suggestedCashOffer ?? analysis.maxBuyPrice ?? card.cashOffer ?? 0;
    if (market > 0 && offer > 0) {
      offerRatioSum += offer / market;
      offerRatioCount += 1;
    }

    bumpCategory(trendCategoryMap, categoryLabel(card.category), market);

    const setKey = card.setName?.trim();
    if (setKey) {
      setCounts.set(setKey, (setCounts.get(setKey) ?? 0) + 1);
    }
  }

  const analyzedCards = buyCount + passCount + reviewCount;
  const topSets = [...setCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const buyingTrends = {
    analyzedCards,
    buyCount,
    passCount,
    reviewCount,
    avgMarginPercent:
      marginTrendCount > 0 ? marginTrendSum / marginTrendCount : null,
    avgOfferToMarketRatio:
      offerRatioCount > 0 ? offerRatioSum / offerRatioCount : null,
    sentiment,
    turnover,
    byCategory: topBuckets(trendCategoryMap),
    topSets,
  };

  const inventoryReport = {
    count: onHandInventory.length,
    totalPaid: invPaid,
    totalMarket: invMarket,
    avgMarginPercent: marginCount > 0 ? marginSum / marginCount : null,
    byCategory: topBuckets(invCategoryMap),
  };

  const activeRules = rules
    .filter((r) => r.active)
    .sort((a, b) => b.priority - a.priority)
    .map((r) => ({
      id: r.id,
      title: r.title,
      ruleType: r.ruleType,
      categories: r.appliesToCategories,
    }));

  const insights = buildInsights({
    settings: store,
    orders,
    purchases,
    inventory: inventoryReport,
    trends: buyingTrends,
    rules,
  });

  const topInventoryItems = [...onHandInventory]
    .filter((i) => i.marketPrice != null && (i.purchasePrice ?? 0) > 0)
    .sort((a, b) => {
      const aPaid = a.purchasePrice ?? 0;
      const bPaid = b.purchasePrice ?? 0;
      return (
        (b.marketPrice! - bPaid) / bPaid - (a.marketPrice! - aPaid) / aPaid
      );
    })
    .slice(0, 5)
    .map((i) => ({
      displayName: i.displayName,
      purchasePrice: i.purchasePrice,
      marketPrice: i.marketPrice,
      category: i.category,
    }));

  const recentPurchases = transactions
    .filter((t) => t.type !== "cancelled")
    .slice(0, 5)
    .map((t) => ({
      orderNumber: t.orderNumber,
      type: t.type,
      amount: t.amount,
      cardCount: t.cardCount,
      createdAt: t.createdAt,
    }));

  return {
    generatedAt: new Date().toISOString(),
    store: {
      id: store.id,
      name: store.storeName,
      slug: store.storeSlug,
    },
    orders: {
      total: orders.length,
      open: orders.filter((o) => OPEN_STATUSES.has(o.status)).length,
      completed: orders.filter((o) => COMPLETED_STATUSES.has(o.status)).length,
      pipelineMarket,
      pipelineCash,
      byStatus,
    },
    purchases,
    inventory: inventoryReport,
    buyingTrends,
    pricingConfig: {
      defaultCashPercent: store.defaultCashPercent,
      defaultTradePercent: store.defaultTradePercent,
      slabCashPercent: store.slabCashPercent,
      slabTradePercent: store.slabTradePercent,
      minimumOffer: store.minimumOffer,
      manualReviewThreshold: store.manualReviewThreshold,
      conditionMultipliers: store.conditionMultipliers,
    },
    activeRules,
    insights,
    highlights: {
      recentPurchases,
      topInventoryItems,
    },
  };
}

export type OrderReportSummary = {
  analyzed: number;
  buy: number;
  pass: number;
  review: number;
  topSummary?: string;
};

export function summarizeOrderReports(cards: ScannedCard[]): OrderReportSummary {
  let buy = 0;
  let pass = 0;
  let review = 0;
  let topSummary: string | undefined;

  for (const card of cards) {
    const rec = card.resaleAnalysis?.recommendation;
    if (!rec) continue;
    if (rec === "buy" || rec === "negotiate") buy += 1;
    else if (rec === "pass") pass += 1;
    else review += 1;
    if (!topSummary && card.resaleAnalysis?.summary) {
      topSummary = card.resaleAnalysis.summary.slice(0, 140);
    }
  }

  return {
    analyzed: buy + pass + review,
    buy,
    pass,
    review,
    topSummary,
  };
}
