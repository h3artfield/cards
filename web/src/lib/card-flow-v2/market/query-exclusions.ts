import type { CardCategory } from "../types";
import type { MarketIdentityFields } from "./types";

/** eBay Browse / Marketplace Insights `q` parameter max length. */
export const EBAY_Q_MAX_LENGTH = 100;

const RAW_FORBIDDEN_GRADED = [
  "psa",
  "cgc",
  "bgs",
  "sgc",
  "tag",
  "slab",
  "graded",
  "gem mint",
  "gem-mint",
];

const GRADED_FORBIDDEN_RAW = ["raw", "ungraded", "nm ", "near mint ungraded"];

const COMMON_FORBIDDEN = [
  "lot of",
  " bulk ",
  "lot ",
  "bundle",
  "break",
  "sealed",
  "booster box",
  "booster pack",
  "etb",
  "elite trainer",
  "proxy",
  "custom card",
  "orica",
  "repack",
  "mystery",
  "digital",
  "code card",
  "online code",
];

/** Single-token exclusions safe for eBay `-keyword` syntax (priority order). */
const RAW_GRADE_QUERY_EXCLUSIONS = ["PSA", "CGC", "BGS", "SGC", "slab", "graded"];
const GRADED_QUERY_EXCLUSIONS = ["raw", "ungraded"];
const COMMON_QUERY_EXCLUSIONS = ["lot", "bundle", "proxy", "sealed", "digital"];

const CATEGORY_QUERY_EXCLUSIONS: Partial<Record<CardCategory, string[]>> = {
  pokemon: ["booster", "code", "japanese"],
  mtg: ["gold", "arena", "oversized", "proxy"],
  yugioh: ["speed", "proxy"],
  sports: ["break", "reprint", "custom"],
  riftbound: ["deck", "display", "playmat"],
};

function finishQueryExclusions(finish?: string): string[] {
  if (!finish || ["unknown", "unknown_finish"].includes(finish.toLowerCase())) {
    return [];
  }
  const f = finish.toLowerCase();
  if (f.includes("reverse")) return ["normal"];
  if (f === "normal" || f.includes("nonfoil")) return ["reverse"];
  if (f === "foil" || f === "holofoil") return ["nonfoil"];
  return [];
}

export function buildForbiddenTerms(
  category: CardCategory,
  gradeCtx: "raw" | "graded" | "unknown",
): string[] {
  const base = [...COMMON_FORBIDDEN];
  if (gradeCtx === "raw") base.push(...RAW_FORBIDDEN_GRADED);
  if (gradeCtx === "graded") base.push(...GRADED_FORBIDDEN_RAW);

  switch (category) {
    case "mtg":
      base.push(
        "gold border",
        "world championship",
        "oversized",
        "art card",
        "arena",
      );
      break;
    case "yugioh":
      base.push("speed duel");
      break;
    case "sports":
      base.push("case break", "pick your team", "reprint", "custom");
      break;
    default:
      break;
  }
  return [...new Set(base)];
}

/**
 * High-value subset of forbidden terms for eBay `q` minus syntax.
 * Full forbiddenTerms still apply in comp-matcher after fetch.
 */
export function buildQueryExclusionTerms(
  category: CardCategory,
  gradeCtx: "raw" | "graded" | "unknown",
  fields: Pick<MarketIdentityFields, "finish" | "language">,
): string[] {
  const terms: string[] = [];

  if (gradeCtx === "raw") terms.push(...RAW_GRADE_QUERY_EXCLUSIONS);
  else if (gradeCtx === "graded") terms.push(...GRADED_QUERY_EXCLUSIONS);

  terms.push(...COMMON_QUERY_EXCLUSIONS);
  terms.push(...(CATEGORY_QUERY_EXCLUSIONS[category] ?? []));

  if (fields.language?.toLowerCase() === "english") {
    terms.push("japanese");
  }

  terms.push(...finishQueryExclusions(fields.finish));

  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

export function formatEbayExclusionTerm(term: string): string {
  const token = term.trim().replace(/^-/, "").split(/\s+/)[0];
  if (!token) return "";
  return `-${token}`;
}

export function appendEbayQueryExclusions(
  positiveQuery: string,
  exclusionTerms: string[],
  maxLength = EBAY_Q_MAX_LENGTH,
): {
  query: string;
  appliedExclusions: string[];
  droppedExclusions: string[];
} {
  const appliedExclusions: string[] = [];
  const droppedExclusions: string[] = [];
  let query = positiveQuery.trim();

  for (const term of exclusionTerms) {
    const minus = formatEbayExclusionTerm(term);
    if (!minus) continue;
    const candidate = `${query} ${minus}`.trim();
    if (candidate.length <= maxLength) {
      query = candidate;
      appliedExclusions.push(term);
    } else {
      droppedExclusions.push(term);
    }
  }

  return { query, appliedExclusions, droppedExclusions };
}
