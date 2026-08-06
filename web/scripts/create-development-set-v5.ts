/**
 * Restore development_set_v4 (256 cases, d8acd3ed…) and create development_set_v5
 * from the expanded multiface corpus with parent/diff manifest.
 * Run: npx tsx scripts/create-development-set-v5.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  NEW_MULTIFACE_CASES,
  applyMultifaceGoldPatches,
  NEW_MULTIFACE_V5_CASES,
} from "./oracle-action-eval-multiface-cases";
import { computeContentHash, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const V4_HASH = "d8acd3ed4752b90f9d7c0f966c221cce3d93cb8766fa2b238f59d080c292a684";
const V4_COMMIT = "5d1a4be";

function attachExpectedFaces(testCase: OracleActionEvalCaseV2): void {
  const faces = segmentCardFaces(testCase.oracleText);
  if (faces.length <= 1 && !testCase.layout) return;
  testCase.expectedFaces = faces.map((f) => ({
    faceId: f.faceId,
    faceName: f.faceName,
    faceIndex: f.faceIndex,
    componentType: f.componentType,
    cardEvidenceStart: f.cardEvidenceStart,
    cardEvidenceEnd: f.cardEvidenceEnd,
  }));
}

function ensureCardFaceOnMultifaceActions(c: OracleActionEvalCaseV2, faces: ReturnType<typeof segmentCardFaces>): void {
  if (!c.layout && faces.length <= 1) return;
  for (const exp of c.expectedPrimitiveActions) {
    if (exp.negative || exp.cardFace) continue;
    const needle = exp.evidenceContains.toLowerCase();
    const face = faces.find((f) => f.text.toLowerCase().includes(needle.slice(0, Math.min(needle.length, 20))));
    if (face) exp.cardFace = face.faceId;
    else if (faces.length === 2) exp.cardFace = faces[0].faceId;
  }
}

function isMultifaceCase(c: OracleActionEvalCaseV2): boolean {
  return (
    Boolean(c.layout) ||
    c.oracleText.includes("\n//\n") ||
    /\nAftermath\n/i.test(c.oracleText) ||
    (/\bRoom\b/i.test(c.oracleText) && c.oracleText.includes("\n//\n"))
  );
}

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
    "expectedFaces",
    "forbiddenPrimitiveActions",
    "category",
    "layout",
    "cardFace",
  ] as const;
  const delta: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of fields) {
    if (JSON.stringify(prior[field]) !== JSON.stringify(next[field])) {
      delta[field] = { before: prior[field], after: next[field] };
    }
  }
  return Object.keys(delta).length ? delta : null;
}

function buildV5Cases(v4Cases: OracleActionEvalCaseV2[]): OracleActionEvalCaseV2[] {
  const cases = v4Cases.map((c) => JSON.parse(JSON.stringify(c)) as OracleActionEvalCaseV2);
  applyMultifaceGoldPatches(cases);
  const existingIds = new Set(cases.map((c) => c.id));
  for (const nc of [...NEW_MULTIFACE_CASES, ...NEW_MULTIFACE_V5_CASES]) {
    if (!existingIds.has(nc.id)) {
      cases.push(JSON.parse(JSON.stringify(nc)) as OracleActionEvalCaseV2);
      existingIds.add(nc.id);
    }
  }
  for (const c of cases) {
    if (isMultifaceCase(c)) {
      const faces = segmentCardFaces(c.oracleText);
      attachExpectedFaces(c);
      ensureCardFaceOnMultifaceActions(c, faces);
    }
  }
  return cases;
}

function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const v4Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v4.json");
  const v4DiffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v4-diff.json");
  const v5Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v5.json");
  const v5DiffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v5-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v4Raw = execSync(`git show ${V4_COMMIT}:web/data/oracle-action-eval-development-v4.json`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const v4DiffRaw = execSync(`git show ${V4_COMMIT}:web/data/oracle-action-eval-development-v4-diff.json`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const v4 = JSON.parse(v4Raw) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
  };

  if (v4.contentHash !== V4_HASH) {
    throw new Error(`v4 hash mismatch: expected ${V4_HASH}, got ${v4.contentHash}`);
  }

  writeFileSync(v4Path, JSON.stringify(v4, null, 2), "utf8");
  writeFileSync(v4DiffPath, v4DiffRaw, "utf8");

  const v5Cases = buildV5Cases(v4.cases);
  const v5Hash = computeContentHash(v5Cases);
  const createdAt = new Date().toISOString();

  const layoutCounts: Record<string, number> = {};
  for (const c of v5Cases.filter(isMultifaceCase)) {
    const key = c.layout ?? "unspecified";
    layoutCounts[key] = (layoutCounts[key] ?? 0) + 1;
  }

  const caseDiffs: Array<{ caseId: string; changedFields: string[] }> = [];
  const newCaseIds: string[] = [];
  for (const next of v5Cases) {
    const prior = v4.cases.find((c) => c.id === next.id);
    if (!prior) {
      newCaseIds.push(next.id);
      continue;
    }
    const delta = caseDiff(prior, next);
    if (delta) caseDiffs.push({ caseId: next.id, changedFields: Object.keys(delta) });
  }

  const v5 = {
    setClassification: "development_set_v5",
    evaluationVersion: "development-v5-multiface",
    contentHash: v5Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v5Cases.length,
    frozenAt: createdAt,
    usagePolicy: "Parser tuning set — multiface v1.7+ (face segmentation, per-component parsing, expanded gold).",
    parentClassification: "development_set_v4",
    parentContentHash: V4_HASH,
    parentSetPath: "data/oracle-action-eval-development-v4.json",
    parentCaseCount: v4.caseCount,
    multifaceGoldSupportByLayout: layoutCounts,
    cases: v5Cases,
  };

  writeFileSync(v5Path, JSON.stringify(v5, null, 2), "utf8");
  writeFileSync(
    v5DiffPath,
    JSON.stringify(
      {
        generatedAt: createdAt,
        parentDataset: "development_set_v4",
        parentContentHash: V4_HASH,
        parentCaseCount: v4.caseCount,
        newDataset: "development_set_v5",
        newContentHash: v5Hash,
        newCaseCount: v5Cases.length,
        changedCaseCount: caseDiffs.length,
        addedCaseIds: newCaseIds,
        multifaceGoldSupportByLayout: layoutCounts,
        reasonForChange:
          "Multiface gold expansion: expectedFaces, cardFace on all multiface actions, new layout coverage (disturb, battle, convert, back-face ability types).",
        caseDiffs,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSetV4 = {
    path: "data/oracle-action-eval-development-v4.json",
    classification: "development_set_v4",
    contentHash: V4_HASH,
    caseCount: 256,
    purpose: "Frozen at parser v1.6 — optionality/condition milestone; immutable",
    frozenAt: v4.frozenAt ?? "2026-08-06T21:18:25.466Z",
  };
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v5.json",
    classification: "development_set_v5",
    contentHash: v5Hash,
    caseCount: v5Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Parser tuning — multiface v1.7+ (face segmentation, expanded gold)",
    parentVersion: {
      classification: "development_set_v4",
      contentHash: V4_HASH,
      caseCount: v4.caseCount,
      path: "data/oracle-action-eval-development-v4.json",
    },
    diffManifest: "data/oracle-action-eval-development-v5-diff.json",
    multifaceGoldSupportByLayout: layoutCounts,
    priorVersions: [
      {
        path: "data/oracle-action-eval-development-v4.json",
        classification: "development_set_v4",
        contentHash: V4_HASH,
        caseCount: 256,
        supersededAt: createdAt,
        reason: "Multiface expansion moved to v5; v4 frozen immutable",
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Restored development_set_v4");
  console.log(`  cases: ${v4.caseCount}, hash ${V4_HASH.slice(0, 12)}…`);
  console.log("Created development_set_v5");
  console.log(`  cases: ${v5Cases.length}, hash ${v5Hash.slice(0, 12)}…`);
  console.log(`  changed: ${caseDiffs.length}, added: ${newCaseIds.length}`);
  console.log(`  layout support:`, layoutCounts);
}

main();
