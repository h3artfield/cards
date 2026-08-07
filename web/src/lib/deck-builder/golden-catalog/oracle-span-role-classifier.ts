/**
 * Clause/span role classification — Layer 1 text roles before Layer 2 primitive extraction.
 * Parser v1.13: primitives emit primarily from effect and replacement_effect spans.
 */
import type { OracleAbilityType } from "./oracle-action-schema";
import type { PrimitiveActionType } from "./oracle-action-taxonomy";

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

export interface StaticPermissionRecord {
  permissionType: "cast" | "play";
  permittedFromZone?: string[];
  permissionSubject?: string;
  condition?: string;
  evidenceText: string;
  localStart: number;
  localEnd: number;
}

/** Lead tokens marking mechanic/reminder parentheticals — preserve text, block Layer 2 emission. */
const MECHANIC_REMINDER_LEADS =
  /^(?:Flash(?:back)?|Cycling|Suspend|Aftermath|Disturb|Prototype|Mutate|Fuse|Warp|Evoke|Plot|Adventure|Casualty|Multikicker|Delve|Splice|Spectacle|Foretell|Boast|Channel|Reconfigure|Blitz|Encore|Jump-start|Embalm|Eternalize|Madam(e)?|Daybound|Nightbound|Craft|Collect evidence|Investigate|Learn|Training|Milestone|Level \d|Gain the next level|Rather than cast|You may cast|As this|As a|As an|Spells without mana costs|It's an artifact|It\u2019s an artifact|They're|Treasure tokens are|Blood tokens are|Clue tokens are|Food tokens are|Create a Clue token|Create a Treasure token|\{T\},\s*Sacrifice this|\{1\},\s*\{T\},\s*Discard|\(As this enters|\(When you cast|\(If you cast|\(If you pay|\(At the beginning of your upkeep, remove|\(At the beginning of your upkeep, you may cast)/i;

const STATIC_PERMISSION_PATTERNS: Array<{
  pattern: RegExp;
  permissionType: "cast" | "play";
  zoneFrom?: RegExp;
}> = [
  {
    pattern: /\b(?:You may )?cast spells from (?:your )?(?:graveyard|exile|hand)\b/gi,
    permissionType: "cast",
    zoneFrom: /\bfrom (?:your )?(graveyard|exile|hand)\b/i,
  },
  {
    pattern: /\b(?:You may )?play lands(?: and cast spells from (?:your )?(?:graveyard|exile|hand))?\b/gi,
    permissionType: "play",
  },
  {
    pattern: /\b(?:You may )?cast (?:that card|it|the copy|the exiled card) without paying its mana cost\b/gi,
    permissionType: "cast",
    zoneFrom: /\bfrom (?:exile|your graveyard)\b/i,
  },
  {
    pattern: /\b(?:You may )?cast (?:this card|this spell) from (?:your )?(?:graveyard|exile)\b/gi,
    permissionType: "cast",
    zoneFrom: /\bfrom (?:your )?(graveyard|exile)\b/i,
  },
  {
    pattern: /\b(?:You may )?cast (?:this card|this spell) any time you could cast an instant\b/gi,
    permissionType: "cast",
  },
];

const STATIC_RESTRICTION_PATTERN =
  /\b(?:You can't|You can\u2019t|Creatures can't|Creatures can\u2019t|Players can't|can't cast|can't be cast|can't be played|can't enter)\b/i;

const COST_LEAD_PATTERNS = [
  /\bAs an additional cost to cast\b/i,
  /\bRather than pay\b/i,
  /\bEvoke[\u2014-]/i,
  /\bCasualty \d+/i,
  /\bMultikicker\b/i,
];

/** Primitives valid only in effect / replacement_effect spans (default Layer 2 set). */
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
  "search_library",
]);

/** Activated mana abilities — add_mana is the effect after `{cost}:` */
const ACTIVATED_EFFECT_PRIMITIVES = new Set<PrimitiveActionType>(["add_mana"]);

/** Cost-region primitives — structure only, not competing Layer 2 effects. */
const COST_REGION_PRIMITIVES = new Set<PrimitiveActionType>([
  "sacrifice",
  "discard",
  "exile",
  "tap",
]);

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

/** Identify parenthetical reminder / mechanic spans. */
export function findReminderSpans(paragraph: string): TextSpanRole[] {
  const spans: TextSpanRole[] = [];
  for (let i = 0; i < paragraph.length; i++) {
    if (paragraph[i] !== "(") continue;
    const close = findMatchingCloseParen(paragraph, i);
    const inner = paragraph.slice(i + 1, close - 1);
    const lead = inner.trimStart();
    let role: TextRole = "reminder_text";
    if (MECHANIC_REMINDER_LEADS.test(lead)) {
      role = "mechanic_reminder";
    } else if (/^It's an artifact with|^It\u2019s an artifact with|^They enter|^Treasure token|^Blood token|^Clue token|^Food token/i.test(lead)) {
      role = "reminder_text";
    } else if (/^As this |^As a |^As an /i.test(lead)) {
      role = "mechanic_reminder";
    }
    spans.push({ role, localStart: i, localEnd: close, text: paragraph.slice(i, close) });
    i = close - 1;
  }
  return spans;
}

function insideSpan(spans: TextSpanRole[], localStart: number, localEnd?: number): TextSpanRole | undefined {
  const end = localEnd ?? localStart + 1;
  return spans.find((s) => s.localStart <= localStart && end <= s.localEnd);
}

function activatedColonSplit(paragraph: string): { costEnd: number; effectStart: number } | null {
  const colonIdx = paragraph.indexOf(":");
  if (colonIdx < 0 || colonIdx > 80) return null;
  const before = paragraph.slice(0, colonIdx).trim();
  if (!before || before.length > 80) return null;
  if (/^(When|Whenever|At the beginning|If |Choose one)/i.test(paragraph.trim())) return null;
  if (!/^[\s\S]*[\d{}+−-]/.test(before) && !/^[+\−-]\d/.test(before)) {
    if (!/\{[WUBRGC]\}/.test(before) && !/\{T\}/.test(before)) return null;
  }
  const after = paragraph.slice(colonIdx + 1).trimStart();
  if (!/^(?:Draw|Create|Exile|Destroy|Return|Put|Add|Target|Each|You|This|Until|Copy|Counter|Search|Reveal|Look|Scry|Surveil|Mill|Tap|Untap)/i.test(after)) {
    return null;
  }
  return { costEnd: colonIdx, effectStart: colonIdx + 1 + (paragraph.slice(colonIdx + 1).length - after.length) };
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

/** Classify role at a character position within an ability paragraph. */
export function classifyTextRoleAt(input: {
  paragraph: string;
  localStart: number;
  localEnd?: number;
  abilityType?: OracleAbilityType | "unknown";
}): TextRole {
  const { paragraph, localStart } = input;
  const localEnd = input.localEnd ?? localStart + 1;
  const reminderSpans = findReminderSpans(paragraph);
  const inReminder = insideSpan(reminderSpans, localStart, localEnd);
  if (inReminder) return inReminder.role;

  if (STATIC_RESTRICTION_PATTERN.test(paragraph.slice(Math.max(0, localStart - 8), localEnd + 40))) {
    const lineStart = paragraph.lastIndexOf("\n", localStart) + 1;
    const clause = paragraph.slice(lineStart, localEnd + 80);
    if (STATIC_RESTRICTION_PATTERN.test(clause)) return "static_restriction";
  }

  for (const { pattern } of STATIC_PERMISSION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(paragraph)) !== null) {
      if (localStart >= m.index && localEnd <= m.index + m[0].length) return "static_permission";
    }
  }

  const insteadStart = insteadEffectStart(paragraph);
  if (insteadStart !== null && localStart >= insteadStart) return "replacement_effect";

  const replEnd = replacementEventEnd(paragraph);
  if (replEnd !== null && localStart < replEnd) return "replacement_event";

  for (const pat of COST_LEAD_PATTERNS) {
    const m = paragraph.match(pat);
    if (m?.index !== undefined) {
      const costRegionEnd = paragraph.indexOf(".", m.index);
      const end = costRegionEnd > m.index ? costRegionEnd : paragraph.indexOf(",", m.index + m[0].length);
      if (localStart >= m.index && localEnd <= (end > 0 ? end : m.index + 120)) return "cost";
    }
  }

  const trigEnd = triggerEventEnd(paragraph);
  if (trigEnd !== null && localStart < trigEnd) return "trigger_event";

  const colon = activatedColonSplit(paragraph);
  if (colon) {
    if (localStart < colon.effectStart) return "cost";
    return "effect";
  }

  if (/^Choose one/i.test(paragraph.trim()) || /^\u2022/.test(paragraph.trim())) {
    if (/^Choose one/i.test(paragraph.trim()) && localStart < 20) return "target_or_choice_structure";
  }

  if (/\bIf you do\b/i.test(paragraph) || /\bWhen you do\b/i.test(paragraph)) {
    const ifYouDo = paragraph.search(/\.\s*(?:If|When) you do\b/i);
    if (ifYouDo >= 0 && localStart <= ifYouDo) {
      const segment = paragraph.slice(0, ifYouDo);
      if (/\b(?:You may|you may) (?:discard|sacrifice|exile|pay)\b/i.test(segment) && localStart < ifYouDo) {
        return "cost";
      }
    }
  }

  if (/\bIf you do\b/i.test(paragraph) || /\bWhen you do\b/i.test(paragraph)) {
    const ifYouDo = paragraph.search(/\b(?:If|When) you do\b/i);
    if (ifYouDo >= 0 && localStart >= ifYouDo && localStart < ifYouDo + 30) return "condition";
  }

  return "effect";
}

/** Whether a primitive may be emitted as Layer 2 at this role. */
export function primitiveAllowedAtRole(role: TextRole, actionType: PrimitiveActionType): boolean {
  if (role === "effect") return true;
  if (role === "replacement_effect") return true;
  if (role === "cost" && ACTIVATED_EFFECT_PRIMITIVES.has(actionType)) return false;
  if (role === "cost" && COST_REGION_PRIMITIVES.has(actionType)) return false;
  if (role === "trigger_event" && EFFECT_ONLY_PRIMITIVES.has(actionType)) return false;
  if (role === "replacement_event" && actionType !== "exile") return false;
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
      if (role !== "static_permission" && role !== "effect") continue;
      if (role === "static_permission" || /\b(?:may cast|may play|cast spells from|play lands)\b/i.test(m[0])) {
        const zoneMatch = zoneFrom?.exec(m[0]);
        records.push({
          permissionType,
          permittedFromZone: zoneMatch ? [zoneMatch[1].toLowerCase()] : undefined,
          permissionSubject: m[0],
          evidenceText: m[0],
          localStart: m.index,
          localEnd: m.index + m[0].length,
        });
      }
    }
  }
  return records;
}

/** Build clause spans with role tags for compound paragraphs. */
export function compoundClauseSpansWithRoles(
  paragraph: string,
): Array<{ localStart: number; text: string; role: TextRole }> {
  const spans = new Map<string, { localStart: number; text: string; role: TextRole }>();
  const add = (localStart: number, text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 4) return;
    const role = classifyTextRoleAt({ paragraph, localStart, localEnd: localStart + trimmed.length });
    spans.set(`${localStart}:${trimmed.slice(0, 20)}`, { localStart, text: trimmed, role });
  };
  add(0, paragraph);
  for (const m of paragraph.matchAll(/,\s*then\s+/gi)) {
    if (m.index !== undefined) add(m.index + m[0].length, paragraph.slice(m.index + m[0].length));
  }
  for (const m of paragraph.matchAll(/\.\s+Then\s+/g)) {
    if (m.index !== undefined) add(m.index + m[0].length, paragraph.slice(m.index + m[0].length));
  }
  const thenMatch = paragraph.match(/\bthen\b/i);
  if (thenMatch?.index !== undefined && thenMatch.index > 0) {
    add(0, paragraph.slice(0, thenMatch.index).replace(/,\s*$/, ""));
  }
  return [...spans.values()];
}

export function roleBlocksPrimitiveEmission(role: TextRole, actionType: PrimitiveActionType): boolean {
  return !primitiveAllowedAtRole(role, actionType);
}
