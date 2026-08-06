/**
 * Send a test PriceCharting import report email via Resend.
 * Run: npm run email:test:pricecharting-import
 *
 * Requires in web/.env.local (or Cloud Run secrets):
 *   RESEND_API_KEY
 *   PRICECHARTING_IMPORT_EMAIL_PROVIDER=resend
 *   PRICECHARTING_IMPORT_EMAIL_TO=h3artfield@gmail.com
 *   PRICECHARTING_IMPORT_EMAIL_FROM=reports@cardscanner9000.com
 *   PRICECHARTING_IMPORT_EMAIL_FROM_NAME="Card Scanner Reports"
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { sendPriceChartingImportTestEmail } from "../src/lib/prices/pricecharting-import-email";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();

  if (!process.env.RESEND_API_KEY?.trim()) {
    console.error("Set RESEND_API_KEY in web/.env.local or the environment.");
    process.exit(1);
  }

  if (process.env.PRICECHARTING_IMPORT_EMAIL_PROVIDER?.trim().toLowerCase() !== "resend") {
    process.env.PRICECHARTING_IMPORT_EMAIL_PROVIDER = "resend";
  }

  const ok = await sendPriceChartingImportTestEmail();
  if (!ok) {
    console.error("Test email failed — check Resend domain and API key.");
    process.exit(1);
  }

  const to = process.env.PRICECHARTING_IMPORT_EMAIL_TO?.trim() || "h3artfield@gmail.com";
  console.log(`Test import report email sent to ${to}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
