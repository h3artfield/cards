import type { CardSuspect, LockedCardIdentity } from "../card-flow-v2/types";
import type { CardPriceSnapshotCategory } from "./types";
import { inferMtgIdentityFromPriceChartingRow } from "./mtg-pc-identity";
import { inferYugiohIdentityFromPriceChartingRow } from "./yugioh-pc-identity";
import type { ScryfallSetResolver } from "./scryfall-set-resolver";

export type IdentityKeyFields = {
  category: CardPriceSnapshotCategory;
  setCode?: string;
  collectorNumber?: string;
  finish?: string;
  treatment?: string;
  variant?: string;
  language?: string;
  cardName?: string;
  setName?: string;
  year?: string;
  brand?: string;
  parallel?: string;
  printingSet?: string;
  originSet?: string;
  originCollectorNumber?: string;
};

export type IdentityInferenceContext = {
  scryfallSetResolver?: ScryfallSetResolver;
  plstOriginByNumber?: Map<string, { originSet?: string; originCollectorNumber?: string }>;
};

export type InferredIdentity = IdentityKeyFields & {
  exactIdentityMatch: boolean;
  rejectedReason?: string;
  identityMatchReason?: string;
};

function normFinish(finish?: string): string {
  const f = (finish ?? "unknown").toLowerCase().replace(/\s+/g, "_");
  if (f.includes("reverse")) return "reverse_holo";
  if (f.includes("nonfoil") || f === "normal") return "nonfoil";
  if (f.includes("foil")) return "foil";
  return f || "unknown";
}

function normLang(language?: string): string {
  const l = (language ?? "en").toLowerCase();
  if (l.startsWith("jp") || l.includes("japanese")) return "jp";
  return "en";
}

/** Exact identity key — never card name alone. */
export function buildIdentityKey(fields: IdentityKeyFields): string | null {
  const cat = fields.category;
  if (cat === "mtg") {
    if (!fields.setCode || !fields.collectorNumber) return null;
    return [
      "mtg",
      fields.setCode.toUpperCase(),
      fields.collectorNumber.replace(/^#/, ""),
      normFinish(fields.finish),
      fields.treatment ?? "normal",
      normLang(fields.language),
    ].join("|");
  }
  if (cat === "pokemon") {
    if (!fields.setCode && !fields.setName) return null;
    if (!fields.collectorNumber) return null;
    const setPart = (fields.setCode ?? fields.setName ?? "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    return [
      "pokemon",
      setPart,
      fields.collectorNumber.replace(/^#/, ""),
      normFinish(fields.finish),
      normLang(fields.language),
    ].join("|");
  }
  if (cat === "sports") {
    if (!fields.cardName || !fields.collectorNumber) return null;
    const slug = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return [
      "sports",
      fields.year ?? "unknown",
      slug(fields.brand ?? fields.setName ?? "unknown"),
      slug(fields.setName ?? "unknown"),
      slug(fields.cardName),
      fields.collectorNumber.replace(/^#/, ""),
      slug(fields.parallel ?? fields.variant ?? "base"),
      fields.finish === "graded" ? "graded" : "raw",
    ].join("|");
  }
  if (cat === "riftbound") {
    if (!fields.setCode || !fields.collectorNumber) return null;
    return [
      "riftbound",
      fields.setCode.toUpperCase(),
      fields.collectorNumber,
      fields.variant ?? "standard",
      fields.treatment ?? "normal",
      normFinish(fields.finish),
      normLang(fields.language),
    ].join("|");
  }
  if (cat === "yugioh") {
    if (!fields.setName || !fields.collectorNumber) return null;
    const setPart = fields.setName.toLowerCase().replace(/\s+/g, "-");
    return [
      "yugioh",
      setPart,
      fields.collectorNumber.replace(/^#/, "").toUpperCase(),
      normLang(fields.language),
    ].join("|");
  }
  if (cat === "onepiece") {
    if (!fields.setName || !fields.collectorNumber) return null;
    const setPart = fields.setName.toLowerCase().replace(/\s+/g, "-");
    return [
      "onepiece",
      setPart,
      fields.collectorNumber.replace(/^#/, ""),
      normLang(fields.language),
    ].join("|");
  }
  return null;
}

export function inferCategoryFromPcRow(
  genre?: string,
  consoleName?: string,
): CardPriceSnapshotCategory {
  const g = `${genre ?? ""} ${consoleName ?? ""}`.toLowerCase();
  if (/magic|mtg/.test(g)) return "mtg";
  if (/pokemon|pokémon/.test(g)) return "pokemon";
  if (/yugioh|yu-gi-oh/.test(g)) return "yugioh";
  if (/riftbound/.test(g)) return "riftbound";
  if (/one piece/.test(g)) return "onepiece";
  if (/lorcana|disney/.test(g)) return "lorcana";
  if (/football|baseball|basketball|hockey|sports/.test(g)) return "sports";
  return "unknown";
}

export function inferIdentityFromPriceChartingRow(
  input: {
    productName: string;
    consoleName?: string;
    genre?: string;
  },
  context?: IdentityInferenceContext,
): InferredIdentity {
  const category = inferCategoryFromPcRow(input.genre, input.consoleName);
  const productName = input.productName.trim();
  const consoleName = input.consoleName?.trim() ?? "";
  const title = `${productName} ${consoleName}`;

  if (category === "mtg") {
    const resolver = context?.scryfallSetResolver;
    if (!resolver) {
      return {
        category: "mtg",
        exactIdentityMatch: false,
        rejectedReason: "set_code_unresolved",
        cardName: productName,
      };
    }

    const nums = productName.match(/#(\d{1,4})\b/);
    const listNum = nums?.[1];
    const plstOrigin =
      listNum && /the list/i.test(consoleName)
        ? context?.plstOriginByNumber?.get(listNum)
        : undefined;

    return inferMtgIdentityFromPriceChartingRow(
      input,
      resolver,
      plstOrigin ?? undefined,
    );
  }

  if (category === "pokemon") {
    const numMatch = productName.match(/#(\d+[a-z]?)/i);
    const collectorNumber = numMatch?.[1];
    const setName = consoleName.replace(/^pokemon\s+/i, "").trim();
    let finish = "nonfoil";
    if (/\breverse holo\b/i.test(productName)) finish = "reverse_holo";
    else if (/\bfoil\b/i.test(productName) && !/\bnonfoil\b/i.test(productName)) {
      finish = "foil";
    }

    const fields: IdentityKeyFields = {
      category,
      setName,
      collectorNumber,
      finish,
      cardName: productName.replace(/\[.*?\]/g, "").replace(/#\d+.*/g, "").trim(),
      language: "en",
    };

    if (!setName || !collectorNumber) {
      return {
        ...fields,
        exactIdentityMatch: false,
        rejectedReason: !setName ? "set_name_missing" : "collector_number_missing",
      };
    }
    return { ...fields, exactIdentityMatch: true, identityMatchReason: "pokemon_set_and_number" };
  }

  if (category === "yugioh") {
    return inferYugiohIdentityFromPriceChartingRow(input);
  }

  if (category === "onepiece") {
    const setName = consoleName.replace(/^one piece\s+/i, "").trim();
    const idMatch = productName.match(/\b(OP\d{2}-\d{3}[A-Z]?)\b/i);
    const hashMatch = productName.match(/#(\d+[a-z]?)/i);
    const collectorNumber = idMatch?.[1]?.toUpperCase() ?? hashMatch?.[1];
    const fields: IdentityKeyFields = {
      category,
      setName,
      collectorNumber,
      cardName: productName.replace(/\[.*?\]/g, "").replace(/#\d+.*/g, "").trim(),
      language: "en",
    };
    if (!setName || !collectorNumber) {
      return {
        ...fields,
        exactIdentityMatch: false,
        rejectedReason: !setName ? "set_name_missing" : "collector_number_missing",
      };
    }
    return { ...fields, exactIdentityMatch: true, identityMatchReason: "onepiece_set_and_number" };
  }

  return {
    category,
    cardName: productName,
    exactIdentityMatch: false,
    rejectedReason: "category_not_fully_supported",
  };
}

export function identityKeyFromSuspect(suspect: CardSuspect): string | null {
  return buildIdentityKey({
    category: suspect.category as CardPriceSnapshotCategory,
    setCode: suspect.setCode,
    setName: suspect.setName,
    collectorNumber: suspect.collectorNumber ?? suspect.cardNumber,
    finish: suspect.finish,
    variant: suspect.variantTags?.join("_"),
    language: suspect.language,
    cardName: suspect.canonicalName,
  });
}

export function identityKeyFromLocked(locked: LockedCardIdentity): string | null {
  return buildIdentityKey({
    category: locked.category as CardPriceSnapshotCategory,
    setCode: locked.setCode,
    setName: locked.setName,
    collectorNumber: locked.collectorNumber,
    finish: locked.finish,
    variant: locked.variantTags?.join("_"),
    cardName: locked.canonicalName,
  });
}

export function snapshotDocId(input: {
  source: string;
  identityKey: string;
  capturedDate: string;
  priceChartingProductId: string;
}): string {
  const slug = input.identityKey.replace(/[|/\\#]/g, "_").slice(0, 120);
  return `${input.source}_${input.capturedDate}_${input.priceChartingProductId}_${slug}`;
}

/** Legacy hardcoded MAR/REX inference for unit tests without Scryfall. */
export function inferIdentityFromPriceChartingRowLegacy(
  input: {
    productName: string;
    consoleName?: string;
    genre?: string;
  },
): InferredIdentity {
  const category = inferCategoryFromPcRow(input.genre, input.consoleName);
  const productName = input.productName.trim();
  const consoleName = input.consoleName?.trim() ?? "";

  if (category === "mtg") {
    const legacyOverrides: Array<{ pattern: RegExp; code: string; name?: string }> = [
      { pattern: /marvel universe|\bmar\b/i, code: "MAR", name: "Marvel Universe" },
      {
        pattern: /jurassic world collection|\bjurassic\b|\bmagic jurassic\b/i,
        code: "REX",
        name: "Jurassic World Collection",
      },
      { pattern: /forgotten realms commander|\bafc\b/i, code: "AFC" },
      { pattern: /the list|\bplst\b/i, code: "PLST", name: "The List" },
    ];
    let setCode: string | undefined;
    let setName: string | undefined;
    for (const m of legacyOverrides) {
      if (m.pattern.test(consoleName) || m.pattern.test(productName)) {
        setCode = m.code;
        setName = m.name;
        break;
      }
    }
    const bracket = productName.match(/\[([^\]]+)\]/);
    if (bracket && !setName) setName = bracket[1];
    const numMatch = productName.match(/#(\d{1,4})\b/);
    const collectorNumber = numMatch?.[1];
    const finish =
      /\bfoil\b/i.test(productName) && !/\bnonfoil\b/i.test(productName) ? "foil" : "nonfoil";
    const fields: IdentityKeyFields = {
      category,
      setCode,
      setName,
      collectorNumber,
      finish,
      treatment: "normal",
      cardName: productName.replace(/\[.*?\]/g, "").replace(/#\d+.*/g, "").trim(),
      language: "en",
    };
    if (!setCode || !collectorNumber) {
      return {
        ...fields,
        exactIdentityMatch: false,
        rejectedReason: !setCode ? "set_code_unresolved" : "collector_number_missing",
      };
    }
    return { ...fields, exactIdentityMatch: true, identityMatchReason: "mtg_set_and_number" };
  }

  return inferIdentityFromPriceChartingRow(input);
}
