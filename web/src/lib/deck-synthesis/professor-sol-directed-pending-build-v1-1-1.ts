/** Client-side pending Sol-directed build handoff (setup → progress page). */
import type { UserSemanticPreferencesV111 } from "./professor-user-semantic-preferences-v1-1-1";
import type { ProfessorImportedDeckCardV111 } from "./professor-imported-decklist-v1-1-1";
import type { SolDirectedBuildModeV111 } from "./professor-sol-directed-build-types-v1-1-1";

export type SolDirectedPendingBuildPayloadV111 = {
  commanderName: string;
  bracket: number;
  playstyle: string;
  deckTheme?: string;
  winPreference?: string;
  commanderStyle: string;
  deckPreferences?: string;
  userSemanticPreferences?: UserSemanticPreferencesV111;
  mode?: SolDirectedBuildModeV111;
  importedCards?: ProfessorImportedDeckCardV111[];
};

export function solDirectedPendingBuildStorageKey(slug: string): string {
  return `professor-sol-directed-pending-${slug}`;
}

export function saveSolDirectedPendingBuild(slug: string, payload: SolDirectedPendingBuildPayloadV111): void {
  sessionStorage.setItem(solDirectedPendingBuildStorageKey(slug), JSON.stringify(payload));
}

export function readSolDirectedPendingBuild(slug: string): SolDirectedPendingBuildPayloadV111 | null {
  const raw = sessionStorage.getItem(solDirectedPendingBuildStorageKey(slug));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SolDirectedPendingBuildPayloadV111;
  } catch {
    return null;
  }
}

export function clearSolDirectedPendingBuild(slug: string): void {
  sessionStorage.removeItem(solDirectedPendingBuildStorageKey(slug));
}

/** @deprecated Prefer read + clear after successful POST */
export function consumeSolDirectedPendingBuild(slug: string): SolDirectedPendingBuildPayloadV111 | null {
  const pending = readSolDirectedPendingBuild(slug);
  if (pending) clearSolDirectedPendingBuild(slug);
  return pending;
}
