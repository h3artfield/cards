/**
 * Commander deck construction legality helpers — v4.9.
 * Basic lands are exempt from the singleton rule.
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { isBasicLand } from "@/lib/deck-evaluation/normalize-deck-input-v1";
import { isBasicLandName } from "./professor-basic-land-name-v1";

export const PROFESSOR_COMMANDER_LEGALITY_V4_9_V1_VERSION = "professor-commander-legality-v4-9-v1";

export { isBasicLandName } from "./professor-basic-land-name-v1";

export function isCommanderBasicLand(args: {
  name: string;
  catalogCard?: GoldenCatalogOracleCard | null;
}): boolean {
  if (args.catalogCard && isBasicLand(args.catalogCard)) return true;
  return isBasicLandName(args.name);
}

/** Non-basic cards must appear at most once by normalized name. */
export function evaluateSingletonPool(names: string[]): {
  pass: boolean;
  duplicateNonBasics: string[];
} {
  const seen = new Map<string, number>();
  const duplicateNonBasics: string[] = [];
  for (const name of names) {
    if (isBasicLandName(name)) continue;
    const key = normalizeOracleName(name);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 2) duplicateNonBasics.push(name);
  }
  return { pass: duplicateNonBasics.length === 0, duplicateNonBasics };
}

export function basicLandAllowsDuplicate(name: string): boolean {
  return isBasicLandName(name);
}
