import { saveProfessorSetupPrefill } from "../store-inventory/gathering-deck-build";

export function professorSetupPath(slug: string): string {
  return `/s/${encodeURIComponent(slug)}/inventory/professor`;
}

export function prefillProfessorCommander(slug: string, commanderName: string): void {
  saveProfessorSetupPrefill(slug, {
    commanderName,
    deckPreferences: "",
    cardNames: [],
  });
}
