import type { PriceChartingProduct } from "../../processing/pricing/pricecharting-pricing";
import type { MarketSearchPlan } from "./types";

export type PriceChartingTierSelection = {
  label: string;
  cents?: number;
  accepted: boolean;
  warning?: string;
};

function centsToUsd(cents?: number): number | undefined {
  if (cents == null || cents <= 0) return undefined;
  return cents / 100;
}

/** V2 explicit tier guard — selects only tiers matching plan grade context. */
export function pickPriceChartingTiersForPlan(
  product: PriceChartingProduct,
  plan: MarketSearchPlan,
): PriceChartingTierSelection[] {
  const allTiers: PriceChartingTierSelection[] = [
    { label: "Ungraded", cents: product["loose-price"], accepted: false },
    { label: "Grade 8", cents: product["new-price"], accepted: false },
    { label: "Graded", cents: product["graded-price"], accepted: false },
    { label: "Manual-only", cents: product["manual-only-price"], accepted: false },
    { label: "PSA 10", cents: product["manual-only-price"], accepted: false },
    { label: "BGS 10", cents: product["bgs-10-price"], accepted: false },
    { label: "CGC 10", cents: product["condition-17-price"], accepted: false },
    { label: "SGC 10", cents: product["condition-18-price"], accepted: false },
  ];

  const ctx = plan.gradeContext;
  const company = (plan.gradingCompany ?? "").toLowerCase();
  const grade = plan.grade ?? "";

  if (ctx === "raw") {
    return allTiers.map((t) => {
      if (t.label === "Ungraded" && t.cents) {
        return { ...t, accepted: true };
      }
      if (["Manual-only", "PSA 10", "BGS 10", "CGC 10", "SGC 10", "Graded"].includes(t.label) && t.cents) {
        return {
          ...t,
          accepted: false,
          warning: `Excluded ${t.label} tier — plan is raw/ungraded context`,
        };
      }
      return t;
    });
  }

  if (ctx === "graded") {
    if (grade === "10") {
      if (company.includes("bgs")) {
        return markAccepted(allTiers, ["BGS 10"], "BGS 10 tier for graded plan");
      }
      if (company.includes("cgc")) {
        return markAccepted(allTiers, ["CGC 10"], "CGC 10 tier for graded plan");
      }
      if (company.includes("sgc")) {
        return markAccepted(allTiers, ["SGC 10"], "SGC 10 tier for graded plan");
      }
      return markAccepted(allTiers, ["PSA 10"], "PSA 10 tier for graded plan");
    }
    if (grade === "9" || grade === "9.5") {
      return markAccepted(allTiers, ["Graded"], "Grade 9 tier for graded plan");
    }
    if (grade === "8" || grade === "8.5") {
      return markAccepted(allTiers, ["Grade 8"], "Grade 8 tier for graded plan");
    }
    return markAccepted(allTiers, ["Graded"], "Generic graded tier — exact grade tier unavailable");
  }

  return allTiers.map((t) =>
    t.label === "Ungraded" && t.cents
      ? { ...t, accepted: true, warning: "Grade context unknown — using ungraded tier only" }
      : { ...t, accepted: false, warning: "Grade context unknown — tier excluded" },
  );
}

function markAccepted(
  tiers: PriceChartingTierSelection[],
  acceptLabels: string[],
  note: string,
): PriceChartingTierSelection[] {
  return tiers.map((t) => {
    if (acceptLabels.includes(t.label) && t.cents) {
      return { ...t, accepted: true, warning: note };
    }
    if (t.cents && !acceptLabels.includes(t.label)) {
      return {
        ...t,
        accepted: false,
        warning: `Excluded ${t.label} — does not match ${note}`,
      };
    }
    return t;
  });
}

export function priceChartingCompsFromPlan(
  product: PriceChartingProduct,
  plan: MarketSearchPlan,
): {
  comps: Array<{ label: string; price: number; warning?: string }>;
  warnings: string[];
} {
  const tiers = pickPriceChartingTiersForPlan(product, plan);
  const warnings: string[] = [];
  const comps: Array<{ label: string; price: number; warning?: string }> = [];

  for (const tier of tiers) {
    const price = centsToUsd(tier.cents);
    if (!price) continue;
    if (tier.warning && !tier.accepted) warnings.push(tier.warning);
    if (tier.accepted) {
      comps.push({ label: tier.label, price, warning: tier.warning });
    }
  }

  if (!comps.length) {
    warnings.push(
      "No PriceCharting tier matched plan grade context — excluded all tiers.",
    );
  }

  return { comps, warnings };
}
