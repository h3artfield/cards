import { scryfallFetch } from "../processing/scryfall-client";
import { normalizeTcgplayerName } from "./collection-tcgplayer";

export type ScryfallTcgMarketPrint = {
  name?: string;
  oracle_id?: string;
  tcgplayer_id?: number;
  prices?: { usd?: string | null };
};

export type ScryfallTcgMarket = {
  price: number;
  tcgplayerId?: string;
};

function parseUsd(raw?: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function pickScryfallTcgMarket(
  prints: ScryfallTcgMarketPrint[],
  wantedName: string,
): ScryfallTcgMarket | undefined {
  const wanted = normalizeTcgplayerName(wantedName.split("//")[0] ?? wantedName);
  let best: ScryfallTcgMarket | undefined;

  for (const print of prints) {
    const printName = normalizeTcgplayerName(
      String(print.name ?? "").split("//")[0] ?? "",
    );
    if (wanted && printName && printName !== wanted) continue;
    const price = parseUsd(print.prices?.usd);
    if (price == null) continue;
    if (!best || price < best.price) {
      best = {
        price,
        tcgplayerId:
          print.tcgplayer_id != null ? String(print.tcgplayer_id) : undefined,
      };
    }
  }

  return best;
}

export async function fetchScryfallTcgMarketFallback(input: {
  name: string;
  oracleId?: string;
}): Promise<ScryfallTcgMarket | undefined> {
  const name = input.name.trim();
  const oracleId = input.oracleId?.trim();
  if (!name && !oracleId) return undefined;

  const query = oracleId
    ? `oracleid:${oracleId} game:paper unique:prints`
    : `!"${name.replace(/"/g, "")}" game:paper unique:prints`;

  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=usd&dir=asc`,
    );
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data?: ScryfallTcgMarketPrint[] };
    return pickScryfallTcgMarket(json.data ?? [], name);
  } catch {
    return undefined;
  }
}
