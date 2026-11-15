#!/usr/bin/env npx tsx
/**
 * Deck Rating v1 Step 1: dated, hashed snapshots.
 *
 *   cd web && npx tsx scripts/deck-rating/v1/run-step1-snapshots.ts
 *   npx tsx scripts/deck-rating/v1/run-step1-snapshots.ts --phase playgroup
 *
 * Phases: dumps | playgroup | tags | b5 | archidekt | all
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractB5IdentitySets } from "./extract-b5-field";
import { fetchArchidektField } from "./fetch-archidekt-field";
import { fetchPublicDumps } from "./fetch-dumps";
import { fetchPlaygroupTables } from "./fetch-playgroup";
import { freezeTagTable } from "./freeze-tag-table";
import { SNAPSHOT_DAY, ensureDir, snapshotRoot, writeJson } from "./lib";

const phase = (process.argv.includes("--phase")
  ? process.argv[process.argv.indexOf("--phase") + 1]
  : "all") as "dumps" | "playgroup" | "tags" | "b5" | "archidekt" | "all";

async function main(): Promise<void> {
  const started = new Date().toISOString();
  const root = ensureDir(snapshotRoot());
  console.log(`snapshot ${SNAPSHOT_DAY} → ${root}`);
  console.log(`phase ${phase}`);

  const prior = readManifest(join(root, "MANIFEST.json"));
  const report: Record<string, unknown> = {
    ...prior,
    version: "deck-rating-v1-step1-snapshot",
    snapshotDate: SNAPSHOT_DAY,
    startedAt: (prior.startedAt as string | undefined) ?? started,
    phase,
    locked: {
      casualWeights: "five non-negative features; no separate GC-count or combo-pressure terms",
      casualFeatures: ["commanderPrior", "meanCardStrength", "interaction", "cardFlow", "manaBase"],
      anchors: "frozen snapshot; median ranked precon within ±25 of 2500; no hard-coded 2600",
      playgroup: "API or published list pages / one export — not thousands of card pages",
      referenceFields: {
        b2: "official precons from roughly the last 3 years that measure B2; 70–90 lists is a comparison set",
        b3b4: "Archidekt legal-now, 95+ resolved, updated last 12 months, measured floor 3 or 4, Jaccard ≥0.9 near-copy drop, ≤5 per commander, drop Jaccard ≥0.6 vs B5, target 300+ per field",
        b5: "TopDeck cEDH-tagged 95+ identity sets only as leakage screen; raw lists stay uncommitted",
      },
    },
  };

  if (phase === "dumps" || phase === "all") {
    console.log("\n== dumps ==");
    report.dumps = await fetchPublicDumps();
  }
  if (phase === "playgroup" || phase === "all") {
    console.log("\n== playgroup ==");
    report.playgroup = await fetchPlaygroupTables();
  }
  if (phase === "tags" || phase === "all") {
    console.log("\n== tag table ==");
    report.tags = await freezeTagTable();
  }
  if (phase === "b5" || phase === "all") {
    console.log("\n== B5 identity sets ==");
    report.b5 = await extractB5IdentitySets();
  }
  if (phase === "archidekt" || phase === "all") {
    console.log("\n== Archidekt field ==");
    report.archidekt = await fetchArchidektField();
  }

  report.finishedAt = new Date().toISOString();
  hydrateExisting(report, root);
  writeJson(join(root, "MANIFEST.json"), report);
  writeFileSync(
    join(root, "ATTRIBUTION.md"),
    [
      "# Deck Rating v1 snapshot attribution",
      "",
      `Snapshot date: ${SNAPSHOT_DAY}`,
      "",
      "## Playgroup.gg (CC-BY 4.0)",
      "Precon win rates, commander priors, and card-strength / staples figures are from Playgroup.gg.",
      "https://playgroup.gg/about",
      "https://playgroup.gg/commander/precons",
      "https://playgroup.gg/commanders/tier-list",
      "https://playgroup.gg/commander/staples",
      "",
      "## Scryfall",
      "Oracle cards and oracle tags: https://scryfall.com/docs/api/bulk-data",
      "",
      "## MTGJSON",
      "AllDeckFiles / DeckList: https://mtgjson.com/api/v5/",
      "",
      "## Archidekt",
      "Public commander deck search and deck payloads via https://archidekt.com/api/decks/v3/",
      "",
      "Footer for later rating cards: Playgroup.gg · CC-BY 4.0 · snapshot " + SNAPSHOT_DAY,
      "",
    ].join("\n"),
  );
  console.log(`\nMANIFEST ${join(root, "MANIFEST.json")}`);
}

function hydrateExisting(report: Record<string, unknown>, root: string): void {
  const dumpsScry = join(root, "scryfall", "hashes.json");
  const dumpsMtg = join(root, "mtgjson", "hashes.json");
  if (!report.dumps && existsSync(dumpsScry) && existsSync(dumpsMtg)) {
    report.dumps = {
      scryfall: JSON.parse(readFileSync(dumpsScry, "utf8")),
      mtgjson: JSON.parse(readFileSync(dumpsMtg, "utf8")),
    };
  }
  const b5 = join(root, "b5", "summary.json");
  if (!report.b5 && existsSync(b5)) report.b5 = JSON.parse(readFileSync(b5, "utf8"));
  const tags = join(root, "tags", "tag-table-manifest.json");
  if (!report.tags && existsSync(tags)) report.tags = JSON.parse(readFileSync(tags, "utf8"));
  const arch = join(root, "archidekt", "summary.json");
  if (!report.archidekt && existsSync(arch)) report.archidekt = JSON.parse(readFileSync(arch, "utf8"));
}

function readManifest(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
