#!/usr/bin/env npx tsx
/**
 * Build sealed canonical catalog slice from published DEV36 + HOLDOUT population JSON only.
 * No benchmark-authority imports.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  combinedGoldenOracleText,
  goldenFaceRecords,
  goldenOracleTextHash,
  loadGoldenCatalogIndex,
  lookupGoldenByName,
} from "./lib/load-golden-catalog-index";

loadEnvLocal();
const OUT = resolve("data/milestones/deck-synthesis");

function canonicalPrintingRef(card: { printingIds?: string[]; id: string }): string {
  return card.printingIds?.[0] ?? card.id;
}

function commanderNamesFromPopulation(path: string): string[] {
  const pop = JSON.parse(readFileSync(path, "utf8")) as { cases?: Array<{ commanders?: string[] }> };
  const names: string[] = [];
  for (const c of pop.cases ?? []) for (const name of c.commanders ?? []) names.push(name);
  return names;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const dev36Path = resolve(OUT, "phase6a1-professor-plan-dev36-population-v2.json");
  const holdoutPath = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v8-population-v8.json");

  const commanderNames = new Set<string>([
    ...commanderNamesFromPopulation(dev36Path),
    ...commanderNamesFromPopulation(holdoutPath),
  ]);

  const records = [...commanderNames].sort().map((commanderName) => {
    const card = lookupGoldenByName(catalog, commanderName);
    if (!card) throw new Error(`Missing catalog record for ${commanderName}`);
    const oracleText = combinedGoldenOracleText(card);
    const faces = goldenFaceRecords(card).map((f) => ({
      faceId: f.faceId,
      faceName: f.faceName,
      oracleText: f.oracleText ?? "",
    }));
    const recordSha256 = createHash("sha256")
      .update(JSON.stringify({ commanderName: card.canonicalName, oracleId: card.oracleId, oracleText, faces }))
      .digest("hex");
    return {
      commanderName: card.canonicalName,
      oracleId: card.oracleId,
      scryfallId: canonicalPrintingRef(card),
      catalogVersion: catalog.catalogVersion,
      oracleText,
      cardFaces: faces,
      oracleTextSha256: goldenOracleTextHash(oracleText),
      recordSha256,
    };
  });

  const payload = {
    version: "phase6a1-benchmark-canonical-catalog-slice-v2",
    generatedAt: new Date().toISOString(),
    catalogVersion: catalog.catalogVersion,
    loaderSource: "web/scripts/lib/load-golden-catalog-index.ts",
    populationSources: [
      "phase6a1-professor-plan-dev36-population-v2.json",
      "phase6a1-professor-plan-holdout-prospective-v8-population-v8.json",
    ],
    purpose: "Independent audit verification of commander pins without shipping full golden catalog or authority imports.",
    recordCount: records.length,
    records,
  };

  const path = resolve(OUT, "phase6a1-benchmark-canonical-catalog-slice-v2.json");
  writeFileSync(path, JSON.stringify(payload, null, 2));
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  writeFileSync(
    resolve(OUT, "phase6a1-benchmark-canonical-catalog-slice-v2-manifest.json"),
    JSON.stringify({ version: "phase6a1-benchmark-canonical-catalog-slice-v2-manifest", artifact: "phase6a1-benchmark-canonical-catalog-slice-v2.json", sha256, recordCount: records.length }, null, 2),
  );
  console.log(JSON.stringify({ path, sha256, recordCount: records.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
