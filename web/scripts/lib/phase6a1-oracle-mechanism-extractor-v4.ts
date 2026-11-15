/**
 * Generic Oracle mechanism extractor v4 — DEV target aligned to independent truth set.
 * No card-name-specific parser exceptions.
 */
import type { IndependentMechanismFact } from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import type { CommanderCaseContext } from "./phase6a1-commander-case-context-v1";
import { normalizeForSpanMatch } from "./phase6a1-semantic-evidence-v3";

export const ORACLE_MECHANISM_EXTRACTOR_V4_VERSION = "phase6a1-oracle-mechanism-extractor-v4";

const SKIP_SEGMENT_PATTERNS = [
  /^\/\/\s*$/,
  /^choose a background/i,
  /^partner\b/i,
  /^\(as this saga enters and after your draw step, add a lore counter\.\)$/i,
  /^\(to mill a card,/i,
];

function stripTrailingRulesReminder(segment: string): string {
  return segment.replace(/\s*\(To [^)]+\)\.\s*$/i, "").trim();
}

function parseManaCosts(prefix: string): string[] {
  const costs: string[] = [];
  const re = /\{[^}]+\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prefix)) !== null) {
    costs.push(m[0]);
  }
  if (/\{T\}/i.test(prefix) || prefix.includes("{T}")) {
    if (!costs.some((c) => c.toUpperCase() === "{T}")) costs.push("{T}");
  }
  if (/^:\s/.test(prefix) && costs.length === 0 && prefix.trim().startsWith("{T}:")) {
    costs.push("{T}");
  }
  return costs;
}

function isKeywordSegment(segment: string): boolean {
  const s = segment.trim();
  if (s.length > 40) return false;
  if (/[:—]/.test(s)) return false;
  return /^(flying|vigilance|deathtouch|lifelink|trample|haste|hexproof|indestructible|reach|ward|menace|defender|flash|first strike|double strike)$/i.test(
    s.split(/\s/)[0] ?? s,
  );
}

function extractKeyword(segment: string): IndependentMechanismFact | null {
  const kw = segment.trim().split(/\s/)[0]?.toUpperCase().replace(/ /g, "_") ?? "";
  if (!kw) return null;
  return {
    mechanismId: `parser--keyword--${normalizeForSpanMatch(segment).slice(0, 24)}`,
    mechanismType: "KEYWORD",
    evidenceSpan: segment.trim(),
    keyword: kw,
  };
}

function extractReplacementEffect(segment: string): IndependentMechanismFact | null {
  if (!/\bwould\b.*\binstead\b/i.test(segment)) return null;
  const span = stripTrailingRulesReminder(segment);
  return {
    mechanismId: `parser--replacement--${normalizeForSpanMatch(span).slice(0, 24)}`,
    mechanismType: "REPLACEMENT_EFFECT",
    evidenceSpan: span,
    event: "REPLACEMENT_EVENT",
    actions: [{ type: "REPLACE_EVENT_OUTCOME" }],
  };
}

function extractGrantedStatic(segment: string): IndependentMechanismFact | null {
  if (!/\bhave "/i.test(segment) && !/\bhave '/i.test(segment)) return null;
  return {
    mechanismId: `parser--granted--${normalizeForSpanMatch(segment).slice(0, 24)}`,
    mechanismType: "GRANTED_STATIC_ABILITY",
    evidenceSpan: segment.trim(),
    subject: segment.match(/^(Permanents|Creatures|Commander creatures|Artifacts)[^"]*/i)?.[1]?.toUpperCase().replace(/\s+/g, "_") ?? "SUBJECT",
    actions: [{ type: "GRANT_ABILITY", ability: "GRANTED_ABILITY_TEXT" }],
  };
}

function extractStaticTriggerModifier(segment: string): IndependentMechanismFact | null {
  if (!/^if a creature dying causes/i.test(segment.trim())) return null;
  return {
    mechanismId: `parser--trigger-mod--${normalizeForSpanMatch(segment).slice(0, 24)}`,
    mechanismType: "STATIC_TRIGGER_MODIFIER",
    evidenceSpan: segment.trim(),
    condition: "CREATURE_DYING_CAUSES_TRIGGERED_ABILITY",
    actions: [{ type: "TRIGGER_ADDITIONAL_TIME", quantity: 1 }],
  };
}

function extractStaticKeywordGrant(segment: string): IndependentMechanismFact | null {
  if (!/\bhave (vigilance|lifelink|flying|deathtouch|trample|haste)\b/i.test(segment)) return null;
  if (/^if a creature dying/i.test(segment)) return null;
  return {
    mechanismId: `parser--static-kw--${normalizeForSpanMatch(segment).slice(0, 24)}`,
    mechanismType: "STATIC_ABILITY",
    evidenceSpan: segment.trim(),
    actions: [{ type: "GRANT_KEYWORDS" }],
  };
}

function extractTriggered(segment: string): IndependentMechanismFact | null {
  const trimmed = segment.trim();
  if (!/^(whenever|when|at the beginning of)/i.test(trimmed)) return null;
  const triggerMatch = trimmed.match(/^(Whenever|When|At the beginning of)[^,.]+/i);
  return {
    mechanismId: `parser--triggered--${normalizeForSpanMatch(trimmed).slice(0, 24)}`,
    mechanismType: /tap a nonland permanent for mana/i.test(trimmed) ? "TRIGGERED_MANA_ABILITY" : "TRIGGERED_ABILITY",
    evidenceSpan: trimmed,
    trigger: triggerMatch?.[0]?.trim().toUpperCase().replace(/\s+/g, "_") ?? "TRIGGER",
    actions: parseTriggeredActions(trimmed),
  };
}

function parseTriggeredActions(segment: string): Array<Record<string, unknown>> {
  const actions: Array<Record<string, unknown>> = [];
  if (/create .* token/i.test(segment)) {
    actions.push({
      type: "CREATE_TOKEN",
      token: segment.match(/create [^.,]+/i)?.[0] ?? "TOKEN",
      quantity: /where x is/i.test(segment) ? "VARIABLE" : 1,
    });
  }
  if (/draw cards? equal to/i.test(segment)) {
    actions.push({ type: "DRAW_CARDS", quantity: "VARIABLE" });
  } else if (/draw a card/i.test(segment)) {
    actions.push({ type: "DRAW_CARD", quantity: 1 });
  }
  if (/mill \w+/i.test(segment)) {
    actions.push({ type: "MILL", quantity: segment.match(/mill (\w+)/i)?.[1] ?? "VARIABLE" });
  }
  if (/return target .* from your graveyard/i.test(segment)) {
    actions.push({ type: "ZONE_MOVE", from: "GRAVEYARD", to: "BATTLEFIELD" });
  }
  if (/add one mana of any type/i.test(segment)) {
    actions.push({ type: "ADD_MANA", quantity: 1 });
  }
  if (/exile the top card/i.test(segment)) {
    actions.push({ type: "EXILE_TOP", quantity: 1 });
  }
  if (/sacrifice another permanent/i.test(segment)) {
    actions.push({ type: "SACRIFICE", object: "ANOTHER_PERMANENT" });
  }
  if (/put a \+1\/\+1 counter/i.test(segment)) {
    actions.push({ type: "PUT_COUNTER", counterType: "+1/+1" });
  }
  if (actions.length === 0) actions.push({ type: "UNPARSED_TRIGGERED_EFFECT" });
  return actions;
}

function extractActivated(segment: string): IndependentMechanismFact | null {
  const trimmed = segment.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx <= 0) return null;
  const costPart = trimmed.slice(0, colonIdx).trim();
  if (!/\{[^}]+\}/.test(costPart) && !/\{T\}/i.test(costPart) && !/^[^:]*\{T\}/i.test(costPart)) {
    return null;
  }
  const costs = parseManaCosts(costPart);
  if (costPart.includes("{T}") && !costs.includes("{T}")) costs.push("{T}");
  const effect = trimmed.slice(colonIdx + 1).trim();
  const fact: IndependentMechanismFact = {
    mechanismId: `parser--activated--${normalizeForSpanMatch(trimmed).slice(0, 24)}`,
    mechanismType: "ACTIVATED_ABILITY",
    evidenceSpan: trimmed,
    cost: costs,
    actions: parseActivatedActions(effect, trimmed),
  };
  if (/target player mills/i.test(effect)) fact.target = "TARGET_PLAYER";
  return fact;
}

function parseActivatedActions(effect: string, full: string): Array<Record<string, unknown>> {
  const actions: Array<Record<string, unknown>> = [];
  if (/add \{[^}]+\}/i.test(effect) || /add \{C\}/i.test(full)) {
    actions.push({ type: "ADD_MANA", mana: effect.match(/add (\{[^}]+\})/i)?.[1] ?? "{C}" });
  }
  if (/when you do, mill/i.test(effect)) {
    actions.push({ type: "MILL", player: "YOU", quantity: effect.match(/mill (\w+)/i)?.[1] ?? 2, timing: "WHEN_COST_PAID" });
  }
  if (/target player mills/i.test(effect)) {
    actions.push({ type: "MILL", player: "TARGET_PLAYER", quantity: effect.match(/mills (\w+)/i)?.[1] ?? "VARIABLE" });
  }
  if (/look at the top (\w+) cards/i.test(effect)) {
    actions.push({ type: "LOOK_AT_LIBRARY_TOP", quantity: effect.match(/top (\w+) cards/i)?.[1] ?? 5 });
  }
  if (/put target creature card from a graveyard/i.test(effect)) {
    actions.push({ type: "ZONE_MOVE", from: "GRAVEYARD", to: "BATTLEFIELD" });
  }
  if (/all creatures gain/i.test(effect)) {
    actions.push({ type: "GRANT_KEYWORDS_UNTIL_EOT" });
  }
  if (/put a \+1\/\+1 counter on target/i.test(effect)) {
    actions.push({ type: "PUT_COUNTER", counterType: "+1/+1", target: "TARGET_CREATURE" });
  }
  if (/target player gains/i.test(effect)) {
    actions.push({ type: "GAIN_LIFE", target: "TARGET_PLAYER" });
  }
  if (/target player draws/i.test(effect)) {
    actions.push({ type: "DRAW_CARD", target: "TARGET_PLAYER" });
  }
  if (/becomes a copy/i.test(effect)) {
    actions.push({ type: "COPY", object: "SELF" });
  }
  if (/exile .* then return it to the battlefield transformed/i.test(effect)) {
    actions.push({ type: "TRANSFORM_SEQUENCE" });
  }
  if (actions.length === 0) actions.push({ type: "UNPARSED_ACTIVATED_EFFECT" });
  return actions;
}

function extractSagaChapter(segment: string): IndependentMechanismFact | null {
  if (!/^[IVXLC]+,\s*[IVXLC]+,\s*[IVXLC]+\s*—/i.test(segment.trim()) && !/^[IVXLC]+\s*—/i.test(segment.trim())) {
    return null;
  }
  return {
    mechanismId: `parser--saga--${normalizeForSpanMatch(segment).slice(0, 24)}`,
    mechanismType: "TRIGGERED_ABILITY",
    evidenceSpan: segment.trim(),
    trigger: "SAGA_CHAPTER",
    actions: [{ type: "SAGA_CHAPTER_EFFECT" }],
  };
}

function parseSegment(segment: string, commanderName: string): IndependentMechanismFact | null {
  let s = stripTrailingRulesReminder(segment.trim());
  if (!s || SKIP_SEGMENT_PATTERNS.some((p) => p.test(s))) return null;

  if (isKeywordSegment(s)) return extractKeyword(s);
  if (extractReplacementEffect(s)) return extractReplacementEffect(s)!;
  if (extractGrantedStatic(s)) return extractGrantedStatic(s)!;
  if (extractStaticTriggerModifier(s)) return extractStaticTriggerModifier(s)!;
  if (extractSagaChapter(s)) return extractSagaChapter(s)!;
  if (extractStaticKeywordGrant(s)) return extractStaticKeywordGrant(s)!;
  if (extractTriggered(s)) return { ...extractTriggered(s)!, commander: commanderName };
  if (extractActivated(s)) return { ...extractActivated(s)!, commander: commanderName };

  if (s.length > 10) {
    return {
      mechanismId: `parser--unparsed--${normalizeForSpanMatch(s).slice(0, 24)}`,
      mechanismType: "TRIGGERED_ABILITY",
      evidenceSpan: s,
      commander: commanderName,
      actions: [{ type: "UNPARSED_SEGMENT" }],
    };
  }
  return null;
}

export function splitOracleIntoSegments(oracleText: string): string[] {
  const normalized = oracleText.replace(/\r\n/g, "\n");
  const faceParts = normalized.split(/\n\/\/\n|\n\/\/\s*\n/);
  const segments: string[] = [];

  for (const face of faceParts) {
    const lines = face.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    let buffer = "";
    for (const line of lines) {
      if (line === "//") continue;
      if (/^[A-Za-z]+ — /.test(line) && !buffer) {
        segments.push(line);
        continue;
      }
      if (/^(\{[^}]+\}(?:,\s*)?)+\s*:/.test(line) || /^\{T\}:/.test(line)) {
        if (buffer) segments.push(buffer);
        buffer = line;
        continue;
      }
      if (buffer) {
        buffer = `${buffer} ${line}`;
      } else {
        buffer = line;
      }
    }
    if (buffer) segments.push(buffer);
  }

  return segments.filter((s) => s && s !== "//" && !SKIP_SEGMENT_PATTERNS.some((p) => p.test(s)));
}

export function extractMechanismsFromOracle(
  sourceOracleId: string,
  commanderName: string,
  oracleText: string,
): IndependentMechanismFact[] {
  const segments = splitOracleIntoSegments(oracleText);
  const facts: IndependentMechanismFact[] = [];
  for (const seg of segments) {
    const fact = parseSegment(seg, commanderName);
    if (fact) facts.push({ ...fact, mechanismId: `${sourceOracleId}--${fact.mechanismId}` });
  }
  return facts;
}

export function extractParserMechanismsForCase(ctx: CommanderCaseContext): IndependentMechanismFact[] {
  return ctx.commanderOracleTexts.flatMap((m) =>
    extractMechanismsFromOracle(m.sourceOracleId, m.name, m.oracleText),
  );
}

export function extractParserMechanismsForAllCases(contexts: CommanderCaseContext[]): Map<string, IndependentMechanismFact[]> {
  const map = new Map<string, IndependentMechanismFact[]>();
  for (const ctx of contexts) {
    map.set(ctx.caseId, extractParserMechanismsForCase(ctx));
  }
  return map;
}
