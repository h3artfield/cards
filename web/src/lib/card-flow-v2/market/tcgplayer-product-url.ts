import type { CardCategory, CardSuspect } from "../types";
import type { CandidateMarketSnapshot } from "./types";
import { tcgplayerJapanProductFromSuspect } from "../tcgplayer-japan-catalog";

/** Normalize catalog / prices.tcgplayer.com URLs to a public product page. */
export function normalizeTcgplayerProductUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const pathMatch = parsed.pathname.match(/\/(?:price\/)?product\/(\d+)/i);
    if (pathMatch?.[1]) {
      return `https://www.tcgplayer.com/product/${pathMatch[1]}`;
    }
    if (parsed.hostname.includes("tcgplayer.com")) {
      return trimmed;
    }
  } catch {
    /* fall through */
  }

  return trimmed;
}

function isJapanesePokemonSuspect(suspect?: CardSuspect): boolean {
  if (suspect?.category !== "pokemon") return false;
  const lang = (suspect.language ?? "").trim().toLowerCase();
  return (
    lang === "jp" ||
    lang === "ja" ||
    lang.includes("japanese") ||
    suspect.variantTags?.includes("japanese") === true ||
    suspect.catalogSource === "scan_derived_fallback"
  );
}

function tcgplayerSearchCategory(
  category?: CardCategory,
  suspect?: CardSuspect,
): string {
  if (isJapanesePokemonSuspect(suspect)) {
    return "pokemon-japan";
  }
  switch (category) {
    case "pokemon":
      return "pokemon";
    case "mtg":
      return "magic";
    case "yugioh":
      return "yugioh";
    case "lorcana":
      return "lorcana";
    case "onepiece":
      return "one-piece-card-game";
    case "riftbound":
      return "riftbound-league-of-legends-trading-card-game";
    default:
      return "all";
  }
}

function tcgplayerSearchUrl(suspect?: CardSuspect, name?: string): string | undefined {
  const parts: string[] = [];
  if (suspect?.canonicalName) parts.push(suspect.canonicalName);
  else if (name) parts.push(name);
  if (suspect?.setName) parts.push(suspect.setName);
  else if (suspect?.setCode) parts.push(suspect.setCode);
  const num = suspect?.collectorNumber ?? suspect?.cardNumber;
  if (num) parts.push(num.replace(/^#/, ""));
  const q = parts.join(" ").trim();
  if (!q) return undefined;
  const segment = tcgplayerSearchCategory(suspect?.category, suspect);
  return `https://www.tcgplayer.com/search/${segment}/product?q=${encodeURIComponent(q)}&productLineName=${segment}`;
}

export function buildTcgplayerProductUrl(input: {
  snapshot?: CandidateMarketSnapshot;
  suspect?: CardSuspect;
}): string | undefined {
  const jpProduct = input.suspect
    ? tcgplayerJapanProductFromSuspect(input.suspect)
    : undefined;
  if (jpProduct?.productId) {
    return normalizeTcgplayerProductUrl(jpProduct.productUrl);
  }

  const mapping = input.snapshot?.tcgplayerMapping;
  const useMappedProduct =
    mapping?.productUrl &&
    !isJapanesePokemonSuspect(input.suspect) &&
    mapping.reasonIfSkipped == null;

  if (useMappedProduct && mapping?.productUrl) {
    return normalizeTcgplayerProductUrl(mapping.productUrl);
  }

  const productId = mapping?.productId;
  if (
    productId &&
    /^\d+$/.test(productId) &&
    !isJapanesePokemonSuspect(input.suspect) &&
    mapping?.reasonIfSkipped == null
  ) {
    return `https://www.tcgplayer.com/product/${productId}`;
  }

  return tcgplayerSearchUrl(
    input.suspect,
    input.suspect?.canonicalName ?? input.snapshot?.marketProductName,
  );
}
