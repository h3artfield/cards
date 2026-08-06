/**
 * Download PriceCharting Legendary CSV files (Subscriptions → API/Download).
 * Reads full download URLs from env — never hardcode tokens in source.
 *
 * Run: npm run prices:download:pricecharting-csv [--date YYYY-MM-DD] [--force]
 *
 * Env (web/.env.local — do not commit):
 *   PRICECHARTING_CSV_POKEMON_URL
 *   PRICECHARTING_CSV_MAGIC_URL
 *   PRICECHARTING_CSV_YUGIOH_URL
 *   PRICECHARTING_CSV_ONEPIECE_URL
 *   PRICECHARTING_CSV_VIDEOGAMES_URL (optional — skipped by default)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

const CARD_DOWNLOADS: Array<{
  envKey: string;
  fileName: string;
  label: string;
}> = [
  { envKey: "PRICECHARTING_CSV_POKEMON_URL", fileName: "pricecharting-pokemon.csv", label: "Pokémon" },
  { envKey: "PRICECHARTING_CSV_MAGIC_URL", fileName: "pricecharting-magic.csv", label: "Magic" },
  { envKey: "PRICECHARTING_CSV_YUGIOH_URL", fileName: "pricecharting-yugioh.csv", label: "Yu-Gi-Oh" },
  { envKey: "PRICECHARTING_CSV_ONEPIECE_URL", fileName: "pricecharting-onepiece.csv", label: "One Piece" },
];

async function downloadOne(url: string, outPath: string): Promise<number> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(600_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const looksCsv =
    text.startsWith("id,") ||
    text.includes("product-name") ||
    (text.includes(",") && text.length > 5000);
  if (!looksCsv) {
    throw new Error(`Response does not look like CSV: ${text.slice(0, 120)}`);
  }
  writeFileSync(outPath, text, "utf8");
  return text.length;
}

async function main() {
  loadEnvLocal();

  const dateArg = process.argv.find((a, i) => process.argv[i - 1] === "--date");
  const date = dateArg ?? new Date().toISOString().slice(0, 10);
  const force = process.argv.includes("--force");
  const includeGames = process.argv.includes("--include-videogames");

  const outDir = resolve(__dirname, "../../data/pricecharting/raw", date);
  mkdirSync(outDir, { recursive: true });

  const jobs = [...CARD_DOWNLOADS];
  if (includeGames && process.env.PRICECHARTING_CSV_VIDEOGAMES_URL) {
    jobs.push({
      envKey: "PRICECHARTING_CSV_VIDEOGAMES_URL",
      fileName: "pricecharting-videogames.csv",
      label: "Video Games",
    });
  }

  console.log(`PriceCharting CSV download — ${date}`);
  console.log(`Output: ${outDir}\n`);

  let failed = 0;
  for (const job of jobs) {
    const url = process.env[job.envKey]?.trim();
    if (!url) {
      console.error(`SKIP ${job.label}: ${job.envKey} not set`);
      failed++;
      continue;
    }

    const outPath = resolve(outDir, job.fileName);
    if (!force && existsSync(outPath)) {
      const size = statSync(outPath).size;
      console.log(`SKIP ${job.fileName} (exists, ${size} bytes) — use --force to re-download`);
      continue;
    }

    console.log(`Downloading ${job.label} → ${job.fileName}…`);
    try {
      const bytes = await downloadOne(url, outPath);
      console.log(`  OK ${bytes.toLocaleString()} bytes`);
      await new Promise((r) => setTimeout(r, 11_000));
    } catch (err) {
      failed++;
      console.error(`  FAIL ${err instanceof Error ? err.message : err}`);
    }
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
