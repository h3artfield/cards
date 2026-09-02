import type { StoreInventorySemanticFilter } from "../deck-builder/store-inventory-semantic";

export type SemanticBrowseSignals = {
  actionTypes: Set<string>;
  abilityTypes: Set<string>;
  zones: Set<string>;
  semanticOwners: Set<string>;
};

export function isRc8SemanticFilterActive(
  semantic: StoreInventorySemanticFilter | undefined,
): boolean {
  if (!semantic) return false;
  return Boolean(
    semantic.primitiveActions?.length ||
      semantic.abilityTypes?.length ||
      semantic.zones?.length ||
      semantic.semanticOwners?.length,
  );
}

export function semanticSignalsMatchRc8Filter(
  signals: SemanticBrowseSignals,
  semantic: StoreInventorySemanticFilter,
): boolean {
  if (semantic.primitiveActions?.length) {
    const mode = semantic.primitiveActionMode ?? "any";
    if (mode === "all") {
      if (!semantic.primitiveActions.every((a) => signals.actionTypes.has(a))) {
        return false;
      }
    } else if (
      !semantic.primitiveActions.some((a) => signals.actionTypes.has(a))
    ) {
      return false;
    }
  }

  if (semantic.abilityTypes?.length) {
    if (
      !semantic.abilityTypes.some((wanted) =>
        [...signals.abilityTypes].some(
          (a) => a.toLowerCase() === wanted.toLowerCase(),
        ),
      )
    ) {
      return false;
    }
  }

  if (semantic.zones?.length) {
    if (!semantic.zones.some((z) => signals.zones.has(z))) return false;
  }

  if (semantic.semanticOwners?.length) {
    if (!semantic.semanticOwners.some((o) => signals.semanticOwners.has(o))) {
      return false;
    }
  }

  return true;
}
