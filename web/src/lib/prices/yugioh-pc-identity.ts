import type { IdentityKeyFields } from "./identity-key";

export type YugiohPcIdentityResult = IdentityKeyFields & {
  exactIdentityMatch: boolean;
  rejectedReason?: string;
  identityMatchReason?: string;
};

/** Yu-Gi-Oh card IDs in PriceCharting product titles. */
const YGO_ID_PATTERNS = [
  /\b([A-Z0-9]{2,5}-(?:EN|JP|EU|FR|DE|IT|PT|SP)\d{2,4}[A-Z]?)\b/gi,
  /\b([A-Z]{2,5}-J(?:P)?\d{2,4})\b/gi,
  /\b([A-Z]{2,4}-\d{3}[A-Z]?)\b/gi,
];

function parseYugiohCardId(productName: string): string | undefined {
  for (const re of YGO_ID_PATTERNS) {
    const matches = [...productName.matchAll(re)];
    if (matches.length === 1) {
      return matches[0]![1]!.toUpperCase();
    }
    if (matches.length > 1) {
      const last = matches[matches.length - 1]![1]!.toUpperCase();
      return last;
    }
  }
  const bracket = productName.match(/\[([A-Z0-9]{2,5}-(?:EN|JP|EU|FR|DE|IT|PT|SP|J(?:P)?)?\d{2,4}[A-Z]?)\]/i);
  if (bracket?.[1]) return bracket[1].toUpperCase();
  return undefined;
}

function parseSetName(consoleName: string): string {
  return consoleName.replace(/^yugioh\s+/i, "").trim();
}

function cardNameFromTitle(productName: string, cardId?: string): string {
  let name = productName.replace(/\[.*?\]/g, "").trim();
  if (cardId) {
    const re = new RegExp(`\\s*${cardId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    name = name.replace(re, "").trim();
  }
  return name;
}

export function inferYugiohIdentityFromPriceChartingRow(input: {
  productName: string;
  consoleName?: string;
  genre?: string;
}): YugiohPcIdentityResult {
  const productName = input.productName.trim();
  const consoleName = input.consoleName?.trim() ?? "";
  const setName = parseSetName(consoleName);
  const collectorNumber = parseYugiohCardId(productName);

  const fields: IdentityKeyFields = {
    category: "yugioh",
    setName,
    collectorNumber,
    cardName: cardNameFromTitle(productName, collectorNumber),
    language: /japanese|jp\b/i.test(`${consoleName} ${productName}`) ? "jp" : "en",
  };

  if (!setName) {
    return { ...fields, exactIdentityMatch: false, rejectedReason: "set_name_missing" };
  }
  if (!collectorNumber) {
    return { ...fields, exactIdentityMatch: false, rejectedReason: "collector_number_missing" };
  }

  return {
    ...fields,
    exactIdentityMatch: true,
    identityMatchReason: "yugioh_set_and_number",
  };
}
