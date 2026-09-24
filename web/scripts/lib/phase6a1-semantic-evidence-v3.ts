/**
 * Oracle evidence validation — assert spans exist in canonical commander Oracle.
 */
import type { SemanticEvidence } from "../../src/lib/deck-synthesis/build-path-semantic-types-v3";

export function normalizeForSpanMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\{[^}]+\}/g, (m) => m.replace(/\s+/g, ""))
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function spanExistsInOracle(span: string, oracleText: string): boolean {
  if (!span?.trim() || !oracleText?.trim()) return false;
  const normSpan = normalizeForSpanMatch(span);
  const normOracle = normalizeForSpanMatch(oracleText);
  if (normOracle.includes(normSpan)) return true;

  const words = normSpan.split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return normSpan.length <= 4 && normOracle.includes(normSpan);
  const matched = words.filter((w) => normOracle.includes(w)).length;
  return matched / words.length >= 0.75;
}

export function validateOracleEvidence(
  evidence: SemanticEvidence,
  oracleTexts: Array<{ sourceOracleId?: string; name: string; oracleText: string }>,
): { valid: boolean; reason: string | null } {
  if (evidence.type === "STRATEGY_HYPOTHESIS" || evidence.type === "DERIVED_CAUSAL_INFERENCE") {
    return { valid: true, reason: null };
  }

  if (evidence.type === "COMMANDER_ORACLE") {
    if (!evidence.oracleSpan?.trim()) {
      return { valid: false, reason: "COMMANDER_ORACLE evidence missing oracleSpan" };
    }
    const candidates = evidence.sourceOracleId
      ? oracleTexts.filter((t) => t.sourceOracleId === evidence.sourceOracleId)
      : evidence.sourceCommander
        ? oracleTexts.filter((t) => t.name === evidence.sourceCommander)
        : oracleTexts;

    if (candidates.length === 0) {
      return { valid: false, reason: "No matching commander Oracle record for evidence" };
    }

    const found = candidates.some((t) => spanExistsInOracle(evidence.oracleSpan!, t.oracleText));
    return found
      ? { valid: true, reason: null }
      : { valid: false, reason: `oracleSpan not found in canonical Oracle: "${evidence.oracleSpan}"` };
  }

  return { valid: false, reason: `Unknown evidence type: ${evidence.type}` };
}

const STRATEGY_PHRASE_PATTERNS = [
  /\btribal\b/i,
  /\bstrateg(y|ies)\b/i,
  /\bmidrange\b/i,
  /\baggro\b/i,
  /\bcombo\b/i,
  /\bwin from graveyard\b/i,
  /\bthoracle\b/i,
  /\bdread return\b/i,
  /\befficient threats\b/i,
  /\bgenerally useful\b/i,
  /\bstandalone stax\b/i,
  /\bgoblin combat\b/i,
  /\btoken payoff cards\b/i,
  /\bartifact synergies\b/i,
  /\bwithout .* online\b/i,
  /\bpopulate graveyard\b/i,
  /\bmill yourself\b/i,
  /\bnon-[\w]+ reanimation\b/i,
];

export function looksLikeStrategyAssertion(text: string): boolean {
  return STRATEGY_PHRASE_PATTERNS.some((p) => p.test(text));
}

export function oracleSummaryContradictsOracle(summary: string, oracleBlob: string): boolean {
  const s = summary.toLowerCase();
  const o = oracleBlob.toLowerCase();

  if (/mills on attack/i.test(s) && !/attack/i.test(o) && /mills? (three|target)/i.test(o)) {
    return true;
  }
  if (/creates? dragon on dragon death/i.test(s) && !/dragon.*dies|whenever a dragon/i.test(o)) {
    if (/first dragon spell.*costs.*less/i.test(o)) return true;
  }
  if (/partner\/background member.*cross-support/i.test(s)) return true;

  return false;
}
