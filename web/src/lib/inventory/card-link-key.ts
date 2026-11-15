/**
 * The permanent key a card's QR label and Shopify barcode carry, built only
 * from the TCGplayer product and condition so a label printed today still
 * matches after re-imports, restocks and price changes. Example:
 * 593337 + "Near Mint Foil" -> "593337-nm-f".
 */
const CONDITIONS: Array<[RegExp, string]> = [
  [/\bnear mint\b|\bnm\b/, "nm"],
  [/\blightly played\b|\blp\b/, "lp"],
  [/\bmoderately played\b|\bmp\b/, "mp"],
  [/\bheavily played\b|\bhp\b/, "hp"],
  [/\bdamaged\b|\bdmg\b/, "dmg"],
  [/\bunopened\b|\bsealed\b/, "sealed"],
];

const LANGUAGES: Array<[RegExp, string]> = [
  [/japanese/, "ja"],
  [/chinese/, "zh"],
  [/korean/, "ko"],
  [/german/, "de"],
  [/french/, "fr"],
  [/italian/, "it"],
  [/spanish/, "es"],
  [/portuguese/, "pt"],
  [/russian/, "ru"],
];

export function isFoilConditionV1(condition: string): boolean {
  return /\bfoil\b/i.test(condition) && !/\bnon[- ]?foil\b/i.test(condition);
}

export function cardLinkKeyV1(tcgplayerProductId: string, condition: string): string | null {
  const id = tcgplayerProductId.trim();
  if (!/^\d+$/.test(id)) return null;
  const c = condition.toLowerCase();
  const parts = [id, CONDITIONS.find(([re]) => re.test(c))?.[1] ?? "nm"];
  const lang = LANGUAGES.find(([re]) => re.test(c))?.[1];
  if (lang) parts.push(lang);
  if (isFoilConditionV1(c)) parts.push("f");
  return parts.join("-");
}

export function isCardLinkKeyV1(value: string): boolean {
  return /^\d+-(nm|lp|mp|hp|dmg|sealed)(-[a-z]{2})?(-f)?$/.test(value);
}

/** The address a label's QR code opens; also the Shopify barcode POS scans. */
export function cardLinkUrlV1(baseUrl: string, storeSlug: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/s/${encodeURIComponent(storeSlug)}/c/${key}`;
}
