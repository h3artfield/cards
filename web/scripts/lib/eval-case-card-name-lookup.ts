/**
 * Resolve evaluation case ID → intended Magic card name from seed generators.
 */
import { buildEvalCardNameLookup } from "../generate-oracle-action-eval-cases";
import { HELD_OUT_SEEDS } from "../generate-oracle-action-held-out-set";
import { BLIND_SEEDS } from "../generate-oracle-action-final-blind-set";
import { DEV_EXPANSION_V8_SEEDS } from "../development-set-v8-expansion-seeds";
import { DEV_EXPANSION_V9_SEEDS } from "../development-set-v9-expansion-seeds";

const SYNTHETIC_CASE_ID_PREFIXES = [
  "Extra-",
  "Static-",
  "May-",
  "Delayed-",
  "ExileUntil-",
  "Multi-",
  "CDA-",
  "Reflexive-",
  "Intervening-",
  "Aftermath-",
  "Prototype-",
  "Mutate-",
  "Class-",
  "Transform-",
] as const;

export function isSyntheticEvalCaseId(caseId: string): boolean {
  return SYNTHETIC_CASE_ID_PREFIXES.some((prefix) => caseId.startsWith(prefix));
}

export function buildFullEvalCardNameLookup(): Map<string, string> {
  const lookup = buildEvalCardNameLookup();

  for (let i = 0; i < HELD_OUT_SEEDS.length; i++) {
    lookup.set(`held-${String(i + 1).padStart(4, "0")}`, HELD_OUT_SEEDS[i].name);
  }

  for (let i = 0; i < BLIND_SEEDS.length; i++) {
    lookup.set(`blind-${String(i + 1).padStart(4, "0")}`, BLIND_SEEDS[i].name);
  }

  for (let i = 0; i < DEV_EXPANSION_V8_SEEDS.length; i++) {
    lookup.set(`dev-exp-${String(i + 1).padStart(3, "0")}`, DEV_EXPANSION_V8_SEEDS[i].name);
  }

  for (let i = 0; i < DEV_EXPANSION_V9_SEEDS.length; i++) {
    lookup.set(`dev-v9-${String(i + 1).padStart(3, "0")}`, DEV_EXPANSION_V9_SEEDS[i].name);
  }

  return lookup;
}
