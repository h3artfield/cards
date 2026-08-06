/**
 * Sync EDHREC commander meta + recommendation cards to Firestore.
 *
 * Usage:
 *   npx tsx scripts/sync-edhrec-batch.ts [--limit=100] [--batch=5] [--rounds=20]
 */
import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();

import { deckBuilderStore } from "../src/lib/deck-builder/deck-builder-store";
import {
  newSyncRunId,
  syncEdhrecTopCommandersBatch,
} from "../src/lib/deck-builder/sync-edhrec";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const limit = Number.parseInt(arg("limit") ?? "100", 10);
  const batchSize = Number.parseInt(arg("batch") ?? "5", 10);
  const maxRounds = Number.parseInt(arg("rounds") ?? "50", 10);

  let offset = 0;
  let totalSynced = 0;
  let totalFailed = 0;
  let rounds = 0;

  while (rounds < maxRounds) {
    rounds += 1;
    const runId = newSyncRunId();
    await deckBuilderStore.saveSyncRun({
      id: runId,
      type: "commanders",
      status: "running",
      processed: offset,
      total: limit,
      startedAt: new Date().toISOString(),
    });

    const result = await syncEdhrecTopCommandersBatch({
      limit,
      offset,
      batchSize,
      saveMeta: (m) => deckBuilderStore.saveEdhrecMeta(m),
      saveCatalogCard: (c) => deckBuilderStore.saveCatalogCard(c),
    });

    totalSynced += result.synced;
    totalFailed += result.failed;
    offset += batchSize;

    await deckBuilderStore.saveSyncRun({
      id: runId,
      type: "commanders",
      status: "completed",
      processed: offset,
      total: limit,
      message: `Synced ${result.synced}, failed ${result.failed}, remaining ${result.remaining}`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    console.log(
      `Round ${rounds}: synced=${result.synced} failed=${result.failed} remaining=${result.remaining} slugs=${result.slugs.join(", ")}`,
    );

    if (result.remaining <= 0 || result.synced === 0) break;
  }

  console.log(
    `Done. ${totalSynced} commanders synced, ${totalFailed} failed in ${rounds} round(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
