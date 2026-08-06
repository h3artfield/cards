/** Detect Magic rules / legality questions (Comprehensive Rules), not strategy or inventory. */

const RULES_MARKERS =
  /\b(rule \d{3}|comprehensive rules|\bcr \d{3}|state-based|sb?a|the stack|priority|layers?|timestamp|replacement effect|triggered ability|static ability|mana ability|legendary rule|commander tax|commander damage)\b/i;

const RULES_INTERACTION =
  /\b(combat|block(?:er|ing)?|attack(?:ing|er)?|trigger|phase|step|turn|respond|counter(?:ed|ing)?|target|fizzle|resolve|copy|clone|mill|exile|graveyard|hand|library|draw|discard|life|damage|prevent|protection|hexproof|ward|indestructible|first strike|double strike|trample|lifelink|deathtouch|vigilance|reach|flying|menace|flash|haste|defender|summoning sickness|land drop)\b/i;

const RULES_PHRASING =
  /\b(how does|how do|what happens when|when do|can i|does|do|am i allowed|is it legal|is this legal|illegal|legal to|at what point|in response to|rules question|rules of magic|game rules|comp rules|what is the rule)\b/i;

export function isRulesQuestion(question: string): boolean {
  const q = question.trim();
  if (!q) return false;

  if (RULES_MARKERS.test(q)) return true;
  if (/\b(rules question|rules of magic|game rules)\b/i.test(q)) return true;

  if (RULES_PHRASING.test(q) && RULES_INTERACTION.test(q)) return true;
  if (/\bdoes .+ (stop|prevent|work|count|trigger)\b/i.test(q)) return true;
  if (/\bcan (?:a|an|this|that|i) .+ be my commander\b/i.test(q)) return true;
  if (/\bcan .+ go in my commander'?s deck\b/i.test(q)) return true;
  if (/\bhow does .+ work\b/i.test(q) && RULES_INTERACTION.test(q)) return true;

  return false;
}

export function extractRequestedRuleNumbers(question: string): string[] {
  const out = new Set<string>();
  for (const match of question.matchAll(
    /\b(?:rule|cr)\s*(\d{3}(?:\.\d+[a-z]?)?)\b/gi,
  )) {
    if (match[1]) out.add(match[1]);
  }
  return [...out];
}
