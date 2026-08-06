import { readFileSync } from "fs";
import { resolve } from "path";
import { buildPokemonQueries } from "../src/lib/processing/catalog-pricing";
import { findCatalogCandidates } from "../src/lib/processing/pricing";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] == null) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

async function main() {
  loadEnvLocal();

  const vision = {
    category: "pokemon" as const,
    itemType: "raw" as const,
    cardName: "M Charizard EX",
    cardNumber: "100/108",
    confidence: 0.9,
  };

  console.log("Queries:", buildPokemonQueries(vision));
  const matches = await findCatalogCandidates(vision, 12);
  console.log(`Matches: ${matches.length}\n`);
  for (const m of matches.slice(0, 8)) {
    const raw = m.raw as { name?: string; number?: string; set?: { name?: string } };
    console.log(`- ${raw.name} · ${raw.number} · ${raw.set?.name ?? "?"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
