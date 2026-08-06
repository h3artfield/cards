/**
 * Expand development_set_v4 with multiface gold labels and new reviewed cases.
 * Run: npx tsx scripts/expand-development-set-v4-multiface.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  NEW_MULTIFACE_CASES,
  applyMultifaceGoldPatches,
} from "./oracle-action-eval-multiface-cases";
import { computeContentHash, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const PARENT_HASH = "d8acd3ed4752b90f9d7c0f966c221cce3d93cb8766fa2b238f59d080c292a684";

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

function isMultifaceCase(c: OracleActionEvalCaseV2): boolean {
  return (
    Boolean(c.layout) ||
    c.oracleText.includes("\n//\n") ||
    /\nAftermath\n/i.test(c.oracleText) ||
    (/\bRoom\b/i.test(c.oracleText) && c.oracleText.includes("\n//\n"))
  );
}

function main() {
  const v4Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v4.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v4-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v4 = JSON.parse(readFileSync(v4Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
  };

  if (v4.contentHash !== PARENT_HASH) {
    console.warn(`Parent hash ${PARENT_HASH.slice(0, 12)}… differs from loaded ${v4.contentHash.slice(0, 12)}… — continuing.`);
  }

  const cases = v4.cases.map((c) => ({ ...c }));
  const patchCount = applyMultifaceGoldPatches(cases);

  const existingIds = new Set(cases.map((c) => c.id));
  for (const nc of NEW_MULTIFACE_CASES) {
    if (existingIds.has(nc.id)) continue;
    cases.push({ ...nc });
  }

  for (const c of cases) {
    if (isMultifaceCase(c)) attachExpectedFaces(c);
  }

  const newHash = computeContentHash(cases);
  const createdAt = new Date().toISOString();
  const multifaceCases = cases.filter(isMultifaceCase);
  const layoutCounts: Record<string, number> = {};
  for (const c of multifaceCases) {
    const key = c.layout ?? "unspecified";
    layoutCounts[key] = (layoutCounts[key] ?? 0) + 1;
  }

  const updated = {
    setClassification: "development_set_v4",
    evaluationVersion: "development-v4-multiface",
    contentHash: newHash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: cases.length,
    frozenAt: createdAt,
    usagePolicy: "Parser tuning set — multiface v1.7 (face segmentation, per-component parsing).",
    parentClassification: "development_set_v4",
    parentContentHash: v4.contentHash,
    parentCaseCount: v4.caseCount,
    multifaceGoldSupport: layoutCounts,
    cases,
  };

  writeFileSync(v4Path, JSON.stringify(updated, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: createdAt,
        parentContentHash: v4.contentHash,
        newContentHash: newHash,
        priorCaseCount: v4.caseCount,
        newCaseCount: cases.length,
        patchedExistingCases: patchCount,
        addedCases: NEW_MULTIFACE_CASES.map((c) => c.id),
        multifaceGoldSupportByLayout: layoutCounts,
        reasonForChange: "Multiface slice v1.7: expectedFaces, per-action cardFace gold, 14 new reviewed cases.",
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v4.json",
    classification: "development_set_v4",
    contentHash: newHash,
    caseCount: cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Parser tuning — multiface v1.7 (face segmentation, per-component parsing)",
    parentVersion: {
      classification: "development_set_v4",
      contentHash: v4.contentHash,
      caseCount: v4.caseCount,
    },
    diffManifest: "data/oracle-action-eval-development-v4-diff.json",
    multifaceGoldSupportByLayout: layoutCounts,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Expanded development_set_v4 for multiface slice`);
  console.log(`  cases: ${v4.caseCount} → ${cases.length}`);
  console.log(`  hash: ${newHash.slice(0, 12)}…`);
  console.log(`  patched: ${patchCount}, added: ${NEW_MULTIFACE_CASES.length}`);
  console.log(`  multiface layout support:`, layoutCounts);
}

main();
