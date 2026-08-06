import type { MarketSearchPlan } from "./types";

function isJapanesePlanLanguage(language?: string): boolean {
  const lang = (language ?? "").trim().toLowerCase();
  return lang === "jp" || lang === "ja" || lang.includes("japanese");
}

export function suspectBlocksTcgplayerPricingFromPlan(
  plan: MarketSearchPlan,
): boolean {
  if (plan.tcgplayerJapanProductId) return false;
  if (plan.suspectId?.startsWith("scan_derived:")) return true;
  if (plan.catalogSource === "scan_derived_fallback") return true;

  if (
    plan.category === "pokemon" &&
    isJapanesePlanLanguage(plan.identityLanguage) &&
    plan.catalogSource !== "pokemon_tcg"
  ) {
    return true;
  }

  return false;
}
