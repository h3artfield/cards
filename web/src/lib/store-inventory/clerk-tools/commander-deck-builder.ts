import {
  commanderNameToSlug,
  fetchEdhrecCommanderMeta,
} from "../../deck-builder/edhrec-client";
import { validateCommanderDeck } from "../../deck-builder/commander-validation";
import type {
  CatalogCard,
  EdhrecCardRecommendation,
  StoreDeckCard,
} from "../../deck-builder/types";
import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";
import { cardCatalogLookupByName } from "./card-catalog";
import {
  formatEdhrecSampleNote,
  isLegalCommanderStrict,
} from "./commander-eligibility";
import {
  buildInventoryNameIndex,
  findInventoryExactMatch,
} from "./magic-commander-inventory";
import type { ClerkDeckCard, ClerkDeckList } from "../clerk-types";

export type MagicDeckCategory =
  | "commander"
  | "land"
  | "ramp"
  | "draw"
  | "interaction"
  | "protection"
  | "synergy"
  | "finisher"
  | "other";

const LAND_TARGET = 37;
const MAIN_TARGET = 99;

function unitPrice(c: StoreInventoryCard): number {
  return c.listPrice ?? c.tcgLowPrice ?? 0;
}

function mapEdhrecCategory(rec: EdhrecCardRecommendation): MagicDeckCategory {
  const c = `${rec.category} ${rec.categoryTag}`.toLowerCase();
  if (/land/.test(c)) return "land";
  if (/ramp|mana/.test(c)) return "ramp";
  if (/draw|card draw/.test(c)) return "draw";
  if (/removal|counter|interaction|board|wipe|free counter/.test(c)) {
    return "interaction";
  }
  if (/protection/.test(c)) return "protection";
  if (/wincon|finisher|combo/.test(c)) return "finisher";
  if (/high synergy|new cards|top cards/.test(c)) return "synergy";
  return "synergy";
}

function landSearchTerms(colorIdentity: string[]): string[] {
  if (colorIdentity.length === 1 && colorIdentity[0] === "U") {
    return ["island", "snow-covered island", "spider-man island"];
  }
  if (colorIdentity.length === 1 && colorIdentity[0] === "R") {
    return ["mountain", "snow-covered mountain"];
  }
  if (colorIdentity.length === 1 && colorIdentity[0] === "G") {
    return ["forest", "snow-covered forest"];
  }
  if (colorIdentity.length === 1 && colorIdentity[0] === "W") {
    return ["plains", "snow-covered plains"];
  }
  if (colorIdentity.length === 1 && colorIdentity[0] === "B") {
    return ["swamp", "snow-covered swamp"];
  }
  return ["command tower", "exotic orchard", "path of ancestry"];
}

async function loadCatalog(
  scryfallId: string,
  name: string,
  cache: Map<string, CatalogCard>,
): Promise<CatalogCard | null> {
  if (cache.has(scryfallId)) return cache.get(scryfallId)!;
  const hit = await cardCatalogLookupByName(name);
  if (!hit) return null;
  const card: CatalogCard = {
    id: hit.scryfallId,
    name: hit.name,
    set: "",
    collectorNumber: "",
    cmc: 0,
    typeLine: hit.typeLine ?? "",
    colorIdentity: hit.colorIdentity,
    commanderFormatLegal: hit.commanderFormatLegal ?? false,
    isCommander: Boolean(hit.canBeSoleCommander),
    updatedAt: new Date().toISOString(),
  };
  cache.set(scryfallId, card);
  return card;
}

export async function buildCommanderDeckFromInventory(input: {
  commanderName: string;
  inventory: StoreInventoryCard[];
  budget?: number;
}): Promise<ClerkDeckList> {
  const index = buildInventoryNameIndex(input.inventory);
  const commanderStock = findInventoryExactMatch(index, input.commanderName);
  const slug = commanderNameToSlug(input.commanderName);
  const meta = await fetchEdhrecCommanderMeta(slug);
  const commanderCatalog = await cardCatalogLookupByName(input.commanderName);
  const commanderColors =
    commanderCatalog?.colorIdentity ?? meta?.colorIdentity ?? [];

  const sampleNote = formatEdhrecSampleNote(meta?.numDecks);
  const strategy = meta
    ? `${input.commanderName} is a legal Commander${commanderColors.length ? ` (${commanderColors.join("")})` : ""}. This 100-card list uses EDHREC staples we have in stock${sampleNote ? ` — ${sampleNote}` : ""}.`
    : `Inventory-only Commander deck around ${input.commanderName}.`;

  const lines: ClerkDeckCard[] = [];
  const missing: string[] = [];
  const usedNames = new Set<string>();
  const usedInventory = new Map<string, number>();
  const catalogById = new Map<string, CatalogCard>();
  let spent = 0;
  let mainCount = 0;

  function canSpend(price: number): boolean {
    return input.budget == null || spent + price <= input.budget;
  }

  function addLine(
    slot: string,
    item: StoreInventoryCard | null,
    qty: number,
    category: MagicDeckCategory,
    note?: string,
  ): boolean {
    if (qty <= 0) return false;
    const price = item ? unitPrice(item) : 0;
    const lineTotal = price * qty;
    if (item && !canSpend(lineTotal)) return false;

    lines.push({
      slot,
      name: item?.name ?? slot,
      qty,
      category,
      inventoryItemId: item?.inventoryItemId,
      imageUrl: item?.imageUrl,
      imageProxyUrl: item?.imageProxyUrl,
      listPrice: item ? price : undefined,
      lineTotal: item ? lineTotal : undefined,
      inStock: Boolean(item),
      substituteNote: note,
    });

    if (item) {
      usedInventory.set(
        item.inventoryItemId,
        (usedInventory.get(item.inventoryItemId) ?? 0) + qty,
      );
      usedNames.add(item.name.toLowerCase());
      spent += lineTotal;
    }
    return true;
  }

  if (
    commanderStock &&
    commanderCatalog &&
    isLegalCommanderStrict(commanderCatalog)
  ) {
    addLine("Commander", commanderStock, 1, "commander");
    catalogById.set(commanderCatalog.scryfallId, {
      id: commanderCatalog.scryfallId,
      name: commanderCatalog.name,
      set: "",
      collectorNumber: "",
      cmc: 0,
      typeLine: commanderCatalog.typeLine ?? "",
      colorIdentity: commanderCatalog.colorIdentity,
      commanderFormatLegal: true,
      isCommander: true,
      updatedAt: new Date().toISOString(),
    });
  } else {
    missing.push(`Commander: ${input.commanderName}`);
    addLine("Commander", null, 1, "commander", "Not in stock");
  }

  async function tryAddMain(
    rec: EdhrecCardRecommendation,
    category: MagicDeckCategory,
  ): Promise<boolean> {
    if (mainCount >= MAIN_TARGET) return false;
    const inStock = findInventoryExactMatch(index, rec.name);
    if (!inStock || inStock.qty <= 0) return false;

    const key = inStock.name.toLowerCase();
    if (usedNames.has(key)) return false;
    const used = usedInventory.get(inStock.inventoryItemId) ?? 0;
    if (used >= inStock.qty) return false;

    const cat = await loadCatalog(rec.scryfallId, rec.name, catalogById);
    if (!cat) return false;
    if (
      cat.colorIdentity.length &&
      !cat.colorIdentity.every((c) => commanderColors.includes(c))
    ) {
      return false;
    }

    const synergyPct = Math.round(rec.synergy * 100);
    const note =
      rec.synergy !== 0
        ? `${synergyPct >= 0 ? "+" : ""}${synergyPct}% EDHREC synergy vs. average (${rec.category})`
        : rec.category;

    if (!addLine(rec.name, inStock, 1, category, note)) return false;
    mainCount += 1;
    return true;
  }

  const recs = [...(meta?.recommendations ?? [])].sort(
    (a, b) => b.synergy - a.synergy,
  );

  const categoryBudget: Record<MagicDeckCategory, number> = {
    commander: 1,
    land: LAND_TARGET,
    ramp: 11,
    draw: 9,
    interaction: 10,
    protection: 4,
    synergy: 20,
    finisher: 6,
    other: 10,
  };
  const categoryCounts: Record<MagicDeckCategory, number> = {
    commander: commanderStock ? 1 : 0,
    land: 0,
    ramp: 0,
    draw: 0,
    interaction: 0,
    protection: 0,
    synergy: 0,
    finisher: 0,
    other: 0,
  };

  for (const rec of recs) {
    if (mainCount >= MAIN_TARGET) break;
    const category = mapEdhrecCategory(rec);
    if (categoryCounts[category] >= categoryBudget[category]) continue;
    if (await tryAddMain(rec, category)) categoryCounts[category] += 1;
  }

  if (categoryCounts.land < LAND_TARGET) {
    for (const term of landSearchTerms(commanderColors)) {
      if (mainCount >= MAIN_TARGET || categoryCounts.land >= LAND_TARGET) break;
      const candidates = input.inventory
        .filter((c) => c.name.toLowerCase().includes(term) && c.qty > 0)
        .sort((a, b) => unitPrice(a) - unitPrice(b));
      for (const item of candidates) {
        if (mainCount >= MAIN_TARGET || categoryCounts.land >= LAND_TARGET) break;
        const key = item.name.toLowerCase();
        if (usedNames.has(key)) continue;
        const used = usedInventory.get(item.inventoryItemId) ?? 0;
        if (used >= item.qty) continue;
        if (addLine(item.name, item, 1, "land", "Mana base from stock")) {
          mainCount += 1;
          categoryCounts.land += 1;
        }
      }
    }
  }

  for (const rec of recs) {
    if (mainCount >= MAIN_TARGET) break;
    const category = mapEdhrecCategory(rec);
    if (await tryAddMain(rec, category)) categoryCounts[category] += 1;
  }

  if (mainCount < MAIN_TARGET) {
    missing.push(
      `${MAIN_TARGET - mainCount} main-deck card(s) — not enough staples in stock`,
    );
  }

  const deckCards: StoreDeckCard[] = [];
  if (commanderCatalog) {
    deckCards.push({
      scryfallId: commanderCatalog.scryfallId,
      qty: 1,
      board: "commander",
    });
  }
  for (const line of lines) {
    if (line.category === "commander" || !line.inStock) continue;
    const catEntry = [...catalogById.values()].find(
      (c) => c.name.toLowerCase() === line.name.toLowerCase(),
    );
    if (catEntry) {
      deckCards.push({
        scryfallId: catEntry.id,
        qty: line.qty,
        board: "main",
      });
    }
  }

  const validation =
    commanderCatalog && deckCards.length
      ? validateCommanderDeck({
          commanderId: commanderCatalog.scryfallId,
          cards: deckCards,
          catalogById,
        })
      : null;

  const inStockCards = lines
    .filter((l) => l.inStock)
    .reduce((s, l) => s + l.qty, 0);
  const deckTotal = lines
    .filter((l) => l.inStock && l.lineTotal != null)
    .reduce((s, l) => s + (l.lineTotal ?? 0), 0);

  const complete =
    mainCount === MAIN_TARGET &&
    Boolean(commanderStock) &&
    missing.length === 0 &&
    (validation?.valid ?? false);

  return {
    game: "magic",
    format: "Commander",
    archetype: input.commanderName,
    strategy,
    totalCards: lines.reduce((s, l) => s + l.qty, 0),
    targetCards: 100,
    inStockCards,
    deckTotal,
    budget: input.budget,
    withinBudget: input.budget == null || deckTotal <= input.budget,
    lines,
    missingSlots: missing,
    complete,
    mainDeckCount: mainCount,
    validationIssues: validation?.issues.map((i) => i.message) ?? [],
  };
}
