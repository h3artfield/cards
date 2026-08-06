import type { MarketIdentityFields } from "./types";
import type { RawMarketComp } from "./types";

type ScryfallPrices = {
  usd?: string | null;
  usd_foil?: string | null;
  eur?: string | null;
  tix?: string | null;
};

function parsePrice(value?: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function extractScryfallPrintPrices(
  raw: Record<string, unknown>,
  finish?: string,
): Array<{ label: string; price: number }> {
  const prices = raw.prices as ScryfallPrices | undefined;
  if (!prices) return [];

  const f = (finish ?? "").toLowerCase();
  const signals: Array<{ label: string; price: number }> = [];

  if (f.includes("foil") && !f.includes("non")) {
    const p = parsePrice(prices.usd_foil);
    if (p != null) signals.push({ label: "scryfall_usd_foil", price: p });
  } else {
    const p = parsePrice(prices.usd);
    if (p != null) signals.push({ label: "scryfall_usd", price: p });
  }

  return signals;
}

/** Build pricing signal comp(s) from the exact confirmed Scryfall print only. */
export function buildScryfallPrintPriceComps(
  fields: MarketIdentityFields,
): RawMarketComp[] {
  if (fields.category !== "mtg") return [];
  const raw = fields.scryfallCatalogData;
  if (!raw || typeof raw !== "object") return [];

  const signals = extractScryfallPrintPrices(raw, fields.finish);
  if (!signals.length) return [];

  const name = String(raw.name ?? fields.canonicalName ?? "Unknown");
  const set = raw.set as { name?: string; code?: string } | undefined;
  const collector = String(raw.collector_number ?? fields.collectorNumber ?? "");
  const finishLabel = fields.finish ?? "nonfoil";

  return signals.map((sig) => ({
    source: "scryfall_print_price" as const,
    title: `${name} · ${set?.name ?? "?"} (${set?.code ?? "?"}) · #${collector} · ${finishLabel}`,
    price: sig.price,
    conditionText: sig.label,
    rawData: {
      pricingSignal: true,
      exactPrint: true,
      scryfallPrices: raw.prices,
      sourceLabel: "scryfall_print_price",
    },
  }));
}
