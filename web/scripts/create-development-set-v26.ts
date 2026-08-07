/**
 * v26 context-X and if-you-do dependency gold corrections on development_set_v25.
 * Run: npx tsx scripts/create-development-set-v26.ts
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

const V25_HASH = "b382c8ba18b3a83d1a2524a1cc265a33552d9766d300e6fee8ea45662c1204a9";
const REVIEWER = "context-x-if-you-do-gold-v26";

type CasePatch = {
  replace?: CatalogEvalCase["expectedPrimitiveActions"];
  merge?: CatalogEvalCase["expectedPrimitiveActions"];
  expectedConditions?: CatalogEvalCase["expectedConditions"];
  expectedStructure?: CatalogEvalCase["expectedStructure"];
  reason: string;
};

const GOLD_PATCHES: Record<string, CasePatch> = {
  "eval-0052": {
    merge: [
      {
        actionType: "lose_life",
        evidenceContains: "each opponent loses X life",
        cardFace: "back",
        optionalEffect: false,
      },
      {
        actionType: "gain_life",
        evidenceContains: "you gain X life",
        cardFace: "back",
        optionalEffect: false,
      },
    ],
    expectedConditions: [
      {
        textContains: "If you do",
        attachesToEvidence: "each opponent loses X life",
        type: "if_you_do",
      },
      {
        textContains: "If you do",
        attachesToEvidence: "you gain X life",
        type: "if_you_do",
      },
    ],
    reason:
      "Explicit X lose/gain on back face; consequents are if-you-do dependent (optionalEffect false), not optional themselves.",
  },
  "eval-0127": {
    merge: [
      {
        actionType: "deal_damage",
        evidenceContains: "deals X damage to any target",
      },
    ],
    reason: "Structure-only gold omitted explicit context-defined X damage trigger.",
  },
  "eval-0202": {
    merge: [
      {
        actionType: "deal_damage",
        evidenceContains: "deals X damage to any target",
      },
    ],
    reason: "Structure-only gold omitted explicit activated context-defined X damage.",
  },
};

function applyPatch(c: CatalogEvalCase): { updated: CatalogEvalCase; changed: boolean; note: string } | null {
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
    changed: true,
    note: patch.reason,
    updated: {
      ...c,
      expectedPrimitiveActions,
      expectedConditions: patch.expectedConditions ?? c.expectedConditions,
      expectedStructure: patch.expectedStructure ?? c.expectedStructure,
      expectedRoles: inferDerivedRoles(primitives).map((role) => ({
        role,
        fromPrimitiveActions: [...new Set(primitives)],
      })),
      evaluationSetVersion: "development-v26-context-x-if-you-do-gold",
      goldReviewedAt: "2026-08-07T20:00:00.000Z",
      goldReviewer: REVIEWER,
      goldCompleter: REVIEWER,
      goldCompletedAt: "2026-08-07T20:00:00.000Z",
      goldReviewStatus: "reviewed" as const,
      goldCompletenessStatus: "complete" as const,
      layer2GoldAuditNote: patch.reason,
    },
  };
}

async function main() {
  const v25Path = resolve(process.cwd(), "data/oracle-action-eval-development-v25.json");
  const v25 = JSON.parse(readFileSync(v25Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v25.contentHash !== V25_HASH) {
    throw new Error(`Expected v25 hash ${V25_HASH}, got ${v25.contentHash}`);
  }

  const changedCases: Array<{ caseId: string; reason: string; primitives: string[] }> = [];
  const cases = v25.cases.map((c) => {
    const result = applyPatch(c);
    if (!result) return c;
    changedCases.push({
      caseId: c.id,
      reason: result.note,
      primitives: result.updated.expectedPrimitiveActions
        .filter((g) => !g.negative)
        .map((g) => `${g.actionType}:${g.evidenceContains.slice(0, 40)}`),
    });
    return result.updated;
  });

  const v26Hash = computeDatasetContentHash(cases);
  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...v25,
    setClassification: "development_set_v26",
    cases,
    evaluationSetVersion: "development-v26-context-x-if-you-do-gold",
    parentContentHash: V25_HASH,
    parentClassification: "development_set_v25",
    parentSetPath: "data/oracle-action-eval-development-v25.json",
    contentHash: v26Hash,
    generatedAt: new Date().toISOString(),
    goldPatchNote:
      "v26 Oracle-policy gold: context-defined X primitives and if-you-do dependency modeling (not consequent optionality).",
  };

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-v26.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const diffPath = resolve(process.cwd(), "data/oracle-action-eval-development-v26-diff.json");
  writeFileSync(
    diffPath,
    `${JSON.stringify(
      {
        parentDataset: "development_set_v25",
        parentContentHash: V25_HASH,
        newDataset: "development_set_v26",
        newContentHash: v26Hash,
        reviewer: REVIEWER,
        changedCaseIds: changedCases.map((c) => c.caseId),
        changedCases,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(JSON.stringify({ v26Hash, parentHash: V25_HASH, changedCases }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
