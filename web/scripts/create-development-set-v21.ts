/**
 * Apply v1.15 policy gold adjudications → development_set_v21.
 * Parent: development_set_v20 (immutable).
 * Run: npx tsx scripts/create-development-set-v21.ts
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
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import {
  GOLD_V21_ADJUDICATIONS,
  GOLD_V21_REVIEWED_AT,
  GOLD_V21_REVIEWER,
  type GoldV21Adjudication,
} from "./adjudicate-gold-policy-v21";

const V20_HASH = "9554d419fbfd67af809d20376482b9c1d60be47066f95f38dd72e21636512098";

type GoldAddition = NonNullable<GoldV21Adjudication["goldAddition"]>;
type GoldRemoval = NonNullable<GoldV21Adjudication["goldRemoval"]>;

function corpusForFace(oracleText: string, cardFace?: "front" | "back"): string {
  if (!cardFace || !oracleText.includes("\n//\n")) return oracleText;
  return oracleText.split("\n//\n")[cardFace === "back" ? 1 : 0];
}

function mergeGold(
  existing: CatalogEvalCase["expectedPrimitiveActions"],
  additions: GoldAddition[],
  oracleText: string,
): CatalogEvalCase["expectedPrimitiveActions"] {
  const merged = [...existing];
  for (const add of additions) {
    const corpus = corpusForFace(oracleText, add.cardFace);
    if (!evidenceMatchesOracle(corpus, add.evidenceContains)) {
      throw new Error(`[${add.actionType}] Evidence not in oracle: ${add.evidenceContains}`);
    }
    const dup = merged.some(
      (g) =>
        g.actionType === add.actionType &&
        g.evidenceContains === add.evidenceContains &&
        (g.cardFace ?? "front") === (add.cardFace ?? "front"),
    );
    if (dup) continue;
    merged.push({
      actionType: add.actionType,
      evidenceContains: add.evidenceContains,
      ...(add.cardFace ? { cardFace: add.cardFace } : {}),
      ...(add.optionalEffect !== undefined ? { optionalEffect: add.optionalEffect } : {}),
    });
  }
  return merged;
}

function removeGold(
  existing: CatalogEvalCase["expectedPrimitiveActions"],
  removals: GoldRemoval[],
): CatalogEvalCase["expectedPrimitiveActions"] {
  return existing.filter(
    (g) =>
      !removals.some(
        (r) => g.actionType === r.actionType && g.evidenceContains.includes(r.evidenceContains.slice(0, 12)),
      ),
  );
}

function mergeForbidden(
  existing: CatalogEvalCase["forbiddenPrimitiveActions"],
  additions: PrimitiveActionType[],
): PrimitiveActionType[] | undefined {
  const merged = new Set(existing ?? []);
  for (const p of additions) merged.add(p);
  return merged.size ? [...merged] : undefined;
}

async function main() {
  const v20Path = resolve(process.cwd(), "data/oracle-action-eval-development-v20.json");
  const v20 = JSON.parse(readFileSync(v20Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v20.contentHash !== V20_HASH) {
    throw new Error(`Expected v20 hash ${V20_HASH}, got ${v20.contentHash}`);
  }

  const additionsByCase = new Map<string, GoldAddition[]>();
  const removalsByCase = new Map<string, GoldRemoval[]>();
  const forbiddenByCase = new Map<string, PrimitiveActionType[]>();

  for (const adj of GOLD_V21_ADJUDICATIONS) {
    if (adj.decision === "add_gold" && adj.goldAddition) {
      const list = additionsByCase.get(adj.caseId) ?? [];
      list.push(adj.goldAddition);
      additionsByCase.set(adj.caseId, list);
    }
    if (adj.decision === "remove_gold" && adj.goldRemoval) {
      const list = removalsByCase.get(adj.caseId) ?? [];
      list.push(adj.goldRemoval);
      removalsByCase.set(adj.caseId, list);
    }
    if (adj.decision === "reject_parser_output" && adj.forbiddenPrimitive) {
      const list = forbiddenByCase.get(adj.caseId) ?? [];
      list.push(adj.forbiddenPrimitive);
      forbiddenByCase.set(adj.caseId, list);
    }
  }

  const changedCaseIds: string[] = [];
  const v21Cases = v20.cases.map((c) => {
    const additions = additionsByCase.get(c.id) ?? [];
    const removals = removalsByCase.get(c.id) ?? [];
    const forbiddenAdds = forbiddenByCase.get(c.id) ?? [];

    if (!additions.length && !removals.length && !forbiddenAdds.length) return c;

    let expectedPrimitiveActions = removeGold(c.expectedPrimitiveActions, removals);
    if (additions.length) expectedPrimitiveActions = mergeGold(expectedPrimitiveActions, additions, c.oracleText);

    const forbiddenPrimitiveActions = mergeForbidden(c.forbiddenPrimitiveActions, forbiddenAdds);
    const primitives = expectedPrimitiveActions.filter((p) => !p.negative).map((p) => p.actionType);
    const roles = inferDerivedRoles(primitives);

    changedCaseIds.push(c.id);
    return {
      ...c,
      expectedPrimitiveActions,
      ...(forbiddenPrimitiveActions ? { forbiddenPrimitiveActions } : {}),
      expectedRoles: roles.map((role) => ({
        role,
        fromPrimitiveActions: [...new Set(primitives)],
      })),
      evaluationSetVersion: "development-v21-cost-compound-policy",
      goldReviewedAt: GOLD_V21_REVIEWED_AT,
      goldReviewer: GOLD_V21_REVIEWER,
      goldCompleter: GOLD_V21_REVIEWER,
      goldCompletedAt: GOLD_V21_REVIEWED_AT,
      goldReviewStatus: "reviewed" as const,
      goldCompletenessStatus: "complete" as const,
      layer2GoldAuditNote: "v21 cost/compound policy — Layer-1 costs not Layer-2; tutor search+put distinct",
    };
  });

  const v21Hash = computeDatasetContentHash(v21Cases);
  const v21 = {
    ...v20,
    setClassification: "development_set_v21",
    evaluationSetVersion: "development-v21-cost-compound-policy",
    contentHash: v21Hash,
    parentClassification: "development_set_v20",
    parentContentHash: v20.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v20.json",
    frozenAt: GOLD_V21_REVIEWED_AT,
    reviewer: GOLD_V21_REVIEWER,
    reviewTimestamp: GOLD_V21_REVIEWED_AT,
    goldPolicyV21Audit: {
      correctedAt: GOLD_V21_REVIEWED_AT,
      corrector: GOLD_V21_REVIEWER,
      adjudicationCount: GOLD_V21_ADJUDICATIONS.length,
      changedCaseCount: changedCaseIds.length,
      changedCaseIds,
      adjudications: GOLD_V21_ADJUDICATIONS,
    },
    cases: v21Cases,
  };

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-development-v21.json");
  writeFileSync(outPath, JSON.stringify(v21, null, 2));

  console.log(
    JSON.stringify(
      {
        outPath,
        setClassification: v21.setClassification,
        contentHash: v21Hash,
        parentHash: V20_HASH,
        changedCaseCount: changedCaseIds.length,
        changedCaseIds,
      },
      null,
      2,
    ),
  );
}

main();
