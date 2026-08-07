/**
 * Optionality scope, cost/effect distinction, and conditional dependencies.
 */
import { createHash } from "node:crypto";
import type { SegmentedAbility, OracleAbilityStructureAnnotation, StructureAnnotationKind } from "./oracle-action-schema";
import type { SegmentedCardFace } from "./oracle-ability-segmentation";

export type OptionalityController =
  | "you"
  | "opponent"
  | "target_player"
  | "each_player"
  | "object_controller";

export type ConditionType =
  | "if_you_do"
  | "when_you_do"
  | "unless"
  | "intervening_if"
  | "general";

export interface ParsedCondition {
  conditionType: ConditionType;
  conditionText: string;
  conditionStart: number;
  conditionEnd: number;
}

export interface MayScope {
  scopeId: string;
  mayText: string;
  mayStart: number;
  mayEnd: number;
  controller: OptionalityController;
  optionalCost: boolean;
  optionalEffect: boolean;
  paragraphEnd: number;
}

const MAY_CONTROLLER_PATTERN =
  /\b(You|An opponent|That player|Each player|Its controller) may\b/gi;

/** Only "may pay" is an optional cost by default; sacrifice/discard are effects unless additional-cost context. */
function isOptionalCostAfterMay(paragraph: string, afterMayLocal: string): boolean {
  if (/^\s*pay\b/i.test(afterMayLocal)) return true;
  if (
    /\bAs an additional cost\b/i.test(paragraph) &&
    /^\s*(?:sacrifice|discard|exile|remove|return|tap)\b/i.test(afterMayLocal)
  ) {
    return true;
  }
  if (/^\s*pay \{[^}]+\} rather than pay\b/i.test(afterMayLocal)) return true;
  if (/^\s*(?:sacrifice|discard)\b/i.test(afterMayLocal) && /rather than pay/i.test(afterMayLocal)) {
    return false;
  }
  return false;
}

function mapController(raw: string): OptionalityController {
  const lower = raw.toLowerCase();
  if (lower === "you") return "you";
  if (lower === "an opponent") return "opponent";
  if (lower === "that player") return "target_player";
  if (lower === "each player") return "each_player";
  return "object_controller";
}

function scopeId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 12);
}

/** Locate may tokens and their governed span within a paragraph. */
export function findMayScopesInParagraph(
  paragraph: string,
  paragraphStart: number,
): MayScope[] {
  const scopes: MayScope[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MAY_CONTROLLER_PATTERN.source, MAY_CONTROLLER_PATTERN.flags);

  while ((match = re.exec(paragraph)) !== null) {
    const localStart = match.index;
    const mayText = match[0];
    const mayStart = paragraphStart + localStart;
    const mayEnd = mayStart + mayText.length;
    const afterMay = paragraph.slice(localStart + mayText.length);
    const optionalCost = isOptionalCostAfterMay(paragraph, afterMay);
    const optionalEffect = !optionalCost;

    const nextBoundary = findScopeBoundary(paragraph, localStart);
    scopes.push({
      scopeId: scopeId([paragraphStart.toString(), String(localStart), mayText]),
      mayText,
      mayStart,
      mayEnd,
      controller: mapController(match[1]),
      optionalCost,
      optionalEffect,
      paragraphEnd: paragraphStart + nextBoundary,
    });
  }
  return scopes;
}

function findScopeBoundary(paragraph: string, mayLocalStart: number): number {
  const tail = paragraph.slice(mayLocalStart);
  const ifYouDo = tail.search(/\.\s*If you do\b/i);
  const whenYouDo = tail.search(/\.\s*When you do\b/i);
  const period = tail.search(
    /\.\s+(?:[A-Z(]|When|Whenever|At|If|Target|Destroy|Exile|Draw|Return|Create|Counter|Put|Add|Sacrifice|You|Each|That)/,
  );
  const boundary = [ifYouDo, whenYouDo, period].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (boundary !== undefined) {
    return mayLocalStart + boundary + 1;
  }
  return paragraph.length;
}

export function evidenceUnderMayScope(
  evidenceStart: number,
  evidenceEnd: number,
  scope: MayScope,
): boolean {
  return evidenceStart >= scope.mayStart && evidenceEnd <= scope.paragraphEnd;
}

const CONDITION_PATTERNS: Array<{ type: ConditionType; pattern: RegExp }> = [
  { type: "if_you_do", pattern: /\bIf you do\b[^.]*/gi },
  { type: "when_you_do", pattern: /\bWhen you do\b[^.]*/gi },
  { type: "unless", pattern: /\b(?:unless|If they don't)[^.]*/gi },
  { type: "general", pattern: /\bIf you control [^.]*/gi },
  { type: "general", pattern: /\bonly if [^.]*/gi },
  { type: "general", pattern: /\b(?:As long as|For as long as) [^.]*/gi },
  { type: "general", pattern: /\bAt the beginning of the next [^.]*/gi },
  { type: "general", pattern: /\bif it [^.]*/gi },
  { type: "general", pattern: /\bif that [^.]*/gi },
  { type: "general", pattern: /\bif (?:you|they|there|a source) [^.]*/gi },
  { type: "general", pattern: /\bThen if [^.]*/gi },
  { type: "general", pattern: /\bIf a source would deal damage[^.]*/gi },
  { type: "general", pattern: /\bCreatures can't attack you unless [^.]*/gi },
];

/** Parse all condition clauses with evidence spans. */
export function parseConditionsInParagraph(
  paragraph: string,
  paragraphStart: number,
): ParsedCondition[] {
  const found: ParsedCondition[] = [];
  for (const { type, pattern } of CONDITION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(paragraph)) !== null) {
      found.push({
        conditionType: type,
        conditionText: m[0].trim(),
        conditionStart: paragraphStart + m.index,
        conditionEnd: paragraphStart + m.index + m[0].length,
      });
    }
  }
  return found.sort((a, b) => a.conditionStart - b.conditionStart);
}

export interface OptionalityAttachInput {
  actionId: string;
  evidenceStart: number;
  evidenceEnd: number;
  evidenceText: string;
  abilityIndex: number;
  abilityType: string;
  optionalEffect?: boolean;
  optionalCost?: boolean;
}

export interface OptionalityAttachResult {
  optionalEffect: boolean;
  optionalCost: boolean;
  optionalityEvidenceText?: string;
  optionalityEvidenceStart?: number;
  optionalityEvidenceEnd?: number;
  optionalityScopeId?: string;
  optionalityController?: OptionalityController;
  conditionType?: ConditionType;
  conditionText?: string;
  conditionEvidenceStart?: number;
  conditionEvidenceEnd?: number;
  dependsOnActionIds?: string[];
  optionalityCertain: boolean;
}

export function attachOptionalityToAction(input: {
  action: OptionalityAttachInput;
  ability: SegmentedAbility;
  oracleText: string;
  siblingActions: OptionalityAttachInput[];
}): OptionalityAttachResult {
  const { action, ability, siblingActions } = input;
  const paragraph = ability.paragraphText;
  const scopes = findMayScopesInParagraph(paragraph, ability.paragraphStart);

  const governingScope = scopes.find((s) =>
    evidenceUnderMayScope(action.evidenceStart, action.evidenceEnd, s),
  );

  if (governingScope) {
    return {
      optionalEffect: governingScope.optionalEffect,
      optionalCost: governingScope.optionalCost,
      optionalityEvidenceText: governingScope.mayText,
      optionalityEvidenceStart: governingScope.mayStart,
      optionalityEvidenceEnd: governingScope.mayEnd,
      optionalityScopeId: governingScope.scopeId,
      optionalityController: governingScope.controller,
      optionalityCertain: true,
    };
  }

  const additionalCostMay = /\bAs an additional cost[^.]+\byou may\b/i.test(paragraph);
  if (additionalCostMay && /\b(?:sacrifice|discard|pay|exile|remove)\b/i.test(action.evidenceText)) {
    const mayMatch = paragraph.match(/\byou may\b/i);
    const mayStart = mayMatch?.index !== undefined ? ability.paragraphStart + mayMatch.index : undefined;
    return {
      optionalEffect: false,
      optionalCost: true,
      optionalityEvidenceText: mayMatch?.[0],
      optionalityEvidenceStart: mayStart,
      optionalityEvidenceEnd: mayStart !== undefined && mayMatch ? mayStart + mayMatch[0].length : undefined,
      optionalityScopeId: mayStart !== undefined ? scopeId([String(mayStart), "cost"]) : undefined,
      optionalityController: "you",
      optionalityCertain: Boolean(mayMatch),
    };
  }

  return {
    optionalEffect: false,
    optionalCost: false,
    optionalityCertain: false,
  };
}

function actionImmediatelyBeforeCondition(input: {
  actionEvidenceEnd: number;
  conditionStart: number;
  paragraph: string;
  paragraphStart: number;
}): boolean {
  const actionEndLocal = input.actionEvidenceEnd - input.paragraphStart;
  const condStartLocal = input.conditionStart - input.paragraphStart;
  if (condStartLocal < actionEndLocal) return false;
  const between = input.paragraph.slice(actionEndLocal, condStartLocal);
  return /^[\s.,;:—–-]*$/.test(between);
}

/** Attach conditions and if/when-you-do dependencies to specific actions within an ability. */
export function wireConditionsToActions<T extends OptionalityAttachInput & OptionalityAttachResult>(input: {
  actions: T[];
  ability: SegmentedAbility;
}): T[] {
  const { ability } = input;
  const conditions = parseConditionsInParagraph(ability.paragraphText, ability.paragraphStart);
  if (!conditions.length) return input.actions;

  const sorted = [...input.actions].sort((a, b) => a.evidenceStart - b.evidenceStart);
  const byId = new Map(sorted.map((a) => [a.actionId, a]));

  for (const cond of conditions) {
    if (cond.conditionType === "if_you_do" || cond.conditionType === "when_you_do") {
      const dependent = sorted.find((a) => a.evidenceStart >= cond.conditionStart - 2);
      const antecedent = sorted
        .filter(
          (a) =>
            a.evidenceEnd <= cond.conditionStart &&
            a.evidenceStart < (dependent?.evidenceStart ?? Infinity),
        )
        .pop();

      if (dependent) {
        const action = byId.get(dependent.actionId)!;
        action.conditionType = cond.conditionType;
        action.conditionText = cond.conditionText;
        action.conditionEvidenceStart = cond.conditionStart;
        action.conditionEvidenceEnd = cond.conditionEnd;
        action.optionalEffect = false;
        if (antecedent) {
          action.dependsOnActionIds = [antecedent.actionId];
        }
      }
      continue;
    }

    const inlineAction = sorted.find(
      (a) =>
        a.evidenceStart <= cond.conditionStart &&
        a.evidenceEnd >= cond.conditionStart &&
        cond.conditionStart < a.evidenceEnd + 4,
    );
    const trailingAction =
      cond.conditionType === "unless"
        ? sorted.find(
            (a) =>
              !a.conditionType &&
              actionImmediatelyBeforeCondition({
                actionEvidenceEnd: a.evidenceEnd,
                conditionStart: cond.conditionStart,
                paragraph: ability.paragraphText,
                paragraphStart: ability.paragraphStart,
              }),
          )
        : undefined;
    const afterAction = sorted.find((a) => a.evidenceStart >= cond.conditionStart);
    const governed = inlineAction ?? trailingAction ?? afterAction;

    if (governed && !governed.conditionType) {
      const action = byId.get(governed.actionId)!;
      action.conditionType = cond.conditionType;
      action.conditionText = cond.conditionText;
      action.conditionEvidenceStart = cond.conditionStart;
      action.conditionEvidenceEnd = cond.conditionEnd;
    }
  }

  return sorted;
}

/** Tag opponent/target-player may-pay scopes onto the next mandatory action in the paragraph. */
export function attachPlayerMayPayScopes<T extends OptionalityAttachInput & OptionalityAttachResult>(input: {
  actions: T[];
  ability: SegmentedAbility;
}): T[] {
  const { ability } = input;
  const scopes = findMayScopesInParagraph(ability.paragraphText, ability.paragraphStart).filter(
    (s) => s.optionalCost && s.controller !== "you",
  );
  if (!scopes.length) return input.actions;

  const sorted = [...input.actions].sort((a, b) => a.evidenceStart - b.evidenceStart);
  for (const scope of scopes) {
    let target = sorted.find((a) => a.evidenceStart >= scope.mayEnd && !a.optionalCost && !a.optionalEffect);
    if (!target && /\bIf they don't\b/i.test(ability.paragraphText)) {
      target = sorted.find((a) => !a.optionalCost && !a.optionalEffect);
    }
    if (target && !target.optionalCost) {
      target.optionalCost = true;
      target.optionalEffect = false;
      target.optionalityEvidenceText = scope.mayText;
      target.optionalityEvidenceStart = scope.mayStart;
      target.optionalityEvidenceEnd = scope.mayEnd;
      target.optionalityScopeId = scope.scopeId;
      target.optionalityController = scope.controller;
      target.optionalityCertain = true;
    }
  }
  return input.actions;
}

function inferStructureKind(input: {
  optionalCost?: boolean;
  optionalEffect?: boolean;
  conditionType?: ConditionType;
  paragraph: string;
}): StructureAnnotationKind {
  if (input.optionalCost) return "optional_cost";
  if (input.optionalEffect) {
    if (/\bchoose not to target\b/i.test(input.paragraph)) return "choice_or_target";
    return "optional_effect";
  }
  if (input.conditionType === "unless" || /\bCreatures can't attack\b/i.test(input.paragraph)) {
    return "static_restriction";
  }
  if (/\bwould\b.*\binstead\b/i.test(input.paragraph) || /\bIf a source would deal damage\b/i.test(input.paragraph)) {
    return "replacement_condition";
  }
  return "condition_only";
}

/** Layer 1 structure annotations when may/conditions exist without a separate primitive action. */
export function emitStructureAnnotations(input: {
  oracleId: string;
  face?: SegmentedCardFace;
  ability: SegmentedAbility;
  existingInAbility: Array<{
    optionalEffect?: boolean;
    optionalCost?: boolean;
    conditionText?: string;
  }>;
  parserVersion: string;
  annotationId: (parts: string[]) => string;
}): OracleAbilityStructureAnnotation[] {
  const { ability, existingInAbility, face } = input;
  const faceId = face?.faceId ?? ability.cardFaceId;
  const faceEvidence = (cardStart: number, cardEnd: number) => ({
    cardEvidenceStart: cardStart,
    cardEvidenceEnd: cardEnd,
    faceEvidenceStart: face ? cardStart - face.start : undefined,
    faceEvidenceEnd: face ? cardEnd - face.start : undefined,
  });
  const annotations: OracleAbilityStructureAnnotation[] = [];
  const hasOptional = existingInAbility.some((a) => a.optionalEffect || a.optionalCost);
  const scopes = findMayScopesInParagraph(ability.paragraphText, ability.paragraphStart);

  if (!hasOptional && scopes.length) {
    for (const scope of scopes) {
      const localEnd = scope.paragraphEnd - ability.paragraphStart;
      const evidenceText = ability.paragraphText
        .slice(scope.mayStart - ability.paragraphStart, Math.min(localEnd, ability.paragraphText.length))
        .trim();
      if (!evidenceText) continue;
      const evidenceStart = scope.mayStart;
      const evidenceEnd = evidenceStart + evidenceText.length;
      annotations.push({
        annotationId: input.annotationId([
          input.oracleId,
          faceId,
          String(ability.abilityIndex),
          "may-structure",
          evidenceText,
        ]),
        oracleId: input.oracleId,
        faceId,
        faceName: face?.faceName,
        faceIndex: face?.faceIndex,
        componentType: face?.componentType,
        abilityIndex: ability.abilityIndex,
        kind: inferStructureKind({
          optionalCost: scope.optionalCost,
          optionalEffect: scope.optionalEffect,
          paragraph: ability.paragraphText,
        }),
        evidenceText,
        evidenceStart,
        evidenceEnd,
        ...faceEvidence(evidenceStart, evidenceEnd),
        optionalEffect: scope.optionalEffect,
        optionalCost: scope.optionalCost || undefined,
        optionalityEvidenceText: scope.mayText,
        optionalityEvidenceStart: scope.mayStart,
        optionalityEvidenceEnd: scope.mayEnd,
        optionalityScopeId: scope.scopeId,
        optionalityController: scope.controller,
        parserVersion: input.parserVersion,
        reviewStatus: "needs_review",
      });
    }
  }

  const conditions = parseConditionsInParagraph(ability.paragraphText, ability.paragraphStart);
  const uncovered = conditions.filter(
    (cond) =>
      !existingInAbility.some((a) =>
        a.conditionText?.toLowerCase().includes(cond.conditionText.toLowerCase().slice(0, 16)),
      ) &&
      !annotations.some((m) =>
        m.conditionText?.toLowerCase().includes(cond.conditionText.toLowerCase().slice(0, 16)),
      ),
  );

  if (uncovered.length && existingInAbility.length === 0) {
    for (const cond of uncovered) {
      annotations.push({
        annotationId: input.annotationId([
          input.oracleId,
          faceId,
          String(ability.abilityIndex),
          "cond-structure",
          cond.conditionText,
        ]),
        oracleId: input.oracleId,
        faceId,
        faceName: face?.faceName,
        faceIndex: face?.faceIndex,
        componentType: face?.componentType,
        abilityIndex: ability.abilityIndex,
        kind: inferStructureKind({ conditionType: cond.conditionType, paragraph: ability.paragraphText }),
        evidenceText: cond.conditionText,
        evidenceStart: cond.conditionStart,
        evidenceEnd: cond.conditionEnd,
        ...faceEvidence(cond.conditionStart, cond.conditionEnd),
        conditionType: cond.conditionType,
        conditionText: cond.conditionText,
        conditionEvidenceStart: cond.conditionStart,
        conditionEvidenceEnd: cond.conditionEnd,
        parserVersion: input.parserVersion,
        reviewStatus: "needs_review",
      });
    }
  }

  return annotations;
}
