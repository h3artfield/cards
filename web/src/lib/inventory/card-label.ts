import { inferInventoryFinish } from "./inventory-finish-v1";
import type { InventoryItem } from "../types";

export type CardLabelV1 = {
  inventoryItemId: string;
  url: string;
  name: string;
  /** Full set name, e.g. "10th Edition". */
  setName: string;
  /** "Near Mint", plus the language when it is not English. */
  condition: string;
  /** "F" or "NF" for Magic; null for other games. */
  foil: "F" | "NF" | null;
  /** Short rarity: C, U, R, MR, L for Magic; Pokémon's own codes (RH, IR, SIR...). */
  rarity: string;
  /** Collector number as printed, e.g. "325" or "238/191". */
  number: string;
  /** Shelf location, e.g. "1-1", "Binder U", "Bulk". */
  location: string;
  /** Physical copies on hand, i.e. how many labels to print. */
  copies: number;
};

const FINISH_WORDS = /\b(?:non[\s-]?foil|foil|etched|holofoil|reverse\s+holo)\b/i;

/** "Llanowar Elves (Borderless) (Extended Art)" → name + treatments. */
export function splitProductNameV1(productName: string): { name: string; editions: string[] } {
  const editions: string[] = [];
  const name = productName
    .replace(/\s*\(([^()]+)\)/g, (_m, inner: string) => {
      const part = inner.trim();
      // Bare collector numbers ("(0277)") and foil markers are shown elsewhere.
      if (part && !/^#?\d+[a-z]?$/i.test(part) && !FINISH_WORDS.test(part)) editions.push(part);
      return "";
    })
    .replace(/\s+-\s+(?:Foil|Etched Foil)$/i, "")
    .replace(/\s+-\s+[A-Z]*\d+[A-Z]*(?:\/[A-Z]*\d+)?$/i, "")
    .trim();
  return { name: name || productName.trim(), editions };
}

function conditionLabel(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "Near Mint";
  const [base, language] = text.split(/\s+-\s+/);
  const cond = base
    .replace(/\b(?:Foil|Etched|Holofoil|Reverse Holofoil|Reverse Holo|(?:Surge|Galaxy|Textured|Rainbow|Cold|Gold) Foil)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return language && !/^english$/i.test(language.trim()) ? `${cond} · ${language.trim()}` : cond || "Near Mint";
}

const MAGIC_RARITY: Array<[RegExp, string]> = [
  [/^(m|mythic)/, "MR"],
  [/^(u|uncommon)$/, "U"],
  [/^(c|common)$/, "C"],
  [/^(r|rare)$/, "R"],
  [/^(l|land|basic land)$/, "L"],
  [/^(s|special)$/, "S"],
  [/^(t|token)$/, "T"],
  [/^(p|promo)$/, "P"],
];

/** Pokémon's printed rarity codes, most specific first. */
const POKEMON_RARITY: Array<[RegExp, string]> = [
  [/special illustration/, "SIR"],
  [/illustration/, "IR"],
  [/hyper/, "HR"],
  [/ace spec/, "ACE"],
  [/shiny ultra/, "SSR"],
  [/shiny/, "SR"],
  [/secret/, "SR"],
  [/ultra/, "UR"],
  [/double/, "RR"],
  [/amazing/, "A"],
  [/radiant/, "K"],
  [/rare holo|holo rare/, "RH"],
  [/promo/, "PR"],
  [/^(r|rare)$/, "R"],
  [/^(u|uncommon)$/, "U"],
  [/^(c|common)$/, "C"],
];

/** "Mythic" → "MR", "Special Illustration Rare" → "SIR"; anything else by its initials. */
export function rarityCodeV1(productLine: string, rarity: string | undefined): string {
  const r = (rarity ?? "").trim().toLowerCase();
  if (!r) return "";
  const table = /magic/i.test(productLine) ? MAGIC_RARITY : /pok/i.test(productLine) ? POKEMON_RARITY : [];
  const hit = table.find(([re]) => re.test(r))?.[1];
  if (hit) return hit;
  if (r.length <= 3) return r.toUpperCase();
  return r
    .split(/[\s-]+/)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function cardLabelFromItemV1(item: InventoryItem, input: { url: string }): CardLabelV1 {
  const { name } = splitProductNameV1(item.productName || item.displayName);
  const productLine = item.productLine ?? "";
  const isMagic = /magic/i.test(productLine);
  const copies = Math.max(
    0,
    Math.trunc(item.quantityOnHand ?? item.quantity ?? (item.quantityInStore ?? 0) + (item.quantityOnline ?? 0)),
  );
  return {
    inventoryItemId: item.id,
    url: input.url,
    name,
    setName: item.setName ?? "",
    condition: conditionLabel(item.tcgplayerCondition),
    foil: isMagic ? (inferInventoryFinish(item) === "nonfoil" ? "NF" : "F") : null,
    rarity: rarityCodeV1(productLine, item.rarity),
    number: (item.cardNumber ?? "").trim().replace(/^0+(?=\d)/, ""),
    location: item.shelfLocation?.trim() ?? "",
    copies,
  };
}
