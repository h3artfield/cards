/**
 * Staging smoke for known simple-clerk regressions with full reply traces.
 * Run: npx tsx scripts/smoke-staging-simple-clerk.ts
 */
import { assertStagingDeploymentIdentity } from "./staging-deployment-verify";

const BASE =
  process.env.STAGING_URL ??
  "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";
const SLUG = process.env.STORE_SLUG ?? "the-game-lodge";

const KNOWN_SMOKE_QUESTIONS = [
  "Is Lórien Revealed a commander?",
  "Is Embrace the Unknown a commander?",
  "What type of card is Sol Ring?",
  "What are the best mono-blue commanders you have under $100?",
  "Show me blue cards",
  "Show me mono-blue cards",
  "What is blink?",
  "What is blink, and which blink cards are in stock?",
  "Does ward stop a board wipe?",
  "Does copying a spell count as casting it?",
];

interface Rec {
  card_name?: string;
  oracleId?: string;
  inventoryItemId?: string;
  qty?: number;
  price?: number;
  colorIdentity?: string[];
  reason?: string;
}

async function clerk(message: string) {
  const started = Date.now();
  const res = await fetch(
    `${BASE}/api/store/${encodeURIComponent(SLUG)}/inventory/clerk`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: [], filters: {} }),
    },
  );
  const data = (await res.json()) as Record<string, unknown>;
  return { data, ms: Date.now() - started, ok: res.ok };
}

async function main() {
  console.log("=== Staging deployment identity check ===\n");
  const { lock, identity } = await assertStagingDeploymentIdentity({ baseUrl: BASE });
  console.log(JSON.stringify({ lock, identity }, null, 2));
  console.log("\n=== Known regression smoke ===\n");

  let failed = 0;

  for (const question of KNOWN_SMOKE_QUESTIONS) {
    const { data, ms, ok } = await clerk(question);
    const reply = String(data.reply ?? "");
    const routing = data.routing as { intent?: string } | undefined;
    const verify = data.verification as { status?: string; hard_failures?: string[] } | undefined;
    const recs = (data.recommendations as Rec[]) ?? [];

    console.log(`--- ${question} (${ms}ms) ---`);
    console.log(`intent: ${routing?.intent ?? "n/a"}`);
    console.log(`verify: ${verify?.status ?? "n/a"}`);
    if (verify?.hard_failures?.length) {
      console.log(`hard_failures: ${verify.hard_failures.join("; ")}`);
    }
    console.log(`reply:\n${reply}\n`);

    if (question.includes("mono-blue commanders")) {
      console.log("Returned cards:");
      for (const rec of recs) {
        console.log(
          JSON.stringify(
            {
              canonicalName: rec.card_name,
              oracleId: rec.oracleId,
              inventoryListingId: rec.inventoryItemId,
              availableQuantity: rec.qty,
              price: rec.price,
              colorIdentity: rec.colorIdentity,
              reason: rec.reason,
            },
            null,
            2,
          ),
        );
      }
      console.log("");
    }

    if (!ok) {
      failed += 1;
      console.log("FAIL: HTTP error\n");
    }
  }

  if (failed > 0) {
    console.error(`${failed} smoke request(s) FAILED`);
    process.exit(1);
  }
  console.log("Smoke requests completed (review replies above for eligibility)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
