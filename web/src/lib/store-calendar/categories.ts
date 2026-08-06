import type {
  BuiltinStoreEventCategory,
  CalendarCustomCategory,
} from "./types";

export type StoreEventCategoryMeta = {
  id: string;
  label: string;
  color: string;
  builtin?: boolean;
};

/** Default chip colors — tuned to match typical LGS calendar palettes. */
export const STORE_EVENT_CATEGORIES: StoreEventCategoryMeta[] = [
  { id: "pokemon", label: "Pokemon", color: "#c026d3", builtin: true },
  { id: "magic", label: "Magic", color: "#b91c1c", builtin: true },
  { id: "standard", label: "Standard", color: "#dc2626", builtin: true },
  { id: "commander", label: "Commander", color: "#111827", builtin: true },
  { id: "prerelease", label: "Prerelease", color: "#2563eb", builtin: true },
  { id: "set_release", label: "Set Release", color: "#ea580c", builtin: true },
  { id: "lorcana", label: "Lorcana", color: "#7c3aed", builtin: true },
  { id: "warhammer", label: "Warhammer", color: "#6b7280", builtin: true },
  { id: "riftbound", label: "Riftbound", color: "#0891b2", builtin: true },
  { id: "other", label: "Other", color: "#0d9488", builtin: true },
];

export const BUILTIN_CATEGORY_IDS = new Set(
  STORE_EVENT_CATEGORIES.map((c) => c.id),
);

const builtinById = new Map(
  STORE_EVENT_CATEGORIES.map((c) => [c.id, c] as const),
);

export function slugifyCategoryId(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "category"
  );
}

export function normalizeHexColor(raw: unknown): string | null {
  const trimmed = String(raw ?? "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;
  return null;
}

export function resolveStoreEventCategories(
  customCategories?: CalendarCustomCategory[],
): StoreEventCategoryMeta[] {
  const merged = [...STORE_EVENT_CATEGORIES];
  const seen = new Set(BUILTIN_CATEGORY_IDS);
  for (const custom of customCategories ?? []) {
    if (!custom.id || seen.has(custom.id)) continue;
    seen.add(custom.id);
    merged.push({
      id: custom.id,
      label: custom.label,
      color: custom.color,
    });
  }
  return merged;
}

export function categoryMeta(
  category: string,
  categories?: StoreEventCategoryMeta[],
): StoreEventCategoryMeta {
  const list = categories ?? STORE_EVENT_CATEGORIES;
  return (
    list.find((c) => c.id === category) ??
    builtinById.get(category as BuiltinStoreEventCategory) ??
    list.find((c) => c.id === "other") ??
    STORE_EVENT_CATEGORIES[STORE_EVENT_CATEGORIES.length - 1]!
  );
}

export function eventBlockColor(
  category: string,
  override?: string,
  categories?: StoreEventCategoryMeta[],
): string {
  const trimmed = override?.trim();
  if (trimmed && normalizeHexColor(trimmed)) return trimmed;
  return categoryMeta(category, categories).color;
}
