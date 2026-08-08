/**
 * Builds canonical OracleSemanticParse from parser v1 output — single source of truth.
 */
import type { SegmentedAbility } from "./oracle-action-schema";
import type { OracleActionV1, OracleActionV1Result } from "./oracle-action-parser-v1";
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
  stableOptionId,
} from "./oracle-semantic-parse-schema";
import { segmentCardFaces } from "./oracle-ability-segmentation";

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
    const headerIndex = headerSeg?.abilityIndex ?? group.headerAbilityIndex ?? 0;
    const parentAbilityId = stableAbilityId(input.oracleId, input.faceId, headerIndex);
    const isSpree = /^Spree\b/i.test(group.chooseConstraints ?? "");
    const choose = group.chooseConstraints
      ? { ...parseSpreeChoose(group.chooseConstraints), rawText: group.chooseConstraints }
      : undefined;

    if (headerSeg) {
      out.push({
        abilityId: parentAbilityId,
        segmentAbilityIndex: headerIndex,
        faceId: input.faceId,
        abilityType: "modal",
        mechanic: isSpree ? "spree" : "none",
        choose: choose
          ? {
              ...choose,
              evidence: toEvidenceSpan(
                headerSeg.paragraphText,
                headerSeg.paragraphStart,
                headerSeg.paragraphEnd,
              ),
            }
          : undefined,
        abilitySpan: toEvidenceSpan(
          headerSeg.paragraphText,
          headerSeg.paragraphStart,
          headerSeg.paragraphEnd,
        ),
        clauseIds: [],
      });
    }

    const options = group.options.map((opt, idx) => {
      const ordinal = idx + 1;
      const seg =
        findSegmentForSpan(input.segmented, input.faceId, opt.startOffset, opt.endOffset) ??
        findSegmentContainingPoint(input.segmented, input.faceId, opt.startOffset + 1);
      const segmentAbilityIndex = seg?.abilityIndex ?? headerIndex + ordinal;
      const optionId = stableOptionId(parentAbilityId, ordinal);
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

    const container = out.find((a) => a.abilityId === parentAbilityId);
    if (container) {
      container.options = options;
    } else if (options.length > 0) {
      out.push({
        abilityId: parentAbilityId,
        segmentAbilityIndex: headerIndex,
        faceId: input.faceId,
        abilityType: "modal",
        mechanic: isSpree ? "spree" : "none",
        choose: choose
          ? {
              ...choose,
              evidence: toEvidenceSpan(
                group.chooseConstraints ?? "",
                options[0]?.optionSpan.cardStart ?? input.faceStart,
                (options[0]?.optionSpan.cardStart ?? input.faceStart) +
                  (group.chooseConstraints?.length ?? 0),
              ),
            }
          : undefined,
        options,
        abilitySpan: toEvidenceSpan(
          group.chooseConstraints ?? options.map((o) => o.optionSpan.text).join("\n"),
          options[0]?.optionSpan.cardStart ?? input.faceStart,
          options[options.length - 1]?.optionSpan.cardEnd ?? input.faceStart,
        ),
        clauseIds: [],
      });
    }
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
}): SemanticAbility[] {
  const out: SemanticAbility[] = [];
  for (const seg of input.segmented) {
    const id = stableAbilityId(input.oracleId, seg.cardFaceId, seg.abilityIndex);
    if (input.coveredIds.has(id)) continue;
    if (/^Spree\b/i.test(seg.paragraphText.trim())) continue;
    if (/^\+(?:\s*\{[^}]+\})+\s*—/.test(seg.paragraphText.trim())) continue;
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

function resolveParentAbilityId(
  action: OracleActionV1,
  abilities: SemanticAbility[],
  oracleId: string,
): string {
  if (action.modalOptionId) {
    const parent = abilities.find((a) =>
      a.options?.some((o) => o.optionId.endsWith(`.${action.modalOptionId}`) || o.optionId.includes(action.modalOptionId!)),
    );
    if (parent) return parent.abilityId;
    const byOrdinal = abilities.find((a) =>
      a.options?.some((o) => optionOrdinalKey(o.ordinal) === action.modalOptionId),
    );
    if (byOrdinal) return byOrdinal.abilityId;
  }
  if (action.loyaltyCost) {
    const loyalty = abilities.find(
      (a) => a.abilityType === "loyalty" && a.loyaltyCost === action.loyaltyCost,
    );
    if (loyalty) return loyalty.abilityId;
  }
  return stableAbilityId(oracleId, action.faceId, action.abilityIndex);
}

function resolveSemanticClauseId(
  action: OracleActionV1,
  abilities: SemanticAbility[],
  parentAbilityId: string,
  stableModalOptionId?: string,
): string | undefined {
  if (stableModalOptionId) {
    for (const ability of abilities) {
      const opt = ability.options?.find((o) => o.optionId === stableModalOptionId);
      if (opt?.clauseIds[0]) return opt.clauseIds[0];
    }
  }
  const parent = abilities.find((a) => a.abilityId === parentAbilityId);
  if (parent?.clauseIds[0]) return parent.clauseIds[0];
  return action.clauseId?.includes(":clause-") ? action.clauseId : undefined;
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

    abilities.push(...buildFallbackAbilities({ oracleId: result.oracleId, segmented, coveredIds }));
  }

  const objects: SemanticObjectRef[] = [];
  const actions: SemanticAction[] = result.actions.map((action) => {
    const parentAbilityId = resolveParentAbilityId(action, abilities, result.oracleId);
    const stableModalOptionId = resolveStableModalOptionId(action, abilities);
    const semanticClauseId = resolveSemanticClauseId(action, abilities, parentAbilityId, stableModalOptionId);
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
      reviewStatus: action.reviewStatus,
      parserVersion: ORACLE_ACTION_PARSER_VERSION,
    };
  });

  return {
    oracleId: result.oracleId,
    oracleTextHash: hashOracleText(oracleText),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    abilities,
    actions,
    objects,
    diagnostics,
  };
}
