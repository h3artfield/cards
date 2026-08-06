import { readFileSync, existsSync } from "fs";
import { resolveMarketPrice } from "../src/lib/processing/pricing/resolve-market-price";
import type { VisionResult } from "../src/lib/types";

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!.trim();
    const val = m[2]!.trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();

  const morgan: VisionResult = {
    category: "pokemon",
    itemType: "raw",
    cardName: "Morgan",
    setName: "Team Up",
    cardNumber: "178/181",
    variant: "holofoil",
    conditionEstimate: "LP",
    confidence: 0.9,
  };

  const result = await resolveMarketPrice(morgan);
  console.log(
    JSON.stringify(
      {
        marketPrice: result.marketPrice,
        source: result.source,
        estimated: result.estimated,
        compCount: result.compCount,
        compMethod: result.compMethod,
        compConfidence: result.compConfidence,
        hasRaw: Boolean(result.raw),
        comps: result.comps?.slice(0, 3),
      },
      null,
      2,
    ),
  );

  if (result.marketPrice <= 0) {
    console.error("FAIL: expected market price > 0 for Morgan Team Up");
    process.exit(1);
  }
  console.log("resolveMarketPrice OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
