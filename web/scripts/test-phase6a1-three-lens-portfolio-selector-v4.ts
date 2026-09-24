#!/usr/bin/env npx tsx
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasUnexplainedThreeLensCollapseV4,
  selectThreeLensPortfoliosV4,
} from "./lib/phase6a1-three-lens-portfolio-selector-v4";
import type { SemanticPackage } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";

function loadCasePackages(caseId: string, dir: string): SemanticPackage[] {
  const record = JSON.parse(readFileSync(resolve(dir, `${caseId}.json`), "utf8")) as {
    finalValidatedPackages: SemanticPackage[];
  };
  return record.finalValidatedPackages.map((p) => ({
    ...p,
    dependsOnPackageIds: [],
    overlapsWithPackageIds: [],
  }));
}

function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((id) => sa.has(id));
}

let passed = 0;
let failed = 0;

function assert(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, detail ?? "");
  }
}

const amendedDir = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended/cases");

const blind = selectThreeLensPortfoliosV4(
  "blindv5-11-commander-background",
  loadCasePackages("blindv5-11-commander-background", amendedDir),
);
assert(
  "blindv5-11 harmony differs from independent",
  !setEqual(blind.independent.selectedPackageIds, blind.harmony.selectedPackageIds),
);
assert(
  "blindv5-11 harmony includes bridge package",
  blind.harmony.selectedPackageIds.some((id) => id.startsWith("H3-P")),
);
assert("blindv5-11 graph QA passes", blind.synergyGraphQA.passed, blind.synergyGraphQA.blockingReasons.join("; "));
assert("blindv5-11 no unexplained collapse", !hasUnexplainedThreeLensCollapseV4(blind));

const tutor = selectThreeLensPortfoliosV4(
  "blindv5-59-tutor-toolbox",
  loadCasePackages("blindv5-59-tutor-toolbox", amendedDir),
);
assert(
  "blindv5-59 harmony differs from independent",
  !setEqual(tutor.independent.selectedPackageIds, tutor.harmony.selectedPackageIds),
  `${tutor.independent.selectedPackageIds.join(",")} vs ${tutor.harmony.selectedPackageIds.join(",")}`,
);
const indepHarmPair = tutor.pairwiseEquivalences.find(
  (p) => p.lensA === "INDEPENDENT_SYNERGY" && p.lensB === "HARMONY",
);
assert(
  "blindv5-59 no false objective equivalence",
  !indepHarmPair || indepHarmPair.objectiveEquivalentUpToScalar === false,
);
assert(
  "blindv5-59 convergence mode consistent",
  tutor.convergenceMode === "DIFFERENTIATED" || tutor.convergenceMode === "TRUE_CONVERGENCE",
);
if (indepHarmPair?.disposition === "JUSTIFIED_CONVERGENCE") {
  assert("blindv5-59 justified pair uses TRUE_CONVERGENCE", tutor.convergenceMode === "TRUE_CONVERGENCE");
}

const korvold = selectThreeLensPortfoliosV4("multi-korvold", loadCasePackages("multi-korvold", amendedDir));
assert(
  "multi-korvold harmony not single-package unless justified",
  korvold.harmony.selectedPackageIds.length >= 2 ||
    !!korvold.harmony.rationale.includes("Single-package Harmony justified"),
);

let completeOverlapCases = 0;
let blockedGraphCases = 0;
for (const file of readdirSync(amendedDir).filter((f) => f.endsWith(".json"))) {
  const caseId = file.replace(".json", "");
  const pkgs = loadCasePackages(caseId, amendedDir);
  const sel = selectThreeLensPortfoliosV4(caseId, pkgs);
  if (sel.synergyGraphQA.completeOverlapGraph) completeOverlapCases++;
  if (!sel.synergyGraphQA.passed) blockedGraphCases++;
}
assert("no complete overlap graphs", completeOverlapCases === 0, `${completeOverlapCases} cases`);
assert("all graph QA pass", blockedGraphCases === 0, `${blockedGraphCases} cases blocked`);

console.log(JSON.stringify({ passed, failed }, null, 2));
if (failed > 0) process.exit(1);
