"use client";

import { useMemo, useState } from "react";
import {
  clerkDragPayload,
  CLERK_DRAG_MIME,
} from "./clerk-gathering";
import { CardFlipButton, CardInspectButton, InventoryCardDetail } from "./InventoryCardDetail";
import {
  cardBackImageUrl,
  cardHasOtherFace,
} from "@/lib/inventory/double-faced-card";
import {
  POKEMON_CARD_FILTERS,
  POKEMON_STAGE_FILTERS,
  POKEMON_TRAINER_FILTERS,
  POKEMON_TYPE_FILTERS,
  type PokemonBrowseChip,
} from "@/lib/inventory/pokemon-browse-filters";
import { TypeLineFilter } from "./TypeLineFilter";

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

const PIP_STYLE: Record<string, string> = {
  W: "bg-amber-100 text-amber-950 ring-amber-300",
  U: "bg-blue-600 text-white ring-sky-300",
  B: "bg-neutral-950 text-white ring-neutral-200",
  R: "bg-red-600 text-white ring-red-300",
  G: "bg-green-600 text-white ring-green-300",
  C: "bg-neutral-300 text-neutral-950 ring-white",
};

export function ColorPips({
  colors,
  known = true,
}: {
  colors: string[];
  /** An empty list is a colorless card only when the printing's colors are known. */
  known?: boolean;
}) {
  if (!colors.length && !known) return null;
  const shown = colors.length ? colors : ["C"];
  return (
    <span className="inline-flex gap-1">
      {shown.map((c) => {
        const m = COLOR_META[c];
        return (
          <span
            key={c}
            title={m?.label ?? c}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ring-2 ${PIP_STYLE[c] ?? "bg-neutral-600 text-white ring-neutral-300"}`}
          >
            {c}
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

export type InventoryBrowseGame = string;
export type InventoryBrowseSource = "inventory" | "catalog";

export type InventorySortBy =
  | "name"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "cmc_asc"
  | "cmc_desc";

export type ColorMatchMode = "exact" | "including" | "atmost";

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
  finish: "all" | "foil" | "nonfoil";
  channel: "all" | "online" | "instore";
  colorMode: ColorMatchMode;
  commanderColors: ManaColor[];
  rulesText: string;
  typeLine: string;
  typeLinePartial: boolean;
  manaCost: string;
  pokemonTypes: string[];
  pokemonCards: string[];
  pokemonStages: string[];
  pokemonTrainers: string[];
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
  finish: "all",
  channel: "all",
  colorMode: "exact",
  commanderColors: [],
  rulesText: "",
  typeLine: "",
  typeLinePartial: false,
  manaCost: "",
  pokemonTypes: [],
  pokemonCards: [],
  pokemonStages: [],
  pokemonTrainers: [],
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
  inventoryBrowseGameLabel,
} from "@/lib/inventory/inventory-browse-game-v1";
import {
  INVENTORY_CARD_TYPE_OPTIONS,
  INVENTORY_ORACLE_ACTION_CHIPS,
  INVENTORY_PRIMITIVE_ACTION_OPTIONS,
  INVENTORY_SEMANTIC_ABILITY_TYPES,
  INVENTORY_SEMANTIC_ZONES,
  type InventoryManaValuePreset,
} from "@/lib/store-inventory/inventory-browse-filter-params";

/** The printings catalog only holds Magic data, so catalog browse for any other
 *  game can only ever return zero rows. */
export function catalogSupportsGame(game: InventoryBrowseGame): boolean {
  return game === "magic";
}

export function inventoryGameLabel(game: InventoryBrowseGame): string {
  return inventoryBrowseGameLabel(game);
}

function RadioPill({
  active,
  onClick,
  children,
  disabled = false,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={title}
      onClick={disabled ? undefined : onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        disabled
          ? "cursor-not-allowed border border-neutral-800 bg-neutral-900 text-neutral-500 opacity-50"
          : active
            ? "bg-indigo-600 text-[var(--ink-900)]"
            : "border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
      }`}
    >
      {children}
    </button>
  );
}

function BrowseSourcePills({
  filters,
  onChange,
  inStockCount,
  catalogAvailable,
}: {
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
  inStockCount: number;
  catalogAvailable: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Browse source">
      <RadioPill
        active={filters.source === "inventory"}
        onClick={() => onChange({ source: "inventory" })}
      >
        Store inventory{inStockCount > 0 ? ` (${inStockCount.toLocaleString()})` : ""}
      </RadioPill>
      <RadioPill
        active={filters.source === "catalog"}
        disabled={!catalogAvailable}
        title={catalogAvailable ? undefined : "All printings is only available for Magic"}
        onClick={() =>
          onChange({
            source: "catalog",
            ...(filters.sortBy === "newest" ? { sortBy: "name" as const } : {}),
          })
        }
      >
        All printings
      </RadioPill>
    </div>
  );
}

function InventorySortSelect({
  filters,
  onChange,
}: {
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
}) {
  return (
    <select
      value={filters.sortBy}
      onChange={(e) =>
        onChange({
          sortBy: e.target.value as InventoryFilterState["sortBy"],
        })
      }
      className="inventory-filter-input rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white"
      aria-label="Sort by"
    >
      <option value="name">Name A–Z</option>
      {filters.source === "inventory" ? (
        <>
          <option value="newest">Newest</option>
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
  );
}

function InventoryFinishChips({
  filters,
  onChange,
}: {
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Finish">
      <FilterChip active={filters.finish === "all"} onClick={() => onChange({ finish: "all" })}>
        All finishes
      </FilterChip>
      <FilterChip active={filters.finish === "foil"} onClick={() => onChange({ finish: "foil" })}>
        Foils
      </FilterChip>
      <FilterChip
        active={filters.finish === "nonfoil"}
        onClick={() => onChange({ finish: "nonfoil" })}
      >
        Nonfoil
      </FilterChip>
    </div>
  );
}

function InventoryChannelChips({
  filters,
  onChange,
}: {
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Where you can buy">
      <FilterChip active={filters.channel === "all"} onClick={() => onChange({ channel: "all" })}>
        All cards
      </FilterChip>
      <FilterChip active={filters.channel === "online"} onClick={() => onChange({ channel: "online" })}>
        Online &amp; in-store
      </FilterChip>
      <FilterChip active={filters.channel === "instore"} onClick={() => onChange({ channel: "instore" })}>
        In-store only
      </FilterChip>
    </div>
  );
}

export function InventoryResultsToolbar({
  filters,
  onChange,
  facets,
  shown,
}: {
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
  facets?: { games: Record<string, number> };
  shown?: number;
}) {
  const inStockCount = facets?.games?.[filters.game] ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <BrowseSourcePills
          filters={filters}
          onChange={onChange}
          inStockCount={inStockCount}
          catalogAvailable={catalogSupportsGame(filters.game)}
        />
        {filters.source === "inventory" ? (
          <>
            <span className="hidden h-4 w-px bg-neutral-700 sm:inline-block" aria-hidden />
            <InventoryFinishChips filters={filters} onChange={onChange} />
            <span className="hidden h-4 w-px bg-neutral-700 sm:inline-block" aria-hidden />
            <InventoryChannelChips filters={filters} onChange={onChange} />
          </>
        ) : null}
        {typeof shown === "number" ? (
          <span className="text-[11px] text-neutral-500">{shown.toLocaleString()} shown</span>
        ) : null}
      </div>
      <div className="ml-auto shrink-0">
        <InventorySortSelect filters={filters} onChange={onChange} />
      </div>
    </div>
  );
}

export function InventoryGameSourceBar({
  filters,
  onChange,
  facets,
  showGame = true,
  showBrowse = true,
}: {
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
  facets?: { games: Record<string, number>; inStock: number };
  showGame?: boolean;
  showBrowse?: boolean;
}) {
  const gameOptions = useMemo(() => {
    const entries = Object.entries(facets?.games ?? {})
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return entries.map(([id, count]) => ({
      id,
      label: inventoryBrowseGameLabel(id),
      count,
    }));
  }, [facets?.games]);

  const inStockCount = facets?.games?.[filters.game] ?? 0;
  const catalogAvailable = catalogSupportsGame(filters.game);
  if (!showGame && !showBrowse) return null;
  if (showGame && !showBrowse && gameOptions.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2">
      {showGame ? (
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Game</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Game">
          {gameOptions.length ? (
            gameOptions.map((option) => (
              <RadioPill
                key={option.id}
                active={filters.game === option.id}
                onClick={() =>
                  onChange({
                    game: option.id,
                    cardType: option.id === "magic" ? filters.cardType : "all",
                    source: catalogSupportsGame(option.id) ? filters.source : "inventory",
                    ...(option.id === "magic"
                      ? {}
                      : {
                          selectedColors: [],
                          colorCount: "all" as const,
                          commanderColors: [],
                          rulesText: "",
                          typeLine: "",
                          manaCost: "",
                          manaValuePreset: "all" as const,
                          cardTypes: [],
                          oracleActions: [],
                          primitiveActions: [],
                          abilityTypes: [],
                          zones: [],
                          semanticOwners: [],
                        }),
                    ...(option.id === "pokemon"
                      ? {}
                      : {
                          pokemonTypes: [],
                          pokemonCards: [],
                          pokemonStages: [],
                          pokemonTrainers: [],
                        }),
                  })
                }
              >
                {option.label}
                <span className="ml-1 opacity-70">({option.count.toLocaleString()})</span>
              </RadioPill>
            ))
          ) : (
            <span className="text-xs text-neutral-500">No in-stock inventory yet</span>
          )}
        </div>
      </div>
      ) : null}

      {showBrowse ? (
        <BrowseSourcePills
          filters={filters}
          onChange={onChange}
          inStockCount={inStockCount}
          catalogAvailable={catalogAvailable}
        />
      ) : null}
    </div>
  );
}

function toggleListItem(list: string[], item: string): string[] {
  if (list.includes(item)) return list.filter((v) => v !== item);
  return [...list, item];
}

const MANA_PIPS = ["W", "U", "B", "R", "G", "C"] as const;

function ManaPipButton({
  pip,
  active,
  onClick,
}: {
  pip: (typeof MANA_PIPS)[number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={COLOR_META[pip].label}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full p-0.5 transition ${
        active
          ? "ring-2 ring-amber-200 ring-offset-2 ring-offset-neutral-950"
          : "opacity-40 hover:opacity-100"
      }`}
    >
      <img
        src={`https://svgs.scryfall.io/card-symbols/${pip}.svg`}
        alt=""
        width={28}
        height={28}
        draggable={false}
      />
    </button>
  );
}

function FilterText({
  value,
  placeholder,
  onChange,
  label,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <input
      type="text"
      value={value}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="inventory-filter-input w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500"
    />
  );
}

const MANA_VALUE_PRESETS: Array<{ id: InventoryManaValuePreset; label: string }> = [
  { id: "all", label: "Any CMC" },
  { id: "0-2", label: "CMC 0–2" },
  { id: "3-4", label: "CMC 3–4" },
  { id: "5+", label: "CMC 5+" },
];

function countAdvancedFiltersActive(filters: InventoryFilterState): number {
  let n = 0;
  if (filters.cardType === "commander") n += 1;
  n += filters.cardTypes.length;
  n += filters.oracleActions.length;
  n += filters.primitiveActions.length;
  n += filters.abilityTypes.length;
  n += filters.zones.length;
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
  showSortAndFinish = true,
}: {
  slug?: string;
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
  onSearchCommit?: (q: string) => void;
  facets?: { games: Record<string, number>; commanders: number; inStock: number };
  showCommanderFilter?: boolean;
  showSearch?: boolean;
  /** The public inventory page puts sort and finish in the row above the cards. */
  showSortAndFinish?: boolean;
}) {
  const advancedActiveCount = countAdvancedFiltersActive(filters);
  const [showAdvanced, setShowAdvanced] = useState(advancedActiveCount > 0);

  return (
    <div className="space-y-2">
      {showSearch || showSortAndFinish ? (
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
          {showSortAndFinish ? <InventorySortSelect filters={filters} onChange={onChange} /> : null}
        </div>
      ) : null}

      {showSortAndFinish && filters.source === "inventory" ? (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Finish
          </p>
          <InventoryFinishChips filters={filters} onChange={onChange} />
          <p className="mb-1 mt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Where you can buy
          </p>
          <InventoryChannelChips filters={filters} onChange={onChange} />
        </div>
      ) : null}

      {filters.game === "magic" ? (
        <>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              Text
            </p>
            <FilterText
              label="Card text"
              value={filters.rulesText}
              placeholder='Any text, e.g. "draw a card"'
              onChange={(rulesText) => onChange({ rulesText })}
            />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              Type line
            </p>
            <TypeLineFilter
              value={filters.typeLine}
              onChange={(typeLine) => onChange({ typeLine, typeLinePartial: false })}
            />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              Commander
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MANA_PIPS.map((pip) => (
                <ManaPipButton
                  key={pip}
                  pip={pip}
                  active={filters.commanderColors.includes(pip)}
                  onClick={() =>
                    onChange({
                      commanderColors: toggleSelectedColor(filters.commanderColors, pip),
                    })
                  }
                />
              ))}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              Cards whose colors fit this identity.
            </p>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              Color
            </p>
            <select
              value={filters.colorMode}
              aria-label="Color match"
              onChange={(event) =>
                onChange({ colorMode: event.target.value as InventoryFilterState["colorMode"] })
              }
              className="inventory-filter-input mb-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white"
            >
              <option value="exact">Exactly these colors</option>
              <option value="including">Including these colors</option>
              <option value="atmost">At most these colors</option>
            </select>
            <div className="flex flex-wrap gap-1.5">
              {MANA_PIPS.map((pip) => (
                <ManaPipButton
                  key={pip}
                  pip={pip}
                  active={
                    filters.colorCount === "all" && filters.selectedColors.includes(pip)
                  }
                  onClick={() =>
                    onChange({
                      selectedColors: toggleSelectedColor(filters.selectedColors, pip),
                      colorCount: "all",
                    })
                  }
                />
              ))}
            </div>
            {filters.colorCount !== "all" ? (
              <button
                type="button"
                className="mt-1 text-[11px] text-amber-200 underline"
                onClick={() => onChange({ colorCount: "all", selectedColors: [] })}
              >
                {filters.colorCount === "multicolor"
                  ? "Multicolor"
                  : filters.colorCount === "two"
                    ? "2 colors"
                    : filters.colorCount === "three"
                      ? "3 colors"
                      : filters.colorCount}{" "}
                · clear
              </button>
            ) : null}
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              Mana cost
            </p>
            <FilterText
              label="Mana cost"
              value={filters.manaCost}
              placeholder="Any mana symbols, e.g. {W}{W}"
              onChange={(manaCost) => onChange({ manaCost })}
            />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              CMC Value
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
                <span className="rounded-full bg-indigo-600/80 px-2 py-0.5 text-[10px] text-[var(--ink-900)]">
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
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {filters.game === "pokemon" ? (
        <PokemonShelfFilters filters={filters} onChange={onChange} />
      ) : null}
    </div>
  );
}

function PokemonShelfFilters({
  filters,
  onChange,
}: {
  filters: InventoryFilterState;
  onChange: (next: Partial<InventoryFilterState>) => void;
}) {
  return (
    <>
      <PokemonChipRow
        label="Type"
        options={POKEMON_TYPE_FILTERS}
        selected={filters.pokemonTypes}
        onToggle={(id) => onChange({ pokemonTypes: toggleListItem(filters.pokemonTypes, id) })}
      />
      <PokemonChipRow
        label="Card"
        options={POKEMON_CARD_FILTERS}
        selected={filters.pokemonCards}
        onToggle={(id) => onChange({ pokemonCards: toggleListItem(filters.pokemonCards, id) })}
      />
      <PokemonChipRow
        label="Stage"
        options={POKEMON_STAGE_FILTERS}
        selected={filters.pokemonStages}
        onToggle={(id) => onChange({ pokemonStages: toggleListItem(filters.pokemonStages, id) })}
      />
      <PokemonChipRow
        label="Trainer"
        options={POKEMON_TRAINER_FILTERS}
        selected={filters.pokemonTrainers}
        onToggle={(id) =>
          onChange({ pokemonTrainers: toggleListItem(filters.pokemonTrainers, id) })
        }
      />
    </>
  );
}

function PokemonChipRow({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly PokemonBrowseChip[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <FilterChip
            key={option.id}
            active={selected.includes(option.id)}
            onClick={() => onToggle(option.id)}
          >
            {option.color ? (
              <span
                aria-hidden
                className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle"
                style={{ backgroundColor: option.color }}
              />
            ) : null}
            {option.label}
          </FilterChip>
        ))}
      </div>
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
          ? "bg-indigo-600 text-[var(--ink-900)]"
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
  cardNumber?: string;
  gameKey?: string;
  condition?: string;
  rarity?: string;
  manaCost?: string;
  gameLabel?: string;
  colorIdentity: string[];
  isCommander?: boolean;
  typeLine?: string;
  oracleText?: string;
  slug?: string;
  themes?: Array<{ slug: string; label: string; count: number }>;
  isFoil?: boolean;
  finishLabel?: string;
  onlineQty?: number;
};

function InventoryCardImage({
  card,
  face,
  onBackFailed,
}: {
  card: Pick<InventoryGridCard, "name" | "imageUrl" | "imageProxyUrl">;
  face: "front" | "back";
  onBackFailed?: () => void;
}) {
  const candidates = useMemo(
    () =>
      [
        ...(card.imageUrl?.includes("scryfall.io") ? [card.imageUrl] : []),
        ...(card.imageUrl?.includes("firebasestorage.googleapis.com")
          ? [card.imageUrl]
          : []),
        card.imageProxyUrl,
      ].filter(Boolean) as string[],
    [card.imageProxyUrl, card.imageUrl],
  );
  const [index, setIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const frontSrc = index < candidates.length ? candidates[index] : undefined;
  const backSrc = cardBackImageUrl(card);
  const baseSrc = face === "back" && backSrc ? backSrc : frontSrc;
  // A timed-out scan is cached as a 404. A second request with a new query
  // asks again instead of leaving the tile on the card name.
  const src =
    baseSrc && retry > 0 && baseSrc.includes("/inventory/image")
      ? `${baseSrc}&retry=${retry}`
      : baseSrc;

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
      alt=""
      loading={baseSrc?.includes("/inventory/image") ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className="pointer-events-none h-full w-full object-contain"
      onError={() => {
        if (face === "back") {
          onBackFailed?.();
          return;
        }
        if (retry < 1 && baseSrc?.includes("/inventory/image")) {
          setRetry(1);
          return;
        }
        setIndex((current) => current + 1);
      }}
    />
  );
}

function InventoryCardArt({ card }: { card: InventoryGridCard }) {
  const [face, setFace] = useState<"front" | "back">("front");
  const [backUnavailable, setBackUnavailable] = useState(false);
  const canFlip =
    cardHasOtherFace(card.typeLine) && Boolean(cardBackImageUrl(card)) && !backUnavailable;

  return (
    <>
      <InventoryCardImage
        card={card}
        face={canFlip ? face : "front"}
        onBackFailed={() => {
          setFace("front");
          setBackUnavailable(true);
        }}
      />
      {canFlip ? (
        <CardFlipButton
          pressed={face === "back"}
          onFlip={() => setFace((current) => (current === "front" ? "back" : "front"))}
        />
      ) : null}
    </>
  );
}

const RARITY_LETTERS: Record<string, string> = {
  c: "Common",
  u: "Uncommon",
  r: "Rare",
  m: "Mythic",
  s: "Special",
  t: "Token",
  l: "Land",
  p: "Promo",
};

function shelfRarity(rarity?: string): string | null {
  const trimmed = rarity?.trim();
  if (!trimmed) return null;
  if (trimmed.length === 1) return RARITY_LETTERS[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
  return trimmed.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function promoShelfLabel(setName?: string): string | null {
  if (!setName) return null;
  if (/prerelease/i.test(setName)) return "Prerelease";
  if (/promo/i.test(setName)) return "Promo";
  return null;
}

export function sortInventoryCards<
  T extends { name: string; listPrice?: number; tcgLowPrice?: number; cmc?: number },
>(cards: T[], sortBy: InventorySortBy): T[] {
  const next = [...cards];
  next.sort((a, b) => {
    if (sortBy === "price_desc" || sortBy === "price_asc") {
      const pa = a.listPrice ?? a.tcgLowPrice ?? 0;
      const pb = b.listPrice ?? b.tcgLowPrice ?? 0;
      const aMissing = pa <= 0;
      const bMissing = pb <= 0;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (pa !== pb) return sortBy === "price_desc" ? pb - pa : pa - pb;
    }
    if (sortBy === "cmc_desc" || sortBy === "cmc_asc") {
      const ca = a.cmc ?? Number.POSITIVE_INFINITY;
      const cb = b.cmc ?? Number.POSITIVE_INFINITY;
      if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) {
        return sortBy === "cmc_desc" ? cb - ca : ca - cb;
      }
    }
    return a.name.localeCompare(b.name);
  });
  return next;
}

export function InventoryCardGrid({
  cards,
  onSelect,
  selectable = false,
  emptyMessage = "No cards match your filters.",
  highlightIds,
  pileIds,
  pileQty,
  draggable = false,
  size = "default",
  storeSlug,
}: {
  cards: InventoryGridCard[];
  onSelect?: (card: InventoryGridCard) => void;
  selectable?: boolean;
  emptyMessage?: string;
  highlightIds?: Set<string>;
  /** Cards already in the shopper's pile, so a tap has visible confirmation. */
  pileIds?: Set<string>;
  /** Copies of each card already in the cart. */
  pileQty?: Map<string, number>;
  draggable?: boolean;
  size?: "default" | "large";
  storeSlug?: string;
}) {
  const [inspect, setInspect] = useState<InventoryGridCard | null>(null);
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
    <>
    <ul className={gridClass}>
      {cards.map((card) => {
        const highlighted = highlightIds?.has(card.inventoryItemId);
        const inCartQty = pileQty?.get(card.inventoryItemId) ?? 0;
        const inPile = inCartQty > 0 || (pileIds?.has(card.inventoryItemId) ?? false);
        const forSale = card.qty > 0 && !card.inventoryItemId.startsWith("catalog:");
        const canAdd = Boolean(onSelect) && forSale;
        return (
        <li key={card.inventoryItemId}>
          <div
            role={canAdd ? "button" : undefined}
            tabIndex={canAdd ? 0 : undefined}
            draggable={draggable && forSale}
            onDragStart={
              draggable && forSale
                ? (e) => {
                    e.dataTransfer.setData(
                      CLERK_DRAG_MIME,
                      clerkDragPayload(card),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }
                : undefined
            }
            onClick={() => {
              if (canAdd) onSelect?.(card);
            }}
            onKeyDown={(e) => {
              if (canAdd && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelect?.(card);
              }
            }}
            aria-pressed={canAdd ? inPile : undefined}
            className={`inventory-card-tile group w-full overflow-hidden rounded-xl border bg-neutral-900/80 text-left transition ${
              inPile
                ? "border-indigo-400 ring-2 ring-indigo-400/60"
                : highlighted
                  ? "border-emerald-500 ring-1 ring-emerald-500/50"
                  : "border-neutral-800"
            } ${
              draggable && forSale
                ? "cursor-grab active:cursor-grabbing hover:border-indigo-500"
                : canAdd
                  ? "cursor-pointer hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-950/40"
                  : ""
            }`}
          >
            <div className="inventory-card-image-wrap relative aspect-[5/7] w-full bg-neutral-950">
              <InventoryCardArt card={card} />
              {inPile ? (
                <span
                  className={`absolute left-1.5 top-1.5 rounded bg-indigo-500 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-[var(--ink-900)] ${
                    size === "large" ? "text-[10px]" : "text-[9px]"
                  }`}
                >
                  {inCartQty > 1 ? `In cart ×${inCartQty}` : "In cart"}
                </span>
              ) : null}
              <CardInspectButton onInspect={() => setInspect(card)} />
              {card.qty === 0 ? (
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
              {card.setName ? (
                <p className="inventory-card-set line-clamp-2">{card.setName}</p>
              ) : card.gameLabel ? (
                <p className="inventory-card-set truncate">{card.gameLabel}</p>
              ) : null}
              {card.cardNumber || card.rarity ? (
                <p className="inventory-card-set">
                  {[card.cardNumber ? `#${card.cardNumber}` : null, shelfRarity(card.rarity)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              {card.condition ? (
                <p className="inventory-card-set">{card.condition}</p>
              ) : null}
              {card.finishLabel || promoShelfLabel(card.setName) || card.qty > 0 ? (
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  {card.finishLabel ? (
                    <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                      {card.finishLabel}
                    </span>
                  ) : null}
                  {promoShelfLabel(card.setName) ? (
                    <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {promoShelfLabel(card.setName)}
                    </span>
                  ) : null}
                  {card.qty > 0 && card.onlineQty === 0 ? (
                    <span
                      className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200"
                      title="Pick this one up at the shop. You can still pay online."
                    >
                      In-store only
                    </span>
                  ) : null}
                  {card.qty > 0 ? (
                    <span className="text-[11px] font-medium text-neutral-200">
                      Qty {card.qty}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-1 pt-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ColorPips
                    colors={card.colorIdentity}
                    known={
                      card.colorIdentity.length > 0 ||
                      Boolean(card.manaCost || card.typeLine)
                    }
                  />
                  {card.manaCost ? (
                    <span className="truncate text-[11px] font-medium text-neutral-100">
                      {card.manaCost}
                    </span>
                  ) : null}
                </span>
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
            </div>
          </div>
        </li>
        );
      })}
    </ul>
    {inspect ? (
      <InventoryCardDetail
        slug={storeSlug}
        card={inspect}
        onClose={() => setInspect(null)}
      />
    ) : null}
    </>
  );
}
