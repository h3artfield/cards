import { applyStoreRules } from "../src/lib/processing/rules-engine";
import { buildV2OfferPreview } from "../src/lib/card-flow-v2/offer/v2-offer-preview";
import type { StoreRule, ScannedCard, StoreSettings } from "../src/lib/types";

const underTenRule = {
  id: "1",
  storeId: "s1",
  title: "under 10 dollars",
  active: true,
  priority: 10,
  appliesToCategories: ["Pokémon"],
  ruleType: "do_not_buy",
  ruleText: "not accepting any card with a value under 10 dollars",
  createdAt: "",
  updatedAt: "",
} as StoreRule;

const magicVision = {
  category: "magic",
  itemType: "raw",
  cardName: "Spider-Man",
  conditionEstimate: "LP",
  confidence: 0.9,
};
const pokeVision = {
  category: "pokemon",
  itemType: "raw",
  cardName: "Cinderace",
  conditionEstimate: "NM",
  confidence: 0.9,
};

console.log("Magic $2.55:", applyStoreRules([underTenRule], magicVision, 2.55));
console.log("Pokemon $2.23:", applyStoreRules([underTenRule], pokeVision, 2.23));

const settings = {
  defaultCashPercent: 0.5,
  defaultTradePercent: 0.65,
  slabCashPercent: 0.5,
  slabTradePercent: 0.65,
} as StoreSettings;

const card = {
  category: "pokemon",
  marketPrice: 2.23,
  cardFlowV2Identity: { staffSelection: { suspectId: "x" }, suspects: [] },
} as ScannedCard;

const preview = buildV2OfferPreview({
  card,
  decision: {
    usableForOfferPreview: true,
    marketValue: 2.23,
    confidence: "low",
    blockers: [],
    basis: "pricecharting",
  } as never,
  settings,
  rules: [underTenRule],
  identity: card.cardFlowV2Identity as never,
});

console.log(
  "V2 preview blocked:",
  preview.storeRuleBlocked,
  preview.recommendedAction,
);
