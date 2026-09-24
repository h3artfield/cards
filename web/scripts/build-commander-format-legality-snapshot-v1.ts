#!/usr/bin/env npx tsx
/**
 * Build commander format legality snapshot v1 — deterministic product legality source.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import {
  buildDefaultCommanderFormatLegalitySnapshot,
  COMMANDER_FORMAT_LEGALITY_SNAPSHOT_VERSION,
} from "../src/lib/deck-synthesis/benchmark-commander-legality-v1.1";

loadProjectEnvLocal();

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const legalityAsOf = new Date().toISOString();
  const snapshot = buildDefaultCommanderFormatLegalitySnapshot({ catalog, legalityAsOf });

  const setCodes = new Map<string, { setName: string; releasedAt: string; count: number }>();
  for (const card of catalog.byOracleId.values()) {
    const code = card.releaseInformation?.setCode?.toLowerCase();
    if (!code) continue;
    const existing = setCodes.get(code) ?? {
      setName: card.releaseInformation?.setName ?? code,
      releasedAt: card.releaseInformation?.releasedAt ?? "",
      count: 0,
    };
    existing.count += 1;
    setCodes.set(code, existing);
  }

  const enriched = {
    ...snapshot,
    version: COMMANDER_FORMAT_LEGALITY_SNAPSHOT_VERSION,
    catalogUniverse: catalog.catalogUniverse,
    commanderBannedCount: snapshot.commanderBannedOracleIds.length,
    setInventorySample: [...setCodes.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([setCode, meta]) => ({ setCode, ...meta })),
  };

  const outDir = resolve(process.cwd(), "data/milestones/catalog-shadow");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "commander-format-legality-snapshot-v1.json");
  writeFileSync(outPath, JSON.stringify(enriched, null, 2));
  const hash = createHash("sha256").update(JSON.stringify(enriched)).digest("hex");

  console.log(JSON.stringify({ outPath, hash, commanderBannedCount: enriched.commanderBannedCount }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
