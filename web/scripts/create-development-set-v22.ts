/**
 * Apply v22 duplicate-gold corrections → development_set_v22.
 * Run: npx tsx scripts/create-development-set-v22.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import {
  GOLD_V22_CORRECTIONS,
  GOLD_V22_REVIEWED_AT,
  GOLD_V22_REVIEWER,
  type GoldV22Correction,
} from "./adjudicate-gold-dedup-v22";

const V21_HASH = "06c8c7c58cf4a426ae220835ed5b9b29a7e54fd5a4848d9bcd21a12d5a791552";

function applyCorrections(
  actions: CatalogEvalCase["expectedPrimitiveActions"],
  corrections: GoldV22Correction[],
  oracleText: string,
): CatalogEvalCase["expectedPrimitiveActions"] {
  let out = [...actions];
  for (const fix of corrections) {
    if (fix.action === "remove_duplicate" && fix.remove) {
      out = out.filter(
        (g) =>
          !(
            g.actionType === fix.remove!.actionType &&
            g.evidenceContains === fix.remove!.evidenceContains
          ),
      );
    }
    if (fix.action === "align_optional_effect" && fix.align) {
      out = out.map((g) => {
        if (
          g.actionType === fix.align!.actionType &&
          g.evidenceContains === fix.align!.evidenceContains
        ) {
          const next = { ...g };
          if (fix.align!.optionalEffect !== undefined) {
            next.optionalEffect = fix.align!.optionalEffect;
            delete next.optional;
          }
          return next;
        }
        return g;
      });
    }
    if (fix.action === "align_evidence" && fix.align?.newEvidenceContains) {
      if (!evidenceMatchesOracle(oracleText, fix.align.newEvidenceContains)) {
        throw new Error(`Evidence not in oracle: ${fix.align.newEvidenceContains}`);
      }
      out = out.map((g) => {
        if (
          g.actionType === fix.align!.actionType &&
          g.evidenceContains === fix.align!.evidenceContains
        ) {
          return { ...g, evidenceContains: fix.align!.newEvidenceContains! };
        }
        return g;
      });
    }
  }
  return out;
}

async function main() {
  const v21Path = resolve(process.cwd(), "data/oracle-action-eval-development-v21.json");
  const v21 = JSON.parse(readFileSync(v21Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v21.contentHash !== V21_HASH) {
    throw new Error(`Expected v21 hash ${V21_HASH}, got ${v21.contentHash}`);
  }

  const byCase = new Map<string, GoldV22Correction[]>();
  for (const c of GOLD_V22_CORRECTIONS) {
    const list = byCase.get(c.caseId) ?? [];
    list.push(c);
    byCase.set(c.caseId, list);
  }

  const changedCaseIds: string[] = [];
  const v22Cases = v21.cases.map((c) => {
    const fixes = byCase.get(c.id);
    if (!fixes?.length) return c;

    const expectedPrimitiveActions = applyCorrections(c.expectedPrimitiveActions, fixes, c.oracleText);
    const primitives = expectedPrimitiveActions.filter((p) => !p.negative).map((p) => p.actionType);
    changedCaseIds.push(c.id);

    return {
      ...c,
      expectedPrimitiveActions,
      expectedRoles: inferDerivedRoles(primitives).map((role) => ({
        role,
        fromPrimitiveActions: [...new Set(primitives)],
      })),
      evaluationSetVersion: "development-v22-duplicate-gold-dedup",
      goldReviewedAt: GOLD_V22_REVIEWED_AT,
      goldReviewer: GOLD_V22_REVIEWER,
      goldCompleter: GOLD_V22_REVIEWER,
      goldCompletedAt: GOLD_V22_REVIEWED_AT,
      goldReviewStatus: "reviewed" as const,
      goldCompletenessStatus: "complete" as const,
      layer2GoldAuditNote: "v22 duplicate-gold dedup — evaluator FN denominator cleanup",
    };
  });

  const v22Hash = computeDatasetContentHash(v22Cases);
  const v22 = {
    ...v21,
    setClassification: "development_set_v22",
    evaluationSetVersion: "development-v22-duplicate-gold-dedup",
    contentHash: v22Hash,
    parentClassification: "development_set_v21",
    parentContentHash: v21.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v21.json",
    frozenAt: GOLD_V22_REVIEWED_AT,
    reviewer: GOLD_V22_REVIEWER,
    reviewTimestamp: GOLD_V22_REVIEWED_AT,
    goldDedupV22Audit: {
      correctedAt: GOLD_V22_REVIEWED_AT,
      corrector: GOLD_V22_REVIEWER,
      correctionCount: GOLD_V22_CORRECTIONS.length,
      changedCaseCount: changedCaseIds.length,
      changedCaseIds,
      corrections: GOLD_V22_CORRECTIONS,
      tutorCompoundGoldCaseCount: 6,
      tutorCompoundGoldCaseIds: [
        "dev-v9-009",
        "dev-v9-007",
        "dev-v9-008",
        "eval-0009",
        "eval-0012",
        "eval-0030",
      ],
    },
    cases: v22Cases,
  };

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-v22.json");
  writeFileSync(outPath, JSON.stringify(v22, null, 2));

  console.log(
    JSON.stringify(
      {
        outPath,
        setClassification: v22.setClassification,
        contentHash: v22Hash,
        parentHash: V21_HASH,
        changedCaseCount: changedCaseIds.length,
        changedCaseIds,
      },
      null,
      2,
    ),
  );
}

main();
