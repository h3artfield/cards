/**
 * Parser-blind semantic justification for gold actions — derived from oracle text only.
 */
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import {
  classifyTextRoleAt,
  findReminderSpans,
  isOneShotCastPermission,
  isPersistentZoneCastPermission,
  type TextRole,
} from "../../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type SemanticGoldJustification = {
  actionType: PrimitiveActionType;
  evidenceContains: string;
  evidenceSpan: { start: number; end: number } | null;
  clauseRole: TextRole | "unknown";
  abilityType: "static" | "activated" | "triggered" | "spell_effect" | "replacement" | "loyalty" | "modal" | "unknown";
  executionContext:
    | "immediate"
    | "activated_cost"
    | "granted_ability"
    | "token_definition"
    | "replacement_effect"
    | "permission"
    | "trigger_reference"
    | "condition_reference"
    | "reminder"
    | "unknown";
  semanticOwner: "source_card" | "granted_object" | "created_object" | "unknown";
  cardNativeLayer2Eligible: boolean;
  optionalEffect?: boolean;
  optionalCost?: boolean;
  inCostRegion: boolean;
  inReminderSpan: boolean;
  inTypeLineMechanicReminder: boolean;
  inCreatedObjectDefinition: boolean;
  inGrantedQuotedAbility: boolean;
  inTriggerEventHeader: boolean;
  inReplacementEvent: boolean;
};

function evidenceSpanInOracle(oracleText: string, evidence: string): { start: number; end: number } | null {
  const idx = oracleText.toLowerCase().indexOf(evidence.toLowerCase().trim());
  if (idx < 0) return null;
  return { start: idx, end: idx + evidence.length };
}

function hostAbilityAt(
  oracleId: string,
  oracleText: string,
  point: number,
): { paragraphText: string; paragraphStart: number; abilityType: string } | null {
  for (const face of segmentCardFaces(oracleText)) {
    for (const ability of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
      if (point >= ability.paragraphStart && point < ability.paragraphEnd) {
        return {
          paragraphText: ability.paragraphText,
          paragraphStart: ability.paragraphStart,
          abilityType: ability.abilityType,
        };
      }
    }
  }
  return null;
}

function isInCostRegion(paragraph: string, localStart: number): boolean {
  let colonIdx = -1;
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < paragraph.length; i++) {
    const ch = paragraph[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ":" && depth === 0) {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx < 0) return false;
  const before = paragraph.slice(0, colonIdx);
  if (!/\{[^}]+\}|\{T\}|^[\−\+]\d+/m.test(before)) return false;
  return localStart < colonIdx;
}

function isTypeLineMechanicReminder(paragraph: string): boolean {
  return /^\S+ \(When this (?:permanent|creature|artifact|enchantment|land|battle) enters,/i.test(paragraph.trim());
}

/** First top-level comma separating trigger condition from resolving effect clause. */
export function findTriggerEffectCommaBoundary(paragraph: string): number | null {
  const triggerLead = paragraph.match(/(?:^|\n)\s*(?:[^—\n]*—\s*)?(When|Whenever|At the beginning)/i);
  if (!triggerLead || triggerLead.index === undefined) return null;
  let depth = 0;
  let inQuote = false;
  for (let i = triggerLead.index; i < paragraph.length; i++) {
    const ch = paragraph[i]!;
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      const after = paragraph.slice(i + 1).trimStart();
      if (
        /^(?:you may|if you do|then|create|draw|put|return|exile|destroy|target|choose|it|they|that|each|all|search|reveal|shuffle|scry|mill|deal|gain|lose|add|tap|untap|sacrifice|discard|counter|goad|proliferate|transform|copy|fight|surveil|explore|connive|look|distribute|pay|take|roll|skip|can't|cannot|[A-Z])/i.test(
          after,
        )
      ) {
        return i;
      }
    }
  }
  return null;
}

/** Evidence lies in the trigger condition span (before condition/effect comma), not the resolving effect. */
export function isEvidenceInTriggerConditionSpan(
  paragraph: string,
  localStart: number,
  localEnd: number,
): boolean {
  if (!/(?:^|\n)\s*(?:[^—\n]*—\s*)?(When|Whenever|At the beginning)/i.test(paragraph)) return false;
  const boundary = findTriggerEffectCommaBoundary(paragraph);
  if (boundary === null) {
    return localStart < paragraph.length && /^(When|Whenever|At the beginning)/i.test(paragraph.trim());
  }
  return localEnd <= boundary || localStart <= boundary;
}

const TRIGGER_EVENT_REFERENCE_ACTION_TYPES = new Set<PrimitiveActionType>([
  "cast",
  "play",
  "sacrifice",
  "discard",
  "draw",
  "mill",
  "destroy",
  "exile",
]);

export function isTriggerEventReferenceActionType(actionType: PrimitiveActionType): boolean {
  return TRIGGER_EVENT_REFERENCE_ACTION_TYPES.has(actionType);
}

export function isTriggerConditionEventReferenceGold(input: {
  gold: ExpectedPrimitiveAction;
  paragraph: string;
  localStart: number;
  localEnd: number;
}): boolean {
  if (!isEvidenceInTriggerConditionSpan(input.paragraph, input.localStart, input.localEnd)) return false;
  if (isTriggerEventReferenceActionType(input.gold.actionType)) return true;
  const conditionSlice = input.paragraph
    .slice(0, findTriggerEffectCommaBoundary(input.paragraph) ?? input.localEnd)
    .toLowerCase();
  const ev = (input.gold.evidenceContains ?? "").toLowerCase();
  if (!conditionSlice.includes(ev.slice(0, Math.min(20, ev.length)))) return false;
  return (
    /\b(?:whenever|when)\b[^,]*\b(?:cast|play|discarded|discards?|sacrificed|sacrifices?|dies|died|enters|attacks|draws?|milled|mill)\b/i.test(
      conditionSlice,
    ) ||
    /\bone or more [^.]*(?:discarded|sacrificed|destroyed|died|milled)\b/i.test(conditionSlice)
  );
}

/** Quantity token for Create … token(s) structural definitions. */
const CREATED_TOKEN_QUANTITY =
  "(?:a|an|X|one|two|three|four|five|six|seven|eight|nine|ten|\\d+(?:\\/\\d+)?|\\d+)";
const CREATED_TOKEN_BODY = "[^.!\\n]{0,160}? tokens?";

/** Create … token(s). It/They has/have "…" */
const CREATED_OBJECT_DEFINITION_PREFIX = new RegExp(
  `\\b(?:Create|create) ${CREATED_TOKEN_QUANTITY} ${CREATED_TOKEN_BODY}\\.\\s*(?:It|They)\\s+(?:has|have)\\s+`,
  "i",
);
/** Create … token(s) with "…" */
const CREATED_OBJECT_DEFINITION_WITH = new RegExp(
  `\\b(?:Create|create) ${CREATED_TOKEN_QUANTITY} ${CREATED_TOKEN_BODY}\\s+with\\s+"`,
  "i",
);
/** Create … token(s) that have "…" */
const CREATED_OBJECT_DEFINITION_THAT_HAVE = new RegExp(
  `\\b(?:Create|create) ${CREATED_TOKEN_QUANTITY} ${CREATED_TOKEN_BODY}\\s+that have\\s+"`,
  "i",
);

const CREATED_OBJECT_DEFINITION_PATTERNS = [
  CREATED_OBJECT_DEFINITION_PREFIX,
  CREATED_OBJECT_DEFINITION_WITH,
  CREATED_OBJECT_DEFINITION_THAT_HAVE,
];

export type CreatedObjectQuoteSpan = { quoteStart: number; quoteEnd: number };

function quoteEndExists(paragraph: string, quoteStart: number): boolean {
  return paragraph.indexOf('"', quoteStart + 1) >= 0;
}

/** Locate inner quoted span for any structural created-object token definition form. */
export function findCreatedObjectDefinitionQuoteSpan(paragraph: string): CreatedObjectQuoteSpan | null {
  for (const pattern of CREATED_OBJECT_DEFINITION_PATTERNS) {
    const m = paragraph.match(pattern);
    if (!m || m.index === undefined) continue;
    const quoteStart = m.index + m[0].length;
    const quoteEnd = paragraph.indexOf('"', quoteStart + 1);
    if (quoteEnd < 0) continue;
    return { quoteStart, quoteEnd };
  }
  return null;
}

function isTokenDefinitionHaveGrant(paragraph: string, haveMatchIndex: number): boolean {
  const beforeHave = paragraph.slice(0, haveMatchIndex);
  return new RegExp(
    `\\b(?:Create|create) ${CREATED_TOKEN_QUANTITY} ${CREATED_TOKEN_BODY}\\.\\s*(?:It|They)\\s+(?:has|have)\\s*$`,
    "i",
  ).test(beforeHave);
}

function isTokenDefinitionInlineQuoteGrant(paragraph: string, quoteOpenIndex: number): boolean {
  const before = paragraph.slice(0, quoteOpenIndex);
  return (
    new RegExp(`\\b(?:Create|create) ${CREATED_TOKEN_QUANTITY} ${CREATED_TOKEN_BODY}\\s+with\\s*$`, "i").test(before) ||
    new RegExp(`\\b(?:Create|create) ${CREATED_TOKEN_QUANTITY} ${CREATED_TOKEN_BODY}\\s+that have\\s*$`, "i").test(
      before,
    )
  );
}

export function isCreatedObjectDefinition(paragraph: string, localStart: number, localEnd: number): boolean {
  const span = findCreatedObjectDefinitionQuoteSpan(paragraph);
  if (!span) return false;
  return localStart >= span.quoteStart && localEnd <= span.quoteEnd;
}

/** Real granted rules ability: subject have/gains "…" — not a post-Create token definition. */
export function isGrantedQuotedAbilityRegion(paragraph: string, localStart: number, localEnd: number): boolean {
  const inlineSpan = findCreatedObjectDefinitionQuoteSpan(paragraph);
  if (inlineSpan && localStart >= inlineSpan.quoteStart && localEnd <= inlineSpan.quoteEnd) return false;

  const grantRe = /\b(?:have|gains?)\s+"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = grantRe.exec(paragraph)) !== null) {
    const quoteOpen = m.index + m[0].indexOf('"');
    const quoteStart = quoteOpen + 1;
    const quoteEnd = quoteStart + m[1]!.length;
    if (localStart < quoteStart || localEnd > quoteEnd) continue;
    if (isTokenDefinitionHaveGrant(paragraph, m.index)) continue;
    if (isTokenDefinitionInlineQuoteGrant(paragraph, quoteOpen)) continue;
    return true;
  }
  return false;
}

function inferAbilityType(host: { paragraphText: string; abilityType: string } | null): SemanticGoldJustification["abilityType"] {
  if (!host) return "unknown";
  const t = host.paragraphText.trim();
  if (/^[\−\+]\d+:/.test(t)) return "loyalty";
  if (/^Choose (?:one|two|three|four|\d+) target/i.test(t)) return "spell_effect";
  if (/^Choose (?:one|two|any number)\s*[—–-]/i.test(t) || /^Choose one or both\s*[—–-]/i.test(t)) return "modal";
  if (/^Choose (?:one|two|any number) of\b/i.test(t)) return "modal";
  if (/^(When|Whenever|At the beginning)/i.test(t)) return "triggered";
  if (/^If you would/i.test(t)) return "replacement";
  if (isInCostRegion(host.paragraphText, 1) || /\{[^}]+\}:/.test(t) || /\{T\},/.test(t)) return "activated";
  if (/^(?:Flash|Flying|Trample|Defender)\b/i.test(t) && !/^(When|Whenever)/i.test(t)) return "static";
  return (host.abilityType as SemanticGoldJustification["abilityType"]) ?? "unknown";
}

function inferExecutionContext(input: {
  gold: ExpectedPrimitiveAction;
  oracleText: string;
  paragraph: string;
  localStart: number;
  localEnd: number;
  clauseRole: TextRole | "unknown";
  inCostRegion: boolean;
  inReminderSpan: boolean;
  inTypeLineMechanicReminder: boolean;
  inCreatedObjectDefinition: boolean;
  inGrantedQuotedAbility: boolean;
  inTriggerEventHeader: boolean;
  inReplacementEvent: boolean;
  abilityType: SemanticGoldJustification["abilityType"];
}): SemanticGoldJustification["executionContext"] {
  const ev = input.gold.evidenceContains;
  if (input.inTypeLineMechanicReminder || input.inReminderSpan) return "reminder";
  if (input.inGrantedQuotedAbility) return "granted_ability";
  if (input.inCreatedObjectDefinition) return "token_definition";
  if (input.inReplacementEvent) return "replacement_effect";
  if (input.inCostRegion && ["sacrifice", "discard", "tap", "exile"].includes(input.gold.actionType)) {
    return "activated_cost";
  }
  if (input.inTriggerEventHeader) return "trigger_reference";
  if (input.clauseRole === "condition") return "condition_reference";
  if (
    input.gold.actionType === "cast" &&
    (isPersistentZoneCastPermission(ev) ||
      (/You may cast/i.test(ev) &&
        !isOneShotCastPermission(input.paragraph, input.localStart, ev) &&
        !/\bcast a copy of its spell\b/i.test(ev)))
  ) {
    return "permission";
  }
  if (input.clauseRole === "cost") return "activated_cost";
  return "immediate";
}

export function enrichGoldAction(
  testCase: OracleActionEvalCaseV2,
  gold: ExpectedPrimitiveAction,
): SemanticGoldJustification {
  const oracleText = testCase.oracleText;
  const evidence = gold.evidenceContains ?? "";
  const span = evidenceSpanInOracle(oracleText, evidence);
  const point = span?.start ?? 0;
  const host = hostAbilityAt(testCase.oracleId, oracleText, point + 1);
  const paragraph = host?.paragraphText ?? oracleText;
  const paragraphStart = host?.paragraphStart ?? 0;
  const localStart = Math.max(0, point - paragraphStart);
  const localEnd = Math.max(localStart + 1, (span?.end ?? point + evidence.length) - paragraphStart);

  let clauseRole: TextRole | "unknown" = host
    ? classifyTextRoleAt({
        paragraph,
        localStart,
        localEnd,
        abilityType: host.abilityType,
      })
    : "unknown";

  const reminders = findReminderSpans(paragraph);
  const inReminderSpan = reminders.some((r) => localStart >= r.localStart && localEnd <= r.localEnd);
  const inTypeLineMechanicReminder = isTypeLineMechanicReminder(paragraph) && span !== null;
  const inCreatedObjectDefinition = isCreatedObjectDefinition(paragraph, localStart, localEnd);
  const inGrantedQuotedAbility =
    !inCreatedObjectDefinition && isGrantedQuotedAbilityRegion(paragraph, localStart, localEnd);
  if (inGrantedQuotedAbility && (clauseRole === "reminder_text" || clauseRole === "mechanic_reminder")) {
    clauseRole = "effect";
  }
  if (inCreatedObjectDefinition && (clauseRole === "reminder_text" || clauseRole === "mechanic_reminder")) {
    clauseRole = "effect";
  }
  const inCostRegion = isInCostRegion(paragraph, localStart);
  const inTriggerConditionSpan = isEvidenceInTriggerConditionSpan(paragraph, localStart, localEnd);
  const inTriggerEventHeader =
    inTriggerConditionSpan &&
    (isTriggerEventReferenceActionType(gold.actionType) ||
      isTriggerConditionEventReferenceGold({ gold, paragraph, localStart, localEnd }));
  const inReplacementEvent = /^If you would/i.test(paragraph.trim()) && localStart < paragraph.indexOf("instead");

  const abilityType = inferAbilityType(host);
  const executionContext = inferExecutionContext({
    gold,
    oracleText,
    paragraph,
    localStart,
    localEnd,
    clauseRole,
    inCostRegion,
    inReminderSpan,
    inTypeLineMechanicReminder,
    inCreatedObjectDefinition,
    inGrantedQuotedAbility,
    inTriggerEventHeader,
    inReplacementEvent,
    abilityType,
  });

  let semanticOwner: SemanticGoldJustification["semanticOwner"] = "source_card";
  if (executionContext === "token_definition") semanticOwner = "created_object";
  if (executionContext === "granted_ability") semanticOwner = "granted_object";

  const cardNativeLayer2Eligible =
    (executionContext === "immediate" || executionContext === "granted_ability") &&
    !inReminderSpan &&
    !inTypeLineMechanicReminder &&
    !inCreatedObjectDefinition &&
    executionContext !== "activated_cost" &&
    executionContext !== "permission" &&
    executionContext !== "trigger_reference" &&
    executionContext !== "condition_reference" &&
    executionContext !== "reminder";

  return {
    actionType: gold.actionType,
    evidenceContains: evidence,
    evidenceSpan: span,
    clauseRole,
    abilityType,
    executionContext,
    semanticOwner,
    cardNativeLayer2Eligible,
    optionalEffect: gold.optionalEffect ?? gold.optional,
    optionalCost: gold.optionalCost,
    inCostRegion,
    inReminderSpan,
    inTypeLineMechanicReminder,
    inCreatedObjectDefinition,
    inGrantedQuotedAbility,
    inTriggerEventHeader,
    inReplacementEvent,
  };
}
