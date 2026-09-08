/**
 * Resolving the commander a hand-built deck starts with.
 *
 * Two catalogs answer two different questions and both are needed. The
 * resolution catalog supplies the oracle id and colour identity every later
 * legality check is measured against. The commander search catalog says whether
 * the card may sit in the command zone at all.
 *
 * The picker only ever offers eligible commanders, so this is not the first
 * line of defence. It is worth the lookup anyway: a deck whose commander
 * resolved to something that cannot lead one would report a colour identity
 * violation on nearly every card, with nothing on screen explaining why.
 */
import { lookupGoldenByName } from "../../../scripts/lib/load-golden-catalog-index";
import { getDeckResolutionCatalogRuntime } from "../deck-synthesis/professor-brew-catalog-runtime-v1";
import {
  getCommanderSearchCatalogRuntime,
  isPaperEligibleCommanderNameFast,
} from "../deck-synthesis/professor-commander-search-catalog-v1";
import type { EditableDeckCommanderV1 } from "./types-v1";

export const PROFESSOR_DECK_EDITOR_HAND_COMMANDER_V1_VERSION =
  "professor-deck-editor-hand-deck-commander-v1";

export type HandDeckCommanderResolutionV1 =
  | { ok: true; commander: EditableDeckCommanderV1 }
  | { ok: false; message: string };

export async function resolveHandDeckCommanderV1(
  rawName: string,
): Promise<HandDeckCommanderResolutionV1> {
  const name = rawName.trim();
  if (!name) return { ok: false, message: "Pick a commander to start the deck" };

  const [catalog, commanderCatalog] = await Promise.all([
    getDeckResolutionCatalogRuntime(),
    getCommanderSearchCatalogRuntime(),
  ]);

  const card = lookupGoldenByName(catalog, name);
  if (!card) {
    return { ok: false, message: `We could not find a card called ${name}` };
  }
  if (!isPaperEligibleCommanderNameFast(commanderCatalog, card.canonicalName)) {
    return { ok: false, message: `${card.canonicalName} cannot be a commander` };
  }

  return {
    ok: true,
    commander: {
      oracleId: card.oracleId,
      name: card.canonicalName,
      colorIdentity: [...(card.colorIdentity ?? [])],
    },
  };
}
