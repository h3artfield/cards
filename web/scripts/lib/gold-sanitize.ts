/**
 * Sanitize and repair case gold labels before second-pass review.
 */
import type { ExpectedCondition } from "../audit-oracle-action-eval-cases";
import { evidenceMatchesOracle } from "../oracle-action-eval-shared";
import { resolveNamedCardFromCatalog } from "./eval-case-from-catalog";
import { relabelCaseGold } from "./gold-relabel-engine";
import type { CatalogEvalCase } from "./eval-provenance-guard";
import type { GoldenCatalogIndex } from "./load-golden-catalog-index";
import { goldenFaceRecords } from "./load-golden-catalog-index";
import { getDevCondOptResolution } from "./dev-cond-opt-catalog-resolutions";
import { getDevCaseResolution } from "./unresolved-dev-case-resolutions";

export function sanitizeGoldPrimitives(
  oracleText: string,
  primitives: CatalogEvalCase["expectedPrimitiveActions"],
): CatalogEvalCase["expectedPrimitiveActions"] {
  return primitives.filter((p) => {
    if (p.negative) return true;
    const corpus =
      p.cardFace && oracleText.includes("\n//\n")
        ? oracleText.split("\n//\n")[p.cardFace === "back" ? 1 : 0] ?? oracleText
        : oracleText;
    return evidenceMatchesOracle(corpus, p.evidenceContains);
  });
}

export function sanitizeExpectedConditions(
  oracleText: string,
  conditions: ExpectedCondition[] | undefined,
): ExpectedCondition[] {
  if (!conditions?.length) return [];
  return conditions.filter((c) => evidenceMatchesOracle(oracleText, c.textContains));
}

export function repairCaseForGoldReview(input: {
  testCase: CatalogEvalCase;
  catalog: GoldenCatalogIndex;
  reviewer: string;
  reviewedAt: string;
  seedHint?: Parameters<typeof relabelCaseGold>[0]["seedHint"];
}): CatalogEvalCase {
  let testCase = { ...input.testCase };

  const condOpt = getDevCondOptResolution(testCase.id);
  if (condOpt) {
    const identity = resolveNamedCardFromCatalog(
      input.catalog,
      { name: condOpt.catalogCardName },
      input.reviewer,
    );
    const faces = goldenFaceRecords(input.catalog.byOracleId.get(identity.oracleId)!);
    testCase = {
      ...testCase,
      oracleId: identity.oracleId,
      oracleText: identity.oracleText,
      cardName: identity.cardName,
      layout: identity.layout ?? testCase.layout,
      colorIdentity: identity.colorIdentity,
      goldenCatalogVersion: identity.goldenCatalogVersion,
      goldenOracleTextHash: identity.goldenOracleTextHash,
      faceIndex: faces[0]?.faceIndex,
      faceName: faces[0]?.faceName,
    };
    if (condOpt.clearStaleConditions) {
      testCase.expectedConditions = sanitizeExpectedConditions(
        testCase.oracleText,
        testCase.expectedConditions,
      );
    }
    const { testCase: relabeled } = relabelCaseGold({
      baseCase: { ...testCase, expectedPrimitiveActions: testCase.expectedPrimitiveActions },
      seedHint: condOpt.seedHint,
      priorGold: testCase.expectedPrimitiveActions,
      reviewer: input.reviewer,
      reviewedAt: input.reviewedAt,
    });
    testCase = relabeled;
  }

  const multiface = getDevCaseResolution(testCase.id);
  if (multiface && !condOpt) {
    testCase.expectedConditions = sanitizeExpectedConditions(
      testCase.oracleText,
      testCase.expectedConditions,
    );
  }

  if (condOpt || multiface) {
    testCase.expectedConditions = sanitizeExpectedConditions(
      testCase.oracleText,
      testCase.expectedConditions,
    );
    testCase.expectedPrimitiveActions = sanitizeGoldPrimitives(
      testCase.oracleText,
      testCase.expectedPrimitiveActions,
    );
  }

  return testCase;
}
