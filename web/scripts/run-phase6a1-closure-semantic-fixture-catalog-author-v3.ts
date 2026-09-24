#!/usr/bin/env npx tsx
/** Write upstream semantic fixture catalog v3 — NO closure answers. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  DEV36_SCENARIO_ASSIGNMENTS,
  buildFixtureForScenario,
  type CaseSemanticFixture,
  type ScenarioKind,
} from "./lib/phase6a1-semantic-fixture-templates-v3";

const OUT = resolve("data/milestones/deck-synthesis");
const CATALOG_DIR = resolve(OUT, "phase6a1-professor-plan-semantic-fixture-catalog-v3");

type BenchmarkCase = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: "single_commander" | "partner_pair" | "commander_with_background";
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadBenchmark(version: "dev36" | "holdout24-v3"): BenchmarkCase[] {
  const file =
    version === "dev36"
      ? "phase6a1-professor-plan-dev36-population-v2.json"
      : "phase6a1-professor-plan-holdout24-v3-population-v3.json";
  const parsed = JSON.parse(readFileSync(resolve(OUT, file), "utf8")) as { cases: BenchmarkCase[] };
  return parsed.cases;
}

export function authorFixtureCatalog(
  cases: BenchmarkCase[],
  scenarios: ScenarioKind[],
  subset: "dev36" | "holdout24-v3",
): { manifestPath: string; manifestSha256: string } {
  mkdirSync(CATALOG_DIR, { recursive: true });
  const entries: Array<{ caseId: string; artifact: string; sha256: string; scenario: ScenarioKind }> = [];
  cases.forEach((c, i) => {
    const scenario = scenarios[i] ?? "minimal_closed";
    const fixture: CaseSemanticFixture = buildFixtureForScenario(
      scenario,
      c.caseId,
      c.commanders,
      c.commandZoneConfiguration,
    );
    const artifact = `${subset}/${c.caseId}.json`;
    const path = resolve(CATALOG_DIR, artifact);
    mkdirSync(resolve(CATALOG_DIR, subset), { recursive: true });
    writeFileSync(path, JSON.stringify(fixture, null, 2));
    entries.push({ caseId: c.caseId, artifact, sha256: sha256File(path), scenario });
  });
  const manifestPath = resolve(CATALOG_DIR, `${subset}-manifest.json`);
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-semantic-fixture-catalog-v3",
        subset,
        generatedAt: new Date().toISOString(),
        note: "Upstream planning semantics only. No trigger IDs, roleClaims, or closure adjudication fields.",
        cases: entries,
      },
      null,
      2,
    ),
  );
  return { manifestPath, manifestSha256: sha256File(manifestPath) };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("run-phase6a1-closure-semantic-fixture-catalog-author-v3.ts")) {
  const dev36 = loadBenchmark("dev36");
  authorFixtureCatalog(dev36, DEV36_SCENARIO_ASSIGNMENTS, "dev36");
  console.log("fixture catalog dev36 written");
}
