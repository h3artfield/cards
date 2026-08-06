/**
 * Directive 008 — Cloud Run Job entry: process one order.
 * Run: npx tsx scripts/run-order-processing-job.ts --order-id <uuid> [--attempt-id <uuid>]
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { processOrderSubmission } from "../src/lib/processing/process-order-submission";
import { logProcessingConfig } from "../src/lib/processing/invoke-order-processing-job";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (process.env[k] == null) process.env[k] = v;
  }
}

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  loadEnvLocal();
  process.env.REQUIRE_FIRESTORE = "true";

  const orderId = parseArg("--order-id");
  if (!orderId) {
    console.error("Usage: npx tsx scripts/run-order-processing-job.ts --order-id <uuid>");
    process.exit(1);
  }

  const attemptId = parseArg("--attempt-id");
  const jobExecutionId =
    process.env.CLOUD_RUN_EXECUTION?.trim() ||
    process.env.CLOUD_RUN_JOB_EXECUTION?.trim();

  logProcessingConfig();

  const order = await import("../src/lib/storage/data-store").then((m) =>
    m.dataStore.getOrder(orderId),
  );
  if (!order) {
    console.error(`Order not found: ${orderId}`);
    process.exit(1);
  }

  const isFirstSubmit = !order.reviewedAt;

  await processOrderSubmission(orderId, {
    isFirstSubmit,
    attemptId,
    jobExecutionId,
    workerMode: "cloud_run_job",
  });

  console.log(JSON.stringify({ ok: true, orderId, attemptId, jobExecutionId }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
