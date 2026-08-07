/**
 * Apply v1.14 gold_omission adjudications → development_set_v20.
 * Parent: development_set_v19 (cast-permission policy).
 * Run: npx tsx scripts/apply-gold-omission-corrections-v20.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import { TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import {
  GOLD_OMISSION_V14_ADJUDICATIONS,
  GOLD_OMISSION_V14_REVIEWED_AT,
  GOLD_OMISSION_V14_REVIEWER,
} from "./adjudicate-gold-omission-v14";

type GoldAddition = {
  actionType: string;
  evidenceContains: string;
  cardFace?: "front" | "back";
  optionalEffect?: boolean;
};

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
      actionType: add.actionType as CatalogEvalCase["expectedPrimitiveActions"][number]["actionType"],
      evidenceContains: add.evidenceContains,
      ...(add.cardFace ? { cardFace: add.cardFace } : {}),
      ...(add.optionalEffect !== undefined ? { optionalEffect: add.optionalEffect } : {}),
    });
  }
  return merged;
}

function applyEvidenceFixes(
  gold: CatalogEvalCase["expectedPrimitiveActions"],
  fixes: Array<{ actionType: string; oldEvidenceContains: string; newEvidenceContains: string }>,
  oracleText: string,
): CatalogEvalCase["expectedPrimitiveActions"] {
  return gold.map((g) => {
    const fix = fixes.find(
      (f) => f.actionType === g.actionType && g.evidenceContains.includes(f.oldEvidenceContains.slice(0, 8)),
    );
    if (!fix) return g;
    if (!evidenceMatchesOracle(oracleText, fix.newEvidenceContains)) {
      throw new Error(`Fix evidence not in oracle: ${fix.newEvidenceContains}`);
    }
    return { ...g, evidenceContains: fix.newEvidenceContains };
  });
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
  const v19Path = resolve(process.cwd(), "data/oracle-action-eval-development-v19.json");
  const v19 = JSON.parse(readFileSync(v19Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  const additionsByCase = new Map<string, GoldAddition[]>();
  const evidenceFixesByCase = new Map<
    string,
    Array<{ actionType: string; oldEvidenceContains: string; newEvidenceContains: string }>
  >();
  const forbiddenByCase = new Map<string, PrimitiveActionType[]>();

  for (const adj of GOLD_OMISSION_V14_ADJUDICATIONS) {
    if (adj.decision === "add_gold" && adj.goldAddition) {
      const list = additionsByCase.get(adj.caseId) ?? [];
      list.push(adj.goldAddition);
      additionsByCase.set(adj.caseId, list);
    }
    if (adj.goldEvidenceFix) {
      const list = evidenceFixesByCase.get(adj.caseId) ?? [];
      list.push(adj.goldEvidenceFix);
      evidenceFixesByCase.set(adj.caseId, list);
    }
    if (adj.forbiddenPrimitive) {
      const list = forbiddenByCase.get(adj.caseId) ?? [];
      list.push(adj.forbiddenPrimitive as PrimitiveActionType);
      forbiddenByCase.set(adj.caseId, list);
    }
  }

  const changedCaseIds: string[] = [];
  const confirmed = GOLD_OMISSION_V14_ADJUDICATIONS.filter((a) => a.decision === "add_gold").length;
  const rejected = GOLD_OMISSION_V14_ADJUDICATIONS.filter((a) => a.decision === "reject_parser_output").length;

  const v20Cases = v19.cases.map((c) => {
    const additions = additionsByCase.get(c.id) ?? [];
    const fixes = evidenceFixesByCase.get(c.id) ?? [];
    const forbiddenAdds = forbiddenByCase.get(c.id) ?? [];

    if (!additions.length && !fixes.length && !forbiddenAdds.length) return c;

    let expectedPrimitiveActions = applyEvidenceFixes(c.expectedPrimitiveActions, fixes, c.oracleText);
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
      evaluationSetVersion: "development-v20-gold-omission-v14-audit",
      goldReviewedAt: GOLD_OMISSION_V14_REVIEWED_AT,
      goldReviewer: GOLD_OMISSION_V14_REVIEWER,
      goldCompleter: GOLD_OMISSION_V14_REVIEWER,
      goldCompletedAt: GOLD_OMISSION_V14_REVIEWED_AT,
      goldReviewStatus: "reviewed" as const,
      goldCompletenessStatus: "complete" as const,
      layer2GoldAuditNote: "v20 gold_omission audit — v1.14 boundary-emission adjudication",
    };
  });

  const v20Hash = computeDatasetContentHash(v20Cases);
  const v20 = {
    ...v19,
    setClassification: "development_set_v20",
    evaluationSetVersion: "development-v20-gold-omission-v14-audit",
    contentHash: v20Hash,
    parentClassification: "development_set_v19",
    parentContentHash: v19.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v19.json",
    frozenAt: GOLD_OMISSION_V14_REVIEWED_AT,
    reviewer: GOLD_OMISSION_V14_REVIEWER,
    reviewTimestamp: GOLD_OMISSION_V14_REVIEWED_AT,
    goldOmissionV14Audit: {
      correctedAt: GOLD_OMISSION_V14_REVIEWED_AT,
      corrector: GOLD_OMISSION_V14_REVIEWER,
      adjudicationCount: GOLD_OMISSION_V14_ADJUDICATIONS.length,
      confirmedAddGold: confirmed,
      rejectedParserOutput: rejected,
      changedCaseCount: changedCaseIds.length,
      changedCaseIds,
      adjudications: GOLD_OMISSION_V14_ADJUDICATIONS,
    },
    cases: v20Cases,
  };

  writeFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v20.json"), JSON.stringify(v20, null, 2), "utf8");
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-development-v20-diff.json"),
    JSON.stringify(
      {
        generatedAt: GOLD_OMISSION_V14_REVIEWED_AT,
        parentDataset: "development_set_v19",
        parentContentHash: v19.contentHash,
        newDataset: "development_set_v20",
        newContentHash: v20Hash,
        changedCaseIds,
        confirmedAddGold: confirmed,
        rejectedParserOutput: rejected,
        policy: "v1.14 gold_omission audit — manual catalog adjudication, no parser changes",
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v20.json",
    classification: "development_set_v20",
    contentHash: v20Hash,
    caseCount: v20Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Canonical development set — v20 v1.14 gold_omission audit corrections",
    parentClassification: "development_set_v19",
    parentContentHash: v19.contentHash,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  manifest.developmentSetV19 = {
    path: "data/oracle-action-eval-development-v19.json",
    classification: "development_set_v19",
    contentHash: v19.contentHash,
    caseCount: v19.cases.length,
    purpose: "Immutable parent — v19 cast-permission policy gold",
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        v20Hash,
        parentV19Hash: v19.contentHash,
        changedCaseCount: changedCaseIds.length,
        confirmedAddGold: confirmed,
        rejectedParserOutput: rejected,
        changedCaseIds,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
