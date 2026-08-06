/**
 * Bootstrap PriceCharting warehouse from API when bulk CSV is unavailable.
 * Fetches validation + category sample products, writes archived CSV, imports to Firestore.
 *
 * Run: npx tsx scripts/bootstrap-pricecharting-api-import.ts [--date YYYY-MM-DD]
 */
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve } from "path";
import { v4 as uuidv4 } from "uuid";
import { importPriceChartingCsv } from "../src/lib/prices/pricecharting-csv-import";
import { priceWarehouseStore } from "../src/lib/prices/price-warehouse-store";
import type { PriceChartingImportRun } from "../src/lib/prices/types";

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

type PcProduct = Record<string, unknown>;

const FETCH_TARGETS: Array<{
  label: string;
  host: "pricecharting" | "sportscardspro";
  id?: string;
  q?: string;
}> = [
  { label: "REX #18 Ravenous", host: "pricecharting", id: "6213997" },
  { label: "REX #43 Ravenous", host: "pricecharting", id: "6214022" },
  {
    label: "MAR #93 Ravenous (search)",
    host: "pricecharting",
    q: "Ravenous Tyrannosaurus Marvel Universe 93 nonfoil",
  },
  { label: "Argentum Armor AFC", host: "pricecharting", id: "5553635" },
  { label: "Grusha reverse holo", host: "pricecharting", id: "5287735" },
  { label: "CJ Stroud base", host: "sportscardspro", id: "6180283" },
  { label: "CJ Stroud silver", host: "sportscardspro", id: "6201625" },
  { label: "Yu-Gi-Oh sample", host: "pricecharting", id: "2530687" },
  { label: "One Piece sample", host: "pricecharting", id: "10801024" },
  { label: "Lorcana sample", host: "pricecharting", id: "10749539" },
];

async function fetchProduct(
  token: string,
  target: { id?: string; q?: string; host: "pricecharting" | "sportscardspro" },
): Promise<PcProduct | null> {
  const base =
    target.host === "sportscardspro"
      ? "https://www.sportscardspro.com"
      : "https://www.pricecharting.com";
  const param = target.id
    ? `id=${encodeURIComponent(target.id)}`
    : `q=${encodeURIComponent(target.q ?? "")}`;
  const url = `${base}/api/product?t=${encodeURIComponent(token)}&${param}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const data = (await res.json()) as PcProduct;
  if (data.status !== "success") return null;
  return data;
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"')) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function productToCsvRow(p: PcProduct): string {
  const cols: Array<[string, unknown]> = [
    ["id", p.id],
    ["product-name", p["product-name"]],
    ["console-name", p["console-name"]],
    ["genre", p.genre],
    ["loose-price", p["loose-price"]],
    ["cib-price", p["cib-price"]],
    ["new-price", p["new-price"]],
    ["graded-price", p["graded-price"]],
    ["box-only-price", p["box-only-price"]],
    ["manual-only-price", p["manual-only-price"]],
    ["bgs-10-price", p["bgs-10-price"]],
    ["condition-17-price", p["condition-17-price"]],
    ["condition-18-price", p["condition-18-price"]],
    ["retail-loose-buy", p["retail-loose-buy"]],
    ["retail-loose-sell", p["retail-loose-sell"]],
    ["retail-new-buy", p["retail-new-buy"]],
    ["retail-new-sell", p["retail-new-sell"]],
    ["sales-volume", p["sales-volume"]],
  ];
  return cols
    .map(([k, v]) => (v == null || v === "" ? "" : csvEscape(String(v))))
    .join(",");
}

async function main() {
  loadEnvLocal();
  const token = process.env.PRICECHARTING_API_KEY?.trim();
  if (!token) {
    console.error("PRICECHARTING_API_KEY not set");
    process.exit(1);
  }

  const date =
    process.argv.find((a, i) => process.argv[i - 1] === "--date") ??
    new Date().toISOString().slice(0, 10);

  const products: Array<{ label: string; product: PcProduct }> = [];
  const seenIds = new Set<string>();

  for (const item of FETCH_TARGETS) {
    await new Promise((r) => setTimeout(r, 1100));
    const product = await fetchProduct(token, item);
    if (!product?.id) {
      console.warn(`MISS ${item.label}: no product`);
      continue;
    }
    const id = String(product.id);
    if (seenIds.has(id)) {
      console.log(`SKIP duplicate ${item.label} id=${id}`);
      continue;
    }
    seenIds.add(id);
    products.push({ label: item.label, product });
    console.log(
      `OK ${item.label}: id=${id} name=${product["product-name"]} loose=${product["loose-price"]}`,
    );
  }

  if (!products.length) {
    console.error("No products fetched");
    process.exit(1);
  }

  const header =
    "id,product-name,console-name,genre,loose-price,cib-price,new-price,graded-price,box-only-price,manual-only-price,bgs-10-price,condition-17-price,condition-18-price,retail-loose-buy,retail-loose-sell,retail-new-buy,retail-new-sell,sales-volume";
  const csv = [header, ...products.map((p) => productToCsvRow(p.product))].join("\n");

  const outDir = resolve(__dirname, "../../data/pricecharting/raw");
  mkdirSync(outDir, { recursive: true });
  const csvPath = resolve(outDir, `pricecharting-api-bootstrap-${date}.csv`);
  writeFileSync(csvPath, csv, "utf8");
  console.log(`\nArchived CSV: ${csvPath} (${products.length} rows)`);

  const result = importPriceChartingCsv({
    fileText: csv,
    fileName: `pricecharting-api-bootstrap-${date}.csv`,
    capturedDate: date,
    category: "all",
  });

  result.run.fileName = `pricecharting-api-bootstrap-${date}.csv (API-synthesized; bulk CSV pending)`;

  console.log("\nImport summary:");
  console.log(JSON.stringify(result.run, null, 2));

  await priceWarehouseStore.saveImportRun(result.run);
  await priceWarehouseStore.upsertProducts(result.products);
  const snap = await priceWarehouseStore.saveSnapshots(result.snapshots);

  console.log(`\nPersisted products=${result.products.length} snapshots=${snap.written}`);
  console.log(`Import run ID: ${result.run.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
