import type { CatalogCard, EdhrecCardRecommendation } from "../../deck-builder/types";
import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";
import { browseStoreInventory } from "../../deck-builder/store-inventory-browse";
import { cardCatalogLookupByName, cardCatalogLookupByOracleId } from "./card-catalog";
import { isLegalCommanderForHit } from "./commander-eligibility";
import type { MagicDeckCategory } from "./commander-deck-builder";
import {
  buildInventoryNameIndex,
  findInventoryExactMatch,
} from "./magic-commander-inventory";
import {
  inventorySearchMultiple,
  inventorySearchTool,
} from "./inventory-search";
import type { CommanderDeckBuildSession, CommanderDeckBuildStageId } from "./commander-deck-build-state";
import { isMtgRagEnabled } from "../../mtg-rag/constants";
import { hybridRetrieveMtgKnowledge } from "../../mtg-rag/hybrid-retrieval";

const LAND_TARGET = 37;
const MAIN_TARGET = 99;

const CATEGORY_BUDGET: Record<MagicDeckCategory, number> = {
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
    return ["island", "snow-covered island"];
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

function stagesForCategory(stageId: CommanderDeckBuildStageId): MagicDeckCategory[] {
  switch (stageId) {
    case "commander":
      return ["commander"];
    case "ramp":
      return ["ramp"];
    case "draw":
      return ["draw"];
    case "interaction":
      return ["interaction", "protection"];
    case "synergy":
      return ["synergy", "finisher"];
    case "lands":
      return ["land"];
    case "fill":
      return ["synergy", "finisher", "other", "ramp", "draw", "interaction"];
    default:
      return ["other"];
  }
}

async function loadStageInventory(input: {
  storeId: string;
  storeSlug: string;
  session: CommanderDeckBuildSession;
  stageId: CommanderDeckBuildStageId;
}): Promise<StoreInventoryCard[]> {
  const { session, stageId } = input;
  const byId = new Map<string, StoreInventoryCard>();

  const merge = (items: StoreInventoryCard[]) => {
    for (const item of items) {
      if (item.qty > 0) byId.set(item.inventoryItemId, item);
    }
  };

  if (stageId === "commander") {
    const multi = await inventorySearchMultiple({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      cardNames: [session.commanderName],
      game: "magic",
      cardType: "commander",
    });
    merge(multi.items);
    return [...byId.values()];
  }

  const categories = stagesForCategory(stageId);
  const recs = [...session.edhrecRecommendations]
    .filter((r) => categories.includes(mapEdhrecCategory(r)))
    .sort((a, b) => b.synergy - a.synergy)
    .slice(0, 24);

  if (recs.length > 0) {
    const multi = await inventorySearchMultiple({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      cardNames: recs.map((r) => r.name),
      game: "magic",
      maxPrice: session.budget,
    });
    merge(multi.items);
  }

  const semanticQuery =
    stageId === "ramp"
      ? "ramp"
      : stageId === "draw"
        ? "card draw"
        : stageId === "interaction"
          ? "removal counterspells"
          : stageId === "lands"
            ? "lands"
            : null;

  if (stageId === "lands") {
    const browse = await inventorySearchTool({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      params: { game: "magic", cardType: "all", q: "land", limit: 48 },
    });
    merge(browse.items);
  } else if (semanticQuery) {
    const browse = await inventorySearchTool({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      params: {
        game: "magic",
        cardType: "all",
        limit: 32,
        semantic: {
          oracleTagsAny:
            stageId === "ramp"
              ? ["ramp"]
              : stageId === "draw"
                ? ["draw"]
                : stageId === "interaction"
                  ? ["removal", "counterspell"]
                  : [],
        },
        semanticOnly: true,
      },
    });
    merge(browse.items);
  }

  if (stageId === "lands") {
    for (const term of landSearchTerms(session.commanderColors)) {
      const result = await browseStoreInventory({
        storeId: input.storeId,
        storeSlug: input.storeSlug,
        game: "magic",
        q: term,
        color: "all",
        cardType: "all",
        page: 1,
        limit: 24,
      });
      merge(result.items);
    }
  }

  return [...byId.values()];
}

async function loadCatalog(
  name: string,
  cache: Map<string, CatalogCard>,
): Promise<CatalogCard | null> {
  const key = name.toLowerCase();
  for (const c of cache.values()) {
    if (c.name.toLowerCase() === key) return c;
  }
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
  cache.set(card.id, card);
  return card;
}

export async function runCommanderDeckBuildStage(input: {
  storeId: string;
  storeSlug: string;
  session: CommanderDeckBuildSession;
  stageId: CommanderDeckBuildStageId;
}): Promise<CommanderDeckBuildSession> {
  const session = { ...input.session };
  session.usedNames = [...session.usedNames];
  session.lines = [...session.lines];
  session.missingSlots = [...session.missingSlots];
  session.categoryCounts = { ...session.categoryCounts };
  session.usedInventory = { ...session.usedInventory };

  const catalogCache = new Map<string, CatalogCard>();
  const inventory = await loadStageInventory(input);

  function canSpend(price: number): boolean {
    return session.budget == null || session.spent + price <= session.budget;
  }

  function addLine(
    slot: string,
    item: StoreInventoryCard | null,
    qty: number,
    category: MagicDeckCategory,
    note?: string,
    meta?: { oracleId?: string; scryfallId?: string; displayName?: string },
  ): boolean {
    if (qty <= 0) return false;
    const price = item ? unitPrice(item) : 0;
    const lineTotal = price * qty;
    if (item && !canSpend(lineTotal)) return false;

    const displayName = meta?.displayName ?? item?.name ?? slot;

    session.lines.push({
      slot,
      name: displayName,
      qty,
      category,
      oracleId: meta?.oracleId ?? item?.oracleId,
      scryfallId: meta?.scryfallId ?? item?.scryfallId,
      inventoryItemId: item?.inventoryItemId,
      imageUrl: item?.imageUrl,
      imageProxyUrl: item?.imageProxyUrl,
      listPrice: item ? price : undefined,
      lineTotal: item ? lineTotal : undefined,
      inStock: Boolean(item),
      substituteNote: note,
    });

    if (item) {
      session.usedInventory[item.inventoryItemId] =
        (session.usedInventory[item.inventoryItemId] ?? 0) + qty;
      session.usedNames.push(item.name.toLowerCase());
      session.spent += lineTotal;
    }
    return true;
  }

  async function tryAddMain(
    rec: EdhrecCardRecommendation,
    category: MagicDeckCategory,
  ): Promise<boolean> {
    if (session.mainCount >= MAIN_TARGET) return false;
    const index = buildInventoryNameIndex(inventory);
    const inStock = findInventoryExactMatch(index, rec.name);
    if (!inStock || inStock.qty <= 0) return false;

    const key = inStock.name.toLowerCase();
    if (session.usedNames.includes(key)) return false;
    const used = session.usedInventory[inStock.inventoryItemId] ?? 0;
    if (used >= inStock.qty) return false;

    const cat = await loadCatalog(rec.name, catalogCache);
    if (
      cat?.colorIdentity.length &&
      !cat.colorIdentity.every((c) => session.commanderColors.includes(c))
    ) {
      return false;
    }

    const synergyPct = Math.round(rec.synergy * 100);
    const note =
      rec.synergy !== 0
        ? `${synergyPct >= 0 ? "+" : ""}${synergyPct}% EDHREC synergy (${rec.category})`
        : rec.category;

    if (!addLine(rec.name, inStock, 1, category, note)) return false;
    session.mainCount += 1;
    session.categoryCounts[category] += 1;
    return true;
  }

  const { stageId } = input;

  if (stageId === "commander") {
    const index = buildInventoryNameIndex(inventory);
    const commanderStock = findInventoryExactMatch(index, session.commanderName);
    const commanderCatalog = session.commanderOracleId
      ? await cardCatalogLookupByOracleId(session.commanderOracleId)
      : await cardCatalogLookupByName(session.commanderName);

    if (commanderCatalog?.colorIdentity?.length) {
      session.commanderColors = commanderCatalog.colorIdentity;
    }

    if (
      commanderStock &&
      commanderCatalog &&
      (await isLegalCommanderForHit(commanderCatalog))
    ) {
      addLine("Commander", commanderStock, 1, "commander", undefined, {
        oracleId: commanderCatalog.oracleId,
        scryfallId: commanderCatalog.scryfallId,
        displayName: session.commanderName,
      });
      session.categoryCounts.commander = 1;
      session.commanderScryfallId = commanderCatalog.scryfallId;
      if (commanderCatalog.oracleId) {
        session.commanderOracleId = commanderCatalog.oracleId;
      }
    } else {
      session.missingSlots.push(`Commander: ${session.commanderName}`);
      addLine("Commander", null, 1, "commander", "Not in stock", {
        oracleId: commanderCatalog?.oracleId ?? session.commanderOracleId,
        scryfallId: commanderCatalog?.scryfallId,
        displayName: session.commanderName,
      });
      if (commanderCatalog?.scryfallId) {
        session.commanderScryfallId = commanderCatalog.scryfallId;
      }
    }
    return session;
  }

  if (stageId === "synergy" && isMtgRagEnabled() && !session.ragNotes) {
    try {
      const rag = await hybridRetrieveMtgKnowledge({
        question: `${session.commanderName} commander synergy engines win conditions`,
        intent: "commander_strategy",
        limit: 3,
      });
      if (rag.hits.length > 0) {
        session.ragNotes = rag.hits.map((h) => h.chunk.text.slice(0, 200)).join(" ");
      }
    } catch {
      /* optional */
    }
  }

  const targetCategories = stagesForCategory(stageId);
  const recs = [...session.edhrecRecommendations].sort(
    (a, b) => b.synergy - a.synergy,
  );

  for (const rec of recs) {
    if (session.mainCount >= MAIN_TARGET) break;
    const category = mapEdhrecCategory(rec);
    if (!targetCategories.includes(category)) continue;
    if (session.categoryCounts[category] >= CATEGORY_BUDGET[category]) continue;
    await tryAddMain(rec, category);
  }

  if (stageId === "lands" && session.categoryCounts.land < LAND_TARGET) {
    for (const term of landSearchTerms(session.commanderColors)) {
      if (session.mainCount >= MAIN_TARGET || session.categoryCounts.land >= LAND_TARGET) {
        break;
      }
      const candidates = inventory
        .filter((c) => c.name.toLowerCase().includes(term) && c.qty > 0)
        .sort((a, b) => unitPrice(a) - unitPrice(b));
      for (const item of candidates) {
        if (session.mainCount >= MAIN_TARGET || session.categoryCounts.land >= LAND_TARGET) {
          break;
        }
        if (session.usedNames.includes(item.name.toLowerCase())) continue;
        const used = session.usedInventory[item.inventoryItemId] ?? 0;
        if (used >= item.qty) continue;
        if (addLine(item.name, item, 1, "land", "Mana base from stock")) {
          session.mainCount += 1;
          session.categoryCounts.land += 1;
        }
      }
    }
  }

  if (stageId === "fill" && session.mainCount < MAIN_TARGET) {
    session.missingSlots.push(
      `${MAIN_TARGET - session.mainCount} main-deck card(s) — not enough staples in stock`,
    );
  }

  return session;
}

