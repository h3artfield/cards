import {
  fetchScryfallBySetAndNumber,
  searchScryfallCards,
} from "../processing/scryfall-client";

export type PlstOrigin = {
  originSet?: string;
  originCollectorNumber?: string;
};

const plstCache = new Map<string, PlstOrigin | null>();

export async function lookupPlstOrigin(collectorNumber: string): Promise<PlstOrigin | null> {
  const key = collectorNumber.replace(/^#/, "");
  if (plstCache.has(key)) return plstCache.get(key) ?? null;

  const card = await fetchScryfallBySetAndNumber("plst", key);
  if (!card) {
    const fallback = { originCollectorNumber: key };
    plstCache.set(key, fallback);
    return fallback;
  }

  const oracleId = card.oracle_id as string | undefined;
  if (!oracleId) {
    const fallback = { originCollectorNumber: key };
    plstCache.set(key, fallback);
    return fallback;
  }

  const prints = await searchScryfallCards(`oracle_id:${oracleId} -set:plst`);
  const origin = prints.find((p) => {
    const set = String(p.set ?? "").toLowerCase();
    return set && set !== "plst";
  });

  if (origin) {
    const result: PlstOrigin = {
      originSet: String(origin.set ?? "").toUpperCase(),
      originCollectorNumber: key,
    };
    plstCache.set(key, result);
    return result;
  }

  const fallback = { originCollectorNumber: key };
  plstCache.set(key, fallback);
  return fallback;
}

export function clearPlstOriginCache(): void {
  plstCache.clear();
}

export async function preloadPlstOrigins(
  collectorNumbers: string[],
  concurrency = 8,
): Promise<Map<string, PlstOrigin>> {
  const out = new Map<string, PlstOrigin>();
  const unique = [...new Set(collectorNumbers.map((n) => n.replace(/^#/, "")))];
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (cn) => {
        const origin = await lookupPlstOrigin(cn);
        if (origin) out.set(cn, origin);
        await new Promise((r) => setTimeout(r, 110));
      }),
    );
  }
  return out;
}
