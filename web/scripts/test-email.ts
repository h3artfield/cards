/**
 * Send a test email via Resend (uses web/.env.local).
 * Run: npm run email:test
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { sendEmail } from "../src/lib/processing/notifications";

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
    console.error("Set RESEND_API_KEY in web/.env.local.");
    process.exit(1);
  }

  if (!process.env.EMAIL_FROM?.trim()) {
    process.env.EMAIL_FROM = "Card Scanner Reports <reports@cardscanner9000.com>";
  }

  const to = process.env.EMAIL_TEST_TO?.trim() || "h3artfield@gmail.com";
  const ok = await sendEmail({
    to,
    subject: "Card Scanner Reports — test email",
    html: `<p>Resend is working for <strong>Card Scanner Reports</strong>.</p>
<p>Sent at ${new Date().toISOString()}</p>`,
  });

  if (!ok) {
    console.error("Test email failed — check Resend domain and API key.");
    process.exit(1);
  }

  console.log(`Test email sent to ${to}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
