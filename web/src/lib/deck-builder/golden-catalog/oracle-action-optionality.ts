/**
 * Optionality scope, cost/effect distinction, and conditional dependencies.
 */
import { createHash } from "node:crypto";
import type { SegmentedAbility } from "./oracle-action-schema";

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

const OPTIONAL_COST_AFTER_MAY =
  /\bmay (?:pay|sacrifice|discard|exile|return|tap|remove|put)\b/i;

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
  const paragraphEnd = paragraphStart + paragraph.length;
  let match: RegExpExecArray | null;
  const re = new RegExp(MAY_CONTROLLER_PATTERN.source, MAY_CONTROLLER_PATTERN.flags);

  while ((match = re.exec(paragraph)) !== null) {
    const localStart = match.index;
    const mayText = match[0];
    const mayStart = paragraphStart + localStart;
    const mayEnd = mayStart + mayText.length;
    const afterMay = paragraph.slice(localStart);
    const optionalCost = OPTIONAL_COST_AFTER_MAY.test(afterMay.slice(0, 48));
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
  const period = tail.search(/\.\s+(?:[A-Z(]|When|Whenever|At|If|Target|Destroy|Exile|Draw|Return|Create|Counter|Put|Add|Sacrifice|You|Each|That)/);
  if (ifYouDo >= 0 && (period < 0 || ifYouDo < period)) {
    return mayLocalStart + ifYouDo + 1;
  }
  if (period >= 0) return mayLocalStart + period;
  return paragraph.length;
}

export function evidenceUnderMayScope(
  evidenceStart: number,
  evidenceEnd: number,
  scope: MayScope,
): boolean {
  return evidenceStart >= scope.mayStart && evidenceEnd <= scope.paragraphEnd;
}

export function parseConditionsInParagraph(
  paragraph: string,
  paragraphStart: number,
): ParsedCondition[] {
  const found: ParsedCondition[] = [];
  const rules: Array<{ type: ConditionType; pattern: RegExp }> = [
    { type: "if_you_do", pattern: /\bIf you do\b[^.]*/i },
    { type: "when_you_do", pattern: /\bWhen you do\b[^.]*/i },
    { type: "unless", pattern: /\bunless [^.]+/i },
    { type: "intervening_if", pattern: /\bWhen you do\b[^.]*/i },
    { type: "general", pattern: /\b(?:only if|if you control|if it|if that|if there|if a )[^.]+/i },
  ];
  for (const { type, pattern } of rules) {
    const m = paragraph.match(pattern);
    if (!m || m.index === undefined) continue;
    found.push({
      conditionType: type,
      conditionText: m[0].trim(),
      conditionStart: paragraphStart + m.index,
      conditionEnd: paragraphStart + m.index + m[0].length,
    });
  }
  return found;
}

export interface OptionalityAttachInput {
  actionId: string;
  evidenceStart: number;
  evidenceEnd: number;
  evidenceText: string;
  abilityIndex: number;
  abilityType: string;
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
  const conditions = parseConditionsInParagraph(paragraph, ability.paragraphStart);

  const governingScope = scopes.find((s) => evidenceUnderMayScope(action.evidenceStart, action.evidenceEnd, s));

  const ifYouDo = conditions.find((c) => c.conditionType === "if_you_do" || c.conditionType === "when_you_do");
  const conditionAfterAction = ifYouDo && ifYouDo.conditionStart >= action.evidenceStart;

  if (conditionAfterAction && ifYouDo) {
    const optionalSibling = siblingActions.find((s) => {
      if (s.actionId === action.actionId) return false;
      return scopes.some(
        (sc) =>
          sc.optionalEffect &&
          evidenceUnderMayScope(s.evidenceStart, s.evidenceEnd, sc) &&
          s.abilityIndex === action.abilityIndex,
      );
    });
    return {
      optionalEffect: false,
      optionalCost: false,
      conditionType: ifYouDo.conditionType,
      conditionText: ifYouDo.conditionText,
      dependsOnActionIds: optionalSibling ? [optionalSibling.actionId] : [],
      optionalityCertain: Boolean(optionalSibling),
    };
  }

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
