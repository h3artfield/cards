/**
 * Structural block model for v1.27 parser — LoyaltyAbility, ModalOption, TokenCreatedObject.
 * Builds explicit spans from segmented abilities; validates action containment invariants.
 */
import { segmentAbilities, type SegmentedAbility } from "./oracle-ability-segmentation";

export interface LoyaltyClause {
  text: string;
  localStart: number;
  localEnd: number;
}

export interface LoyaltyAbility {
  abilityId: string;
  loyaltyCost: string;
  startOffset: number;
  endOffset: number;
  fullAbilityText: string;
  abilityIndex: number;
  clauses: LoyaltyClause[];
}

export interface ModalOption {
  optionId: string;
  optionCost?: string;
  startOffset: number;
  endOffset: number;
  fullOptionText: string;
  abilityIndex: number;
  clauses: LoyaltyClause[];
}

export interface ModalAbility {
  chooseConstraints?: string;
  chooseCount?: number;
  options: ModalOption[];
  headerAbilityIndex?: number;
}

export interface TokenCreatedObject {
  createdObjectId: string;
  tokenCopyOf?: string;
  createActionEvidence: string;
  evidenceStart: number;
  evidenceEnd: number;
}

export interface DelayedActionRef {
  referentObjectId: string;
  timingCondition: string;
  actionType: string;
  evidenceText: string;
}

const LOYALTY_LINE = /^[+\u2212-](?:\d+|X):/m;
const SPREE_OPTION = /^\+(?:\s*\{[^}]+\})+\s*—\s*/m;
const MODAL_BULLET = /^•\s/m;

function splitClauses(text: string): LoyaltyClause[] {
  const parts = text.split(/(?<=\.)\s+(?=[A-Z"(])/);
  let cursor = 0;
  return parts.map((part) => {
    const idx = text.indexOf(part, cursor);
    const localStart = idx >= 0 ? idx : cursor;
    cursor = localStart + part.length;
    return { text: part.trim(), localStart, localEnd: localStart + part.length };
  });
}

/** Build loyalty ability blocks from face text. */
export function buildLoyaltyAbilities(
  oracleId: string,
  cardFaceId: string,
  faceText: string,
  faceStartOffset = 0,
): LoyaltyAbility[] {
  const abilities = segmentAbilities(oracleId, cardFaceId, faceText, faceStartOffset);
  const blocks: LoyaltyAbility[] = [];
  for (const a of abilities) {
    if (!a.loyaltyCost) continue;
    blocks.push({
      abilityId: a.abilityId,
      loyaltyCost: a.loyaltyCost,
      startOffset: a.paragraphStart,
      endOffset: a.paragraphEnd,
      fullAbilityText: a.paragraphText,
      abilityIndex: a.abilityIndex,
      clauses: splitClauses(a.paragraphText.replace(/^[+\u2212-](?:\d+|X):\s*/, "")),
    });
  }
  return blocks;
}

/** Build modal/spree option blocks including Spree + {cost} — lines. */
export function buildModalOptions(
  oracleId: string,
  cardFaceId: string,
  faceText: string,
  faceStartOffset = 0,
): ModalAbility[] {
  const abilities = segmentAbilities(oracleId, cardFaceId, faceText, faceStartOffset);
  const groups: ModalAbility[] = [];
  let current: ModalAbility | null = null;

  // Direct line scan for Spree blocks (segmentation may not tag + {cost} — lines)
  const lines = faceText.split("\n");
  let lineOffset = faceStartOffset;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Spree\b/i.test(trimmed)) {
      if (current && current.options.length > 0) groups.push(current);
      current = { chooseConstraints: trimmed, options: [] };
      lineOffset += line.length + 1;
      continue;
    }
    const spreeLine = trimmed.match(/^(\+(?:\s*\{[^}]+\})+)\s*—\s*(.+)$/s);
    if (spreeLine && current) {
      const localStart = faceText.indexOf(line);
      current.options.push({
        optionId: `opt-${current.options.length + 1}`,
        optionCost: spreeLine[1].trim(),
        startOffset: faceStartOffset + Math.max(0, localStart),
        endOffset: faceStartOffset + Math.max(0, localStart) + line.length,
        fullOptionText: trimmed,
        abilityIndex: current.options.length,
        clauses: splitClauses(spreeLine[2]),
      });
    }
    lineOffset += line.length + 1;
  }
  if (current && current.options.length > 0) groups.push(current);

  for (const a of abilities) {
    const trimmed = a.paragraphText.trim();
    if (/^Choose (?:one|two|three|\d+)/i.test(trimmed)) {
      const existing = groups.find((g) => g.chooseConstraints?.startsWith("Choose"));
      if (existing) continue;
      groups.push({
        chooseConstraints: trimmed,
        chooseCount: a.modalChooseCount,
        options: [],
        headerAbilityIndex: a.abilityIndex,
      });
      continue;
    }
    if (a.modalOptionId) {
      let group = groups.find((g) => g.chooseConstraints?.startsWith("Choose"));
      if (!group) {
        group = { chooseConstraints: "Choose one", options: [] };
        groups.push(group);
      }
      group.options.push({
        optionId: a.modalOptionId,
        startOffset: a.paragraphStart,
        endOffset: a.paragraphEnd,
        fullOptionText: trimmed,
        abilityIndex: a.abilityIndex,
        clauses: splitClauses(trimmed.replace(/^•\s*/, "")),
      });
    }
  }

  return groups.filter((g) => g.options.length > 0);
}

/** Hard invariant: action evidence span must lie within owning loyalty ability span. */
export function actionWithinLoyaltyBlock(
  action: { evidenceStart: number; evidenceEnd: number; loyaltyCost?: string },
  blocks: LoyaltyAbility[],
): { ok: boolean; owningBlock?: LoyaltyAbility; reason?: string } {
  if (!action.loyaltyCost) return { ok: true };
  const owner = blocks.find(
    (b) =>
      b.loyaltyCost === action.loyaltyCost &&
      action.evidenceStart >= b.startOffset &&
      action.evidenceEnd <= b.endOffset,
  );
  if (!owner) {
    return { ok: false, reason: "evidence_span_outside_loyalty_block" };
  }
  return { ok: true, owningBlock: owner };
}

/** Hard invariant: action must lie within owning modal option span. */
export function actionWithinModalOption(
  action: { evidenceStart: number; evidenceEnd: number; modalOptionId?: string },
  groups: ModalAbility[],
): { ok: boolean; owningOption?: ModalOption; reason?: string } {
  if (!action.modalOptionId) return { ok: true };
  for (const g of groups) {
    const opt = g.options.find(
      (o) =>
        o.optionId === action.modalOptionId &&
        action.evidenceStart >= o.startOffset &&
        action.evidenceEnd <= o.endOffset,
    );
    if (opt) return { ok: true, owningOption: opt };
  }
  return { ok: false, reason: "evidence_span_outside_modal_option" };
}

/** Parse token-copy referent from create-token evidence. */
export function parseTokenCopyOf(evidenceText: string): string | undefined {
  const m = evidenceText.match(/\btoken that'?s a copy of (.+)$/is);
  return m?.[1]?.trim();
}

/** True when evidence is spell/object copy primitive, not token-as-copy creation. */
export function isSpellCopyPrimitive(evidenceText: string): boolean {
  return /\bCopy target (?:instant|sorcery|spell|triggered|activated)\b/i.test(evidenceText);
}

export function isTokenCopyCreation(evidenceText: string): boolean {
  return /\bCreate a token that's a copy of\b/i.test(evidenceText);
}

/** Find modal option whose span fully contains evidence. */
export function findModalOptionForSpan(
  groups: ModalAbility[],
  evidenceStart: number,
  evidenceEnd: number,
): ModalOption | undefined {
  for (const g of groups) {
    for (const o of g.options) {
      if (evidenceStart >= o.startOffset && evidenceEnd <= o.endOffset) return o;
    }
  }
  return undefined;
}

/** Find loyalty block whose span fully contains evidence. */
export function findLoyaltyBlockForSpan(
  blocks: LoyaltyAbility[],
  evidenceStart: number,
  evidenceEnd: number,
): LoyaltyAbility | undefined {
  return blocks.find((b) => evidenceStart >= b.startOffset && evidenceEnd <= b.endOffset);
}

export interface StructuralActionLike {
  evidenceStart: number;
  evidenceEnd: number;
  evidenceText: string;
  faceId: string;
  actionType: string;
  loyaltyCost?: string;
  modalOptionId?: string;
  modalOptionEvidence?: string;
  abilityId?: string;
  abilityIndex?: number;
  tokenCopyOf?: string;
  referentObject?: string;
  referentActionId?: string;
  delayedEffect?: boolean;
  timingCondition?: string;
  actionId?: string;
  reviewStatus?: string;
}

/** Apply v1.27 structural invariants: span ownership, modal/loyalty tagging, token-copy taxonomy. */
export function applyStructuralBlockInvariants<T extends StructuralActionLike>(
  actions: T[],
  faces: Array<{ faceId: string; text: string; start: number }>,
  oracleId: string,
  segmentedAbilities?: Array<{
    cardFaceId: string;
    abilityIndex: number;
    paragraphStart: number;
    paragraphEnd: number;
  }>,
): T[] {
  const kept: T[] = [];
  let createdObjectSeq = 0;
  const tokenObjectByActionId = new Map<string, string>();

  for (const face of faces) {
    const loyaltyBlocks = buildLoyaltyAbilities(oracleId, face.faceId, face.text, face.start);
    const modalGroups = buildModalOptions(oracleId, face.faceId, face.text, face.start);
    const faceActions = actions.filter((a) => a.faceId === face.faceId);

    for (const action of faceActions) {
      if (isSpreeCostLine(action.evidenceText)) continue;

      const modalOpt = findModalOptionForSpan(modalGroups, action.evidenceStart, action.evidenceEnd);
      const loyaltyBlock = findLoyaltyBlockForSpan(loyaltyBlocks, action.evidenceStart, action.evidenceEnd);

      const updated = { ...action } as T;

      if (loyaltyBlock) {
        updated.loyaltyCost = loyaltyBlock.loyaltyCost;
        updated.abilityId = loyaltyBlock.abilityId;
      }

      if (modalOpt) {
        updated.modalOptionId = modalOpt.optionId;
        updated.modalOptionEvidence = modalOpt.fullOptionText;
      }

      const seg = segmentedAbilities?.find(
        (a) =>
          a.cardFaceId === face.faceId &&
          action.evidenceStart >= a.paragraphStart &&
          action.evidenceEnd <= a.paragraphEnd,
      );
      if (seg) {
        (updated as { abilityIndex?: number }).abilityIndex = seg.abilityIndex;
      } else if (loyaltyBlock) {
        (updated as { abilityIndex?: number }).abilityIndex = loyaltyBlock.abilityIndex;
      } else if (modalOpt && segmentedAbilities) {
        const optSeg = segmentedAbilities.find(
          (a) =>
            a.cardFaceId === face.faceId &&
            modalOpt.startOffset >= a.paragraphStart &&
            modalOpt.endOffset <= a.paragraphEnd,
        );
        if (optSeg) (updated as { abilityIndex?: number }).abilityIndex = optSeg.abilityIndex;
      }

      if (updated.loyaltyCost && loyaltyBlock && updated.loyaltyCost !== loyaltyBlock.loyaltyCost) {
        continue;
      }
      if (updated.loyaltyCost && !loyaltyBlock) {
        const tagged = loyaltyBlocks.find((b) => b.loyaltyCost === updated.loyaltyCost);
        if (
          tagged &&
          (action.evidenceStart < tagged.startOffset || action.evidenceEnd > tagged.endOffset)
        ) {
          continue;
        }
      }

      if (modalGroups.length > 0 && modalOpt) {
        const check = actionWithinModalOption(updated, modalGroups);
        if (!check.ok) continue;
      }

      if (isTokenCopyCreation(updated.evidenceText)) {
        (updated as { actionType: string }).actionType = "create_token";
        updated.tokenCopyOf = parseTokenCopyOf(updated.evidenceText);
      }

      if (updated.actionType === "create_token" && updated.tokenCopyOf && updated.actionId) {
        const objectId = `${oracleId}:${face.faceId}:created-${createdObjectSeq++}`;
        tokenObjectByActionId.set(updated.actionId, objectId);
      }

      kept.push(updated);
    }
  }

  for (const action of kept) {
    if (!action.referentObject) continue;
    const priorCreate = [...kept]
      .filter(
        (a) =>
          a.actionId !== action.actionId &&
          a.actionType === "create_token" &&
          a.evidenceEnd <= action.evidenceStart,
      )
      .pop();
    if (priorCreate?.actionId && tokenObjectByActionId.has(priorCreate.actionId)) {
      action.referentActionId = priorCreate.actionId;
    }
    if (action.delayedEffect && priorCreate?.actionId) {
      action.referentActionId = priorCreate.actionId;
    }
  }

  const faceIds = new Set(faces.map((f) => f.faceId));
  for (const action of actions) {
    if (!faceIds.has(action.faceId)) kept.push(action);
  }

  return kept.sort((a, b) => a.evidenceStart - b.evidenceStart);
}

/** Spree/modal option cost lines must not become Layer-2 actions. */
export function isSpreeCostLine(text: string): boolean {
  return SPREE_OPTION.test(text.trim()) && !/\b(?:Destroy|Return|Create|Draw|Counter|Exile|Search)\b/i.test(text);
}

export {
  LOYALTY_LINE,
  SPREE_OPTION,
  MODAL_BULLET,
};
