import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";
import type { ImplementedMechanismCatalogEntry } from "../../../scripts/lib/phase6a1-implemented-mechanism-catalog-v1";
import { DEFAULT_PROFESSOR_BREW_BRACKET } from "./professor-brew-bracket-v4-v1";

export function withCatalogEntryBracket(
  entry: ImplementedMechanismCatalogEntry,
  bracket: CommanderBracket = DEFAULT_PROFESSOR_BREW_BRACKET,
): ImplementedMechanismCatalogEntry {
  if (entry.bracket === bracket) return entry;
  return { ...entry, bracket };
}
