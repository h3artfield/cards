import type {

  CardCategory,

  CardResaleAnalysis,

  ScannedCard,

  StoreRule,

  VisionResult,

} from "../types";

import {

  cardRarityMatchesFilter,

  parseRarityFilterList,

} from "./rule-rarity";

import { getStaffSelectedSuspect } from "../card-flow-v2/staff-suspect-selection";



export interface RuleEngineResult {

  doNotBuy: boolean;

  manualReview: boolean;

  cashPercentOverride?: number;

  tradePercentOverride?: number;

  matchedRules: string[];

  notes: string[];

  skipMinimumOffer?: boolean;

  roundOffersToWholeDollar?: boolean;

}



export type StoreRuleEvaluationContext = {

  resaleAnalysis?: CardResaleAnalysis;

};



export function enrichVisionForStoreRules(

  vision: VisionResult,

  card?: Pick<ScannedCard, "cardFlowV2Identity" | "pricingJson" | "visionJson">,

): VisionResult {

  if (vision.rarity?.trim()) return vision;



  const suspect = card?.cardFlowV2Identity

    ? getStaffSelectedSuspect(card.cardFlowV2Identity)

    : undefined;

  const fromSuspect = suspect?.rarity?.trim();

  const fromPricing = (

    card?.pricingJson as { rarity?: string } | undefined

  )?.rarity?.trim();

  const fromVision = (

    card?.visionJson as { rarity?: string } | undefined

  )?.rarity?.trim();

  const rarity = fromSuspect || fromPricing || fromVision;

  if (!rarity) return vision;

  return { ...vision, rarity };

}



export function rulePricingOptions(result: RuleEngineResult) {

  return {

    skipMinimumOffer: result.skipMinimumOffer,

    roundOffersToWholeDollar: result.roundOffersToWholeDollar,

  };

}



function ruleTextImpliesAllCategories(rule: StoreRule): boolean {

  const text = `${rule.title} ${rule.ruleText}`.toLowerCase();

  return /\bany card\b|\ball cards\b|\bevery card\b/.test(text);

}



function ruleImpliesSlowMover(rule: StoreRule): boolean {

  const text = `${rule.title} ${rule.ruleText}`.toLowerCase();

  return text.includes("slow");

}



function matchesSlowMoverResale(

  rule: StoreRule,

  ctx?: StoreRuleEvaluationContext,

): boolean {

  if (!ruleImpliesSlowMover(rule)) return false;

  const ra = ctx?.resaleAnalysis;

  if (!ra) return false;

  if (ra.recommendation === "pass") return true;

  if (ra.salesFrequency === "low") return true;

  return Boolean(ra.risks?.some((r) => /slow/i.test(r)));

}



function ruleMatchesCategory(

  rule: StoreRule,

  category?: CardCategory,

): boolean {

  if (rule.ruleType === "do_not_buy" && ruleTextImpliesAllCategories(rule)) {

    return true;

  }

  return matchesCategory(rule, category);

}



function matchesCategory(rule: StoreRule, category?: CardCategory): boolean {

  if (!rule.appliesToCategories.length) return true;

  if (!category) return false;

  const normalized = normalizeRuleCategory(category);

  return rule.appliesToCategories.some(

    (c) => normalizeRuleCategory(c) === normalized,

  );

}



/** Normalize store rule categories (Pokémon → pokemon). */

export function normalizeRuleCategory(raw?: string): CardCategory | undefined {

  if (!raw) return undefined;

  const n = raw

    .toLowerCase()

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .trim();

  if (n === "pokemon" || n === "pokemon tcg") return "pokemon";

  if (n === "magic" || n === "mtg") return "magic";

  if (n === "yugioh" || n === "yu-gi-oh") return "yugioh";

  if (n === "sports") return "sports";

  if (n === "other") return "other";

  return n as CardCategory;

}



function inferDoNotBuyPriceFilter(

  rule: StoreRule,

): Record<string, unknown> | undefined {

  const text = `${rule.title} ${rule.ruleText}`.toLowerCase();

  const under = text.match(

    /(?:under|below|less than|not accepting any card with a value under)\s*\$?\s*(\d+(?:\.\d+)?)/,

  );

  if (under) {

    return { maxMarketPrice: Number(under[1]) };

  }

  return undefined;

}



function effectiveStructuredFilters(rule: StoreRule): Record<string, unknown> | undefined {

  if (hasStructuredFilters(rule)) {

    return rule.structuredFilters as Record<string, unknown>;

  }

  if (rule.ruleType === "do_not_buy") {

    return inferDoNotBuyPriceFilter(rule);

  }

  return undefined;

}



function hasStructuredFilters(rule: StoreRule): boolean {

  const f = rule.structuredFilters;

  if (!f || typeof f !== "object") return false;



  for (const [key, value] of Object.entries(f)) {

    if (value == null || value === "") continue;

    if (Array.isArray(value) && value.length === 0) continue;

    if ((key === "slabOnly" || key === "damagedOnly") && !value) continue;

    return true;

  }

  return false;

}



function minPurchaseThreshold(rule: StoreRule): number | undefined {

  const filters = rule.structuredFilters;

  if (!filters) return undefined;

  const raw =

    filters.minMarketPrice ?? filters.minPurchasePrice ?? filters.minPrice;

  const n = Number(raw);

  return Number.isFinite(n) && n > 0 ? n : undefined;

}



function matchesMinPurchasePriceRule(

  rule: StoreRule,

  vision: VisionResult,

  marketPrice: number,

): boolean {

  if (!ruleMatchesCategory(rule, vision.category)) return false;

  const min = minPurchaseThreshold(rule);

  if (min == null) return false;

  if (marketPrice <= 0 || marketPrice >= min) return false;



  const rarities = parseRarityFilterList(rule.structuredFilters?.rarities);

  if (rarities.length > 0) {

    return cardRarityMatchesFilter(vision.rarity, rarities);

  }

  return true;

}



function matchesRarityBuyOverrideRule(

  rule: StoreRule,

  vision: VisionResult,

): boolean {

  if (!ruleMatchesCategory(rule, vision.category)) return false;

  const rarities = parseRarityFilterList(rule.structuredFilters?.rarities);

  if (rarities.length === 0) return false;

  return cardRarityMatchesFilter(vision.rarity, rarities);

}



function matchesStructuredFilters(

  rule: StoreRule,

  vision: VisionResult,

  marketPrice: number,

): boolean {

  const filters = rule.structuredFilters;

  if (!filters) return false;



  let matched = false;



  const years = filters.years;

  if (Array.isArray(years) && years.length > 0) {

    if (!vision.year || !years.map(String).includes(String(vision.year))) {

      return false;

    }

    matched = true;

  } else if (filters.year != null && filters.year !== "") {

    if (!vision.year || String(filters.year) !== String(vision.year)) {

      return false;

    }

    matched = true;

  }



  if (filters.setName != null && String(filters.setName) !== "") {

    if (!vision.setName) return false;

    const target = String(filters.setName).toLowerCase();

    if (!vision.setName.toLowerCase().includes(target)) return false;

    matched = true;

  }



  const rarityFilter = parseRarityFilterList(filters.rarities);

  if (rarityFilter.length > 0) {

    if (!cardRarityMatchesFilter(vision.rarity, rarityFilter)) return false;

    matched = true;

  }



  if (filters.minMarketPrice != null) {

    if (marketPrice <= 0) return false;

    if (marketPrice < Number(filters.minMarketPrice)) return false;

    matched = true;

  }

  if (filters.maxMarketPrice != null) {

    if (marketPrice <= 0) return false;

    if (marketPrice > Number(filters.maxMarketPrice)) return false;

    matched = true;

  }

  if (filters.slabOnly) {

    if (vision.itemType !== "graded") return false;

    matched = true;

  }

  if (filters.damagedOnly) {

    if (vision.conditionEstimate === "NM") return false;

    matched = true;

  }



  return matched;

}



function ruleImpliesSlabOnly(rule: StoreRule): boolean {

  const text = `${rule.title} ${rule.ruleText}`.toLowerCase();

  return (

    Boolean(rule.structuredFilters?.slabOnly) ||

    (text.includes("slab") && !text.includes("raw"))

  );

}



function ruleMatches(

  rule: StoreRule,

  vision: VisionResult,

  marketPrice: number,

  ctx?: StoreRuleEvaluationContext,

): boolean {

  if (!ruleMatchesCategory(rule, vision.category)) return false;



  if (ruleImpliesSlabOnly(rule) && vision.itemType !== "graded") {

    return false;

  }



  if (rule.ruleType === "min_purchase_price") {

    return matchesMinPurchasePriceRule(rule, vision, marketPrice);

  }



  if (rule.ruleType === "rarity_buy_override") {

    return matchesRarityBuyOverrideRule(rule, vision);

  }



  if (rule.ruleType === "round_up_offers") {

    return true;

  }



  if (rule.ruleType === "do_not_buy") {

    const filters = effectiveStructuredFilters(rule);

    if (filters) {

      return matchesStructuredFilters(

        { ...rule, structuredFilters: filters },

        vision,

        marketPrice,

      );

    }

    return matchesSlowMoverResale(rule, ctx);

  }



  if (hasStructuredFilters(rule)) {

    return matchesStructuredFilters(rule, vision, marketPrice);

  }



  if (rule.ruleType === "note_only") {

    return true;

  }



  return false;

}



export function applyStoreRules(

  rules: StoreRule[],

  vision: VisionResult,

  marketPrice: number,

  ctx?: StoreRuleEvaluationContext,

): RuleEngineResult {

  const active = [...rules]

    .filter((r) => r.active)

    .sort((a, b) => b.priority - a.priority);



  const result: RuleEngineResult = {

    doNotBuy: false,

    manualReview: false,

    matchedRules: [],

    notes: [],

  };



  let buyOverride = false;



  for (const rule of active) {

    if (!ruleMatches(rule, vision, marketPrice, ctx)) continue;



    result.matchedRules.push(rule.title);



    switch (rule.ruleType) {

      case "do_not_buy":

        if (!buyOverride) result.doNotBuy = true;

        break;

      case "min_purchase_price":

        if (!buyOverride) result.doNotBuy = true;

        break;

      case "rarity_buy_override":

        buyOverride = true;

        result.doNotBuy = false;

        result.skipMinimumOffer = true;

        break;

      case "manual_review":

        result.manualReview = true;

        break;

      case "adjust_percentage":

        if (rule.cashPercentOverride != null)

          result.cashPercentOverride = rule.cashPercentOverride;

        if (rule.tradePercentOverride != null)

          result.tradePercentOverride = rule.tradePercentOverride;

        break;

      case "round_up_offers":

        result.roundOffersToWholeDollar = true;

        break;

      case "note_only":

        if (rule.ownerNote) result.notes.push(rule.ownerNote);

        break;

    }

  }



  if (buyOverride) {

    result.doNotBuy = false;

  }



  return result;

}



export function buildRulesPromptContext(rules: StoreRule[]): string {

  const active = rules.filter((r) => r.active);

  if (!active.length) return "No active store rules.";

  return active

    .map((r) => `- [${r.ruleType}] ${r.title}: ${r.ruleText}`)

    .join("\n");

}



export function cardMatchesRuleText(

  card: ScannedCard,

  rule: StoreRule,

): boolean {

  const text = rule.ruleText.toLowerCase();

  const haystack = [

    card.category,

    card.detectedName,

    card.setName,

    card.year,

    card.playerName,

    card.slabCompany,

  ]

    .filter(Boolean)

    .join(" ")

    .toLowerCase();



  if (rule.structuredFilters?.year && card.year !== rule.structuredFilters.year)

    return false;



  if (text.includes("2014") && card.year === "2014") return true;

  if (text.includes("2015") && card.year === "2015") return true;

  if (text.includes("damaged") && card.conditionEstimate === "DMG") return true;

  if (text.includes("graded") && card.itemType === "graded") return true;



  return haystack.length > 0 && text.split(" ").some((w) => w.length > 4 && haystack.includes(w));

}


