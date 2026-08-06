import type { StoreInventoryCard, StoreInventoryColorFilter } from "../../deck-builder/store-inventory-browse";
import type { CardCatalogHit } from "../clerk-types";
import type { CatalogCard, CatalogOracleCard } from "../../deck-builder/types";
import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import { matchesColor } from "./magic-commander-inventory";

type CatalogLike = Pick<
  CatalogCard | CardCatalogHit,
  "colorIdentity" | "typeLine" | "oracleId" | "commanderFormatLegal"
>;

/** True when card can legally occupy the command zone as sole commander. */
export function isLegalCommanderStrict(
  hit: Pick<CardCatalogHit, "canBeSoleCommander"> | null | undefined,
): boolean {
  return hit?.canBeSoleCommander === true;
}

/** True when card is legal to include in a Commander-format deck — NOT command-zone eligible. */
export function isCommanderFormatLegalStrict(catalog: CatalogLike | null | undefined): boolean {
  return catalog?.commanderFormatLegal === true;
}

export function isCommanderEligibleOracle(
  oracle: Pick<CatalogOracleCard, "commanderEligibility" | "commanderClassification"> | null | undefined,
): boolean {
  if (oracle?.commanderClassification) {
    return oracle.commanderClassification.canBeSoleCommander === true;
  }
  return oracle?.commanderEligibility.eligible === true;
}

/** @deprecated Use isCommanderEligibleOracle */
export function isCommanderEligibleOracleLegacy(
  oracle: Pick<CatalogOracleCard, "commanderEligibility"> | null | undefined,
): boolean {
  return isCommanderEligibleOracle(oracle);
}

export async function isLegalCommanderForHit(
  hit: Pick<CardCatalogHit, "oracleId"> | null | undefined,
): Promise<boolean> {
  if (!hit) return false;
  if (hit.oracleId) {
    const oracle = await deckBuilderStore.getCatalogOracleCard(hit.oracleId);
    if (oracle) return isCommanderEligibleOracle(oracle);
    return false;
  }
  return false;
}

export async function isLegalCommanderForInventoryCard(
  card: Pick<StoreInventoryCard, "oracleId" | "isCommander" | "typeLine">,
): Promise<boolean> {
  const typeLine = (card.typeLine ?? "").toLowerCase();
  if (typeLine.includes("token")) return false;
  if (
    (typeLine.includes("sorcery") ||
      typeLine.includes("instant") ||
      typeLine.includes("artifact") ||
      typeLine.includes("enchantment")) &&
    !typeLine.includes("background")
  ) {
    if (!typeLine.includes("legendary") || !typeLine.includes("creature")) {
      return false;
    }
  }

  if (card.oracleId) {
    const oracle = await deckBuilderStore.getCatalogOracleCard(card.oracleId);
    if (oracle) return isCommanderEligibleOracle(oracle);
  }

  return false;
}

export function passesCommanderPrice(
  card: StoreInventoryCard,
  maxPrice?: number,
): boolean {
  if (maxPrice == null) return true;
  const p = card.listPrice ?? card.tcgLowPrice;
  /** Unknown price — do not exclude; only reject when price is known and over budget. */
  if (p == null || p <= 0) return true;
  return p <= maxPrice;
}

export function passesCommanderColor(
  colorIdentity: string[],
  filter: StoreInventoryColorFilter,
): boolean {
  return matchesColor(colorIdentity ?? [], filter);
}

export function formatEdhrecSampleNote(numDecks?: number): string | undefined {
  if (numDecks == null) return undefined;
  if (numDecks < 50) {
    return `Early data — ${numDecks} deck${numDecks === 1 ? "" : "s"} on EDHREC`;
  }
  return `${numDecks.toLocaleString()} EDHREC decks`;
}
