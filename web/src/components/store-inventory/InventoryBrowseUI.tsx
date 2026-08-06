"use client";

import { useState } from "react";
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

export type InventoryFilterState = {
  q: string;
  game: "all" | "magic" | "pokemon" | "yugioh" | "sports" | "other";
  selectedColors: ManaColor[];
  colorCount: ColorCountFilter;
  cardType: "all" | "commander";
  sortBy: "name" | "price_asc" | "price_desc";
};

export const DEFAULT_INVENTORY_FILTERS: InventoryFilterState = {
  q: "",
  game: "all",
  selectedColors: [],
  colorCount: "all",
  cardType: "all",
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
          value={filters.game}
          onChange={(e) =>
            onChange({
              game: e.target.value as InventoryFilterState["game"],
            })
          }
          className="inventory-filter-input rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          <option value="all">All games</option>
          <option value="magic">
            Magic ({facets?.games.magic ?? 0})
          </option>
          <option value="pokemon">
            Pokémon ({facets?.games.pokemon ?? 0})
          </option>
          <option value="yugioh">
            Yu-Gi-Oh ({facets?.games.yugioh ?? 0})
          </option>
          <option value="sports">
            Sports ({facets?.games.sports ?? 0})
          </option>
          <option value="other">
            Other ({facets?.games.other ?? 0})
          </option>
        </select>
        {showCommanderFilter ? (
          <select
            value={filters.cardType}
            onChange={(e) =>
              onChange({
                cardType: e.target.value as InventoryFilterState["cardType"],
              })
            }
            className="inventory-filter-input rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
          >
            <option value="all">All cards</option>
            <option value="commander">
              Commanders ({facets?.commanders ?? 0})
            </option>
          </select>
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
          <option value="price_desc">Price: high to low</option>
          <option value="price_asc">Price: low to high</option>
        </select>
      </div>

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
  slug?: string;
  themes?: Array<{ slug: string; label: string; count: number }>;
};

function InventoryCardImage({
  card,
}: {
  card: Pick<InventoryGridCard, "name" | "imageUrl" | "imageProxyUrl">;
}) {
  const candidates = [card.imageUrl, card.imageProxyUrl].filter(Boolean) as string[];
  const [index, setIndex] = useState(0);
  const src = candidates[index];

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
      src={src}
      alt={card.name}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="pointer-events-none h-full w-full object-contain"
      onError={() => {
        if (index + 1 < candidates.length) setIndex(index + 1);
      }}
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
              ) : null}
              {card.isCommander ? (
                <span
                  className={`absolute left-1.5 top-1.5 rounded bg-indigo-600/90 px-1.5 py-0.5 font-semibold uppercase text-white ${
                    size === "large" ? "text-xs" : "text-[10px]"
                  }`}
                >
                  CMD
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
