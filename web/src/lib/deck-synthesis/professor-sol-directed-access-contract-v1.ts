/**
 * ACCESS budget obligation contract (P0 truth).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { BrewBlueprintV417, FunctionalBudgetV417 } from "./professor-brew-blueprint-v4-17-v1";
import { buildAccessPortfolioStateV417 } from "./professor-brew-blueprint-access-v4-17-v1";

export const PROFESSOR_SOL_DIRECTED_ACCESS_CONTRACT_V1_VERSION = "professor-sol-directed-access-contract-v1";

export type AccessBudgetObligationV1 = "REQUIRED_MINIMUM" | "PREFERRED_TARGET" | "OPTIONAL";

export function isTutorsAndAccessBudgetCategory(category: string): boolean {
  return category.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() === "tutorsandaccess";
}

export function resolveAccessBudgetObligationV1(budget: FunctionalBudgetV417): AccessBudgetObligationV1 {
  const obligation = (budget as FunctionalBudgetV417 & { obligation?: AccessBudgetObligationV1 }).obligation;
  if (obligation) return obligation;
  if (!isTutorsAndAccessBudgetCategory(String(budget.category ?? budget.function ?? ""))) return "OPTIONAL";
  if (budget.minimum <= 0) return "OPTIONAL";
  return "REQUIRED_MINIMUM";
}

export function findTutorsAndAccessBudgetV1(blueprint: BrewBlueprintV417): FunctionalBudgetV417 | null {
  return (
    blueprint.functionalBudgets.find((b) =>
      isTutorsAndAccessBudgetCategory(String(b.category ?? b.function ?? "")),
    ) ?? null
  );
}

export function accessPortfolioClosureSatisfiedV1(args: {
  blueprint: BrewBlueprintV417;
  catalog?: DeckResolutionCatalog | null;
}): { satisfied: boolean; obligation: AccessBudgetObligationV1; portfolioStatus: string | null } {
  const budget = findTutorsAndAccessBudgetV1(args.blueprint);
  if (!budget) {
    return { satisfied: true, obligation: "OPTIONAL", portfolioStatus: null };
  }
  const obligation = resolveAccessBudgetObligationV1(budget);
  if (obligation === "OPTIONAL") {
    return { satisfied: true, obligation, portfolioStatus: null };
  }
  const portfolio = buildAccessPortfolioStateV417({
    blueprint: args.blueprint,
    catalog: args.catalog ?? null,
  });
  if (obligation === "REQUIRED_MINIMUM") {
    return {
      satisfied: portfolio.status === "MINIMUM_SATISFIED" || portfolio.status === "PREFERRED_SATISFIED",
      obligation,
      portfolioStatus: portfolio.status,
    };
  }
  return {
    satisfied: portfolio.status === "PREFERRED_SATISFIED",
    obligation,
    portfolioStatus: portfolio.status,
  };
}
