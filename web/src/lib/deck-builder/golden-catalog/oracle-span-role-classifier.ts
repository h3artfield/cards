/**
 * Clause/span role classification — Layer 1 text roles before Layer 2 primitive extraction.
 * Parser v1.13+: primitives emit primarily from effect and replacement_effect spans.
 */
import type { OracleAbilityType } from "./oracle-action-schema";
import type { PrimitiveActionType } from "./oracle-action-taxonomy";
import {
  segmentCompoundClauses,
  type CompoundClauseSegment,
} from "./oracle-compound-clause-segmentation";
import { detectQuoteSpans } from "./oracle-rc3-quote-span-detector";
import { classifyQuotedSpan } from "./oracle-rc3-granted-rules-classifier";

export type TextRole =
  | "effect"
  | "cost"
  | "trigger_event"
  | "condition"
  | "replacement_event"
  | "replacement_effect"
  | "static_permission"
  | "static_restriction"
  | "reminder_text"
  | "mechanic_reminder"
  | "target_or_choice_structure"
  | "unknown";

export interface TextSpanRole {
  role: TextRole;
  localStart: number;
  localEnd: number;
  text: string;
}

/** Layer-1 future-action permission window only — never one-shot resolution referents. */
export type StaticPermissionDuration =
  | "continuous"
  | "while_condition"
  | "until_end_of_turn"
  | "this_turn";

export interface StaticPermissionRecord {
  /** @deprecated use permittedAction */
  permissionType: "cast" | "play";
  permittedAction: "cast" | "play";
  objectCriteria?: string;
  permittedFromZone?: string[];
  destination?: string;
  /** INVARIANT: one-shot resolution referents ("cast that card", "play the copy") never persist here — they are Layer-2 actions. */
  duration?: StaticPermissionDuration;
  permissionSubject?: string;
  condition?: string;
  evidenceText: string;
  localStart: number;
  localEnd: number;
}

/** Lead tokens marking mechanic/reminder parentheticals — preserve text, block Layer 2 emission. */
const MECHANIC_REMINDER_LEADS =
  /^(?:Flash(?:back)?|Cycling|Suspend|Aftermath|Disturb|Prototype|Mutate|Fuse|Warp|Evoke|Plot|Adventure|Casualty|Multikicker|Delve|Splice|Spectacle|Foretell|Boast|Channel|Reconfigure|Blitz|Encore|Jump-start|Embalm|Eternalize|Persist|Madam(e)?|Daybound|Nightbound|Craft|Collect evidence|Investigate|Learn|Training|Milestone|Level \d|Gain the next level|Rather than cast|Cumulative upkeep|Cast this spell only from your graveyard|You may cast this card from your graveyard|You may cast the creature later from exile|You may pay|As you cast|Spells without mana costs|It's an artifact with|^It\u2019s an artifact with|They enter|Treasure tokens are|Blood tokens are|Clue tokens are|Food tokens are|Create a Treasure token|Look at the top|To surveil|To scry|\{[^}]+\},\s*Discard this card:|\(As this enters|\(When you cast|\(If you cast|\(If you pay|\(At the beginning of your upkeep, remove|\(At the beginning of your upkeep, you may cast|Read ahead|Doctor's companion|If you cast this spell for its mutate cost|You may cast this spell with different mana cost|You may cast this card from your hand for its|You may cast that card from your graveyard for its flashback cost|At the beginning of your upkeep, put an age counter|While they(?:'re| are) phased out|Whenever you cast a spell, you may pay \{[^}]+\}\. If you do, each opponent loses|Choose a chapter and start with that many lore counters)/i;

/** Reminder-only parenthetical intros — parentheses alone are insufficient. */
const REMINDER_TEXT_LEADS =
  /^(?:It's an artifact with|^It\u2019s an artifact with|They enter the battlefield|Treasure tokens are|Blood tokens are|Clue tokens are|Food tokens are|Look at the top card|To surveil|To scry|\(As this Saga enters|Sacrifice after III|Skipped chapters don't trigger|Reveal the card as you exile it)/i;

const STATIC_PERMISSION_PATTERNS: Array<{
  pattern: RegExp;
  permissionType: "cast" | "play";
  zoneFrom?: RegExp;
  persistentOnly?: boolean;
}> = [
  {
    pattern: /\b(?:You may )?cast spells from (?:your )?(?:hand|graveyard|exile|library)\b/gi,
    permissionType: "cast",
    zoneFrom: /\bfrom (?:your )?(hand|graveyard|exile|library)\b/i,
    persistentOnly: true,
  },
  {
    pattern: /\b(?:You may )?play lands(?: and cast spells from (?:your )?(?:graveyard|exile|hand))?\b/gi,
    permissionType: "play",
    persistentOnly: true,
  },
  {
    pattern: /\b(?:You may )?cast (?:this card|this spell) from (?:your )?(?:graveyard|exile)\b/gi,
    permissionType: "cast",
    zoneFrom: /\bfrom (?:your )?(graveyard|exile)\b/i,
    persistentOnly: true,
  },
  {
    pattern: /\b(?:You may )?cast [A-Za-z][\w',-]*(?: [A-Za-z][\w',-]*)* from (?:your )?graveyard\b/gi,
    permissionType: "cast",
    zoneFrom: /\bfrom (?:your )?(graveyard)\b/i,
    persistentOnly: true,
  },
  {
    pattern: /\b(?:You may )?cast (?:this card|this spell) any time you could cast an instant\b/gi,
    permissionType: "cast",
    persistentOnly: true,
  },
  {
    pattern: /\bYou may cast [A-Za-z][\w',-]*(?: [A-Za-z][\w',-]*)* for as long as it remains exiled\b/gi,
    permissionType: "cast",
    persistentOnly: true,
  },
];

const STATIC_RESTRICTION_PATTERN =
  /\b(?:You can't|You can\u2019t|Creatures can't|Creatures can\u2019t|Players can't|can't cast|can't be cast|can't be played|can't enter)\b/i;

const COST_LEAD_PATTERNS = [
  /\bAs an additional cost to cast(?: this spell)?,\s*[^.\n]+/i,
  /\bRather than pay[^,.\n]+/i,
  /\bEvoke[\u2014-]\s*[^.\n]+/i,
  /\bCasualty \d+/i,
  /\bMultikicker\b/i,
];

const EFFECT_ONLY_PRIMITIVES = new Set<PrimitiveActionType>([
  "draw",
  "destroy",
  "exile",
  "counter",
  "return_to_hand",
  "return_to_battlefield",
  "put_onto_battlefield",
  "create_token",
  "copy",
  "mill",
  "deal_damage",
  "gain_life",
  "lose_life",
  "scry",
  "surveil",
  "tap",
  "untap",
  "put_counter",
  "shuffle_into_library",
  "shuffle_library",
  "search_library",
]);

const ACTIVATED_EFFECT_PRIMITIVES = new Set<PrimitiveActionType>(["add_mana"]);

const COST_REGION_PRIMITIVES = new Set<PrimitiveActionType>([
  "sacrifice",
  "discard",
  "exile",
  "tap",
]);

const CLAUSE_SPLIT_PATTERN =
  /(?:,\s*then\s+(?!shuffle(?:\s|\.|$))|\.\s+Then\s+|,\s*and\s+|\.\s+(?:If|When) you do,\s+|,\s*and if you do,\s+|;\s*|\.\s+(?=[A-Z]))/gi;

function findMatchingCloseParen(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function findMatchingQuote(text: string, openIdx: number): number {
  const quote = text[openIdx];
  for (let i = openIdx + 1; i < text.length; i++) {
    if (text[i] === quote && text[i - 1] !== "\\") return i + 1;
  }
  return text.length;
}

function investigateTokenDefinitionStart(inner: string): number | null {
  const m = inner.match(/\bIt(?:'|\u2019)s an artifact with\b/i);
  return m?.index ?? null;
}

function isManaAbilityParenthetical(inner: string): boolean {
  const t = inner.trim();
  return /^\{T\}:\s*Add(?:\s+\{[WUBRGC]\}|\s+one mana)/i.test(t);
}

function isCardSpecificRulesParenthetical(inner: string): boolean {
  const t = inner.trim();
  if (/^As this Saga enters|^After your draw step|^Add one after your draw step|^Choose a chapter|^Sacrifice after III|^Skipped chapters/i.test(t)) {
    return true;
  }
  if (/^As this (?:Class|Room|Siege|Enchantment|Creature|Artifact) enters/i.test(t)) {
    return true;
  }
  return false;
}

/** Identify parenthetical reminder / mechanic spans — never tag on parentheses alone. */
export function findReminderSpans(paragraph: string): TextSpanRole[] {
  const spans: TextSpanRole[] = [];
  for (let i = 0; i < paragraph.length; i++) {
    if (paragraph[i] !== "(") continue;
    const close = findMatchingCloseParen(paragraph, i);
    const inner = paragraph.slice(i + 1, close - 1);
    const lead = inner.trimStart();

    if (isManaAbilityParenthetical(inner)) continue;

    const prefix = paragraph.slice(Math.max(0, i - 24), i);
    if (
      /\b(?:Storm|Forecast|Cascade|Annihilator|Landfall|Morbid|Heroic|Constellation|Ninjutsu|Equip|Reconfigure|Bestow|Fortify|Crew|Embalm|Eternalize|Mutate|Flashback|Spectacle|Harmonize|Disturb|Warp|Blitz)\s*[\{(]?[^()]*$/i.test(
        prefix,
      )
    ) {
      spans.push({
        role: "mechanic_reminder",
        localStart: i,
        localEnd: close,
        text: paragraph.slice(i, close),
      });
      i = close - 1;
      continue;
    }

    if (/^When you cast this spell/i.test(lead)) {
      spans.push({
        role: "mechanic_reminder",
        localStart: i,
        localEnd: close,
        text: paragraph.slice(i, close),
      });
      i = close - 1;
      continue;
    }
    if (/^Create a (?:Clue|Treasure|Blood|Food) token\.\s*/i.test(lead)) {
      const defOffset = investigateTokenDefinitionStart(inner);
      if (defOffset !== null && defOffset > 0) {
        spans.push({
          role: "mechanic_reminder",
          localStart: i + 1 + defOffset,
          localEnd: close,
          text: paragraph.slice(i + 1 + defOffset, close),
        });
      } else {
        spans.push({
          role: "mechanic_reminder",
          localStart: i,
          localEnd: close,
          text: paragraph.slice(i, close),
        });
      }
      i = close - 1;
      continue;
    }
    if (isCardSpecificRulesParenthetical(inner)) {
      spans.push({
        role: "mechanic_reminder",
        localStart: i,
        localEnd: close,
        text: paragraph.slice(i, close),
      });
      i = close - 1;
      continue;
    }

    let role: TextRole | null = null;
    if (MECHANIC_REMINDER_LEADS.test(lead)) {
      role = "mechanic_reminder";
    } else if (REMINDER_TEXT_LEADS.test(lead)) {
      role = "reminder_text";
    } else if (/Sacrifice after III|Skipped chapters don't trigger/i.test(inner)) {
      role = "mechanic_reminder";
    } else if (/^As this |^As a |^As an /i.test(lead) && /Saga|chapter|lore counter|Room|Siege|Class enters/i.test(inner)) {
      role = "mechanic_reminder";
    }

    if (role) {
      spans.push({ role, localStart: i, localEnd: close, text: paragraph.slice(i, close) });
    }
    i = close - 1;
  }
  return spans;
}

export function findQuotedAbilitySpans(paragraph: string): TextSpanRole[] {
  return detectQuoteSpans(paragraph).map((span) => {
    const classified = classifyQuotedSpan(paragraph, span);
    const role: TextRole =
      classified.classification === "granted_rules_ability" ? "effect" : "reminder_text";
    return {
      role,
      localStart: span.localStart,
      localEnd: span.localEnd,
      text: span.text,
    };
  });
}

function insideSpan(spans: TextSpanRole[], localStart: number, localEnd?: number): TextSpanRole | undefined {
  const end = localEnd ?? localStart + 1;
  return spans.find((s) => s.localStart <= localStart && end <= s.localEnd);
}

export function clauseBoundaries(paragraph: string): number[] {
  const starts = new Set<number>([0]);
  CLAUSE_SPLIT_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLAUSE_SPLIT_PATTERN.exec(paragraph)) !== null) {
    if (m.index !== undefined) starts.add(m.index + m[0].length);
  }
  const whenYouDo = paragraph.match(/\b(?:When|If) you do,\s*/gi);
  if (whenYouDo) {
    let searchFrom = 0;
    for (const match of whenYouDo) {
      const idx = paragraph.indexOf(match, searchFrom);
      if (idx >= 0) {
        starts.add(idx + match.length);
        searchFrom = idx + match.length;
      }
    }
  }
  return [...starts].sort((a, b) => a - b);
}

export function clauseAtPosition(
  paragraph: string,
  localStart: number,
): { clauseStart: number; clauseEnd: number; clauseText: string } {
  const bounds = clauseBoundaries(paragraph);
  let clauseStart = 0;
  for (const b of bounds) {
    if (b <= localStart) clauseStart = b;
    else break;
  }
  const nextBound = bounds.find((b) => b > localStart);
  const clauseEnd = nextBound ?? paragraph.length;
  return {
    clauseStart,
    clauseEnd,
    clauseText: paragraph.slice(clauseStart, clauseEnd),
  };
}

function activatedColonSplit(paragraph: string): { costEnd: number; effectStart: number } | null {
  const trimmed = paragraph.trimStart();
  const offset = paragraph.length - trimmed.length;

  if (/^(When|Whenever|At the beginning|If |Choose one|Each player|Target |Until end)/i.test(trimmed)) {
    return null;
  }

  let colonIdx = -1;
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
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
  if (colonIdx < 0 || colonIdx > 120) return null;

  const before = trimmed.slice(0, colonIdx).trim();
  if (!before) return null;

  if (/^(When|Whenever|At the beginning|If you|If a|If target)/i.test(before)) return null;

  const looksLikeCost =
    /^[+\−-]\d/.test(before) ||
    /\{[WUBRGC\d]+\}/.test(before) ||
    /\{T\}/.test(before) ||
    /\b(?:Discard|Sacrifice|Exile|Pay|Tap)\b/i.test(before) ||
    /,\s*(?:Discard|Sacrifice|Exile|Tap)\b/i.test(before);

  if (!looksLikeCost) return null;

  const afterRaw = trimmed.slice(colonIdx + 1);
  const after = afterRaw.trimStart();
  if (
    !/^(?:Draw|Create|Exile|Destroy|Return|Put|Add|Target|Each|You|This|Until|Copy|Counter|Search|Reveal|Look|Scry|Surveil|Mill|Tap|Untap|Whenever|When|If|At the beginning)/i.test(
      after,
    )
  ) {
    return null;
  }

  const effectStart = offset + colonIdx + 1 + (afterRaw.length - after.length);
  return { costEnd: offset + colonIdx, effectStart };
}

function triggerEventEnd(paragraph: string): number | null {
  const trimmed = paragraph.trimStart();
  const offset = paragraph.length - trimmed.length;
  const m = trimmed.match(/^(When|Whenever|At the beginning of)[^,]+,\s*/i);
  if (!m) return null;
  return offset + m[0].length;
}

function replacementEventEnd(paragraph: string): number | null {
  const m = paragraph.match(/\bIf (?:a |an |target |you |each |that )[^,]+ would [^,]+,\s*/i);
  if (!m || m.index === undefined) return null;
  return m.index + m[0].length;
}

function insteadEffectStart(paragraph: string): number | null {
  const m = paragraph.match(/\binstead\b/i);
  if (!m || m.index === undefined) return null;
  return m.index + m[0].length;
}

function ifYouDoPhraseBounds(paragraph: string): { start: number; end: number; consequentStart: number | null } | null {
  const m = paragraph.match(/\b(?:If|When) you do\b/i);
  if (!m || m.index === undefined) return null;
  const start = m.index;
  const end = start + m[0].length;
  const after = paragraph.slice(end);
  const commaMatch = after.match(/^\s*,\s*/);
  const consequentStart = commaMatch ? end + commaMatch[0].length : null;
  return { start, end, consequentStart };
}

function additionalCostBounds(paragraph: string): { start: number; end: number } | null {
  const m = paragraph.match(/\bAs an additional cost to cast(?: this spell)?,\s*([^.\n]+)/i);
  if (!m || m.index === undefined) return null;
  return { start: m.index, end: m.index + m[0].length };
}

function evokeCostBounds(paragraph: string, localStart: number): { start: number; end: number } | null {
  const m = paragraph.match(/\bEvoke[\u2014-]\s*[^.\n]+/i);
  if (!m || m.index === undefined) return null;
  if (localStart < m.index || localStart > m.index + m[0].length + 4) return null;
  return { start: m.index, end: m.index + m[0].length };
}

function isPersistentStaticAbility(paragraph: string): boolean {
  const t = paragraph.trimStart();
  if (/^(When|Whenever|At the beginning|Until end of turn|At the beginning of your)/i.test(t)) return false;
  if (/^[\+\−-]\d:/.test(t)) return false;
  if (/^\{[^}]+\}:/.test(t)) return false;
  return true;
}

/** Classify role at a character position within an ability paragraph. */
export function classifyTextRoleAt(input: {
  paragraph: string;
  localStart: number;
  localEnd?: number;
  abilityType?: OracleAbilityType | "unknown";
}): TextRole {
  const { paragraph: rawParagraph, localStart } = input;
  const paragraph = normalizeParagraphForRole(rawParagraph);
  const offset = rawParagraph.length - paragraph.length > 0 && paragraph !== rawParagraph
    ? rawParagraph.indexOf(paragraph)
    : 0;
  const adjustedStart = paragraph === rawParagraph ? localStart : localStart - offset;
  const localEnd = input.localEnd ?? localStart + 1;
  const adjustedEnd = paragraph === rawParagraph ? localEnd : localEnd - offset;

  const reminderSpans = findReminderSpans(paragraph);
  const quotedSpans = findQuotedAbilitySpans(paragraph);
  const inReminder = insideSpan(reminderSpans, adjustedStart, adjustedEnd);
  if (inReminder) return inReminder.role;
  const inQuote = insideSpan(quotedSpans, adjustedStart, adjustedEnd);
  if (inQuote) return inQuote.role;

  const { clauseStart, clauseText } = clauseAtPosition(paragraph, adjustedStart);
  const clauseLocalStart = adjustedStart - clauseStart;
  const clauseLocalEnd = adjustedEnd - clauseStart;

  if (STATIC_RESTRICTION_PATTERN.test(clauseText.slice(Math.max(0, clauseLocalStart - 8), clauseLocalEnd + 40))) {
    if (STATIC_RESTRICTION_PATTERN.test(clauseText)) return "static_restriction";
  }

  const clauseTrimmed = clauseText.trimStart();
  for (const { pattern, persistentOnly } of STATIC_PERMISSION_PATTERNS) {
    if (persistentOnly === false) continue;
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(clauseText)) !== null) {
      if (clauseLocalStart >= m.index && clauseLocalEnd <= m.index + m[0].length) {
        if (isPersistentStaticAbility(clauseTrimmed) && !/^Choose one/i.test(clauseTrimmed)) {
          return "static_permission";
        }
        if (/^Until end of turn/i.test(clauseTrimmed) && /\b(?:play lands and )?cast spells from\b/i.test(m[0])) {
          return "static_permission";
        }
      }
    }
  }
  if (
    isPersistentStaticAbility(clauseTrimmed) &&
    !/^Choose one/i.test(clauseTrimmed)
  ) {
    for (const { pattern, persistentOnly } of STATIC_PERMISSION_PATTERNS) {
      if (persistentOnly === false) continue;
      const re = new RegExp(pattern.source, pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(clauseText)) !== null) {
        if (clauseLocalStart >= m.index && clauseLocalEnd <= m.index + m[0].length) {
          return "static_permission";
        }
      }
    }
  }

  const insteadStart = insteadEffectStart(clauseText);
  if (insteadStart !== null && clauseLocalStart >= insteadStart) return "replacement_effect";

  const replEnd = replacementEventEnd(clauseText);
  if (replEnd !== null && clauseLocalStart < replEnd) return "replacement_event";

  const addCost = additionalCostBounds(clauseText);
  if (addCost && clauseLocalStart >= addCost.start && clauseLocalEnd <= addCost.end) return "cost";

  const evokeCost = evokeCostBounds(clauseText, clauseLocalStart);
  if (evokeCost && clauseLocalStart >= evokeCost.start && clauseLocalEnd <= evokeCost.end) return "cost";

  for (const pat of COST_LEAD_PATTERNS) {
    const m = clauseText.match(pat);
    if (m?.index !== undefined) {
      const end = m.index + m[0].length;
      if (clauseLocalStart >= m.index && clauseLocalEnd <= end) return "cost";
    }
  }

  const trigEnd = triggerEventEnd(clauseText);
  if (trigEnd !== null && clauseLocalStart < trigEnd) return "trigger_event";

  const colon = activatedColonSplit(clauseText);
  if (colon) {
    if (clauseLocalStart < colon.effectStart) return "cost";
    return "effect";
  }

  if (/^Choose one/i.test(clauseTrimmed) || /^\u2022/.test(clauseTrimmed)) {
    if (/^Choose one/i.test(clauseTrimmed) && clauseLocalStart < 20) return "target_or_choice_structure";
  }

  const ifYouDo = ifYouDoPhraseBounds(clauseText);
  if (ifYouDo) {
    if (ifYouDo.consequentStart !== null && clauseLocalStart >= ifYouDo.consequentStart) {
      return "effect";
    }
    if (clauseLocalStart >= ifYouDo.start && clauseLocalEnd <= ifYouDo.end) {
      return "condition";
    }
  }

  if (trigEnd !== null && clauseLocalStart >= trigEnd) {
    return "effect";
  }

  return "effect";
}

/** Cost-region sacrifice/discard/exile/tap are Layer 1 structure only — never Layer 2 primitives. */
export function costPrimitiveMayEmit(
  _paragraph: string,
  _localStart: number,
  _localEnd: number,
  _actionType: PrimitiveActionType,
): boolean {
  return false;
}

/** Whether a primitive may be emitted as Layer 2 at this role. */
export function primitiveAllowedAtRole(
  role: TextRole,
  actionType: PrimitiveActionType,
  context?: { paragraph?: string; localStart?: number; localEnd?: number },
): boolean {
  if (role === "effect") return true;
  if (role === "replacement_effect") return true;
  if (role === "cost") {
    if (ACTIVATED_EFFECT_PRIMITIVES.has(actionType)) return false;
    return false;
  }
  if (role === "trigger_event" && EFFECT_ONLY_PRIMITIVES.has(actionType)) return false;
  if (role === "replacement_event") return false;
  if (role === "static_permission" || role === "static_restriction") return false;
  if (role === "reminder_text" || role === "mechanic_reminder") return false;
  if (role === "condition") return false;
  if (role === "target_or_choice_structure") return false;
  if (role === "unknown") return true;
  return false;
}

/** Extract static permission records from paragraph (Layer 1, not cast actions). */
export function extractStaticPermissions(paragraph: string): StaticPermissionRecord[] {
  const records: StaticPermissionRecord[] = [];
  if (!isPersistentStaticAbility(paragraph)) return records;

  for (const { pattern, permissionType, zoneFrom } of STATIC_PERMISSION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(paragraph)) !== null) {
      const role = classifyTextRoleAt({
        paragraph,
        localStart: m.index,
        localEnd: m.index + m[0].length,
        abilityType: "static",
      });
      if (role !== "static_permission") continue;
      const zoneMatch = zoneFrom?.exec(m[0]);
      records.push({
        permissionType,
        permittedAction: permissionType,
        objectCriteria: permissionType === "play" ? "land" : "spell",
        permittedFromZone: zoneMatch?.[1] ? [zoneMatch[1].toLowerCase()] : undefined,
        duration: inferStaticPermissionDuration(paragraph),
        permissionSubject: m[0],
        evidenceText: m[0],
        localStart: m.index,
        localEnd: m.index + m[0].length,
      });
    }
  }
  return records;
}

/** Build clause spans with role tags for compound paragraphs. */
export function compoundClauseSpansWithRoles(
  paragraph: string,
  parentAbilityId?: string,
): Array<{ localStart: number; text: string; role: TextRole; clause?: CompoundClauseSegment }> {
  const abilityId = parentAbilityId ?? paragraph.slice(0, 24);
  const colon = activatedColonSplit(paragraph);
  const spans: Array<{ localStart: number; text: string; role: TextRole; clause?: CompoundClauseSegment }> = [];

  if (colon && colon.costEnd > 0) {
    const costText = paragraph.slice(0, colon.costEnd).trim();
    if (costText.length >= 2) {
      spans.push({ localStart: 0, text: costText, role: "cost" });
    }
    const effectSlice = paragraph.slice(colon.effectStart);
    const effectAbsStart = colon.effectStart;
    for (const clause of segmentCompoundClauses({
      parentAbilityId: abilityId,
      paragraph: effectSlice,
      paragraphStart: effectAbsStart,
    })) {
      spans.push({
        localStart: clause.evidenceStart,
        text: clause.text,
        role: clause.textRole,
        clause,
      });
    }
    if (spans.length > 0) return spans;
  }

  for (const clause of segmentCompoundClauses({ parentAbilityId: abilityId, paragraph })) {
    spans.push({
      localStart: clause.evidenceStart,
      text: clause.text,
      role: clause.textRole,
      clause,
    });
  }

  if (spans.length === 0 && paragraph.trim().length >= 2) {
    spans.push({
      localStart: 0,
      text: paragraph.trim(),
      role: classifyTextRoleAt({ paragraph, localStart: 0, localEnd: paragraph.length }),
    });
  }
  return spans;
}

export function roleBlocksPrimitiveEmission(role: TextRole, actionType: PrimitiveActionType): boolean {
  return !primitiveAllowedAtRole(role, actionType);
}

/** True when position is inside quoted reminder text (not a granted ability quote). */
export function isInsideQuotedGrantedAbility(
  paragraph: string,
  localStart: number,
  actionType?: PrimitiveActionType,
): boolean {
  const span = findQuotedAbilitySpans(paragraph).find(
    (s) => localStart >= s.localStart && localStart < s.localEnd,
  );
  if (!span) return false;
  if (span.role === "effect") {
    if (actionType === "cast" || actionType === "play") return true;
    return false;
  }
  return true;
}

function normalizeParagraphForRole(paragraph: string): string {
  const t = paragraph.trim();
  if (t.startsWith("(") && t.endsWith(")")) {
    const inner = t.slice(1, -1).trim();
    if (isManaAbilityParenthetical(inner)) return inner;
  }
  return paragraph;
}

/** True for reflexive trigger references like "When you sacrifice one or more artifacts this way". */
export function isReflexiveTriggerReference(paragraph: string, evidenceText: string): boolean {
  if (!/\bthis way\b/i.test(evidenceText)) return false;
  return /\bWhen you (?:sacrifice|discard|exile|pay)\b/i.test(paragraph);
}

/** Infer StaticPermissionRecord duration from enclosing clause (Layer 1 only). */
export function inferStaticPermissionDuration(paragraph: string): StaticPermissionDuration {
  const t = paragraph.trimStart();
  if (/\bUntil end of turn\b/i.test(t)) return "until_end_of_turn";
  if (/\bDuring each of your turns\b/i.test(t)) return "while_condition";
  if (/\bthis turn\b/i.test(t)) return "this_turn";
  return "continuous";
}

/** Persistent zone cast permission — Layer 1 only; must not emit Layer-2 cast primitive. */
export function isPersistentZoneCastPermission(evidenceText: string): boolean {
  if (!/\bcast\b/i.test(evidenceText)) return false;
  if (/\bYou may cast (?:it|that card|that spell|the copy|that copy)\b/i.test(evidenceText)) return false;
  if (/for as long as it remains exiled/i.test(evidenceText)) return false;
  return (
    /\bcast spells from (?:your )?(?:hand|graveyard|library|exile)\b/i.test(evidenceText) ||
    /\bYou may cast [A-Za-z][\w',-]*(?: [A-Za-z][\w',-]*)* from (?:your )?graveyard\b/i.test(evidenceText)
  );
}

/** Persistent/duration-limited zone play permission — Layer 1 only; must not emit Layer-2 play primitive. */
export function isPersistentZonePlayPermission(evidenceText: string, paragraph?: string): boolean {
  if (!/\bplay\b/i.test(evidenceText)) return false;
  if (/\bYou may play (?:it|that card|that land|that permanent)\b/i.test(evidenceText)) return false;
  if (/\bplay lands(?: and cast spells from|\b)/i.test(evidenceText)) return true;
  if (/\bYou may play lands from (?:your )?(?:graveyard|hand|exile)\b/i.test(evidenceText)) return true;
  if (paragraph && /\bplay lands\b/i.test(evidenceText) && isPersistentStaticAbility(paragraph)) return true;
  return false;
}

/** Future-action permission (cast or play from zone) — never Layer 2. */
export function isFutureActionZonePermission(
  actionType: "cast" | "play",
  evidenceText: string,
  paragraph?: string,
): boolean {
  if (actionType === "cast") return isPersistentZoneCastPermission(evidenceText);
  return isPersistentZonePlayPermission(evidenceText, paragraph);
}

/** One-shot resolution cast (Layer 2) vs persistent static grant (Layer 1). Returns true when cast SHOULD emit. */
export function isOneShotCastPermission(paragraph: string, localStart: number, evidenceText: string): boolean {
  if (!/\bcast\b/i.test(evidenceText)) return false;
  const clause = clauseAtPosition(paragraph, localStart).clauseText;
  if (isPersistentStaticAbility(clause.trimStart()) && /\bcast spells from\b/i.test(clause)) return false;
  if (/\b(?:You may cast (?:it|that card|that spell|the copy)[^.\n]*(?:without paying|\.|$))/i.test(evidenceText)) {
    return true;
  }
  if (/\b(?:You may cast (?:it|that card|that spell)[^.\n]*without paying)/i.test(clause)) return true;
  if (/\b(?:you may cast an instant or sorcery spell with mana value)/i.test(clause)) return true;
  if (/^(?:When|Whenever|At the beginning)[^.\n]*\bYou may cast\b/i.test(clause.trimStart())) return true;
  if (/\bYou may cast the copy\b/i.test(evidenceText)) return true;
  if (/\bYou may cast\b/i.test(evidenceText) && /\bCopy it\b/i.test(clause)) return true;
  return false;
}
