/**
 * expansion v2 gold corrections on frozen development_generalization_expansion_v1.
 * Run: npx tsx scripts/create-development-generalization-expansion-v2.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const EXPANSION_V1_HASH = "3a03ca436dd2dca6a97498a3da2de106a3e1916a8483e9dbc6555f8fac4d66e4";
const REVIEWER = "expansion-gold-completeness-v2";

type CasePatch = {
  replace?: CatalogEvalCase["expectedPrimitiveActions"];
  merge?: CatalogEvalCase["expectedPrimitiveActions"];
  reason: string;
};

const GOLD_PATCHES: Record<string, CasePatch> = {
  "dev-exp-v1-001": {
    replace: [
      {
        actionType: "destroy",
        evidenceContains: "destroy target artifact or enchantment an opponent controls",
        cardFace: "front",
      },
    ],
    reason: "Full Oracle evidence span for destroy on creature face.",
  },
  "dev-exp-v1-010": {
    replace: [
      {
        actionType: "create_token",
        evidenceContains: "Create a token that's a copy of target artifact",
      },
      {
        actionType: "create_token",
        evidenceContains: "Create a token that's a copy of target creature",
      },
    ],
    reason: "Token-copy is create_token semantics, not imperative copy primitive.",
  },
  "dev-exp-v1-013": {
    merge: [
      { actionType: "gain_life", evidenceContains: "gains 3 life" },
      { actionType: "sacrifice", evidenceContains: "Sacrifice a permanent" },
      { actionType: "draw", evidenceContains: "draw two cards" },
    ],
    reason: "Modal gold must include all option capabilities, not only two sampled options.",
  },
  "dev-exp-v1-017": {
    merge: [{ actionType: "shuffle_library", evidenceContains: "then shuffle" }],
    reason: "Search tutor resolution includes shuffle step in Oracle text.",
  },
  "dev-exp-v1-018": {
    merge: [{ actionType: "shuffle_library", evidenceContains: "then shuffle" }],
    reason: "Land tutor resolution includes shuffle step in Oracle text.",
  },
  "dev-exp-v1-021": {
    merge: [{ actionType: "shuffle_library", evidenceContains: "then shuffle" }],
    reason: "Optional Ninja tutor includes shuffle step.",
  },
  "dev-exp-v1-025": {
    merge: [{ actionType: "shuffle_library", evidenceContains: "then shuffle" }],
    reason: "Duplicate Higure tutor case — shuffle step missing from gold.",
  },
  "dev-exp-v1-026": {
    merge: [
      { actionType: "put_onto_battlefield", evidenceContains: "put it onto the battlefield" },
      { actionType: "shuffle_library", evidenceContains: "then shuffle" },
    ],
    reason: "Search-only gold incomplete for put+shuffle tutor chain.",
  },
  "dev-exp-v1-027": {
    merge: [
      { actionType: "put_onto_battlefield", evidenceContains: "put it onto the battlefield tapped" },
      { actionType: "shuffle_library", evidenceContains: "then shuffle" },
    ],
    reason: "Search-only gold incomplete for land tutor chain.",
  },
};

function applyPatch(c: CatalogEvalCase): CatalogEvalCase | null {
  const patch = GOLD_PATCHES[c.id];
  if (!patch) return null;

  let expectedPrimitiveActions = patch.replace
    ? [...patch.replace]
    : [...c.expectedPrimitiveActions.filter((g) => !g.negative)];

  if (patch.merge) {
    for (const add of patch.merge) {
      const exists = expectedPrimitiveActions.some(
        (g) => g.actionType === add.actionType && g.evidenceContains === add.evidenceContains,
      );
      if (!exists) expectedPrimitiveActions.push(add);
    }
  }

  const primitives = expectedPrimitiveActions.map((p) => p.actionType as PrimitiveActionType);

  return {
    ...c,
    expectedPrimitiveActions,
    expectedRoles: inferDerivedRoles(primitives).map((role) => ({
      role,
      fromPrimitiveActions: [...new Set(primitives)],
    })),
    evaluationSetVersion: "development-generalization-expansion-v2",
    goldReviewedAt: "2026-08-07T20:00:00.000Z",
    goldReviewer: REVIEWER,
    goldReviewStatus: "reviewed" as const,
    goldCompletenessStatus: "complete" as const,
    layer2GoldAuditNote: patch.reason,
  };
}

async function main() {
  const v1Path = resolve(process.cwd(), "data/oracle-action-eval-development-generalization-expansion-v1.json");
  const v1 = JSON.parse(readFileSync(v1Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v1.contentHash !== EXPANSION_V1_HASH) {
    throw new Error(`Expected expansion v1 hash ${EXPANSION_V1_HASH}, got ${v1.contentHash}`);
  }

  const changedCases: Array<{ caseId: string; reason: string }> = [];
  const cases = v1.cases.map((c) => {
    const updated = applyPatch(c);
    if (!updated) return c;
    changedCases.push({ caseId: c.id, reason: GOLD_PATCHES[c.id]!.reason });
    return updated;
  });

  const v2Hash = computeDatasetContentHash(cases);
  const envelope = {
    ...v1,
    setClassification: "development_generalization_expansion_v2",
    cases,
    parentContentHash: EXPANSION_V1_HASH,
    parentClassification: "development_generalization_expansion_v1",
    parentSetPath: "data/oracle-action-eval-development-generalization-expansion-v1.json",
    contentHash: v2Hash,
    generatedAt: new Date().toISOString(),
    goldPatchNote: "v2 expansion gold completeness: tutor chains, modal options, token-copy semantics.",
  };

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-generalization-expansion-v2.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const diffPath = resolve(process.cwd(), "data/oracle-action-eval-development-generalization-expansion-v2-diff.json");
  writeFileSync(
    diffPath,
    `${JSON.stringify(
      {
        parentDataset: "development_generalization_expansion_v1",
        parentContentHash: EXPANSION_V1_HASH,
        newDataset: "development_generalization_expansion_v2",
        newContentHash: v2Hash,
        reviewer: REVIEWER,
        changedCaseIds: changedCases.map((c) => c.caseId),
        changedCases,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(JSON.stringify({ v2Hash, parentHash: EXPANSION_V1_HASH, changedCases }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
