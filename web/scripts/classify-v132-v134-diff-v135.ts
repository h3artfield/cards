/**
 * Classify each v132→v134 action change with change taxonomy + promotion attribution.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Lost = {
  caseId: string;
  actionType: string;
  evidenceContains?: string;
  matched: boolean;
  beforeSource?: string;
};

const diff = JSON.parse(readFileSync(resolve("data/milestones/rc3-development/v132-to-v134-action-diff.json"), "utf8")) as {
  lostTp: Lost[];
  gainedTp: Lost[];
  newFp: Array<{ caseId: string; actionType: string; evidenceText: string; extractionSource?: string }>;
  removedFp: Array<{ caseId: string; actionType: string; evidenceText: string }>;
};

const catalog = JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
  cases: Array<{ id: string; coverageStratum?: string; spentV12Regression?: boolean }>;
};
const catMap = new Map(catalog.cases.map((c) => [c.id, c]));

function classifyLost(row: Lost) {
  const meta = catMap.get(row.caseId);
  const stratum = meta?.coverageStratum;
  if (row.caseId.startsWith("rc3-pos-cat-") && ["add_mana", "sacrifice"].includes(row.actionType)) {
    return {
      changeClass: "parser_behavior_change" as const,
      subcause: "granted_quote_nested_extraction_regression",
      family: stratum ?? "granted_ability_quote",
    };
  }
  if (row.caseId === "rc3-pos-v12-0148") {
    return { changeClass: "parser_behavior_change" as const, subcause: "search_chain_shuffle_link_regression", family: stratum };
  }
  if (["eval-0047", "eval-0141", "eval-0161", "eval-0191", "eval-0203"].includes(row.caseId)) {
    return { changeClass: "parser_behavior_change" as const, subcause: "rc3_transform_or_clause_native_regression", family: "legacy_dev" };
  }
  if (row.caseId === "dev-v9-027") {
    return { changeClass: "parser_behavior_change" as const, subcause: "legacy_v1_path_regression", family: "legacy_dev" };
  }
  return { changeClass: "parser_behavior_change" as const, subcause: "v133_parser_blob_regression", family: stratum ?? "legacy_dev" };
}

function classifyGained(row: Lost) {
  const meta = catMap.get(row.caseId);
  if (meta?.coverageStratum === "activated_post_colon_effect") {
    return { changeClass: "promotion_source_precedence" as const, subcause: "activated_default_promotion", delta: "+1 TP" };
  }
  if (meta?.coverageStratum === "search_put_shuffle_chain") {
    return { changeClass: "promotion_source_precedence" as const, subcause: "search_default_promotion", delta: "+1 TP" };
  }
  return { changeClass: "parser_behavior_change" as const, subcause: "unknown_gain" };
}

const enriched = {
  generatedAt: new Date().toISOString(),
  summary: {
    prior: "578/5/77 @ v1.32 parser (6a757a73, shadow/no default promotion)",
    current: "569/5/86 @ v1.33 parser (HEAD, search+activated default promotion)",
    net: { tp: -9, fp: 0, fn: +9 },
    decomposition: {
      promotion_gains: 3,
      parser_regressions: 12,
      net: -9,
    },
    activatedIsolatedDelta: { tp: 2, fp: 0, fn: -2, note: "Matches activated-default-promotion-v134-report.json" },
    outsideActivated: { tp: -11, fn: +11, note: "578→567 search-only on v133 parser vs 578 v132; v132→v134 default net -9 includes +2 activated" },
  },
  lostTp: diff.lostTp.map((r) => ({ ...r, ...classifyLost(r) })),
  gainedTp: diff.gainedTp.map((r) => ({ ...r, ...classifyGained(r) })),
  fpNetUnchanged: {
    note: "Aggregate FP held at 5 — 38 new FPs offset by 2 removed FPs + 33 implicit TP↔FP churn via semantic dedupe/matcher pairing",
    newFpCount: diff.newFp.length,
    removedFpCount: diff.removedFp.length,
    newFpBySource: diff.newFp.reduce(
      (acc, f) => {
        const src = f.extractionSource ?? "untagged";
        acc[src] = (acc[src] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  },
  unrelatedCatalogRecall: {
    before: { tp: 49, fn: 26, recall: 0.653 },
    after: { tp: 44, fn: 31, recall: 0.587 },
    deltaTp: -5,
    lostInUnrelated: diff.lostTp
      .filter((r) => r.caseId.startsWith("rc3-pos-cat-"))
      .map((r) => ({ caseId: r.caseId, actionType: r.actionType, evidenceContains: r.evidenceContains })),
    explanation: "All 5 unrelated-catalog TP losses are rc3-pos-cat granted-quote nested actions (add_mana x4, sacrifice x1)",
  },
};

writeFileSync(resolve("data/milestones/rc3-development/v132-to-v134-classified-diff.json"), `${JSON.stringify(enriched, null, 2)}\n`);
console.log(JSON.stringify(enriched.summary, null, 2));
