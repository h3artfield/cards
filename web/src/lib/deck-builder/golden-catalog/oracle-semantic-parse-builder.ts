/**
 * Builds canonical OracleSemanticParse from parser v1 output — single source of truth.
 */
import type { SegmentedAbility } from "./oracle-action-schema";
import type { OracleActionV1, OracleActionV1Result } from "./oracle-action-parser-v1";
import type { RC3ActionExtensions } from "./oracle-rc3-extraction-metadata";
import type { GrantedAbilityNode } from "./oracle-rc3-clause-native";
import { resolveActionScoringScope } from "./oracle-rc3-scoring-scope";
import { ORACLE_ACTION_PARSER_VERSION } from "./oracle-action-schema";
import {
  buildLoyaltyAbilities,
  buildModalOptions,
  type ModalAbility,
} from "./oracle-action-structural-blocks";
import {
  extractActionArguments,
  parseAdditionalCostFromLine,
  parseSpreeChoose,
  toEvidenceSpan,
} from "./oracle-action-argument-extraction";
import type {
  OracleSemanticParse,
  SemanticAbility,
  SemanticAction,
  SemanticDiagnostic,
  SemanticObjectRef,
} from "./oracle-semantic-parse-schema";
import {
  hashOracleText,
  optionOrdinalKey,
  stableAbilityId,
  stableGrantedAbilityId,
  stableGrantedClauseId,
  stableOptionId,
} from "./oracle-semantic-parse-schema";
import { segmentCardFaces } from "./oracle-ability-segmentation";

/** Synthetic segment index for inline modal containers embedded in triggered/static paragraphs. */
export const INLINE_MODAL_CONTAINER_INDEX_BASE = 10_000;

export function inlineModalContainerIndex(chooseCardStart: number): number {
  return INLINE_MODAL_CONTAINER_INDEX_BASE + chooseCardStart;
}

function dedicatedModalHeaderSegment(seg: SegmentedAbility | undefined): boolean {
  return !!seg && /^Choose (?:one|two|three|\d+|any number)/i.test(seg.paragraphText.trim());
}

function findSegmentForSpan(
  abilities: SegmentedAbility[],
  faceId: string,
  start: number,
  end: number,
): SegmentedAbility | undefined {
  return abilities.find(
    (a) =>
      a.cardFaceId === faceId &&
      start >= a.paragraphStart &&
      end <= a.paragraphEnd,
  );
}

function findSegmentContainingPoint(
  abilities: SegmentedAbility[],
  faceId: string,
  point: number,
): SegmentedAbility | undefined {
  return abilities.find(
    (a) => a.cardFaceId === faceId && point >= a.paragraphStart && point < a.paragraphEnd,
  );
}

function buildModalSemanticAbilities(input: {
  oracleId: string;
  faceId: string;
  faceText: string;
  faceStart: number;
  segmented: SegmentedAbility[];
  modalGroups: ModalAbility[];
}): SemanticAbility[] {
  const out: SemanticAbility[] = [];
  for (const group of input.modalGroups) {
    const headerSeg = input.segmented.find((a) =>
      group.chooseConstraints
        ? a.paragraphText.trim() === group.chooseConstraints.trim() ||
          a.paragraphText.includes(group.chooseConstraints.slice(0, 20))
        : false,
    );
    const headerIsDedicatedModal = dedicatedModalHeaderSegment(headerSeg);
    const headerIndex = headerSeg?.abilityIndex ?? group.headerAbilityIndex ?? 0;
    const isSpree = /^Spree\b/i.test(group.chooseConstraints ?? "");
    const choose = group.chooseConstraints
      ? { ...parseSpreeChoose(group.chooseConstraints), rawText: group.chooseConstraints }
      : undefined;

    const provisionalParentId = stableAbilityId(input.oracleId, input.faceId, headerIndex);
    const options = group.options.map((opt, idx) => {
      const ordinal = idx + 1;
      const seg =
        findSegmentForSpan(input.segmented, input.faceId, opt.startOffset, opt.endOffset) ??
        findSegmentContainingPoint(input.segmented, input.faceId, opt.startOffset + 1);
      const segmentAbilityIndex = seg?.abilityIndex ?? headerIndex + ordinal;
      const optionId = stableOptionId(provisionalParentId, ordinal);
      const additionalCost = parseAdditionalCostFromLine(opt.fullOptionText, opt.startOffset);
      return {
        optionId,
        ordinal,
        segmentAbilityIndex,
        additionalCost,
        optionSpan: toEvidenceSpan(opt.fullOptionText, opt.startOffset, opt.endOffset),
        clauseIds: [`${optionId}:clause-0`],
      };
    });
    if (options.length === 0) continue;

    const chooseCardStart = (() => {
      const chooseMatch = group.chooseConstraints?.match(/choose (?:one|two|three|\d+|any number)/i);
      if (!chooseMatch) return options[0]!.optionSpan.cardStart;
      const faceSlice = input.faceText.slice(0, Math.max(0, options[0]!.optionSpan.cardStart - input.faceStart));
      const rel = faceSlice.lastIndexOf(chooseMatch[0]);
      return rel >= 0 ? input.faceStart + rel : options[0]!.optionSpan.cardStart;
    })();

    const containerAbilityIndex = headerIsDedicatedModal
      ? headerIndex
      : inlineModalContainerIndex(chooseCardStart);
    const parentAbilityId = stableAbilityId(input.oracleId, input.faceId, containerAbilityIndex);

    for (const opt of options) {
      opt.optionId = stableOptionId(parentAbilityId, opt.ordinal);
      opt.clauseIds = [`${opt.optionId}:clause-0`];
    }

    const chooseEnd = chooseCardStart + (group.chooseConstraints?.length ?? 0);
    const modalSpanStart = headerIsDedicatedModal && headerSeg ? headerSeg.paragraphStart : chooseCardStart;
    const modalSpanText =
      headerIsDedicatedModal && headerSeg
        ? headerSeg.paragraphText
        : `${group.chooseConstraints ?? "Choose one"}\n${options.map((o) => o.optionSpan.text).join("\n")}`;

    out.push({
      abilityId: parentAbilityId,
      segmentAbilityIndex: containerAbilityIndex,
      faceId: input.faceId,
      abilityType: "modal",
      mechanic: isSpree ? "spree" : "none",
      choose: choose
        ? {
            ...choose,
            evidence: toEvidenceSpan(group.chooseConstraints ?? "", chooseCardStart, chooseEnd),
          }
        : undefined,
      options,
      abilitySpan: toEvidenceSpan(
        modalSpanText,
        modalSpanStart,
        options[options.length - 1]!.optionSpan.cardEnd,
      ),
      clauseIds: [],
    });
  }
  return out;
}

function buildLoyaltySemanticAbilities(input: {
  oracleId: string;
  faceId: string;
  faceText: string;
  faceStart: number;
  segmented: SegmentedAbility[];
}): SemanticAbility[] {
  const blocks = buildLoyaltyAbilities(input.oracleId, input.faceId, input.faceText, input.faceStart);
  return blocks.map((b) => {
    const seg = findSegmentForSpan(input.segmented, input.faceId, b.startOffset, b.endOffset);
    const segmentAbilityIndex = seg?.abilityIndex ?? b.abilityIndex;
    return {
      abilityId: stableAbilityId(input.oracleId, input.faceId, segmentAbilityIndex),
      segmentAbilityIndex,
      faceId: input.faceId,
      abilityType: "loyalty" as const,
      loyaltyCost: b.loyaltyCost,
      abilitySpan: toEvidenceSpan(b.fullAbilityText, b.startOffset, b.endOffset),
      clauseIds: b.clauses.map((_, i) => `${stableAbilityId(input.oracleId, input.faceId, segmentAbilityIndex)}:clause-${i}`),
    };
  });
}

function buildFallbackAbilities(input: {
  oracleId: string;
  segmented: SegmentedAbility[];
  coveredIds: Set<string>;
  existingAbilities: SemanticAbility[];
}): SemanticAbility[] {
  const out: SemanticAbility[] = [];
  for (const seg of input.segmented) {
    const id = stableAbilityId(input.oracleId, seg.cardFaceId, seg.abilityIndex);
    const segSpan = { cardStart: seg.paragraphStart, cardEnd: seg.paragraphEnd };
    const fullyCovered = input.existingAbilities.some((ability) => spanContains(ability.abilitySpan, segSpan));
    if (fullyCovered || input.coveredIds.has(id)) continue;
    if (/^Spree\b/i.test(seg.paragraphText.trim())) continue;
    if (/^\+(?:\s*\{[^}]+\})+\s*—/.test(seg.paragraphText.trim())) continue;
    if (seg.abilityIndex >= INLINE_MODAL_CONTAINER_INDEX_BASE) continue;
    out.push({
      abilityId: id,
      segmentAbilityIndex: seg.abilityIndex,
      faceId: seg.cardFaceId,
      abilityType: seg.abilityType === "modal" ? "modal" : (seg.abilityType as SemanticAbility["abilityType"]) ?? "spell_effect",
      loyaltyCost: seg.loyaltyCost,
      abilitySpan: toEvidenceSpan(seg.paragraphText, seg.paragraphStart, seg.paragraphEnd),
      clauseIds: [`${id}:clause-0`],
    });
    input.coveredIds.add(id);
  }
  return out;
}

function parseSegmentRef(id: string): { oracleId: string; faceId: string; segmentIdx: number } | null {
  const m = id.match(/^([0-9a-f-]+):(front|back):(\d+)$/i);
  if (!m) return null;
  return { oracleId: m[1]!, faceId: m[2] as "front" | "back", segmentIdx: Number(m[3]) };
}

function parseGrantedRef(
  id: string,
): { oracleId: string; faceId: string; segmentIdx: number; grantedLocalStart: number } | null {
  const m = id.match(/^([0-9a-f-]+):(front|back):(\d+):granted:(\d+)$/i);
  if (!m) return null;
  return {
    oracleId: m[1]!,
    faceId: m[2] as "front" | "back",
    segmentIdx: Number(m[3]),
    grantedLocalStart: Number(m[4]),
  };
}

function findModalOptionForSegment(
  abilities: SemanticAbility[],
  segmentIdx: number,
): { parentAbilityId: string; option: NonNullable<SemanticAbility["options"]>[number] } | undefined {
  for (const ability of abilities) {
    if (!ability.options?.length) continue;
    const option = ability.options.find((o) => o.segmentAbilityIndex === segmentIdx);
    if (option) return { parentAbilityId: ability.abilityId, option };
  }
  return undefined;
}

function toSemanticGrantedAbilityType(raw: string): SemanticAbility["abilityType"] {
  if (raw === "triggered") return "triggered";
  if (raw === "activated") return "activated";
  if (raw === "replacement") return "replacement";
  return "static";
}

type GrantedIdentityMaps = {
  grantedAbilities: SemanticAbility[];
  nativeGrantedIdToStable: Map<string, string>;
  nativeClauseIdToStable: Map<string, string>;
};

function buildGrantedSemanticAbilities(input: {
  grantedNodes: GrantedAbilityNode[];
  abilities: SemanticAbility[];
  segmented: SegmentedAbility[];
}): GrantedIdentityMaps {
  const nativeGrantedIdToStable = new Map<string, string>();
  const nativeClauseIdToStable = new Map<string, string>();
  const grantedAbilities: SemanticAbility[] = [];
  const seenStable = new Set<string>();

  for (const node of input.grantedNodes) {
    const nativeGrantedId = `${node.grantingClauseId}:granted:${node.quotedSpan.start}`;
    const grantedRef = parseGrantedRef(nativeGrantedId);
    if (!grantedRef) continue;
    const segmentRef = parseSegmentRef(node.grantingClauseId);
    if (!segmentRef) continue;

    const modalHost = findModalOptionForSegment(input.abilities, segmentRef.segmentIdx);
    const hostAbilityId = modalHost?.option.optionId ?? stableAbilityId(
      segmentRef.oracleId,
      segmentRef.faceId,
      segmentRef.segmentIdx,
    );
    const stableGrantedId = stableGrantedAbilityId(hostAbilityId, grantedRef.grantedLocalStart);
    if (seenStable.has(stableGrantedId)) continue;
    seenStable.add(stableGrantedId);
    nativeGrantedIdToStable.set(nativeGrantedId, stableGrantedId);

    const stableClauseIds = node.nestedAbilityBlock.clauses.map((clause, idx) => {
      const stableClauseId = stableGrantedClauseId(stableGrantedId, idx);
      nativeClauseIdToStable.set(clause.clauseId, stableClauseId);
      return stableClauseId;
    });

    const hostSegment = input.segmented.find(
      (seg) => seg.cardFaceId === segmentRef.faceId && seg.abilityIndex === segmentRef.segmentIdx,
    );
    const quoteStart = (hostSegment?.paragraphStart ?? 0) + node.quotedSpan.start;
    const quoteEnd = (hostSegment?.paragraphStart ?? 0) + node.quotedSpan.end;

    grantedAbilities.push({
      abilityId: stableGrantedId,
      segmentAbilityIndex: segmentRef.segmentIdx,
      faceId: segmentRef.faceId,
      abilityType: toSemanticGrantedAbilityType(node.nestedAbilityBlock.abilityType),
      abilitySpan: toEvidenceSpan(node.quotedSpan.text, quoteStart, quoteEnd),
      clauseIds: stableClauseIds,
    });
  }

  return { grantedAbilities, nativeGrantedIdToStable, nativeClauseIdToStable };
}

function resolveGrantedEffectClauseId(
  grantedAbility: SemanticAbility,
  action: OracleActionV1,
  nativeClauseIdToStable: Map<string, string>,
): string | undefined {
  if (action.clauseId && nativeClauseIdToStable.has(action.clauseId)) {
    return nativeClauseIdToStable.get(action.clauseId);
  }
  if (action.clauseId?.includes(":granted:")) {
    const nativeGrantedClause = action.clauseId;
    if (nativeClauseIdToStable.has(nativeGrantedClause)) {
      return nativeClauseIdToStable.get(nativeGrantedClause);
    }
  }
  if (grantedAbility.clauseIds.length === 0) return undefined;
  if (!action.clauseId) {
    return grantedAbility.clauseIds[grantedAbility.clauseIds.length - 1];
  }
  if (
    !action.clauseId.includes(":granted:") &&
    !action.clauseId.includes(".granted-")
  ) {
    return grantedAbility.clauseIds[grantedAbility.clauseIds.length - 1];
  }
  return grantedAbility.clauseIds[grantedAbility.clauseIds.length - 1];
}

function resolveGrantedActionIdentity(
  action: OracleActionV1,
  ext: RC3ActionExtensions,
  abilities: SemanticAbility[],
  grantedMaps: GrantedIdentityMaps,
): { parentAbilityId?: string; semanticClauseId?: string; stableModalOptionId?: undefined } {
  if (ext.grantedAbilityId && grantedMaps.nativeGrantedIdToStable.has(ext.grantedAbilityId)) {
    const parentAbilityId = grantedMaps.nativeGrantedIdToStable.get(ext.grantedAbilityId)!;
    const grantedAbility = abilities.find((a) => a.abilityId === parentAbilityId);
    return {
      parentAbilityId,
      semanticClauseId: grantedAbility
        ? resolveGrantedEffectClauseId(grantedAbility, action, grantedMaps.nativeClauseIdToStable)
        : undefined,
      stableModalOptionId: undefined,
    };
  }

  if (ext.executionContext !== "granted_ability" && !action.clauseId?.includes(":granted:")) {
    return {};
  }

  for (const stableGrantedId of grantedMaps.nativeGrantedIdToStable.values()) {
    const grantedAbility = abilities.find((a) => a.abilityId === stableGrantedId);
    if (!grantedAbility) continue;
    if (
      action.evidenceStart >= grantedAbility.abilitySpan.cardStart &&
      action.evidenceEnd <= grantedAbility.abilitySpan.cardEnd
    ) {
      return {
        parentAbilityId: stableGrantedId,
        semanticClauseId: resolveGrantedEffectClauseId(grantedAbility, action, grantedMaps.nativeClauseIdToStable),
        stableModalOptionId: undefined,
      };
    }
  }

  return {};
}

function findSmallestOwningAbilityId(
  action: OracleActionV1,
  abilities: SemanticAbility[],
): string | undefined {
  const span = { cardStart: action.evidenceStart, cardEnd: action.evidenceEnd };
  let best: { id: string; size: number } | undefined;

  for (const ability of abilities) {
    for (const opt of ability.options ?? []) {
      if (!spanContains(opt.optionSpan, span)) continue;
      const size = opt.optionSpan.cardEnd - opt.optionSpan.cardStart;
      if (!best || size < best.size) best = { id: ability.abilityId, size };
    }
    if (spanContains(ability.abilitySpan, span)) {
      const size = ability.abilitySpan.cardEnd - ability.abilitySpan.cardStart;
      if (!best || size < best.size) best = { id: ability.abilityId, size };
    }
  }
  return best?.id;
}

function actionContainedInAbilityTree(
  action: OracleActionV1,
  abilities: SemanticAbility[],
  parentAbilityId: string,
): boolean {
  const span = { cardStart: action.evidenceStart, cardEnd: action.evidenceEnd };
  const parent = abilities.find((a) => a.abilityId === parentAbilityId);
  if (!parent) return false;
  if (action.modalOptionId) {
    const opt = parent.options?.find((o) => o.optionId === action.modalOptionId);
    if (opt && spanContains(opt.optionSpan, span)) return true;
  }
  return spanContains(parent.abilitySpan, span);
}

function resolveParentAbilityId(
  action: OracleActionV1,
  abilities: SemanticAbility[],
  oracleId: string,
): string {
  const bySpan = findSmallestOwningAbilityId(action, abilities);
  if (bySpan) return bySpan;

  if (action.modalOptionId) {
    const parent = abilities.find((a) =>
      a.options?.some((o) => o.optionId.endsWith(`.${action.modalOptionId}`) || o.optionId.includes(action.modalOptionId!)),
    );
    if (parent && actionContainedInAbilityTree(action, abilities, parent.abilityId)) return parent.abilityId;
    const byOrdinal = abilities.find((a) =>
      a.options?.some((o) => optionOrdinalKey(o.ordinal) === action.modalOptionId),
    );
    if (byOrdinal && actionContainedInAbilityTree(action, abilities, byOrdinal.abilityId)) return byOrdinal.abilityId;
  }
  if (action.loyaltyCost) {
    const bySpan = abilities.find(
      (a) =>
        a.abilityType === "loyalty" &&
        action.evidenceStart >= a.abilitySpan.cardStart &&
        action.evidenceEnd <= a.abilitySpan.cardEnd,
    );
    if (bySpan) return bySpan.abilityId;
    const loyalty = abilities.find(
      (a) => a.abilityType === "loyalty" && a.loyaltyCost === action.loyaltyCost,
    );
    if (loyalty && actionContainedInAbilityTree(action, abilities, loyalty.abilityId)) return loyalty.abilityId;
  }
  const modalHost = findModalOptionForSegment(abilities, action.abilityIndex);
  if (modalHost && actionContainedInAbilityTree(action, abilities, modalHost.parentAbilityId)) {
    return modalHost.parentAbilityId;
  }
  return stableAbilityId(oracleId, action.faceId, action.abilityIndex);
}

function spanContains(outer: { cardStart: number; cardEnd: number }, inner: { cardStart: number; cardEnd: number }): boolean {
  return inner.cardStart >= outer.cardStart && inner.cardEnd <= outer.cardEnd;
}

function collectRegisteredClauseIds(abilities: SemanticAbility[]): Set<string> {
  const ids = new Set<string>();
  for (const ability of abilities) {
    for (const id of ability.clauseIds) ids.add(id);
    for (const opt of ability.options ?? []) {
      for (const id of opt.clauseIds) ids.add(id);
    }
  }
  return ids;
}

function nativeModalClauseId(
  oracleId: string,
  faceId: string,
  segmentAbilityIndex: number,
  clauseIndex: number,
): string {
  return `${oracleId}:${faceId}:${segmentAbilityIndex}:clause-${clauseIndex}`;
}

function realignParentAbilityBySpan(
  action: OracleActionV1,
  abilities: SemanticAbility[],
  parentAbilityId: string,
): string {
  return findSmallestOwningAbilityId(action, abilities) ?? parentAbilityId;
}

function owningSpanForAction(
  action: SemanticAction,
  abilities: SemanticAbility[],
): { cardStart: number; cardEnd: number } | undefined {
  if (action.modalOptionId) {
    for (const ability of abilities) {
      const opt = ability.options?.find((o) => o.optionId === action.modalOptionId);
      if (opt) return opt.optionSpan;
    }
  }
  const parent = abilities.find((a) => a.abilityId === action.parentAbilityId);
  return parent?.abilitySpan;
}

function enforceAcceptedActionContainment(
  actions: SemanticAction[],
  abilities: SemanticAbility[],
  diagnostics: SemanticDiagnostic[],
): SemanticAction[] {
  return actions.map((action) => {
    if (action.reviewStatus !== "accepted") return action;
    const owner = owningSpanForAction(action, abilities);
    const span = action.provenance.actionSpan;
    if (owner && spanContains(owner, span)) return action;
    diagnostics.push({
      code: "accepted_action_outside_owner_span",
      message: `Action ${action.actionId} demoted — evidence span not contained in owning ability/option span`,
      severity: "info",
      actionId: action.actionId,
      abilityId: action.parentAbilityId,
    });
    return { ...action, reviewStatus: "needs_review" as const };
  });
}

function resolveSemanticClauseId(
  action: OracleActionV1,
  abilities: SemanticAbility[],
  parentAbilityId: string,
  stableModalOptionId?: string,
  oracleId?: string,
): string | undefined {
  const registered = collectRegisteredClauseIds(abilities);

  if (stableModalOptionId) {
    for (const ability of abilities) {
      const opt = ability.options?.find((o) => o.optionId === stableModalOptionId);
      if (opt?.clauseIds[0]) return opt.clauseIds[0];
    }
  }

  const parent = abilities.find((a) => a.abilityId === parentAbilityId);
  if (parent?.options?.length) {
    const bySegment = parent.options.find((o) => o.segmentAbilityIndex === action.abilityIndex);
    if (bySegment?.clauseIds[0]) return bySegment.clauseIds[0];

    if (oracleId && action.clauseId) {
      for (const opt of parent.options) {
        for (let i = 0; i < Math.max(opt.clauseIds.length, 1); i++) {
          if (action.clauseId === nativeModalClauseId(oracleId, parent.faceId, opt.segmentAbilityIndex, i)) {
            return opt.clauseIds[i] ?? opt.clauseIds[0];
          }
        }
      }
    }
  }

  if (action.clauseId && registered.has(action.clauseId)) return action.clauseId;
  if (parent?.clauseIds[0]) return parent.clauseIds[0];
  return undefined;
}

function resolveStableModalOptionId(
  action: OracleActionV1,
  abilities: SemanticAbility[],
): string | undefined {
  if (!action.modalOptionId) return undefined;
  for (const ability of abilities) {
    for (const opt of ability.options ?? []) {
      if (optionOrdinalKey(opt.ordinal) === action.modalOptionId) {
        return opt.optionId;
      }
      if (opt.optionId === action.modalOptionId) return opt.optionId;
    }
  }
  return action.modalOptionId;
}

export function buildOracleSemanticParse(
  result: Omit<OracleActionV1Result, "semanticParse">,
  oracleText: string,
  options?: { grantedAbilities?: GrantedAbilityNode[] },
): OracleSemanticParse {
  const faces = segmentCardFaces(oracleText);
  const abilities: SemanticAbility[] = [];
  const coveredIds = new Set<string>();
  const diagnostics: SemanticDiagnostic[] = [];

  for (const face of faces) {
    const segmented = result.abilities.filter((a) => a.cardFaceId === face.faceId);
    const modalGroups = buildModalOptions(result.oracleId, face.faceId, face.text, face.start);
    const modalAbilities = buildModalSemanticAbilities({
      oracleId: result.oracleId,
      faceId: face.faceId,
      faceText: face.text,
      faceStart: face.start,
      segmented,
      modalGroups,
    });
    for (const a of modalAbilities) {
      abilities.push(a);
      coveredIds.add(a.abilityId);
    }

    const loyaltyAbilities = buildLoyaltySemanticAbilities({
      oracleId: result.oracleId,
      faceId: face.faceId,
      faceText: face.text,
      faceStart: face.start,
      segmented,
    });
    for (const a of loyaltyAbilities) {
      if (!coveredIds.has(a.abilityId)) {
        abilities.push(a);
        coveredIds.add(a.abilityId);
      }
    }

    abilities.push(...buildFallbackAbilities({ oracleId: result.oracleId, segmented, coveredIds, existingAbilities: abilities }));
  }

  const grantedMaps = buildGrantedSemanticAbilities({
    grantedNodes: options?.grantedAbilities ?? [],
    abilities,
    segmented: result.abilities,
  });
  for (const grantedAbility of grantedMaps.grantedAbilities) {
    abilities.push(grantedAbility);
  }

  const objects: SemanticObjectRef[] = [];
  const actions: SemanticAction[] = result.actions.map((action) => {
    const ext = action as OracleActionV1 & RC3ActionExtensions;
    let parentAbilityId = resolveParentAbilityId(action, abilities, result.oracleId);
    parentAbilityId = realignParentAbilityBySpan(action, abilities, parentAbilityId);
    let stableModalOptionId = resolveStableModalOptionId(action, abilities);
    let semanticClauseId = resolveSemanticClauseId(
      action,
      abilities,
      parentAbilityId,
      stableModalOptionId,
      result.oracleId,
    );

    const grantedIdentity = resolveGrantedActionIdentity(action, ext, abilities, grantedMaps);
    if (grantedIdentity.parentAbilityId) {
      parentAbilityId = grantedIdentity.parentAbilityId;
      stableModalOptionId = grantedIdentity.stableModalOptionId;
      const grantedAbility = abilities.find((a) => a.abilityId === parentAbilityId);
      semanticClauseId =
        grantedIdentity.semanticClauseId ??
        (grantedAbility
          ? resolveGrantedEffectClauseId(grantedAbility, action, grantedMaps.nativeClauseIdToStable)
          : semanticClauseId);
    } else {
      const modalHost = findModalOptionForSegment(abilities, action.abilityIndex);
      if (modalHost) {
        stableModalOptionId = stableModalOptionId ?? modalHost.option.optionId;
        if (!semanticClauseId && modalHost.option.clauseIds[0]) {
          semanticClauseId = modalHost.option.clauseIds[0];
        }
      }
    }
    const containerText =
      abilities
        .flatMap((a) => a.options ?? [])
        .find((o) => o.optionId === stableModalOptionId)?.optionSpan.text ??
      result.abilities.find((a) => a.abilityIndex === action.abilityIndex)?.paragraphText ??
      action.evidenceText;
    const containerStart =
      abilities
        .flatMap((a) => a.options ?? [])
        .find((o) => o.optionId === stableModalOptionId)?.optionSpan.cardStart ??
      action.evidenceStart;

    const actionSpan = toEvidenceSpan(action.evidenceText, action.evidenceStart, action.evidenceEnd);
    const { arguments: args, provenance } = extractActionArguments({
      actionType: action.actionType,
      actionEvidence: actionSpan,
      containerText,
      containerCardStart: containerStart,
    });

    if (action.tokenCopyOf) {
      const objectId = `${result.oracleId}:${action.faceId}:obj-${action.actionId}`;
      objects.push({
        objectId,
        kind: "token",
        tokenCopyOf: action.tokenCopyOf,
        referentActionId: action.actionId,
      });
      args.referentObjectId = objectId;
    }

    const seg = findSegmentContainingPoint(result.abilities, action.faceId, action.evidenceStart + 1);
    const segmentAbilityIndex = seg?.abilityIndex ?? action.abilityIndex;

    if (seg && segmentAbilityIndex !== action.abilityIndex) {
      diagnostics.push({
        code: "ability_index_realigned",
        message: `Action ${action.actionId} realigned segmentAbilityIndex ${action.abilityIndex} → ${segmentAbilityIndex}`,
        severity: "info",
        actionId: action.actionId,
        abilityId: parentAbilityId,
      });
    }

    const scope = resolveActionScoringScope(action as OracleActionV1 & RC3ActionExtensions, oracleText);

    return {
      actionId: action.actionId,
      parentAbilityId,
      modalOptionId: stableModalOptionId,
      clauseId: semanticClauseId,
      segmentAbilityIndex,
      actionType: action.actionType,
      arguments: args,
      provenance,
      optionalEffect: action.optionalEffect,
      optionalCost: action.optionalCost,
      choiceGroupId: (action as OracleActionV1 & RC3ActionExtensions).choiceGroupId,
      choiceAlternativeIndex: (action as OracleActionV1 & RC3ActionExtensions).choiceAlternativeIndex,
      choiceMutuallyExclusive: (action as OracleActionV1 & RC3ActionExtensions).choiceMutuallyExclusive,
      reviewStatus: action.reviewStatus,
      parserVersion: ORACLE_ACTION_PARSER_VERSION,
      extractionSource: scope.extractionSource,
      executionContext: scope.executionContext,
      semanticOwner: scope.semanticOwner,
      cardNativeLayer2Eligible: scope.cardNativeLayer2Eligible,
    };
  });

  const containedActions = enforceAcceptedActionContainment(actions, abilities, diagnostics);

  return {
    oracleId: result.oracleId,
    oracleTextHash: hashOracleText(oracleText),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    abilities,
    actions: containedActions,
    objects,
    diagnostics,
  };
}
