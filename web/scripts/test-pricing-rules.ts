import assert from "node:assert/strict";
import { applyStoreRules } from "../src/lib/processing/rules-engine";
import { applyConditionPricing } from "../src/lib/processing/condition-ladder";
import type { StoreRule, StoreSettings } from "../src/lib/types";

const settings = {
  defaultCashPercent: 0.5,
  defaultTradePercent: 0.65,
  minimumOffer: 1,
  conditionMultipliers: { NM: 1, LP: 0.9, MP: 0.8, HP: 0.6, DMG: 0.4 },
} as StoreSettings;

function testCommonUnderOneDollarBlocked() {
  const rule = {
    id: "1",
    title: "Commons under $1",
    active: true,
    priority: 10,
    appliesToCategories: ["magic"],
    ruleType: "min_purchase_price",
    ruleText: "Common and uncommon must be over $1",
    structuredFilters: { minMarketPrice: 1, rarities: ["common", "uncommon"] },
    createdAt: "",
    updatedAt: "",
  } as StoreRule;

  const result = applyStoreRules(
    [rule],
    {
      category: "magic",
      itemType: "raw",
      cardName: "Island",
      rarity: "common",
      conditionEstimate: "NM",
      confidence: 0.9,
    },
    0.75,
  );
  assert.equal(result.doNotBuy, true);
}

function testRareMythicBuyOverride() {
  const minRule = {
    id: "1",
    title: "Under $1",
    active: true,
    priority: 5,
    appliesToCategories: [],
    ruleType: "min_purchase_price",
    ruleText: "Must be over $1",
    structuredFilters: { minMarketPrice: 1, rarities: ["common", "uncommon"] },
    createdAt: "",
    updatedAt: "",
  } as StoreRule;

  const rareRule = {
    id: "2",
    title: "Buy rare/mythic anyway",
    active: true,
    priority: 20,
    appliesToCategories: ["magic"],
    ruleType: "rarity_buy_override",
    ruleText: "Buy rare and mythic even under $1",
    structuredFilters: { rarities: ["rare", "mythic"] },
    createdAt: "",
    updatedAt: "",
  } as StoreRule;

  const result = applyStoreRules(
    [minRule, rareRule],
    {
      category: "magic",
      itemType: "raw",
      cardName: "Bolt",
      rarity: "rare",
      conditionEstimate: "NM",
      confidence: 0.9,
    },
    0.8,
  );
  assert.equal(result.doNotBuy, false);
  assert.equal(result.skipMinimumOffer, true);
}

function testRoundUpOffers() {
  const rule = {
    id: "1",
    title: "Round up",
    active: true,
    priority: 1,
    appliesToCategories: [],
    ruleType: "round_up_offers",
    ruleText: "Round cash and trade to next dollar",
    createdAt: "",
    updatedAt: "",
  } as StoreRule;

  const result = applyStoreRules(
    [rule],
    {
      category: "magic",
      itemType: "raw",
      cardName: "Card",
      conditionEstimate: "NM",
      confidence: 0.9,
    },
    2.4,
  );
  assert.equal(result.roundOffersToWholeDollar, true);

  const priced = applyConditionPricing(2.4, "NM", settings, 0.5, 0.65, {
    roundOffersToWholeDollar: true,
  });
  assert.equal(priced.cashOffer, 2);
  assert.equal(priced.tradeOffer, 2);

  const pricedLow = applyConditionPricing(1.2, "NM", settings, 0.5, 0.65, {
    roundOffersToWholeDollar: true,
  });
  assert.equal(pricedLow.cashOffer, 1);
  assert.equal(pricedLow.tradeOffer, 1);
}

testCommonUnderOneDollarBlocked();
testRareMythicBuyOverride();
testRoundUpOffers();

console.log("pricing rule tests passed");
