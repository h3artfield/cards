"use client";

import { useMemo, useState } from "react";
import {
  clerkDragPayload,
  CLERK_DRAG_MIME,
} from "./clerk-gathering";

const COLOR_META: Record<
  string,
  { label: string; symbol: string; bg: string; text: string }
> = {
  W: { label: "White", symbol: "☀", bg: "bg-amber-100", text: "text-amber-900" },
  U: { label: "Blue", symbol: "💧", bg: "bg-sky-100", text: "text-sky-900" },
  B: { label: "Black", symbol: "💀", bg: "bg-zinc-300", text: "text-zinc-900" },
  R: { label: "Red", symbol: "🔥", bg: "bg-red-100", text: "text-red-900" },
  G: { label: "Green", symbol: "🌲", bg: "bg-emerald-100", text: "text-emerald-900" },
  C: { label: "Colorless", symbol: "◇", bg: "bg-neutral-200", text: "text-neutral-800" },
};

export function ColorPips({ colors }: { colors: string[] }) {
  if (!colors.length) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-[10px] text-neutral-300">
        ◇
      </span>
    );
  }
  return (
    <span className="inline-flex gap-0.5">
      {colors.map((c) => {
        const m = COLOR_META[c];
        return (
          <span
            key={c}
            title={m?.label ?? c}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${m?.bg ?? "bg-neutral-600"} ${m?.text ?? "text-white"}`}
          >
            {m?.symbol ?? c}
          </span>
        );
      })}
    </span>
  );
}

export type ManaColor = "W" | "U" | "B" | "R" | "G" | "C";

export type ColorCountFilter =
  | "all"
  | "multicolor"
  | "two"
  | "three"
  | "four"
  | "five";

/** Legacy single-value color filter (clerk API). */
export type LegacyInventoryColorFilter =
  | "all"
  | ManaColor
  | Exclude<ColorCountFilter, "all">;

export type InventoryBrowseGame = "magic" | "pokemon" | "riftbound";
export type InventoryBrowseSource = "inventory" | "catalog";

export type InventorySortBy =
  | "name"
  | "price_asc"
  | "price_desc"
  | "cmc_asc"
  | "cmc_desc";

export type InventoryFilterState = {
  q: string;
  game: InventoryBrowseGame;
  source: InventoryBrowseSource;
  selectedColors: ManaColor[];
  colorCount: ColorCountFilter;
  cardType: "all" | "commander";
  cardTypes: string[];
  oracleActions: string[];
  primitiveActions: string[];
  primitiveActionMode: "any" | "all";
  abilityTypes: string[];
  zones: string[];
  semanticOwners: string[];
  manaValuePreset: "all" | "0-2" | "3-4" | "5+";
  sortBy: InventorySortBy;
};

export const DEFAULT_INVENTORY_FILTERS: InventoryFilterState = {
  q: "",
  game: "magic",
  source: "inventory",
  selectedColors: [],
  colorCount: "all",
  cardType: "all",
  cardTypes: [],
  oracleActions: [],
  primitiveActions: [],
  primitiveActionMode: "any",
  abilityTypes: [],
  zones: [],
  semanticOwners: [],
  manaValuePreset: "all",
  sortBy: "name",
};

export function inventoryColorFiltersActive(
  filters: Pick<InventoryFilterState, "selectedColors" | "colorCount">,
): boolean {
  return filters.selectedColors.length > 0 || filters.colorCount !== "all";
}

export function appendInventoryColorParams(
  params: URLSearchParams,
  filters: Pick<InventoryFilterState, "selectedColors" | "colorCount">,
): void {
  if (filters.colorCount !== "all") {
    params.set("colorCount", filters.colorCount);
    return;
  }
  if (filters.selectedColors.length > 0) {
    params.set("colors", filters.selectedColors.join(","));
  }
}

export function legacyColorToFilterPatch(
  color: LegacyInventoryColorFilter | undefined,
): Pick<InventoryFilterState, "selectedColors" | "colorCount"> {
  if (!color || color === "all") {
    return { selectedColors: [], colorCount: "all" };
  }
  if (["W", "U", "B", "R", "G", "C"].includes(color)) {
    return { selectedColors: [color as ManaColor], colorCount: "all" };
  }
  return {
    selectedColors: [],
    colorCount: color as Exclude<ColorCountFilter, "all">,
  };
}

export function filtersToLegacyColor(
  filters: Pick<InventoryFilterState, "selectedColors" | "colorCount">,
): LegacyInventoryColorFilter {
  if (filters.colorCount !== "all") return filters.colorCount;
  if (filters.selectedColors.length === 1) return filters.selectedColors[0];
  return "all";
}

function toggleSelectedColor(
  selected: ManaColor[],
  color: ManaColor,
): ManaColor[] {
  if (selected.includes(color)) {
    return selected.filter((c) => c !== color);
  }
  return [...selected, color];
}

import { InventorySearchAutocomplete } from "./InventorySearchAutocomplete";
import {
  INVENTORY_CARD_TYPE_OPTIONS,
  INVENTORY_ORACLE_ACTION_CHIPS,
  INVENTORY_PRIMITIVE_ACTION_OPTIONS,
  INVENTORY_SEMANTIC_ABILITY_TYPES,
  INVENTORY_SEMANTIC_OWNERS,
  INVENTORY_SEMANTIC_ZONES,
  type InventoryManaValuePreset,
} from "@/lib/store-inventory/inventory-browse-filter-params";

const GAME_OPTIONS: Array<{ id: InventoryBrowseGame; label: string }> = [
  { id: "magic", label: "Magic" },
  { id: "pokemon", label: "Pokémon" },
  { id: "riftbound", label: "Riftbound" },
];

function RadioPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-indigo-600 text-white"
          : "border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
      }`}
    >
      {children}
    </button>
  );
}

export function InventoryGameSourceBar({
  filters,
  onChange,
  facets,
}: {
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
  facets?: { games: Record<string, number>; inStock: number };
}) {
  const inStockCount =
    filters.game === "magic"
      ? facets?.games.magic ?? 0
      : filters.game === "pokemon"
        ? facets?.games.pokemon ?? 0
        : facets?.games.riftbound ?? 0;

  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Game</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Game">
          {GAME_OPTIONS.map((option) => (
            <RadioPill
              key={option.id}
              active={filters.game === option.id}
              onClick={() =>
                onChange({
                  game: option.id,
                  cardType: option.id === "magic" ? filters.cardType : "all",
                })
              }
            >
              {option.label}
            </RadioPill>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Browse</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Browse source">
          <RadioPill
            active={filters.source === "inventory"}
            onClick={() => onChange({ source: "inventory" })}
          >
            Store inventory{inStockCount > 0 ? ` (${inStockCount.toLocaleString()})` : ""}
          </RadioPill>
          <RadioPill
            active={filters.source === "catalog"}
            onClick={() => onChange({ source: "catalog" })}
          >
            All printings
          </RadioPill>
        </div>
        <p className="mt-1.5 text-[11px] text-neutral-500">
          {filters.source === "catalog"
            ? "Browse all printings — cards load automatically (100 per page)."
            : "Only cards this store has in stock — cards load automatically (100 per page)."}
        </p>
      </div>
    </div>
  );
}

function toggleListItem(list: string[], item: string): string[] {
  if (list.includes(item)) return list.filter((v) => v !== item);
  return [...list, item];
}

const MANA_VALUE_PRESETS: Array<{ id: InventoryManaValuePreset; label: string }> = [
  { id: "all", label: "Any MV" },
  { id: "0-2", label: "MV 0–2" },
  { id: "3-4", label: "MV 3–4" },
  { id: "5+", label: "MV 5+" },
];

function countAdvancedFiltersActive(filters: InventoryFilterState): number {
  let n = 0;
  if (filters.cardType === "commander") n += 1;
  n += filters.cardTypes.length;
  n += filters.oracleActions.length;
  n += filters.primitiveActions.length;
  n += filters.abilityTypes.length;
  n += filters.zones.length;
  n += filters.semanticOwners.length;
  if (filters.primitiveActionMode === "all") n += 1;
  return n;
}

export function InventoryFilterBar({
  slug,
  filters,
  onChange,
  onSearchCommit,
  facets,
  showCommanderFilter = true,
  showSearch = false,
}: {
  slug?: string;
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
  onSearchCommit?: (q: string) => void;
  facets?: { games: Record<string, number>; commanders: number; inStock: number };
  showCommanderFilter?: boolean;
  showSearch?: boolean;
}) {
  const advancedActiveCount = countAdvancedFiltersActive(filters);
  const [showAdvanced, setShowAdvanced] = useState(advancedActiveCount > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {showSearch ? (
          slug ? (
            <InventorySearchAutocomplete
              slug={slug}
              filters={filters}
              onChange={onChange}
              onCommit={onSearchCommit}
            />
          ) : (
            <input
              type="search"
              value={filters.q}
              onChange={(e) => onChange({ q: e.target.value })}
              placeholder="Search cards…"
              className="inventory-filter-input min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
            />
          )
        ) : null}
        <select
          value={filters.sortBy}
          onChange={(e) =>
            onChange({
              sortBy: e.target.value as InventoryFilterState["sortBy"],
            })
          }
          className="inventory-filter-input rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
          aria-label="Sort by"
        >
          <option value="name">Name A–Z</option>
          {filters.source === "inventory" ? (
            <>
              <option value="price_desc">Price: high to low</option>
              <option value="price_asc">Price: low to high</option>
            </>
          ) : null}
          {filters.game === "magic" ? (
            <>
              <option value="cmc_asc">Mana value: low to high</option>
              <option value="cmc_desc">Mana value: high to low</option>
            </>
          ) : null}
        </select>
      </div>

      {filters.game === "magic" ? (
        <>
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              Mana value
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MANA_VALUE_PRESETS.map((preset) => (
                <FilterChip
                  key={preset.id}
                  active={filters.manaValuePreset === preset.id}
                  onClick={() => onChange({ manaValuePreset: preset.id })}
                >
                  {preset.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              Color
            </p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={
                  filters.selectedColors.length === 0 && filters.colorCount === "all"
                }
                onClick={() =>
                  onChange({ selectedColors: [], colorCount: "all" })
                }
              >
                All colors
              </FilterChip>
              {(["W", "U", "B", "R", "G", "C"] as const).map((c) => (
                <FilterChip
                  key={c}
                  active={filters.selectedColors.includes(c)}
                  onClick={() =>
                    onChange({
                      selectedColors: toggleSelectedColor(filters.selectedColors, c),
                      colorCount: "all",
                    })
                  }
                >
                  {COLOR_META[c].label}
                </FilterChip>
              ))}
              <FilterChip
                active={filters.colorCount === "multicolor"}
                onClick={() =>
                  onChange({ selectedColors: [], colorCount: "multicolor" })
                }
              >
                Multicolor
              </FilterChip>
              <FilterChip
                active={filters.colorCount === "two"}
                onClick={() => onChange({ selectedColors: [], colorCount: "two" })}
              >
                2-color
              </FilterChip>
              <FilterChip
                active={filters.colorCount === "three"}
                onClick={() => onChange({ selectedColors: [], colorCount: "three" })}
              >
                3-color
              </FilterChip>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((open) => !open)}
              className="flex items-center gap-2 text-xs font-medium text-neutral-400 transition hover:text-neutral-200"
              aria-expanded={showAdvanced}
            >
              <span className="text-[11px] uppercase tracking-wide">
                Advanced filters
              </span>
              <span aria-hidden>{showAdvanced ? "▾" : "▸"}</span>
              {!showAdvanced && advancedActiveCount > 0 ? (
                <span className="rounded-full bg-indigo-600/80 px-2 py-0.5 text-[10px] text-white">
                  {advancedActiveCount} active
                </span>
              ) : null}
            </button>

            {showAdvanced ? (
              <div className="mt-3 space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Card type
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {showCommanderFilter ? (
                      <FilterChip
                        active={filters.cardType === "commander"}
                        onClick={() =>
                          onChange({
                            cardType: filters.cardType === "commander" ? "all" : "commander",
                            cardTypes: [],
                          })
                        }
                      >
                        Commander{facets?.commanders ? ` (${facets.commanders})` : ""}
                      </FilterChip>
                    ) : null}
                    {INVENTORY_CARD_TYPE_OPTIONS.map((type) => (
                      <FilterChip
                        key={type}
                        active={filters.cardTypes.includes(type)}
                        onClick={() =>
                          onChange({
                            cardType: "all",
                            cardTypes: toggleListItem(filters.cardTypes, type),
                          })
                        }
                      >
                        {type}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Deck roles
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INVENTORY_ORACLE_ACTION_CHIPS.map((chip) => (
                      <FilterChip
                        key={chip.id}
                        active={filters.oracleActions.includes(chip.id)}
                        onClick={() =>
                          onChange({
                            oracleActions: toggleListItem(filters.oracleActions, chip.id),
                          })
                        }
                      >
                        {chip.label}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Semantic action
                  </p>
                  <div className="mb-2 flex gap-1.5">
                    <FilterChip
                      active={filters.primitiveActionMode === "any"}
                      onClick={() => onChange({ primitiveActionMode: "any" })}
                    >
                      Any
                    </FilterChip>
                    <FilterChip
                      active={filters.primitiveActionMode === "all"}
                      onClick={() => onChange({ primitiveActionMode: "all" })}
                    >
                      All
                    </FilterChip>
                  </div>
                  <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                    {INVENTORY_PRIMITIVE_ACTION_OPTIONS.map((action) => (
                      <FilterChip
                        key={action}
                        active={filters.primitiveActions.includes(action)}
                        onClick={() =>
                          onChange({
                            primitiveActions: toggleListItem(
                              filters.primitiveActions,
                              action,
                            ),
                          })
                        }
                      >
                        {action.replace(/_/g, " ")}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Ability structure
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INVENTORY_SEMANTIC_ABILITY_TYPES.map((ability) => (
                      <FilterChip
                        key={ability}
                        active={filters.abilityTypes.includes(ability)}
                        onClick={() =>
                          onChange({
                            abilityTypes: toggleListItem(filters.abilityTypes, ability),
                          })
                        }
                      >
                        {ability.replace(/_/g, " ")}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Zone interaction
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INVENTORY_SEMANTIC_ZONES.map((zone) => (
                      <FilterChip
                        key={zone}
                        active={filters.zones.includes(zone)}
                        onClick={() =>
                          onChange({
                            zones: toggleListItem(filters.zones, zone),
                          })
                        }
                      >
                        {zone}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    Semantic owner
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INVENTORY_SEMANTIC_OWNERS.map((owner) => (
                      <FilterChip
                        key={owner}
                        active={filters.semanticOwners.includes(owner)}
                        onClick={() =>
                          onChange({
                            semanticOwners: toggleListItem(filters.semanticOwners, owner),
                          })
                        }
                      >
                        {owner.replace(/_/g, " ")}
                      </FilterChip>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inventory-filter-chip transition ${
        active ? "inventory-filter-chip-active" : ""
      } rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-indigo-600 text-white"
          : "border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
      }`}
    >
      {children}
    </button>
  );
}

export type InventoryGridCard = {
  inventoryItemId: string;
  scryfallId?: string;
  name: string;
  imageUrl?: string;
  imageProxyUrl?: string;
  qty: number;
  listPrice?: number;
  tcgLowPrice?: number;
  setName?: string;
  colorIdentity: string[];
  isCommander?: boolean;
  typeLine?: string;
  slug?: string;
  themes?: Array<{ slug: string; label: string; count: number }>;
};

function InventoryCardImage({
  card,
}: {
  card: Pick<InventoryGridCard, "name" | "imageUrl" | "imageProxyUrl">;
}) {
  const candidates = useMemo(
    () =>
      [
        ...(card.imageUrl?.includes("scryfall.io") ? [card.imageUrl] : []),
        card.imageProxyUrl,
        ...(card.imageUrl && !card.imageUrl.includes("scryfall.io")
          ? [card.imageUrl]
          : []),
      ].filter(Boolean) as string[],
    [card.imageProxyUrl, card.imageUrl],
  );
  const [index, setIndex] = useState(0);
  const src = index < candidates.length ? candidates[index] : undefined;

  if (!src) {
    return (
      <div className="inventory-card-placeholder flex h-full items-center justify-center px-2 text-center text-xs text-neutral-500">
        {card.name}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      src={src}
      alt={card.name}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="pointer-events-none h-full w-full object-contain"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

export function InventoryCardGrid({
  cards,
  onSelect,
  selectable = false,
  emptyMessage = "No cards match your filters.",
  highlightIds,
  draggable = false,
  size = "default",
}: {
  cards: InventoryGridCard[];
  onSelect?: (card: InventoryGridCard) => void;
  selectable?: boolean;
  emptyMessage?: string;
  highlightIds?: Set<string>;
  draggable?: boolean;
  size?: "default" | "large";
}) {
  if (!cards.length) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">{emptyMessage}</p>
    );
  }

  const gridClass =
    size === "large"
      ? "inventory-card-grid-large"
      : "inventory-card-grid grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

  return (
    <ul className={gridClass}>
      {cards.map((card) => {
        const highlighted = highlightIds?.has(card.inventoryItemId);
        return (
        <li key={card.inventoryItemId}>
          <div
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            draggable={draggable}
            onDragStart={
              draggable
                ? (e) => {
                    e.dataTransfer.setData(
                      CLERK_DRAG_MIME,
                      clerkDragPayload(card),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }
                : undefined
            }
            onClick={() => onSelect?.(card)}
            onKeyDown={(e) => {
              if (onSelect && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelect(card);
              }
            }}
            className={`inventory-card-tile group w-full overflow-hidden rounded-xl border bg-neutral-900/80 text-left transition ${
              highlighted
                ? "border-emerald-500 ring-1 ring-emerald-500/50"
                : "border-neutral-800"
            } ${
              draggable
                ? "cursor-grab active:cursor-grabbing hover:border-indigo-500"
                : selectable || onSelect
                  ? "cursor-pointer hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-950/40"
                  : ""
            }`}
          >
            <div className="inventory-card-image-wrap relative aspect-[5/7] w-full bg-neutral-950">
              <InventoryCardImage card={card} />
              {card.qty > 1 ? (
                <span
                  className={`absolute right-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 font-semibold text-white ${
                    size === "large" ? "text-xs" : "text-[10px]"
                  }`}
                >
                  ×{card.qty}
                </span>
              ) : card.qty === 0 ? (
                <span
                  className={`absolute right-1.5 top-1.5 rounded bg-neutral-700/90 px-1.5 py-0.5 font-semibold uppercase text-neutral-200 ${
                    size === "large" ? "text-[10px]" : "text-[9px]"
                  }`}
                >
                  Catalog
                </span>
              ) : null}
            </div>
            <div
              className={`inventory-card-body space-y-1 ${
                size === "large" ? "p-3" : "p-2"
              }`}
            >
              <p
                className={`inventory-card-name line-clamp-2 font-semibold leading-tight text-white ${
                  size === "large" ? "text-sm" : "text-xs"
                }`}
              >
                {card.name}
              </p>
              <div className="flex items-center justify-between gap-1">
                <ColorPips colors={card.colorIdentity} />
                <span
                  className={`inventory-card-price shrink-0 font-medium text-emerald-400 ${
                    size === "large" ? "text-sm" : "text-[11px]"
                  }`}
                >
                  {card.listPrice != null
                    ? `$${card.listPrice.toFixed(2)}`
                    : card.tcgLowPrice != null
                      ? `$${card.tcgLowPrice.toFixed(2)}`
                      : ""}
                </span>
              </div>
              {card.setName ? (
                <p
                  className={`inventory-card-set truncate text-neutral-500 ${
                    size === "large" ? "text-xs" : "text-[10px]"
                  }`}
                >
                  {card.setName}
                </p>
              ) : null}
            </div>
          </div>
        </li>
        );
      })}
    </ul>
  );
}
