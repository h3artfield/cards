/**
 * Independent validation gold certification from catalog oracle + taxonomy policy only.
 * Does NOT consult RC1 parser output or predictions.
 */
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import { inferDerivedRoles, type PrimitiveActionType } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { evidenceMatchesOracle } from "../oracle-action-eval-shared";
import type { CatalogEvalCase } from "./eval-provenance-guard";
import { HELD_OUT_SEEDS } from "../generate-oracle-action-held-out-set";
import {
  dedupeGoldPrimitives,
  derivePrimitivesFromOracleText,
} from "./catalog-oracle-gold-completer";
import { sanitizeGoldPrimitives } from "./gold-sanitize";
import { getValidationGoldAdjudication } from "./validation-oracle-adjudications";

export const VALIDATION_GOLD_CERTIFIER_ID = "validation-gold-certifier-oracle-v10";

export interface ValidationCertificationRecord {
  caseId: string;
  oracleId: string;
  cardName: string;
  faceComponent?: string;
  v9PrimitiveCount: number;
  v10PrimitiveCount: number;
  primitivesAdded: ExpectedPrimitiveAction[];
  primitivesRemoved: ExpectedPrimitiveAction[];
  evidenceCorrections: Array<{ before: string; after: string; actionType: PrimitiveActionType }>;
  faceCorrections: string[];
  changed: boolean;
  goldCompletenessStatus: "complete" | "incomplete";
  incompleteReasons: string[];
}

function heldSeedIndex(caseId: string): number | undefined {
  const m = caseId.match(/^held-(\d+)$/);
  if (!m) return undefined;
  return parseInt(m[1], 10) - 1;
}

function primitiveSignature(p: ExpectedPrimitiveAction): string {
  return `${p.actionType}|${p.evidenceContains.toLowerCase()}|${p.cardFace ?? ""}`;
}

function diffPrimitives(
  before: ExpectedPrimitiveAction[],
  after: ExpectedPrimitiveAction[],
): {
  added: ExpectedPrimitiveAction[];
  removed: ExpectedPrimitiveAction[];
  evidenceCorrections: ValidationCertificationRecord["evidenceCorrections"];
} {
  const beforeByType = new Map<string, ExpectedPrimitiveAction[]>();
  for (const p of before) {
    const list = beforeByType.get(p.actionType) ?? [];
    list.push(p);
    beforeByType.set(p.actionType, list);
  }
  const afterSigs = new Set(after.map(primitiveSignature));
  const beforeSigs = new Set(before.map(primitiveSignature));

  const added = after.filter((p) => !beforeSigs.has(primitiveSignature(p)));
  const removed = before.filter((p) => !afterSigs.has(primitiveSignature(p)));

  const evidenceCorrections: ValidationCertificationRecord["evidenceCorrections"] = [];
  for (const p of after) {
    const prior = before.find((b) => b.actionType === p.actionType && b.cardFace === p.cardFace);
    if (prior && prior.evidenceContains !== p.evidenceContains) {
      evidenceCorrections.push({
        before: prior.evidenceContains,
        after: p.evidenceContains,
        actionType: p.actionType,
      });
    }
  }
  return { added, removed, evidenceCorrections };
}

function deriveStructureFromOracle(
  oracleText: string,
  seedStructure?: OracleActionEvalCaseV2["expectedStructure"],
): OracleActionEvalCaseV2["expectedStructure"] | undefined {
  const structure: OracleActionEvalCaseV2["expectedStructure"] = { ...seedStructure };
  if (/\b(When|Whenever|At the beginning of)\b/i.test(oracleText)) {
    structure.minTriggeredAbilities = Math.max(structure.minTriggeredAbilities ?? 0, 1);
  }
  if (/\{[^}]+\}:/.test(oracleText) || /\{T\}/.test(oracleText)) {
    structure.minActivatedAbilities = Math.max(structure.minActivatedAbilities ?? 0, 1);
  }
  if (/\bYou may\b/i.test(oracleText)) structure.optional = true;
  return Object.keys(structure).length ? structure : undefined;
}

function assessOracleCompleteness(
  testCase: CatalogEvalCase,
  primitives: ExpectedPrimitiveAction[],
): { status: "complete" | "incomplete"; reasons: string[] } {
  const reasons: string[] = [];
  const corpus =
    testCase.cardFace && testCase.oracleText.includes("\n//\n")
      ? testCase.oracleText.split("\n//\n")[testCase.cardFace === "back" ? 1 : 0] ?? testCase.oracleText
      : testCase.oracleText;

  for (const p of primitives) {
    const faceCorpus =
      p.cardFace && testCase.oracleText.includes("\n//\n")
        ? testCase.oracleText.split("\n//\n")[p.cardFace === "back" ? 1 : 0] ?? testCase.oracleText
        : testCase.oracleText;
    if (!evidenceMatchesOracle(faceCorpus, p.evidenceContains)) {
      reasons.push(`Evidence "${p.evidenceContains}" not in oracle for ${p.actionType}`);
    }
  }

  const hasLayer1 =
    (testCase.expectedStructure?.minTriggeredAbilities ?? 0) > 0 ||
    (testCase.expectedStructure?.minActivatedAbilities ?? 0) > 0 ||
    (testCase.forbiddenPrimitiveActions?.length ?? 0) > 0 ||
    /\b(can't|cannot|don't|do not)\b/i.test(corpus);

  if (primitives.length === 0 && !hasLayer1) {
    const auto = derivePrimitivesFromOracleText(testCase.oracleText, testCase.cardFace);
    if (auto.length > 0) {
      reasons.push("Oracle derivation found primitives but certified set is empty");
    }
  }

  return { status: reasons.length ? "incomplete" : "complete", reasons };
}

export function certifyValidationCaseGold(input: {
  v9Case: CatalogEvalCase;
  reviewedAt: string;
}): { testCase: CatalogEvalCase; record: ValidationCertificationRecord } {
  const { v9Case, reviewedAt } = input;
  const seedIdx = heldSeedIndex(v9Case.id);
  const seed = seedIdx !== undefined ? HELD_OUT_SEEDS[seedIdx] : undefined;
  const face = seed?.face ?? v9Case.cardFace;

  let primitives = derivePrimitivesFromOracleText(v9Case.oracleText, face);
  primitives = sanitizeGoldPrimitives(v9Case.oracleText, primitives);
  primitives = dedupeGoldPrimitives(primitives);

  const adjudication = getValidationGoldAdjudication(v9Case.id);
  if (adjudication?.replace) {
    primitives = adjudication.replace;
  } else if (adjudication?.merge) {
    primitives = dedupeGoldPrimitives([...primitives, ...adjudication.merge]);
  }
  if (adjudication?.removeTypes?.length) {
    primitives = primitives.filter((p) => !adjudication.removeTypes!.includes(p.actionType));
  }

  primitives = sanitizeGoldPrimitives(v9Case.oracleText, dedupeGoldPrimitives(primitives));

  const roles = inferDerivedRoles(primitives.map((p) => p.actionType));
  const expectedStructure = deriveStructureFromOracle(v9Case.oracleText, seed?.structure ?? v9Case.expectedStructure);
  const completeness = assessOracleCompleteness(
    { ...v9Case, expectedStructure, forbiddenPrimitiveActions: seed?.forbidden ?? v9Case.forbiddenPrimitiveActions },
    primitives,
  );

  const v9Primitives = v9Case.expectedPrimitiveActions.filter((p) => !p.negative);
  const diff = diffPrimitives(v9Primitives, primitives);

  const testCase: CatalogEvalCase = {
    ...v9Case,
    cardFace: face,
    expectedPrimitiveActions: primitives,
    expectedStructure,
    expectedRoles: roles.length
      ? roles.map((role) => ({
          role,
          fromPrimitiveActions: primitives
            .map((p) => p.actionType)
            .filter((p) =>
              role === "tutor"
                ? p === "search_library"
                : role === "ramp"
                  ? p === "add_mana" || p === "put_onto_battlefield"
                  : role === "removal"
                    ? ["destroy", "exile", "deal_damage", "counter", "mill"].includes(p)
                    : role === "card_advantage"
                      ? p === "draw"
                      : role === "recursion"
                        ? ["return_to_battlefield", "play", "cast", "put_onto_battlefield"].includes(p)
                        : false,
            ),
        }))
      : undefined,
    forbiddenPrimitiveActions: seed?.forbidden ?? v9Case.forbiddenPrimitiveActions,
    goldReviewStatus: "reviewed",
    goldReviewVersion: "validation-gold-certification-v10",
    goldReviewedAt: reviewedAt,
    goldReviewer: VALIDATION_GOLD_CERTIFIER_ID,
    goldCompletenessStatus: completeness.status,
    goldCompleter: VALIDATION_GOLD_CERTIFIER_ID,
    goldCompletedAt: reviewedAt,
    invalidPriorTextDisposition: completeness.status === "complete" ? "superseded_complete" : "gold_incomplete",
    taxonomyVersion: "three-layer-v1.3",
  };

  const record: ValidationCertificationRecord = {
    caseId: v9Case.id,
    oracleId: v9Case.oracleId,
    cardName: v9Case.cardName ?? v9Case.id,
    faceComponent: face,
    v9PrimitiveCount: v9Primitives.length,
    v10PrimitiveCount: primitives.length,
    primitivesAdded: diff.added,
    primitivesRemoved: diff.removed,
    evidenceCorrections: diff.evidenceCorrections,
    faceCorrections: face !== v9Case.cardFace && v9Case.cardFace ? [`${v9Case.cardFace} → ${face}`] : [],
    changed:
      diff.added.length > 0 ||
      diff.removed.length > 0 ||
      diff.evidenceCorrections.length > 0 ||
      face !== v9Case.cardFace,
    goldCompletenessStatus: completeness.status,
    incompleteReasons: completeness.reasons,
  };

  return { testCase, record };
}
