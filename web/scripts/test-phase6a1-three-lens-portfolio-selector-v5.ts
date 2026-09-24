#!/usr/bin/env npx tsx
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasUnexplainedThreeLensCollapseV5,
  selectThreeLensPortfoliosV5,
} from "./lib/phase6a1-three-lens-portfolio-selector-v5";
import type { SemanticPackage } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";

const amendedV2Dir = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v2/cases");

function loadCasePackages(caseId: string): SemanticPackage[] {
  const record = JSON.parse(readFileSync(resolve(amendedV2Dir, `${caseId}.json`), "utf8")) as {
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

const kinnan = selectThreeLensPortfoliosV5("hybrid-kinnan", loadCasePackages("hybrid-kinnan"));
assert(
  "kinnan has UNBOUNDED_MANA causal edge",
  kinnan.packageSynergyTypedEdges.some(
    (e) =>
      e.kind === "REQUIRES_FROM" &&
      e.fromPackageId === "compact-conversion-dual-channel-outlets" &&
      e.toPackageId === "compact-conversion-positive-untap-loop" &&
      e.resource === "UNBOUNDED_MANA",
  ),
);
assert(
  "kinnan harmony not false typed-edge claim",
  kinnan.harmonyDetermination !== "DIFFERENTIATED" ||
    kinnan.packageSynergyTypedEdges.some((e) =>
      [kinnan.harmony.selectedPackageIds[0], kinnan.harmony.selectedPackageIds[1]].includes(e.fromPackageId),
    ),
  kinnan.harmony.rationale,
);

const daxos = selectThreeLensPortfoliosV5("blindv5-25-activated-engine", loadCasePackages("blindv5-25-activated-engine"));
assert(
  "daxos no spell access from spirit tokens",
  !daxos.packageSynergyTypedEdges.some(
    (e) =>
      e.kind === "REQUIRES_FROM" &&
      e.fromPackageId === "package-low-curve-enchantment-throughput" &&
      e.toPackageId === "package-experience-scaled-spirit-pressure",
  ),
);

const tutor = selectThreeLensPortfoliosV5("blindv5-59-tutor-toolbox", loadCasePackages("blindv5-59-tutor-toolbox"));
assert(
  "blindv5-59 no zero-weight harmony packages",
  tutor.harmony.selectedPackageIds.every((id) => (tutor.harmony.objectiveWeights[id] ?? 0) > 0) ||
    tutor.harmonyDetermination !== "DIFFERENTIATED",
);
assert(
  "blindv5-59 no forced differentiation",
  tutor.harmonyDetermination === "HARMONY_UNDERDETERMINED" ||
    tutor.harmonyDetermination === "JUSTIFIED_CONVERGENCE" ||
    !setEqual(tutor.independent.selectedPackageIds, tutor.harmony.selectedPackageIds),
  `${tutor.harmonyDetermination} ${tutor.harmony.selectedPackageIds.join(",")}`,
);

assert(
  "no profile-tag bridge resources",
  !kinnan.packageSynergyTypedEdges.some((e) => e.kind === "BRIDGE" && String(e.resource).includes("<->")),
);

let completeOverlap = 0;
let lexicalNoise = 0;
for (const file of readdirSync(amendedV2Dir).filter((f) => f.endsWith(".json"))) {
  const caseId = file.replace(".json", "");
  const sel = selectThreeLensPortfoliosV5(caseId, loadCasePackages(caseId));
  if (sel.synergyGraphQA.completeOverlapGraph) completeOverlap++;
  lexicalNoise += sel.packageSynergyTypedEdges.filter((e) =>
    ["against", "closing", "controlled", "continued", "depletion", "defensive", "exposure"].includes(String(e.resource)),
  ).length;
  if (!sel.synergyGraphQA.passed) {
    console.log("QA fail", caseId, sel.synergyGraphQA.blockingReasons);
  }
}
assert("no complete overlap graphs", completeOverlap === 0);
assert("no lexical noise resources", lexicalNoise === 0, `${lexicalNoise} edges`);

console.log(JSON.stringify({ passed, failed }, null, 2));
if (failed > 0) process.exit(1);
