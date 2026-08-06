/** Probe PriceCharting CSV endpoints — writes results only, no token in output. */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

const PATHS = [
  "api/csv",
  "api/download",
  "api/download-csv",
  "api/price-guide",
  "api/price-guide.csv",
  "api/products.csv",
  "price-guide/download",
  "download/price-guide",
  "download/csv",
  "api/category-csv?category=pokemon-cards",
  "api/category-csv?category=magic-cards",
  "api/category-csv?category=yugioh-cards",
  "api/category-csv?category=other-tcg-cards",
  "api/csv?category=pokemon-cards",
  "api/csv?category=magic-cards",
  "api/csv?category=video-games",
  "api/csv?category=other-cards",
  "api/csv?category=one-piece-cards",
  "api/csv?category=lorcana-cards",
];

async function main() {
  loadEnvLocal();
  const t = process.env.PRICECHARTING_API_KEY?.trim();
  if (!t) throw new Error("no token");

  const results: string[] = [];
  for (const path of PATHS) {
    const url = `https://www.pricecharting.com/${path}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(t)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const preview = (await res.text()).slice(0, 120).replace(/\s+/g, " ");
      results.push(`${path} -> ${res.status} ${res.headers.get("content-type")} ${preview}`);
    } catch (e) {
      results.push(`${path} -> ERR ${e instanceof Error ? e.message : e}`);
    }
  }

  // SportsCardsPro uses separate domain
  for (const path of ["api/csv", "api/download", "price-guide/download"]) {
    const url = `https://www.sportscardspro.com/${path}?t=${encodeURIComponent(t)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const preview = (await res.text()).slice(0, 120).replace(/\s+/g, " ");
      results.push(`sportscardspro/${path} -> ${res.status} ${preview}`);
    } catch (e) {
      results.push(`sportscardspro/${path} -> ERR ${e instanceof Error ? e.message : e}`);
    }
  }

  const out = results.join("\n");
  writeFileSync(resolve(__dirname, "../../data/pricecharting/csv-probe.txt"), out);
  console.log(out);
}

main();
