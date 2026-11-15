#!/usr/bin/env npx tsx
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasUnexplainedThreeLensCollapseV5,
  selectThreeLensPortfoliosV5,
} from "./lib/phase6a1-three-lens-portfolio-selector-v5";
import type { SemanticPackage } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";

const amendedV5Dir = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-amended-v5/cases");

function loadCasePackages(caseId: string): SemanticPackage[] {
  const record = JSON.parse(readFileSync(resolve(amendedV5Dir, `${caseId}.json`), "utf8")) as {
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
assert(
  "kinnan mana not permanent",
  !causalEdges(kinnan).some(
    (e) =>
      /repeatable nonland mana|flexible mana availability|unbounded mana of usable types/i.test(e.support.producerText) &&
      /repeatable nonland mana permanent/i.test(e.support.consumerText),
  ),
);
assert(
  "kinnan unbounded not outlet",
  !causalEdges(kinnan).some(
    (e) =>
      /unbounded mana of usable types/i.test(e.support.producerText) &&
      /scalable outlet|noncommander scalable outlet/i.test(e.support.consumerText),
  ),
);

const teysa = selectThreeLensPortfoliosV5("single-aristocrats-teysa", loadCasePackages("single-aristocrats-teysa"));
assert(
  "teysa token not sacrifice method",
  !causalEdges(teysa).some(
    (e) =>
      /creature tokens/i.test(e.support.producerText) &&
      /method for sacrificing|sacrificing creature tokens/i.test(e.support.consumerText),
  ),
);

const huaTuo = selectThreeLensPortfoliosV5("blindv5-29-static-restriction", loadCasePackages("blindv5-29-static-restriction"));
assert(
  "hua tuo recovered not mana",
  !causalEdges(huaTuo).some(
    (e) =>
      /recovered creatures|multiple recovered creatures ordered/i.test(e.support.producerText) &&
      /mana development sufficient to activate/i.test(e.support.consumerText),
  ),
);
assert(
  "hua tuo topdeck not destination",
  !causalEdges(huaTuo).some(
    (e) =>
      /additional topdeck-recursion activations/i.test(e.support.producerText) &&
      /mix of recovery destinations/i.test(e.support.consumerText),
  ),
);
assert(
  "hua tuo window not recovery effect",
  !causalEdges(huaTuo).some(
    (e) =>
      /activation window/i.test(e.support.producerText) &&
      /creature-recovery effects that do not require/i.test(e.support.consumerText),
  ),
);

const toolbox = selectThreeLensPortfoliosV5("blindv5-59-tutor-toolbox", loadCasePackages("blindv5-59-tutor-toolbox"));
assert(
  "toolbox successful attacks not combat opportunity",
  !causalEdges(toolbox).some(
    (e) =>
      /successful attacks/i.test(e.support.producerText) &&
      /combat step|legal attacks|available combat step/i.test(e.support.consumerText),
  ),
);

function sharedEnablerEdges(sel: ReturnType<typeof selectThreeLensPortfoliosV5>) {
  return sel.packageSynergyTypedEdges.filter((e) => e.kind === "SHARED_ENABLER");
}

const dionus = selectThreeLensPortfoliosV5("blindv5-19-narrow-single-engine", loadCasePackages("blindv5-19-narrow-single-engine"));
assert(
  "dionus card selection not elf tap source",
  !causalEdges(dionus).some(
    (e) =>
      /cards or card selection|card selection/i.test(e.support.producerText) &&
      /elves with repeatable activated tap abilities/i.test(e.support.consumerText),
  ),
);
assert(
  "dionus no false shared enabler among elf packages",
  sharedEnablerEdges(dionus).filter(
    (e) =>
      ["package-cast-entry-card-flow", "package-elf-mana-repetition", "package-elf-tap-card-flow", "package-independent-elf-development"].includes(
        e.fromPackageId,
      ) &&
      ["package-cast-entry-card-flow", "package-elf-mana-repetition", "package-elf-tap-card-flow", "package-independent-elf-development"].includes(
        e.toPackageId,
      ),
  ).length === 0,
);

const cyclonus = selectThreeLensPortfoliosV5("blindv5-42-resource-conversion", loadCasePackages("blindv5-42-resource-conversion"));
assert(
  "cyclonus card selection not hand-to-board outlet",
  !causalEdges(cyclonus).some(
    (e) =>
      /card selection/i.test(e.support.producerText) &&
      /flexible ways to turn increased hand size/i.test(e.support.consumerText),
  ),
);

const orvar = selectThreeLensPortfoliosV5("blindv5-51-tokens", loadCasePackages("blindv5-51-tokens"));
assert(
  "orvar no shared enabler between copy packages",
  !sharedEnablerEdges(orvar).some(
    (e) =>
      (e.fromPackageId === "package-copy-worthy-permanents" && e.toPackageId === "package-reactive-utility-permanents") ||
      (e.fromPackageId === "package-reactive-utility-permanents" && e.toPackageId === "package-copy-worthy-permanents"),
  ),
);

const korvold = selectThreeLensPortfoliosV5("multi-korvold", loadCasePackages("multi-korvold"));
assert(
  "korvold payment not protection shared enabler",
  !sharedEnablerEdges(korvold).some(
    (e) =>
      /mana held for protection/i.test(e.support.producerText) &&
      /protection or interaction for the attack/i.test(e.support.consumerText),
  ),
);

for (const file of readdirSync(amendedV5Dir).filter((f) => f.endsWith(".json"))) {
  const caseId = file.replace(/\.json$/, "");
  const sel = selectThreeLensPortfoliosV5(caseId, loadCasePackages(caseId));
  assert(
    `${caseId} no semanticRequirements causal`,
    !causalEdges(sel).some((e) => e.support.consumerField === "semanticRequirements"),
  );
  assert(`${caseId} symmetric edge audit`, (sel.synergyGraphQA.symmetricEdgeAuditFailures ?? 0) === 0);
  assert(`${caseId} graph QA`, sel.synergyGraphQA.passed, sel.synergyGraphQA.blockingReasons?.join("; "));
  assert(`${caseId} no unexplained collapse`, !hasUnexplainedThreeLensCollapseV5(sel));
}

console.log(JSON.stringify({ passed, failed }, null, 2));
process.exit(failed > 0 ? 1 : 0);
