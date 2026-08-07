/**
 * Apply gold_omission adjudications → development_set_v18.
 * Run: npx tsx scripts/apply-gold-omission-corrections-v18.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
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
  GOLD_OMISSION_ADJUDICATIONS,
  GOLD_OMISSION_REVIEWED_AT,
  GOLD_OMISSION_REVIEWER,
} from "./adjudicate-gold-omission-v18";

loadEnvLocal();

type GoldAddition = {
  actionType: string;
  evidenceContains: string;
  cardFace?: "front" | "back";
  optionalEffect?: boolean;
};

type GoldRemoval = {
  actionType: string;
  evidenceContains: string;
};

/** Extra additions beyond per-entry adjudication records. */
const EXTRA_GOLD_ADDITIONS: Record<string, GoldAddition[]> = {
  "eval-0055": [{ actionType: "discard", evidenceContains: "discard two cards" }],
};

/** Fix imprecise prior gold evidence spans. */
const GOLD_EVIDENCE_FIXES: Record<
  string,
  Array<{ actionType: string; oldEvidence: string; newEvidence: string }>
> = {
  "eval-0267": [{ actionType: "counter", oldEvidence: "Choose one", newEvidence: "Counter target artifact spell" }],
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

function removeGold(
  existing: CatalogEvalCase["expectedPrimitiveActions"],
  removals: GoldRemoval[],
): CatalogEvalCase["expectedPrimitiveActions"] {
  return existing.filter(
    (g) =>
      !removals.some(
        (r) => g.actionType === r.actionType && g.evidenceContains.startsWith(r.evidenceContains.slice(0, 20)),
      ),
  );
}

function applyEvidenceFixes(
  gold: CatalogEvalCase["expectedPrimitiveActions"],
  caseId: string,
  oracleText: string,
): CatalogEvalCase["expectedPrimitiveActions"] {
  const fixes = GOLD_EVIDENCE_FIXES[caseId];
  if (!fixes?.length) return gold;
  return gold.map((g) => {
    const fix = fixes.find((f) => f.actionType === g.actionType && g.evidenceContains.includes(f.oldEvidence.slice(0, 8)));
    if (!fix) return g;
    if (!evidenceMatchesOracle(oracleText, fix.newEvidence)) {
      throw new Error(`Fix evidence not in oracle: ${fix.newEvidence}`);
    }
    return { ...g, evidenceContains: fix.newEvidence };
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
  const v17Path = resolve(process.cwd(), "data/oracle-action-eval-development-v17.json");
  const v17 = JSON.parse(readFileSync(v17Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  const additionsByCase = new Map<string, GoldAddition[]>();
  const removalsByCase = new Map<string, GoldRemoval[]>();
  const forbiddenByCase = new Map<string, PrimitiveActionType[]>();

  for (const adj of GOLD_OMISSION_ADJUDICATIONS) {
    if (adj.decision === "add_gold" && adj.goldAddition) {
      const list = additionsByCase.get(adj.caseId) ?? [];
      list.push(adj.goldAddition);
      additionsByCase.set(adj.caseId, list);
    }
    if (adj.goldRemoval) {
      const list = removalsByCase.get(adj.caseId) ?? [];
      list.push(adj.goldRemoval);
      removalsByCase.set(adj.caseId, list);
    }
    if (adj.forbiddenPrimitive) {
      const list = forbiddenByCase.get(adj.caseId) ?? [];
      list.push(adj.forbiddenPrimitive as PrimitiveActionType);
      forbiddenByCase.set(adj.caseId, list);
    }
  }

  for (const [caseId, extras] of Object.entries(EXTRA_GOLD_ADDITIONS)) {
    const list = additionsByCase.get(caseId) ?? [];
    list.push(...extras);
    additionsByCase.set(caseId, list);
  }

  const changedCaseIds: string[] = [];
  const confirmed = GOLD_OMISSION_ADJUDICATIONS.filter((a) => a.decision === "add_gold").length;
  const rejected = GOLD_OMISSION_ADJUDICATIONS.filter((a) => a.decision === "reject_parser_output").length;

  const v18Cases = v17.cases.map((c) => {
    const additions = additionsByCase.get(c.id) ?? [];
    const removals = removalsByCase.get(c.id) ?? [];
    const forbiddenAdds = forbiddenByCase.get(c.id) ?? [];
    const hasFix = GOLD_EVIDENCE_FIXES[c.id];

    if (!additions.length && !removals.length && !forbiddenAdds.length && !hasFix) return c;

    let expectedPrimitiveActions = applyEvidenceFixes(c.expectedPrimitiveActions, c.id, c.oracleText);
    if (removals.length) expectedPrimitiveActions = removeGold(expectedPrimitiveActions, removals);
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
      evaluationSetVersion: "development-v18-gold-omission-audit",
      goldReviewedAt: GOLD_OMISSION_REVIEWED_AT,
      goldReviewer: GOLD_OMISSION_REVIEWER,
      goldCompleter: GOLD_OMISSION_REVIEWER,
      goldCompletedAt: GOLD_OMISSION_REVIEWED_AT,
      goldReviewStatus: "reviewed" as const,
      goldCompletenessStatus: "complete" as const,
      layer2GoldAuditNote: "v18 gold_omission audit — manual catalog adjudication of accepted FPs",
    };
  });

  const v18Hash = computeDatasetContentHash(v18Cases);
  if (v18Hash === v17.contentHash) {
    console.log(JSON.stringify({ unchanged: true, hash: v18Hash }, null, 2));
    return;
  }

  const v18 = {
    ...v17,
    setClassification: "development_set_v18",
    evaluationSetVersion: "development-v18-gold-omission-audit",
    contentHash: v18Hash,
    parentClassification: "development_set_v17",
    parentContentHash: v17.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v17.json",
    frozenAt: GOLD_OMISSION_REVIEWED_AT,
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewTimestamp: GOLD_OMISSION_REVIEWED_AT,
    goldOmissionAudit: {
      correctedAt: GOLD_OMISSION_REVIEWED_AT,
      corrector: GOLD_OMISSION_REVIEWER,
      adjudicationCount: GOLD_OMISSION_ADJUDICATIONS.length,
      confirmedAddGold: confirmed,
      rejectedParserOutput: rejected,
      changedCaseCount: changedCaseIds.length,
      changedCaseIds,
      adjudications: GOLD_OMISSION_ADJUDICATIONS,
    },
    cases: v18Cases,
  };

  writeFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v18.json"), JSON.stringify(v18, null, 2), "utf8");
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-development-v18-diff.json"),
    JSON.stringify(
      {
        generatedAt: GOLD_OMISSION_REVIEWED_AT,
        parentDataset: "development_set_v17",
        parentContentHash: v17.contentHash,
        newDataset: "development_set_v18",
        newContentHash: v18Hash,
        changedCaseIds,
        confirmedAddGold: confirmed,
        rejectedParserOutput: rejected,
        policy: "v1.13 gold_omission audit — manual catalog adjudication, no parser changes",
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
    path: "data/oracle-action-eval-development-v18.json",
    classification: "development_set_v18",
    contentHash: v18Hash,
    caseCount: v18Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Canonical development set — v18 gold_omission audit corrections",
    parentClassification: "development_set_v17",
    parentContentHash: v17.contentHash,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  manifest.developmentSetV17 = {
    path: "data/oracle-action-eval-development-v17.json",
    classification: "development_set_v17",
    contentHash: v17.contentHash,
    caseCount: v17.cases.length,
    purpose: "Immutable parent — none/Layer1 gold audit Layer 2 corrections",
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
        v18Hash,
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
