/**
 * Shared eval identity audit logic — compare cases against catalogOracleCards.
 */
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import {
  combinedGoldenOracleText,
  findCardsWithOracleText,
  goldenColorIdentity,
  goldenFaceRecords,
  goldenOracleTextHash,
  lookupGoldenByName,
  normalizeOracleTextForCompare,
  type GoldenCatalogIndex,
  type GoldenCatalogOracleCard,
} from "./load-golden-catalog-index";
import { isSyntheticEvalCaseId } from "./eval-case-card-name-lookup";

export type IdentityMismatchCategory =
  | "wrong_card_name"
  | "wrong_oracle_id"
  | "wrong_oracle_text"
  | "text_from_different_card"
  | "wrong_layout"
  | "wrong_face_name"
  | "wrong_face_text"
  | "stale_oracle_text"
  | "synthetic_test_text"
  | "serialization_only_difference";

export interface IdentityMismatch {
  caseId: string;
  dataset: string;
  storedCardName: string;
  storedOracleId: string;
  goldenCardName: string | null;
  goldenOracleId: string | null;
  storedText: string;
  goldenText: string | null;
  classification: IdentityMismatchCategory;
  likelyRootCause: string;
  details?: string;
}

export interface IdentityAuditCaseResult {
  caseId: string;
  dataset: string;
  exactMatch: boolean;
  isSynthetic: boolean;
  mismatches: IdentityMismatch[];
}

export interface IdentityAuditSummary {
  totalCasesChecked: number;
  exactMatchCases: number;
  mismatchCountByDataset: Record<string, number>;
  mismatchCountByCategory: Record<IdentityMismatchCategory, number>;
  caseResults: IdentityAuditCaseResult[];
  allMismatches: IdentityMismatch[];
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function resolveGoldenCard(
  index: GoldenCatalogIndex,
  testCase: OracleActionEvalCaseV2,
  cardName: string | undefined,
): GoldenCatalogOracleCard | null {
  const byStoredId = index.byOracleId.get(testCase.oracleId);
  if (byStoredId) return byStoredId;
  if (cardName) return lookupGoldenByName(index, cardName);
  return null;
}

function classifyTextMismatch(
  storedText: string,
  goldenText: string,
  goldenCard: GoldenCatalogOracleCard,
  index: GoldenCatalogIndex,
): IdentityMismatchCategory {
  const normStored = normalizeOracleTextForCompare(storedText);
  const normGolden = normalizeOracleTextForCompare(goldenText);
  if (normStored === normGolden) return "serialization_only_difference";

  const textOwners = findCardsWithOracleText(index, storedText).filter(
    (c) => c.oracleId !== goldenCard.oracleId,
  );
  if (textOwners.length > 0) return "text_from_different_card";

  if (normStored.length > 20 && normGolden.includes(normStored.slice(0, 40))) {
    return "stale_oracle_text";
  }

  return "wrong_oracle_text";
}

export function auditEvalCaseIdentity(input: {
  testCase: OracleActionEvalCaseV2;
  dataset: string;
  cardName: string | undefined;
  catalog: GoldenCatalogIndex;
}): IdentityAuditCaseResult {
  const { testCase, dataset, cardName, catalog } = input;
  const mismatches: IdentityMismatch[] = [];
  const storedCardName =
    (testCase as { cardName?: string }).cardName ?? cardName ?? testCase.id;

  if (isSyntheticEvalCaseId(testCase.id)) {
    return {
      caseId: testCase.id,
      dataset,
      exactMatch: true,
      isSynthetic: true,
      mismatches: [],
    };
  }

  const golden = resolveGoldenCard(catalog, testCase, storedCardName);

  if (!golden) {
    if (!cardName || cardName === testCase.id) {
      return {
        caseId: testCase.id,
        dataset,
        exactMatch: true,
        isSynthetic: true,
        mismatches: [],
      };
    }
    mismatches.push({
      caseId: testCase.id,
      dataset,
      storedCardName,
      storedOracleId: testCase.oracleId,
      goldenCardName: null,
      goldenOracleId: null,
      storedText: testCase.oracleText,
      goldenText: null,
      classification: "wrong_card_name",
      likelyRootCause: `Card name "${storedCardName}" not found in catalogOracleCards.`,
    });
    return { caseId: testCase.id, dataset, exactMatch: false, isSynthetic: false, mismatches };
  }

  const goldenText = combinedGoldenOracleText(golden);
  const normStored = normalizeOracleTextForCompare(testCase.oracleText);
  const normGolden = normalizeOracleTextForCompare(goldenText);

  if (testCase.oracleId !== golden.oracleId) {
    mismatches.push({
      caseId: testCase.id,
      dataset,
      storedCardName,
      storedOracleId: testCase.oracleId,
      goldenCardName: golden.canonicalName,
      goldenOracleId: golden.oracleId,
      storedText: testCase.oracleText,
      goldenText,
      classification: "wrong_oracle_id",
      likelyRootCause:
        "Generator assigned synthetic oracleId instead of catalog oracleId from catalogOracleCards.",
    });
  }

  if (storedCardName !== golden.canonicalName) {
    mismatches.push({
      caseId: testCase.id,
      dataset,
      storedCardName,
      storedOracleId: testCase.oracleId,
      goldenCardName: golden.canonicalName,
      goldenOracleId: golden.oracleId,
      storedText: testCase.oracleText,
      goldenText,
      classification: "wrong_card_name",
      likelyRootCause: "Seed card name does not match golden canonicalName for resolved oracleId.",
    });
  }

  if (testCase.layout && golden.layout && testCase.layout !== golden.layout) {
    mismatches.push({
      caseId: testCase.id,
      dataset,
      storedCardName,
      storedOracleId: testCase.oracleId,
      goldenCardName: golden.canonicalName,
      goldenOracleId: golden.oracleId,
      storedText: testCase.oracleText,
      goldenText,
      classification: "wrong_layout",
      likelyRootCause: `Seed layout "${testCase.layout}" does not match catalog layout "${golden.layout}".`,
      details: `stored=${testCase.layout} golden=${golden.layout}`,
    });
  }

  if (normStored !== normGolden) {
    const classification = classifyTextMismatch(testCase.oracleText, goldenText, golden, catalog);
    const textOwners = findCardsWithOracleText(catalog, testCase.oracleText);
    mismatches.push({
      caseId: testCase.id,
      dataset,
      storedCardName,
      storedOracleId: testCase.oracleId,
      goldenCardName: golden.canonicalName,
      goldenOracleId: golden.oracleId,
      storedText: testCase.oracleText,
      goldenText,
      classification,
      likelyRootCause:
        classification === "text_from_different_card"
          ? `Stored oracle text matches catalog text for: ${textOwners.map((c) => c.canonicalName).join(", ")}`
          : "Seed file provided hand-authored oracle text that was not validated against catalogOracleCards.",
      details:
        classification === "text_from_different_card"
          ? `textOwnerOracleIds=${textOwners.map((c) => c.oracleId).join(",")}`
          : undefined,
    });
  }

  const goldenFaces = goldenFaceRecords(golden);
  if (testCase.expectedFaces?.length) {
    for (const expected of testCase.expectedFaces) {
      const goldenFace = goldenFaces[expected.faceIndex];
      if (!goldenFace) continue;
      if (expected.faceName && goldenFace.faceName !== expected.faceName) {
        mismatches.push({
          caseId: testCase.id,
          dataset,
          storedCardName,
          storedOracleId: testCase.oracleId,
          goldenCardName: golden.canonicalName,
          goldenOracleId: golden.oracleId,
          storedText: expected.faceName,
          goldenText: goldenFace.faceName,
          classification: "wrong_face_name",
          likelyRootCause: "expectedFaces.faceName does not match catalog cardFaces name.",
        });
      }
    }
  }

  if (testCase.cardFace && golden.cardFaces?.length) {
    const faceIdx = testCase.cardFace === "back" ? 1 : 0;
    const goldenFaceText = goldenFaces[faceIdx]?.oracleText;
    if (goldenFaceText) {
      const storedHasFaceOnly =
        !normStored.includes("\n//\n") &&
        normStored !== normGolden &&
        normalizeOracleTextForCompare(goldenFaceText) !== normStored;
      if (storedHasFaceOnly) {
        mismatches.push({
          caseId: testCase.id,
          dataset,
          storedCardName,
          storedOracleId: testCase.oracleId,
          goldenCardName: golden.canonicalName,
          goldenOracleId: golden.oracleId,
          storedText: testCase.oracleText,
          goldenText: goldenFaceText,
          classification: "wrong_face_text",
          likelyRootCause: "Stored text does not match catalog face oracle text for cardFace side.",
        });
      }
    }
  }

  const storedColorIdentity = (testCase as OracleActionEvalCaseV2 & { colorIdentity?: string[] }).colorIdentity;
  if (storedColorIdentity?.length) {
    const goldenCi = goldenColorIdentity(golden);
    if (!arraysEqual([...storedColorIdentity].sort(), goldenCi)) {
      mismatches.push({
        caseId: testCase.id,
        dataset,
        storedCardName,
        storedOracleId: testCase.oracleId,
        goldenCardName: golden.canonicalName,
        goldenOracleId: golden.oracleId,
        storedText: storedColorIdentity.join(""),
        goldenText: goldenCi.join(""),
        classification: "wrong_oracle_text",
        likelyRootCause: "Stored colorIdentity does not match golden catalog colorIdentity.",
        details: "colorIdentity mismatch",
      });
    }
  }

  const substantive = mismatches.filter((m) => m.classification !== "serialization_only_difference");
  return {
    caseId: testCase.id,
    dataset,
    exactMatch: substantive.length === 0,
    isSynthetic: false,
    mismatches: substantive,
  };
}

export function summarizeIdentityAudit(results: IdentityAuditCaseResult[]): IdentityAuditSummary {
  const mismatchCountByDataset: Record<string, number> = {};
  const mismatchCountByCategory = {} as Record<IdentityMismatchCategory, number>;
  const allMismatches: IdentityMismatch[] = [];

  for (const result of results) {
    if (result.mismatches.length === 0) continue;
    mismatchCountByDataset[result.dataset] = (mismatchCountByDataset[result.dataset] ?? 0) + 1;
    for (const mismatch of result.mismatches) {
      mismatchCountByCategory[mismatch.classification] =
        (mismatchCountByCategory[mismatch.classification] ?? 0) + 1;
      allMismatches.push(mismatch);
    }
  }

  return {
    totalCasesChecked: results.length,
    exactMatchCases: results.filter((r) => r.exactMatch).length,
    mismatchCountByDataset,
    mismatchCountByCategory,
    caseResults: results,
    allMismatches,
  };
}
