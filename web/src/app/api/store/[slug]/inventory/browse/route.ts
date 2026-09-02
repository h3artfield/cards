import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  browseStoreInventory,
  parseBrowseColorParams,
  type StoreInventoryColorFilter,
  type StoreInventoryGameFilter,
  type StoreInventorySortBy,
  type StoreInventoryTypeFilter,
} from "@/lib/deck-builder/store-inventory-browse";
import {
  browseCatalogPrintings,
  type CatalogBrowseGame,
} from "@/lib/deck-builder/store-catalog-browse";
import {
  INVENTORY_ORACLE_ACTION_CHIPS,
  INVENTORY_PRIMITIVE_ACTION_OPTIONS,
  INVENTORY_SEMANTIC_ABILITY_TYPES,
  INVENTORY_SEMANTIC_OWNERS,
  INVENTORY_SEMANTIC_ZONES,
  manaValuePresetToRange,
} from "@/lib/store-inventory/inventory-browse-filter-params";
import type { StoreInventorySemanticFilter } from "@/lib/deck-builder/store-inventory-semantic";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";

export const maxDuration = 120;

function parseBrowseSemanticFromParams(sp: URLSearchParams): StoreInventorySemanticFilter | undefined {
  const semantic: StoreInventorySemanticFilter = {};

  const types = sp.get("types")?.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) ?? [];
  if (types.length > 0) semantic.typeIncludes = types;

  const actionIds = sp.get("actions")?.split(",").map((a) => a.trim()).filter(Boolean) ?? [];
  if (actionIds.length > 0) {
    const tags = new Set<string>();
    const oracleTextAny = new Set<string>();
    for (const actionId of actionIds) {
      const chip = INVENTORY_ORACLE_ACTION_CHIPS.find((c) => c.id === actionId);
      if (!chip) continue;
      for (const tag of chip.tags) tags.add(tag);
      for (const text of chip.oracleTextAny ?? []) oracleTextAny.add(text);
    }
    if (tags.size > 0) semantic.oracleTagsAny = [...tags];
    if (oracleTextAny.size > 0) semantic.oracleTextAny = [...oracleTextAny];
  }

  const mv = sp.get("mv");
  if (mv === "0-2" || mv === "3-4" || mv === "5+") {
    const range = manaValuePresetToRange(mv);
    if (range.cmcMin != null) semantic.cmcMin = range.cmcMin;
    if (range.cmcMax != null) semantic.cmcMax = range.cmcMax;
  }

  const semActions =
    sp.get("semActions")?.split(",").map((a) => a.trim()).filter(Boolean) ?? [];
  if (semActions.length > 0) {
    semantic.primitiveActions = semActions.filter((a) =>
      (INVENTORY_PRIMITIVE_ACTION_OPTIONS as readonly string[]).includes(a),
    );
    semantic.primitiveActionMode = sp.get("semMode") === "all" ? "all" : "any";
  }

  const semAbility =
    sp.get("semAbility")?.split(",").map((a) => a.trim()).filter(Boolean) ?? [];
  if (semAbility.length > 0) {
    semantic.abilityTypes = semAbility.filter((a) =>
      (INVENTORY_SEMANTIC_ABILITY_TYPES as readonly string[]).includes(a),
    );
  }

  const semZones =
    sp.get("semZones")?.split(",").map((z) => z.trim()).filter(Boolean) ?? [];
  if (semZones.length > 0) {
    semantic.zones = semZones.filter((z) =>
      (INVENTORY_SEMANTIC_ZONES as readonly string[]).includes(z),
    );
  }

  const semOwners =
    sp.get("semOwners")?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
  if (semOwners.length > 0) {
    semantic.semanticOwners = semOwners.filter((o) =>
      (INVENTORY_SEMANTIC_OWNERS as readonly string[]).includes(o),
    );
  }

  if (
    semantic.cmcMin == null &&
    semantic.cmcMax == null &&
    !semantic.typeIncludes?.length &&
    !semantic.oracleTagsAny?.length &&
    !semantic.primitiveActions?.length &&
    !semantic.abilityTypes?.length &&
    !semantic.zones?.length &&
    !semantic.semanticOwners?.length
  ) {
    return undefined;
  }
  return semantic;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const sp = req.nextUrl.searchParams;
    const q = sp.get("q") ?? undefined;
    const game = (sp.get("game") ?? "magic") as StoreInventoryGameFilter;
    const color = (sp.get("color") ?? "all") as StoreInventoryColorFilter;
    const colors = sp.get("colors") ?? undefined;
    const colorCountRaw = sp.get("colorCount");
    const parsedColors = parseBrowseColorParams({
      colors,
      color,
      colorCount:
        colorCountRaw === "multicolor" ||
        colorCountRaw === "two" ||
        colorCountRaw === "three" ||
        colorCountRaw === "four" ||
        colorCountRaw === "five"
          ? colorCountRaw
          : undefined,
    });
    const cardType = (sp.get("type") ?? "all") as StoreInventoryTypeFilter;
    const page = parseInt(sp.get("page") ?? "1", 10);
    const limit = parseInt(sp.get("limit") ?? "100", 10);
    const sortRaw = sp.get("sort") ?? "name";
    const sortBy: StoreInventorySortBy =
      sortRaw === "price_asc" ||
      sortRaw === "price_desc" ||
      sortRaw === "cmc_asc" ||
      sortRaw === "cmc_desc"
        ? sortRaw
        : "name";
    const source = sp.get("source") === "catalog" ? "catalog" : "inventory";
    const semantic = parseBrowseSemanticFromParams(sp);

    if (source === "catalog") {
      const catalogGame = (["magic", "pokemon", "riftbound"].includes(game)
        ? game
        : "magic") as CatalogBrowseGame;
      const result = await browseCatalogPrintings({
        q,
        game: catalogGame,
        selectedColors: parsedColors.selectedColors,
        colorCount: parsedColors.colorCount,
        cardType,
        page,
        limit,
        sortBy,
        semantic,
      });
      return jsonOk(result);
    }

    const result = await browseStoreInventory({
      storeId: store.id,
      storeSlug: slug,
      q,
      game,
      selectedColors: parsedColors.selectedColors,
      colorCount: parsedColors.colorCount,
      cardType,
      page,
      limit,
      sortBy,
      semantic,
    });

    return jsonOk(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
