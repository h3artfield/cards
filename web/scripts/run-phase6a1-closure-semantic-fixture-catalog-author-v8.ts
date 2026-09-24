#!/usr/bin/env npx tsx
/** DEV36 semantic fixture catalog v8 — unified schema, oracle clause evidence. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { buildDev36FixtureV8, DEV36_SCENARIO_CODES } from "./lib/phase6a1-semantic-fixture-builder-v8";

loadEnvLocal();
const OUT = resolve("data/milestones/deck-synthesis");
const CATALOG_DIR = resolve(OUT, "phase6a1-professor-plan-semantic-fixture-catalog-v8");

type BenchmarkCase = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: "single_commander" | "partner_pair" | "commander_with_background";
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export async function authorDev36FixtureCatalogV8(cases: BenchmarkCase[]): Promise<{ manifestPath: string; manifestSha256: string }> {
  const catalog = await loadGoldenCatalogIndex();
  mkdirSync(resolve(CATALOG_DIR, "dev36-v8"), { recursive: true });
  const entries: Array<{ caseId: string; artifact: string; sha256: string; scenarioCode: string }> = [];

  cases.forEach((c, i) => {
    const scenarioCode = DEV36_SCENARIO_CODES[i] ?? DEV36_SCENARIO_CODES[0];
    const fixture = buildDev36FixtureV8(catalog, c.caseId, c.commanders, c.commandZoneConfiguration, scenarioCode);
    const artifact = `dev36-v8/${c.caseId}.json`;
    const path = resolve(CATALOG_DIR, artifact);
    writeFileSync(path, JSON.stringify(fixture, null, 2));
    entries.push({ caseId: c.caseId, artifact, sha256: sha256File(path), scenarioCode });
  });

  const manifestPath = resolve(CATALOG_DIR, "dev36-v8-manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-semantic-fixture-catalog-v8-dev36",
        subset: "dev36-v8",
        generatedAt: new Date().toISOString(),
        catalogVersion: catalog.catalogVersion,
        runtimeSchemaVersion: "phase6a1-semantic-closure-runtime-input-v8",
        note: "DEV development/template fixture with oracle clause evidence and unified v8 runtime schema.",
        cases: entries,
      },
      null,
      2,
    ),
  );
  return { manifestPath, manifestSha256: sha256File(manifestPath) };
}
