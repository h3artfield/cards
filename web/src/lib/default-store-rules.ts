import type { StoreRule } from "./types";

export const DEFAULT_STORE_RULES: Omit<
  StoreRule,
  "id" | "createdAt" | "updatedAt"
>[] = [
  {
    title: "No Pokémon 2014-2015",
    active: true,
    priority: 10,
    appliesToCategories: ["pokemon"],
    ruleType: "do_not_buy",
    ruleText: "We do not buy Pokémon cards from 2014 or 2015.",
    structuredFilters: { years: ["2014", "2015"] },
  },
  {
    title: "Sports over $50 review",
    active: true,
    priority: 8,
    appliesToCategories: ["sports"],
    ruleType: "manual_review",
    ruleText: "All sports cards over $50 require manual review.",
    structuredFilters: { minMarketPrice: 50 },
  },
  {
    title: "All graded slabs review",
    active: true,
    priority: 9,
    appliesToCategories: [],
    ruleType: "manual_review",
    ruleText: "All graded slabs require owner review.",
    structuredFilters: { slabOnly: true },
  },
  {
    title: "Modern sports cash 40%",
    active: true,
    priority: 5,
    appliesToCategories: ["sports"],
    ruleType: "adjust_percentage",
    ruleText: "Cash offer for modern sports cards is 40%.",
    cashPercentOverride: 0.4,
  },
];
