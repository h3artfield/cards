/**
 * Create development_set_v4 from frozen development_set_v3.
 * v3 (hash 4a69de72…) is immutable; v4 captures gold-label corrections only.
 * Run: npx tsx scripts/create-development-set-v4.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { applyLegacyOptionalAdjudications } from "./adjudicate-legacy-optional-labels";
import { computeContentHash, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const V3_HASH = "4a69de72c991c3a3173b4e5efe54ccf96f4c171e11c3f6edd1a0a256573d76d9";

function caseDiff(
  prior: OracleActionEvalCaseV2,
  next: OracleActionEvalCaseV2,
): Record<string, { before: unknown; after: unknown }> | null {
  const fields = [
    "oracleText",
    "expectedPrimitiveActions",
    "expectedConditions",
    "expectedStructure",
    "expectedRoles",
    "forbiddenPrimitiveActions",
    "category",
    "layout",
    "cardFace",
  ] as const;
  const delta: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of fields) {
    const before = prior[field];
    const after = next[field];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      delta[field] = { before, after };
    }
  }
  return Object.keys(delta).length ? delta : null;
}

function main() {
  const v3Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v3.json");
  const v4Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v4.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v4-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v3 = JSON.parse(readFileSync(v3Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    setClassification: string;
  };

  if (v3.contentHash !== V3_HASH) {
    throw new Error(
      `development_set_v3 hash mismatch: expected ${V3_HASH}, got ${v3.contentHash}. Restore v3 from ea41efe before creating v4.`,
    );
  }

  const { cases: relabeledCases, adjudications } = applyLegacyOptionalAdjudications(v3.cases);
  const v4Cases = relabeledCases.map((c) => ({ ...c }));

  const eval0120 = v4Cases.find((c) => c.id === "eval-0120");
  if (eval0120) {
    eval0120.expectedPrimitiveActions = eval0120.expectedPrimitiveActions.filter(
      (a) => !(a.actionType === "cast" && a.evidenceContains === "play that card"),
    );
  }

  const v4Hash = computeContentHash(v4Cases);
  const createdAt = new Date().toISOString();
  const caseDiffs: Array<{ caseId: string; changedFields: string[]; delta: Record<string, unknown> }> = [];

  for (const next of v4Cases) {
    const prior = v3.cases.find((c) => c.id === next.id);
    if (!prior) continue;
    const delta = caseDiff(prior, next);
    if (delta) {
      caseDiffs.push({
        caseId: next.id,
        changedFields: Object.keys(delta),
        delta,
      });
    }
  }

  const v4 = {
    setClassification: "development_set_v4",
    evaluationVersion: "development-v4",
    contentHash: v4Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v4Cases.length,
    frozenAt: createdAt,
    usagePolicy: "Parser tuning set — optionality/condition v1.6+ (structure annotations, taxonomy v1.1).",
    parentClassification: "development_set_v3",
    parentContentHash: v3.contentHash,
    parentSetPath: "data/oracle-action-eval-development-v3.json",
    parentCaseCount: v3.caseCount,
    creationReason:
      "Paragraph-scoped legacy optional relabel (eval-0053 draw/return false optional) and eval-0120 duplicate cast/play dedup. v3 identity preserved.",
    legacyOptionalAdjudications: adjudications.length,
    cases: v4Cases,
  };

  writeFileSync(v4Path, JSON.stringify(v4, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: createdAt,
        parentDataset: "development_set_v3",
        parentContentHash: v3.contentHash,
        newDataset: "development_set_v4",
        newContentHash: v4Hash,
        caseCount: v4Cases.length,
        changedCaseCount: caseDiffs.length,
        reasonForChange:
          "Gold-label corrections after v1.5 checkpoint: paragraph-scoped optional adjudication and eval-0120 cast/play dedup. Case count unchanged (256). Oracle text unchanged.",
        caseDiffs,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSetV3 = {
    path: "data/oracle-action-eval-development-v3.json",
    classification: "development_set_v3",
    contentHash: v3.contentHash,
    caseCount: v3.caseCount,
    purpose: "Frozen at parser v1.5 checkpoint — immutable, do not modify",
    frozenAt: v3.frozenAt ?? "2026-08-06T19:54:10.823Z",
  };
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v4.json",
    classification: "development_set_v4",
    contentHash: v4Hash,
    caseCount: v4Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Parser tuning — optionality/condition v1.6 (structure annotations)",
    parentVersion: {
      classification: "development_set_v3",
      contentHash: v3.contentHash,
      caseCount: v3.caseCount,
      path: "data/oracle-action-eval-development-v3.json",
    },
    diffManifest: "data/oracle-action-eval-development-v4-diff.json",
    priorVersions: [
      ...(Array.isArray((manifest.developmentSet as { priorVersions?: unknown[] })?.priorVersions)
        ? (manifest.developmentSet as { priorVersions: unknown[] }).priorVersions
        : []),
      {
        path: "data/oracle-action-eval-development-v3.json",
        classification: "development_set_v3",
        contentHash: v3.contentHash,
        caseCount: v3.caseCount,
        supersededAt: createdAt,
        reason: "Gold-label corrections moved to v4; v3 frozen immutable",
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Created development_set_v4`);
  console.log(`  parent v3: ${v3.caseCount} cases, hash ${v3.contentHash.slice(0, 12)}…`);
  console.log(`  v4 cases: ${v4Cases.length}, hash ${v4Hash.slice(0, 12)}…`);
  console.log(`  changed cases: ${caseDiffs.length}`);
  console.log(`  → ${v4Path}`);
  console.log(`  diff → ${diffPath}`);
}

main();
