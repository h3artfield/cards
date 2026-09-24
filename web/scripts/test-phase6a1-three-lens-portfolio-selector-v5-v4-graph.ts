#!/usr/bin/env npx tsx
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasUnexplainedThreeLensCollapseV5,
  selectThreeLensPortfoliosV5,
} from "./lib/phase6a1-three-lens-portfolio-selector-v5";
import type { SemanticPackage } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";

const amendedV3Dir = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v3/cases");

function loadCasePackages(caseId: string): SemanticPackage[] {
  const record = JSON.parse(readFileSync(resolve(amendedV3Dir, `${caseId}.json`), "utf8")) as {
    finalValidatedPackages: SemanticPackage[];
  };
  return record.finalValidatedPackages.map((p) => ({
    ...p,
    dependsOnPackageIds: [],
    overlapsWithPackageIds: [],
  }));
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

function causalEdges(sel: ReturnType<typeof selectThreeLensPortfoliosV5>) {
  return sel.packageSynergyTypedEdges.filter((e) => e.kind === "REQUIRES_FROM" || e.kind === "PRODUCES_FOR");
}

const kinnan = selectThreeLensPortfoliosV5("hybrid-kinnan", loadCasePackages("hybrid-kinnan"));
assert(
  "kinnan UNBOUNDED_MANA edge",
  kinnan.packageSynergyTypedEdges.some(
    (e) =>
      e.kind === "REQUIRES_FROM" &&
      e.fromPackageId === "compact-conversion-dual-channel-outlets" &&
      e.toPackageId === "compact-conversion-positive-untap-loop" &&
      e.resource === "UNBOUNDED_MANA",
  ),
);
assert(
  "kinnan no bounded->unbounded",
  !causalEdges(kinnan).some(
    (e) =>
      /repeatable nonland mana|flexible mana availability/i.test(e.support.producerText) &&
      /unbounded mana|large or unbounded mana/i.test(e.support.consumerText),
  ),
);

const kenrith = selectThreeLensPortfoliosV5("multi-kenrith", loadCasePackages("multi-kenrith"));
assert(
  "kenrith target not mana",
  !causalEdges(kenrith).some(
    (e) =>
      /prepared reanimation targets/i.test(e.support.producerText) &&
      /at least five mana per reanimation/i.test(e.support.consumerText),
  ),
);

const meren = selectThreeLensPortfoliosV5("single-graveyard-meren", loadCasePackages("single-graveyard-meren"));
assert(
  "meren graveyard not mana",
  !causalEdges(meren).some(
    (e) =>
      /creature cards in the graveyard/i.test(e.support.producerText) &&
      /mana appropriate to replay/i.test(e.support.consumerText),
  ),
);

const huaTuo = selectThreeLensPortfoliosV5("blindv5-29-static-restriction", loadCasePackages("blindv5-29-static-restriction"));
assert(
  "blindv5-29 zone not inverted",
  !causalEdges(huaTuo).some(
    (e) =>
      /recovered creature card in hand or on the battlefield/i.test(e.support.producerText) &&
      /creature cards in the graveyard/i.test(e.support.consumerText),
  ),
);

const tutor = selectThreeLensPortfoliosV5("blindv5-59-tutor-toolbox", loadCasePackages("blindv5-59-tutor-toolbox"));
assert(
  "blindv5-59 no payoff causal",
  !causalEdges(tutor).some((e) => e.support.producerField === "payoffs"),
  `${causalEdges(tutor).filter((e) => e.support.producerField === "payoffs").length} payoff causal edges`,
);
assert(
  "blindv5-59 no generic token->power4",
  !causalEdges(tutor).some(
    (e) =>
      e.resource === "POWER_FOUR_PLUS_ATTACKER" &&
      !/power-4|4\/4|threshold-compatible|power-4-plus/.test(e.support.producerText),
  ),
);

for (const file of readdirSync(amendedV3Dir).filter((f) => f.endsWith(".json"))) {
  const caseId = file.replace(".json", "");
  const sel = selectThreeLensPortfoliosV5(caseId, loadCasePackages(caseId));
  if (!sel.synergyGraphQA.passed) {
    console.log("QA fail", caseId, sel.synergyGraphQA.blockingReasons);
    failed++;
  } else {
    passed++;
  }
  assert(`${caseId} no unexplained collapse`, !hasUnexplainedThreeLensCollapseV5(sel));
}

console.log(JSON.stringify({ passed, failed }, null, 2));
if (failed > 0) process.exit(1);
