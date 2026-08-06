import type { VisionResult } from "../../types";
import { buildSportsSearchQueries, sportsBrand, sportsPlayerName } from "./sports-search-queries";
import { isVisionGradedSlab, mergeVisionSlabFields, slabSearchTag } from "../slab-pricing";
import { normalizeVisionCardNumber } from "../pokemon-utils";

export interface CompSearchQuery {
  /** Primary keyword string for marketplaces. */
  primary: string;
  /** Narrow query with set + number when available. */
  narrow: string;
  /** Graded slab query when applicable. */
  graded?: string;
}

function cleanPart(value?: string): string {
  return value?.trim() ?? "";
}

function stripPromoSuffix(cardNumber?: string): string {
  if (!cardNumber) return "";
  return cardNumber.replace(/\s*(promo|holo|reverse).*$/i, "").trim();
}

export function buildCompSearchQuery(vision: VisionResult): CompSearchQuery {
  const v = normalizeVisionCardNumber(mergeVisionSlabFields(vision));
  const name = cleanPart(v.cardName);
  const set = cleanPart(v.setName);
  const number = stripPromoSuffix(cleanPart(v.cardNumber));
  const variant = cleanPart(v.variant);
  const player = cleanPart(v.playerName);
  const team = cleanPart(v.team);
  const year = cleanPart(v.year);
  const parallel = cleanPart(v.parallel);

  const parts: string[] = [];
  if (v.category === "sports") {
    const player = sportsPlayerName(v);
    const brand = sportsBrand(v);
    if (year) parts.push(year);
    if (brand) parts.push(brand);
    if (player) parts.push(player);
    if (number) parts.push(number.replace(/^#/, ""));
    if (team) parts.push(team);
    if (parallel) parts.push(parallel);
  } else {
    if (name) parts.push(name);
    if (set) parts.push(set);
    if (number) parts.push(number);
    if (variant) parts.push(variant);
  }

  const primary = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const narrowParts =
    v.category === "sports"
      ? buildSportsSearchQueries(v).slice(0, 1)
      : [name, set, number].filter(Boolean);
  const narrow = narrowParts.join(" ").replace(/\s+/g, " ").trim() || primary;

  const slabTag = slabSearchTag(v);
  let graded: string | undefined;
  if (isVisionGradedSlab(v) && slabTag) {
    graded = [name, set, number, slabTag].filter(Boolean).join(" ");
  }

  return {
    primary: primary || name || "trading card",
    narrow,
    graded,
  };
}

/** Best single query for live marketplace links and eBay sold search. */
export function primaryCompSearchQuery(vision: VisionResult): string {
  const v = mergeVisionSlabFields(vision);
  const { graded, narrow, primary } = buildCompSearchQuery(v);
  if (isVisionGradedSlab(v) && graded) return graded;
  return narrow || primary;
}

/** Titles that usually indicate lots, junk, or irrelevant listings. */
export function isLikelyLotListing(title: string): boolean {
  const lower = title.toLowerCase();
  const block = [
    "lot of",
    " bulk ",
    " x10",
    " x20",
    " x50",
    " x100",
    "proxy",
    "custom card",
    "repack",
    "mystery",
    "random",
    " booster box",
    "elite trainer",
    "etb ",
    "booster pack",
    "sealed",
  ];
  return block.some((term) => lower.includes(term));
}
