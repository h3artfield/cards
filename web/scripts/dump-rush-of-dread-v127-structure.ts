/**
 * Dump v1.27 structured output for Rush of Dread — read-only inspection.
 */
import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import {
  buildModalOptions,
  isSpreeCostLine,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-structural-blocks";
import { segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const envelope = JSON.parse(
  readFileSync("data/oracle-action-eval-development-generalization-expansion-v4.json", "utf8"),
) as { cases: OracleActionEvalCaseV2[] };
const testCase = envelope.cases.find((c) => c.cardName === "Rush of Dread")!;

const { oracleId, oracleText } = testCase;
const result = extractOracleActionsV1({ oracleId, oracleText });
const faces = segmentCardFaces(oracleText);
const face = faces[0];

const modalGroups = buildModalOptions(oracleId, face.faceId, face.text, face.start);

const acceptedActions = result.actions.filter((a) => a.reviewStatus === "accepted");
const structureAnnotations = result.structureAnnotations;

function parseChooseConstraint(header?: string) {
  if (!header) return null;
  if (/Choose one or more additional costs/i.test(header)) {
    return { abilityType: "modal/spree", choose: "one_or_more" };
  }
  if (/Choose one/i.test(header)) return { abilityType: "modal", choose: "one" };
  return { abilityType: "unknown", choose: header };
}

function parseOptionCost(optionCost?: string) {
  if (!optionCost) return null;
  const m = optionCost.match(/\+(?:\s*\{([^}]+)\})+/);
  if (!m) return { raw: optionCost };
  const costs = [...optionCost.matchAll(/\{([^}]+)\}/g)].map((x) => x[1]);
  return { raw: optionCost, manaSymbols: costs };
}

function inferActionFields(evidenceText: string) {
  const rounding = /rounded up/i.test(evidenceText) ? "up" : undefined;
  if (/\bsacrifices?\b/i.test(evidenceText)) {
    return {
      primitive: "sacrifice",
      target: /Target opponent/i.test(evidenceText) ? "opponent" : undefined,
      quantity: /half the creatures they control/i.test(evidenceText)
        ? "half creatures they control"
        : undefined,
      rounding,
    };
  }
  if (/\bdiscards?\b/i.test(evidenceText)) {
    return {
      primitive: "discard",
      target: /Target opponent/i.test(evidenceText) ? "opponent" : undefined,
      quantity: /half the cards in their hand/i.test(evidenceText) ? "half cards in hand" : undefined,
      rounding,
    };
  }
  if (/\bloses?\b.*\blife\b/i.test(evidenceText)) {
    return {
      primitive: "lose_life",
      target: /Target opponent/i.test(evidenceText) ? "opponent" : undefined,
      quantity: /half their life/i.test(evidenceText) ? "half life total" : undefined,
      rounding,
    };
  }
  return { primitive: "unknown" };
}

const spreeGroup = modalGroups[0];
const chooseInfo = parseChooseConstraint(spreeGroup?.chooseConstraints);

const fullCard = {
  parserVersion: ORACLE_ACTION_PARSER_VERSION,
  cardName: testCase.cardName,
  oracleId,
  oracleText,
  abilityType: chooseInfo?.abilityType ?? "modal/spree",
  choose: chooseInfo?.choose ?? "one_or_more",
  modalAbilityHeader: spreeGroup?.chooseConstraints,
  options: (spreeGroup?.options ?? []).map((opt) => {
    const cost = parseOptionCost(opt.optionCost);
    const optionActions = acceptedActions.filter((a) => a.modalOptionId === opt.optionId);
    const costLineIsLayer2Action = acceptedActions.some(
      (a) =>
        a.modalOptionId === opt.optionId &&
        isSpreeCostLine(a.evidenceText) &&
        !/\b(?:Destroy|Return|Create|Draw|Counter|Exile|Search|sacrific|discard|lose)\b/i.test(a.evidenceText),
    );
    return {
      optionId: opt.optionId,
      layer1: {
        optionCost: cost,
        optionCostStoredAsLayer1: true,
        optionCostEmittedAsLayer2Action: costLineIsLayer2Action,
        optionSpan: {
          startOffset: opt.startOffset,
          endOffset: opt.endOffset,
          fullOptionText: opt.fullOptionText,
        },
      },
      layer2Actions: optionActions.map((a) => ({
        actionType: a.actionType,
        ...inferActionFields(a.evidenceText),
        evidenceText: a.evidenceText,
        evidenceSpan: {
          cardEvidenceStart: a.cardEvidenceStart,
          cardEvidenceEnd: a.cardEvidenceEnd,
          evidenceStart: a.evidenceStart,
          evidenceEnd: a.evidenceEnd,
        },
        modalOptionId: a.modalOptionId,
        modalOptionEvidence: a.modalOptionEvidence,
        abilityIndex: a.abilityIndex,
        reviewStatus: a.reviewStatus,
      })),
    };
  }),
  allAcceptedActions: acceptedActions.map((a) => ({
    actionType: a.actionType,
    evidenceText: a.evidenceText,
    evidenceSpan: [a.evidenceStart, a.evidenceEnd],
    modalOptionId: a.modalOptionId,
    loyaltyCost: a.loyaltyCost,
    isSpreeCostLine: isSpreeCostLine(a.evidenceText),
  })),
  structureAnnotations: structureAnnotations.map((a) => ({
    kind: a.kind,
    evidenceText: a.evidenceText,
    evidenceSpan: [a.evidenceStart, a.evidenceEnd],
    textRole: a.textRole,
  })),
  segmentedAbilities: result.abilities.map((a) => ({
    abilityIndex: a.abilityIndex,
    loyaltyCost: a.loyaltyCost,
    modalOptionId: a.modalOptionId,
    modalChooseCount: a.modalChooseCount,
    paragraphStart: a.paragraphStart,
    paragraphEnd: a.paragraphEnd,
    paragraphText: a.paragraphText,
  })),
};

console.log(JSON.stringify(fullCard, null, 2));
