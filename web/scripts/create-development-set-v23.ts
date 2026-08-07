/**
 * Apply v23 Grief evoke-cost gold correction → development_set_v23.
 * Run: npx tsx scripts/create-development-set-v23.ts
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
import {
  GOLD_V23_CORRECTIONS,
  GOLD_V23_REVIEWED_AT,
  GOLD_V23_REVIEWER,
  type GoldV23Correction,
} from "./adjudicate-gold-evoke-v23";

const V22_HASH = "09249207cb6926fd452a5b2b7836dc4479f7139924e2fd8303ff9f17549310f5";

function applyCorrection(
  c: CatalogEvalCase,
  fix: GoldV23Correction,
): CatalogEvalCase {
  let expectedPrimitiveActions = c.expectedPrimitiveActions.filter(
    (g) =>
      !(
        fix.removeGold &&
        g.actionType === fix.removeGold.actionType &&
        g.evidenceContains.includes(fix.removeGold.evidenceContains.slice(0, 12))
      ),
  );

  const forbidden = new Set(c.forbiddenPrimitiveActions ?? []);
  if (fix.forbiddenPrimitive) forbidden.add(fix.forbiddenPrimitive);

  const primitives = expectedPrimitiveActions.filter((p) => !p.negative).map((p) => p.actionType);

  return {
    ...c,
    expectedPrimitiveActions,
    ...(forbidden.size ? { forbiddenPrimitiveActions: [...forbidden] as PrimitiveActionType[] } : {}),
    expectedRoles: inferDerivedRoles(primitives).map((role) => ({
      role,
      fromPrimitiveActions: [...new Set(primitives)],
    })),
    expectedStructure: {
      ...(c.expectedStructure ?? {}),
      minTriggeredAbilities: c.expectedStructure?.minTriggeredAbilities ?? 1,
    },
    evaluationSetVersion: "development-v23-evoke-cost-policy",
    goldReviewedAt: GOLD_V23_REVIEWED_AT,
    goldReviewer: GOLD_V23_REVIEWER,
    goldCompleter: GOLD_V23_REVIEWER,
    goldCompletedAt: GOLD_V23_REVIEWED_AT,
    goldReviewStatus: "reviewed" as const,
    goldCompletenessStatus: "complete" as const,
    layer2GoldAuditNote: fix.structureNote,
  };
}

async function main() {
  const v22Path = resolve(process.cwd(), "data/oracle-action-eval-development-v22.json");
  const v22 = JSON.parse(readFileSync(v22Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v22.contentHash !== V22_HASH) {
    throw new Error(`Expected v22 hash ${V22_HASH}, got ${v22.contentHash}`);
  }

  const byCase = new Map<string, GoldV23Correction[]>();
  for (const fix of GOLD_V23_CORRECTIONS) {
    const list = byCase.get(fix.caseId) ?? [];
    list.push(fix);
    byCase.set(fix.caseId, list);
  }

  const changedCaseIds: string[] = [];
  const v23Cases = v22.cases.map((c) => {
    const fixes = byCase.get(c.id);
    if (!fixes?.length) return c;
    changedCaseIds.push(c.id);
    return fixes.reduce((acc, fix) => applyCorrection(acc, fix), c);
  });

  const v23Hash = computeDatasetContentHash(v23Cases);
  const v23 = {
    ...v22,
    setClassification: "development_set_v23",
    evaluationSetVersion: "development-v23-evoke-cost-policy",
    contentHash: v23Hash,
    parentClassification: "development_set_v22",
    parentContentHash: v22.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v22.json",
    frozenAt: GOLD_V23_REVIEWED_AT,
    reviewer: GOLD_V23_REVIEWER,
    reviewTimestamp: GOLD_V23_REVIEWED_AT,
    goldEvokeCostV23Audit: {
      correctedAt: GOLD_V23_REVIEWED_AT,
      corrector: GOLD_V23_REVIEWER,
      correctionCount: GOLD_V23_CORRECTIONS.length,
      changedCaseCount: changedCaseIds.length,
      changedCaseIds,
      corrections: GOLD_V23_CORRECTIONS,
    },
    cases: v23Cases,
  };

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-v23.json");
  writeFileSync(outPath, JSON.stringify(v23, null, 2));

  console.log(
    JSON.stringify(
      {
        outPath,
        setClassification: v23.setClassification,
        contentHash: v23Hash,
        parentHash: V22_HASH,
        changedCaseIds,
      },
      null,
      2,
    ),
  );
}

main();
