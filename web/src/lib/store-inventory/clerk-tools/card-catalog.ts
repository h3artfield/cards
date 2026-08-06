import { isCurrentCatalogPrinting } from "../../deck-builder/catalog-lifecycle";
import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import { fetchScryfallCardById } from "../../deck-builder/scryfall-catalog";
import { isCommanderFormatLegal } from "../../deck-builder/commander-classification";
import type { CatalogOracleCard } from "../../deck-builder/types";
import type { CardCatalogHit } from "../clerk-types";
import { resolveCardNameControlled } from "./controlled-card-name-resolution";
import {
  lookupCardByName,
  resetLookupBudget,
} from "./scryfall-lookup-service";

export { resetLookupBudget, clearLookupCaches, getSessionLiveCallCount, getLookupAttemptLog, getServerLookupTrace } from "./scryfall-lookup-service";

function hitFromOracle(
  oracle: CatalogOracleCard,
  printing?: {
    id: string;
    setName?: string;
    imageNormal?: string;
    commanderFormatLegal?: boolean;
  } | null,
): CardCatalogHit {
  return {
    scryfallId: printing?.id ?? oracle.printingIds[0] ?? oracle.id,
    oracleId: oracle.id,
    name: oracle.canonicalName,
    setName: printing?.setName,
    colorIdentity: oracle.colorIdentity,
    typeLine: oracle.typeLine,
    canBeSoleCommander:
      oracle.commanderClassification?.canBeSoleCommander ??
      oracle.commanderEligibility.eligible,
    commanderFormatLegal:
      printing?.commanderFormatLegal ??
      isCommanderFormatLegal(oracle.legalities),
    imageNormal: printing?.imageNormal,
  };
}

/** Merge printing-level hit with oracle-level canonical facts when available. */
export async function mergeCatalogHitWithOracle(
  hit: CardCatalogHit,
): Promise<CardCatalogHit> {
  const oracleId = hit.oracleId?.trim();
  if (!oracleId) return hit;

  const oracle = await deckBuilderStore.getCatalogOracleCard(oracleId);
  if (!oracle) return hit;

  const printingId = hit.scryfallId;
  const printing = printingId
    ? await deckBuilderStore.getCatalogCard(printingId)
    : null;
  if (printing && !isCurrentCatalogPrinting(printing)) return hit;

  return hitFromOracle(oracle, printing ?? { id: hit.scryfallId });
}

export async function cardCatalogLookupByName(
  name: string,
): Promise<CardCatalogHit | null> {
  const controlled = await resolveCardNameControlled(name);
  const lookupName =
    controlled.status === "resolved" && controlled.canonicalName
      ? controlled.canonicalName
      : name.trim();

  const hit = await lookupCardByName(lookupName);
  if (!hit) return null;
  return mergeCatalogHitWithOracle(hit);
}

export async function cardCatalogLookupByOracleId(
  oracleId: string,
): Promise<CardCatalogHit | null> {
  const trimmed = oracleId.trim();
  if (!trimmed) return null;

  const oracle = await deckBuilderStore.getCatalogOracleCard(trimmed);
  if (!oracle) return null;

  const printingId = oracle.printingIds[0];
  const printing = printingId
    ? await deckBuilderStore.getCatalogCard(printingId)
    : null;
  if (printing && !isCurrentCatalogPrinting(printing)) return null;

  return hitFromOracle(oracle, printing);
}

export async function cardCatalogLookupById(
  scryfallId: string,
): Promise<CardCatalogHit | null> {
  const cached = await deckBuilderStore.getCatalogCard(scryfallId);
  if (cached) {
    if (!isCurrentCatalogPrinting(cached)) return null;
    const base: CardCatalogHit = {
      scryfallId: cached.id,
      oracleId: cached.oracleId,
      name: cached.name,
      setName: cached.setName,
      colorIdentity: cached.colorIdentity,
      typeLine: cached.typeLine,
      commanderFormatLegal: cached.commanderFormatLegal,
      imageNormal: cached.imageNormal,
    };
    return mergeCatalogHitWithOracle(base);
  }
  const fetched = await fetchScryfallCardById(scryfallId);
  if (!fetched) return null;
  const base: CardCatalogHit = {
    scryfallId: fetched.id,
    oracleId: fetched.oracleId,
    name: fetched.name,
    setName: fetched.setName,
    colorIdentity: fetched.colorIdentity,
    typeLine: fetched.typeLine,
    commanderFormatLegal: fetched.commanderFormatLegal,
    imageNormal: fetched.imageNormal,
  };
  return mergeCatalogHitWithOracle(base);
}

export async function cardCatalogTool(input: {
  cardNames: string[];
  scryfallIds?: string[];
}): Promise<CardCatalogHit[]> {
  const hits: CardCatalogHit[] = [];
  const seen = new Set<string>();

  for (const name of input.cardNames) {
    const hit = await cardCatalogLookupByName(name);
    if (!hit || seen.has(hit.scryfallId)) continue;
    seen.add(hit.scryfallId);
    hits.push(hit);
  }

  for (const id of input.scryfallIds ?? []) {
    const hit = await cardCatalogLookupById(id);
    if (!hit || seen.has(hit.scryfallId)) continue;
    seen.add(hit.scryfallId);
    hits.push(hit);
  }

  return hits;
}
