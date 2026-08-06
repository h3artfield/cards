import type { VisionResult } from "../../types";
import type { PriceChartingProduct } from "./pricecharting-pricing";
import { buildSportsSearchQueries } from "./sports-search-queries";
import { isVisionGradedSlab, mergeVisionSlabFields } from "../slab-pricing";

export function centsToUsd(cents?: number): number | undefined {
  if (cents == null || cents <= 0) return undefined;
  return cents / 100;
}

/** Grade tiers per https://www.pricecharting.com/api-documentation */
export function pickPriceChartingTiers(
  product: PriceChartingProduct,
  vision: VisionResult,
): { label: string; cents?: number }[] {
  const v = mergeVisionSlabFields(vision);
  const isGraded = isVisionGradedSlab(v);
  if (!isGraded) {
    return [
      { label: "Ungraded", cents: product["loose-price"] },
      { label: "Grade 8", cents: product["new-price"] },
    ];
  }

  const grade = v.slabGrade?.trim() ?? "";
  const company = v.slabCompany?.toLowerCase() ?? "";

  if (grade === "10") {
    if (company.includes("bgs")) {
      return [{ label: "BGS 10", cents: product["bgs-10-price"] }];
    }
    if (company.includes("cgc")) {
      return [{ label: "CGC 10", cents: product["condition-17-price"] }];
    }
    if (company.includes("sgc")) {
      return [{ label: "SGC 10", cents: product["condition-18-price"] }];
    }
    return [{ label: "PSA 10", cents: product["manual-only-price"] }];
  }

  if (grade === "9" || grade === "9.5") {
    return [{ label: "Grade 9", cents: product["graded-price"] }];
  }

  if (grade === "8" || grade === "8.5") {
    return [{ label: "Grade 8", cents: product["new-price"] }];
  }

  return [{ label: `Graded ${grade}`, cents: product["graded-price"] }];
}

export function pickPriceChartingMarket(
  product: PriceChartingProduct,
  vision: VisionResult,
): number {
  for (const tier of pickPriceChartingTiers(product, vision)) {
    const price = centsToUsd(tier.cents);
    if (price != null) return price;
  }
  return (
    centsToUsd(product["loose-price"]) ??
    centsToUsd(product["graded-price"]) ??
    0
  );
}

export function priceChartingGameSlug(consoleName: string): string {
  return consoleName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9&-]+/g, "");
}

export function priceChartingProductSlug(productName: string): string {
  return productName
    .toLowerCase()
    .replace(/#/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Human-facing product page, e.g. /game/pokemon-sword-&-shield/snorlax-vmax-206 */
export function priceChartingProductUrl(product: PriceChartingProduct): string {
  const consoleName = product["console-name"];
  const productName = product["product-name"];
  if (consoleName && productName) {
    const consoleSlug = priceChartingGameSlug(consoleName);
    const productSlug = priceChartingProductSlug(productName);
    return `https://www.pricecharting.com/game/${consoleSlug}/${productSlug}`;
  }
  if (productName) {
    return `https://www.pricecharting.com/search-products?q=${encodeURIComponent(productName)}&type=prices`;
  }
  return "https://www.pricecharting.com";
}

export function isPriceChartingSuccess(
  product: PriceChartingProduct & { status?: string },
): boolean {
  return product.status === "success" || product.status == null;
}

export function buildPriceChartingQueries(vision: VisionResult): string[] {
  const v = mergeVisionSlabFields(vision);
  const name = v.cardName?.trim();
  const set = v.setName?.trim();
  const number = v.cardNumber?.replace(/\s*(promo|holo|reverse).*$/i, "").trim();
  const collector = number?.match(/^(\d+)/)?.[1];

  const queries: string[] = [];

  const slabTag =
    isVisionGradedSlab(v) && v.slabCompany && v.slabGrade
      ? `${v.slabCompany} ${v.slabGrade}`
      : undefined;
  if (slabTag) {
    queries.push([name, set, number, slabTag].filter(Boolean).join(" "));
  }
  if (name && set && number) queries.push(`${name} ${set} ${number}`);
  if (name && collector) queries.push(`${name} #${collector}`);
  if (name && set) queries.push(`${name} ${set}`);
  if (name) queries.push(name);

  if (v.category === "pokemon" && name && set) {
    queries.push(`${name} ${set} pokemon`);
  }
  if (v.category === "pokemon" && set && number) {
    queries.push(`${set} ${number} pokemon`);
  }
  if (v.category === "pokemon" && set && collector) {
    queries.push(`${set} ${collector} pokemon`);
  }

  if (v.category === "sports") {
    const sports = buildSportsSearchQueries(v);
    if (slabTag) {
      return [
        ...new Set(
          sports.map((q) => `${q} ${slabTag}`.trim()).concat(queries),
        ),
      ].filter(Boolean);
    }
    return sports;
  }

  return [...new Set(queries.filter(Boolean))];
}

interface ProductSummary {
  id?: string;
  "product-name"?: string;
  "console-name"?: string;
}

export function scorePriceChartingProduct(
  product: ProductSummary,
  vision: VisionResult,
): number {
  const title = String(product["product-name"] ?? "").toLowerCase();
  const consoleName = String(product["console-name"] ?? "").toLowerCase();
  const name = vision.cardName?.trim().toLowerCase() ?? "";
  const set = vision.setName?.trim().toLowerCase() ?? "";
  const number = vision.cardNumber?.trim() ?? "";
  const collector = number.match(/^(\d+)/)?.[1];

  let score = 0;
  if (name && title.includes(name)) score += 40;
  if (set && (title.includes(set) || consoleName.includes(set))) score += 35;
  if (number && title.includes(number)) score += 30;
  else if (collector && new RegExp(`\\b#?${collector}\\b`).test(title)) score += 25;

  if (vision.category === "pokemon" && consoleName.includes("pokemon")) {
    score += 10;
  }

  if (vision.category === "sports") {
    const player = vision.playerName?.trim().toLowerCase() ?? "";
    const year = vision.year?.trim() ?? "";
    const brand = vision.brand?.trim().toLowerCase() ?? "";
    const parallel = vision.parallel?.trim().toLowerCase() ?? "";
    const team = vision.team?.trim().toLowerCase() ?? "";

    if (player && title.includes(player)) score += 45;
    if (year && (title.includes(year) || consoleName.includes(year))) score += 30;
    if (brand && (title.includes(brand) || consoleName.includes(brand))) score += 20;
    if (parallel && title.includes(parallel)) score += 25;
    if (team && title.includes(team)) score += 10;
    if (consoleName.includes("baseball") || consoleName.includes("football") ||
        consoleName.includes("basketball") || consoleName.includes("hockey") ||
        consoleName.includes("topps") || consoleName.includes("panini") ||
        consoleName.includes("bowman") || consoleName.includes("prizm") ||
        consoleName.includes("sportflics")) {
      score += 8;
    }
  }

  return score;
}

export function enrichVisionFromPriceCharting(
  vision: VisionResult,
  product: PriceChartingProduct,
): VisionResult {
  const productName = product["product-name"]?.trim() ?? "";
  const consoleName = product["console-name"]?.trim() ?? "";
  return {
    ...vision,
    category: vision.category ?? "sports",
    cardName: productName || vision.cardName,
    setName: consoleName || vision.setName,
    playerName:
      vision.playerName ??
      (productName.split(" ").slice(0, 2).join(" ") || undefined),
  };
}
