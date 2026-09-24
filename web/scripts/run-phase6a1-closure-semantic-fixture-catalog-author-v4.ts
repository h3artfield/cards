#!/usr/bin/env npx tsx
/** DEV36 semantic fixture catalog v4 — opaque scenario codes, oracle-grounded facts. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDev36FixtureV4, DEV36_SCENARIO_CODES } from "./lib/phase6a1-semantic-fixture-builder-v4";

const OUT = resolve("data/milestones/deck-synthesis");
const CATALOG_DIR = resolve(OUT, "phase6a1-professor-plan-semantic-fixture-catalog-v4");

type BenchmarkCase = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: "single_commander" | "partner_pair" | "commander_with_background";
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function authorDev36FixtureCatalogV4(cases: BenchmarkCase[]): { manifestPath: string; manifestSha256: string } {
  mkdirSync(resolve(CATALOG_DIR, "dev36-v4"), { recursive: true });
  const entries: Array<{ caseId: string; artifact: string; sha256: string; scenarioCode: string }> = [];

  cases.forEach((c, i) => {
    const scenarioCode = DEV36_SCENARIO_CODES[i] ?? DEV36_SCENARIO_CODES[0];
    const fixture = buildDev36FixtureV4(c.caseId, c.commanders, c.commandZoneConfiguration, scenarioCode);
    const artifact = `dev36-v4/${c.caseId}.json`;
    const path = resolve(CATALOG_DIR, artifact);
    writeFileSync(path, JSON.stringify(fixture, null, 2));
    entries.push({ caseId: c.caseId, artifact, sha256: sha256File(path), scenarioCode });
  });

  const manifestPath = resolve(CATALOG_DIR, "dev36-v4-manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-semantic-fixture-catalog-v4-dev36",
        subset: "dev36-v4",
        generatedAt: new Date().toISOString(),
        note: "DEV development/template fixture. Opaque scenario codes only; no gap/closed labels.",
        cases: entries,
      },
      null,
      2,
    ),
  );
  return { manifestPath, manifestSha256: sha256File(manifestPath) };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("run-phase6a1-closure-semantic-fixture-catalog-author-v4.ts")) {
  const dev36 = JSON.parse(readFileSync(resolve(OUT, "phase6a1-professor-plan-dev36-population-v2.json"), "utf8")) as {
    cases: BenchmarkCase[];
  };
  authorDev36FixtureCatalogV4(dev36.cases);
  console.log("dev36-v4 fixture catalog written");
}
