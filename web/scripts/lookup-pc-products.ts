/** Quick lookup — npx tsx scripts/lookup-pc-products.ts */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1]!.trim()]) process.env[m[1]!.trim()] = m[2]!.trim();
  }
}

const queries = [
  "Ravenous Tyrannosaurus [Marvel Universe] #93",
  "Ravenous Tyrannosaurus Marvel Universe #93",
  "Argentum Armor [Forgotten Realms Commander] #347",
  "Grusha [Reverse Holo] #184 Paldea Evolved",
];

async function main() {
  loadEnv();
  const t = process.env.PRICECHARTING_API_KEY!;
  for (const q of queries) {
    await new Promise((r) => setTimeout(r, 1100));
    const url = `https://www.pricecharting.com/api/products?t=${encodeURIComponent(t)}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    const data = (await res.json()) as { products?: Array<Record<string, unknown>> };
    console.log("\nQ:", q);
    for (const p of data.products ?? []) {
      console.log(`  id=${p.id} ${p["product-name"]} | ${p["console-name"]}`);
    }
  }
}
main();
