#!/usr/bin/env npx tsx
/**
 * Unit tests for three-lens selector v3 pre-gold repairs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasUnexplainedThreeLensCollapseV3,
  selectThreeLensPortfoliosV3,
} from "./lib/phase6a1-three-lens-portfolio-selector-v3";
import type { SemanticPackage } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";

function loadCasePackages(caseId: string): SemanticPackage[] {
  const path = resolve(
    "data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3/cases",
    `${caseId}.json`,
  );
  const record = JSON.parse(readFileSync(path, "utf8")) as { finalValidatedPackages: SemanticPackage[] };
  return record.finalValidatedPackages;
}

function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((id) => sa.has(id));
}

let passed = 0;
let failed = 0;

function assert(name: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name);
  }
}

const blind = selectThreeLensPortfoliosV3("blindv5-11-commander-background", loadCasePackages("blindv5-11-commander-background"));
assert(
  "blindv5-11 harmony differs from independent",
  !setEqual(blind.independent.selectedPackageIds, blind.harmony.selectedPackageIds),
);
assert(
  "blindv5-11 harmony includes bridge package",
  blind.harmony.selectedPackageIds.some((id) => id.startsWith("H3-P")),
);
assert("blindv5-11 no unexplained collapse", !hasUnexplainedThreeLensCollapseV3(blind));

const korvold = selectThreeLensPortfoliosV3("multi-korvold", loadCasePackages("multi-korvold"));
assert(
  "multi-korvold harmony not single-package unless justified",
  korvold.harmony.selectedPackageIds.length >= 2 ||
    !!korvold.harmony.rationale.includes("Single-package Harmony justified"),
);

const enriched = selectThreeLensPortfoliosV3("hybrid-prosper", loadCasePackages("hybrid-prosper"));
const edgeCount = enriched.enrichedPackages.reduce(
  (n, p) => n + p.dependsOnPackageIds.length + p.overlapsWithPackageIds.length,
  0,
);
assert("derived synergy edges populated", edgeCount > 0);

console.log(JSON.stringify({ passed, failed }, null, 2));
if (failed > 0) process.exit(1);
