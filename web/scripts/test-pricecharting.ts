import { readFileSync, existsSync } from "fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!.trim();
    const val = m[2]!.trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const token = process.env.PRICECHARTING_API_KEY?.trim();
  if (!token) {
    console.error("PRICECHARTING_API_KEY not set");
    process.exit(1);
  }

  const queries = [
    "Morgan Team Up 178",
    "Charizard VMAX 189 Darkness Ablaze",
  ];

  for (const q of queries) {
    const url = `https://www.pricecharting.com/api/product?t=${encodeURIComponent(token)}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const data = (await res.json()) as Record<string, unknown>;
    console.log("\nQuery:", q);
    console.log(
      JSON.stringify(
        {
          http: res.status,
          status: data.status,
          name: data["product-name"],
          console: data["console-name"],
          looseUsd: (Number(data["loose-price"]) || 0) / 100,
          psa10Usd: (Number(data["manual-only-price"]) || 0) / 100,
          graded9Usd: (Number(data["graded-price"]) || 0) / 100,
          id: data.id,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
