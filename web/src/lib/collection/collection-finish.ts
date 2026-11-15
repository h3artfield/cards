export const COLLECTION_FINISHES = ["nonfoil", "foil", "etched"] as const;
export type CollectionFinish = (typeof COLLECTION_FINISHES)[number];

export const COLLECTION_FINISH_LABELS: Record<CollectionFinish, string> = {
  nonfoil: "Non-foil",
  foil: "Foil",
  etched: "Etched",
};

export function parseCollectionFinish(value: unknown): CollectionFinish {
  if (typeof value !== "string") return "nonfoil";
  const raw = value.trim().toLowerCase();
  if (raw === "foil" || raw === "etched") return raw;
  return "nonfoil";
}

export function finishesFromUnknown(value: unknown): CollectionFinish[] {
  if (!Array.isArray(value) || value.length === 0) return ["nonfoil", "foil"];
  const finishes = value
    .map((row) => (typeof row === "string" ? row.trim().toLowerCase() : ""))
    .filter((row): row is CollectionFinish =>
      COLLECTION_FINISHES.includes(row as CollectionFinish),
    );
  return finishes.length ? [...new Set(finishes)] : ["nonfoil", "foil"];
}

export function pickAvailableFinish(
  wanted: CollectionFinish | undefined,
  available: CollectionFinish[],
): CollectionFinish {
  const options = available.length ? available : (["nonfoil"] as CollectionFinish[]);
  if (wanted && options.includes(wanted)) return wanted;
  if (options.includes("nonfoil")) return "nonfoil";
  return options[0] ?? "nonfoil";
}

const FOIL_MARK = /\s*(?:\*F\*|\*FOIL\*|\bFOIL\b)\s*$/i;

export function stripFoilMark(name: string): {
  name: string;
  finish?: CollectionFinish;
} {
  const match = name.match(FOIL_MARK);
  if (!match) return { name: name.trim() };
  return { name: name.replace(FOIL_MARK, "").trim(), finish: "foil" };
}

export function finishFromCsvCell(value: string | undefined): CollectionFinish | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim().toLowerCase();
  if (["foil", "true", "yes", "1", "y"].includes(raw)) return "foil";
  if (["etched", "etch"].includes(raw)) return "etched";
  if (["nonfoil", "false", "no", "0", "n", ""].includes(raw)) return "nonfoil";
  return undefined;
}
