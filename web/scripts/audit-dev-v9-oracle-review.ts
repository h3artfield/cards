/**
 * Verify development_set_v9 expansion seeds against Oracle text groupings.
 * Run: npx tsx scripts/audit-dev-v9-oracle-review.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DEV_EXPANSION_V9_SEEDS } from "./development-set-v9-expansion-seeds";
import { REVIEWER_ID } from "./oracle-action-eval-shared";

function verifySeed(seed: (typeof DEV_EXPANSION_V9_SEEDS)[number]): {
  name: string;
  family: string;
  pass: boolean;
  issues: string[];
  layerSummary: string[];
} {
  const t = seed.text.toLowerCase();
  const issues: string[] = [];
  const layerSummary: string[] = [];

  for (const p of seed.primitives) {
    if (!t.includes(p.evidenceContains.toLowerCase().slice(0, Math.min(12, p.evidenceContains.length)))) {
      issues.push(`Evidence '${p.evidenceContains}' not found in oracle text`);
    }
    layerSummary.push(`${p.actionType} → ${p.layerLabel}`);
  }

  for (const f of seed.forbidden ?? []) {
    layerSummary.push(`forbidden:${f} → layer1_static_restriction`);
  }

  if (seed.family.includes("play_land") && seed.primitives.some((p) => p.actionType === "put_onto_battlefield")) {
    issues.push("Miscategorized: play_land family must not use put_onto_battlefield");
  }
  if (seed.family.includes("put_not_search") && seed.primitives.some((p) => p.actionType === "search_library")) {
    if (!/\bsearch your library\b/i.test(seed.text)) {
      issues.push("Miscategorized: hand put family should not label search_library without search instruction");
    }
  }
  if (seed.family.includes("search_library") && !/\bsearch (?:your )?library\b/i.test(seed.text)) {
    issues.push("search_library family requires explicit search instruction in oracle");
  }
  if (seed.family.includes("static_cast_restriction") && seed.primitives.some((p) => p.actionType === "cast")) {
    issues.push("Static restriction family must not gold-label cast");
  }
  if (seed.family.includes("alt_cost") && seed.primitives.some((p) => p.actionType === "cast")) {
    issues.push("Alt cost family must not gold-label cast");
  }
  if (
    seed.primitives.some((p) => p.actionType === "play") &&
    !/\bplay (?:an additional land|land cards|lands)\b/i.test(seed.text)
  ) {
    issues.push("play primitive requires explicit play land permission in oracle");
  }
  if (
    seed.primitives.some((p) => p.actionType === "cast") &&
    !/\bcast (?:spells|this|target)\b/i.test(seed.text)
  ) {
    issues.push("cast primitive requires explicit cast permission in oracle");
  }
  if (
    seed.primitives.some((p) => p.actionType === "put_onto_battlefield") &&
    !/\bput [\w ]+ from (?:your |a )?(?:hand|graveyard|exile)[\w ]* onto the battlefield\b/i.test(seed.text)
  ) {
    issues.push("put_onto_battlefield requires put-from-zone onto battlefield wording");
  }

  return {
    name: seed.name,
    family: seed.family,
    pass: issues.length === 0,
    issues,
    layerSummary,
  };
}

function main() {
  const results = DEV_EXPANSION_V9_SEEDS.map(verifySeed);
  const failed = results.filter((r) => !r.pass);
  const report = {
    generatedAt: new Date().toISOString(),
    reviewer: REVIEWER_ID,
    seedCount: DEV_EXPANSION_V9_SEEDS.length,
    passCount: results.filter((r) => r.pass).length,
    failCount: failed.length,
    allManualReviewConfirmed: DEV_EXPANSION_V9_SEEDS.every((s) => s.manualReviewConfirmed),
    results,
  };

  const outPath = resolve(process.cwd(), "reports", "dev-v9-oracle-review.json");
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`v9 oracle review: ${report.passCount}/${report.seedCount} pass`);
  if (failed.length) {
    console.error("FAILURES:", failed);
    process.exit(1);
  }
  console.log("→", outPath);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("audit-dev-v9-oracle-review.ts")) {
  main();
}
