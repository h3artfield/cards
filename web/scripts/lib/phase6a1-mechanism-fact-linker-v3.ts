/**
 * Link adjudicated strategy mechanics to supporting CommanderMechanismFacts.
 */
import type { IndependentMechanismFact } from "../../src/lib/deck-synthesis/independent-truth-types-v1";

export const MECHANISM_FACT_LINKER_V3_VERSION = "phase6a1-mechanism-fact-linker-v3";

const KEYWORD_TO_FACT: Array<{ pattern: RegExp; factHints: RegExp[] }> = [
  { pattern: /mill|graveyard population|self-mill/i, factHints: [/mill/i, /MILL/i] },
  { pattern: /recursion|reanimation|creature.*graveyard/i, factHints: [/graveyard/i, /RETURN/i, /recur/i] },
  { pattern: /death|sacrifice|experience/i, factHints: [/dies/i, /death/i, /experience/i, /SACRIFICE/i] },
  { pattern: /goblin|token swarm/i, factHints: [/goblin/i, /CREATE_TOKEN/i, /GOBLIN/i] },
  { pattern: /untap|tap.*repeat/i, factHints: [/TAP/i, /untap/i] },
  { pattern: /mana|nonland permanent|ramp|rock|doubl/i, factHints: [/mana/i, /MANA/i, /tap a nonland/i] },
  { pattern: /big-?mana|sink|non-human creature|top five|library/i, factHints: [/LIBRARY/i, /NON_HUMAN/i, /mana/i] },
  { pattern: /combat|evasive|damage|ninja|attack/i, factHints: [/combat/i, /COMBAT/i, /attack/i, /damage/i] },
  { pattern: /draw|card advantage/i, factHints: [/draw/i, /DRAW/i] },
  { pattern: /exile|treasure|play from exile/i, factHints: [/exile/i, /EXILE/i, /treasure/i] },
  { pattern: /tax|spell cost|augustin/i, factHints: [/cost/i, /spell/i] },
  { pattern: /enchantment|saga|constellation/i, factHints: [/enchantment/i, /SAGA/i] },
  { pattern: /artifact|unearth|clue/i, factHints: [/artifact/i, /unearth/i] },
  { pattern: /thrasios|scry|land.*battlefield/i, factHints: [/thrasios/i, /SCRY/i, /land/i] },
  { pattern: /tymna|postcombat|lifelink/i, factHints: [/tymna/i, /postcombat/i, /LIFELINK/i] },
  { pattern: /horror|creature.*mill|zellix/i, factHints: [/horror/i, /mill/i, /MILL/i] },
  { pattern: /dragon spell|acolyte|cost.*less/i, factHints: [/dragon/i, /GRANT/i, /cost/i] },
  { pattern: /targeting|copy|orvar|changeling/i, factHints: [/copy/i, /target/i, /orvar/i] },
  { pattern: /connive|discard/i, factHints: [/connive/i, /discard/i] },
  { pattern: /animus|shaun|mill two/i, factHints: [/animus/i, /mill/i, /MILL/i, /shaun/i] },
  { pattern: /kenrith|reanimation|counter|haste|trample/i, factHints: [/kenrith/i, /graveyard/i, /counter/i, /trample/i] },
];

function factBlob(f: IndependentMechanismFact): string {
  return JSON.stringify(f).toLowerCase();
}

export function linkMechanismFacts(
  mechanicLabel: string,
  facts: IndependentMechanismFact[],
  commanders: string[],
): { factIds: string[]; membersSupported: string[] } {
  const matched = new Set<string>();
  const members = new Set<string>();

  for (const rule of KEYWORD_TO_FACT) {
    if (!rule.pattern.test(mechanicLabel)) continue;
    for (const fact of facts) {
      const blob = factBlob(fact);
      if (rule.factHints.some((h) => h.test(blob) || h.test(fact.evidenceSpan))) {
        matched.add(fact.mechanismId);
        if (fact.commander && typeof fact.commander === "string") {
          members.add(fact.commander);
        }
      }
    }
  }

  for (const cmd of commanders) {
    const short = cmd.split(",")[0]?.split(" ")[0] ?? cmd;
    if (mechanicLabel.toLowerCase().includes(short.toLowerCase())) {
      members.add(cmd);
      for (const fact of facts) {
        if (fact.commander === cmd) matched.add(fact.mechanismId);
      }
    }
  }

  if (matched.size === 0 && facts.length > 0) {
    const first = facts[0]!;
    matched.add(first.mechanismId);
    if (first.commander) members.add(first.commander as string);
  }

  if (members.size === 0) {
    for (const c of commanders) members.add(c);
  }

  return { factIds: [...matched], membersSupported: [...members] };
}

export function unreferencedFacts(
  facts: IndependentMechanismFact[],
  referencedIds: Set<string>,
): IndependentMechanismFact[] {
  return facts.filter((f) => !referencedIds.has(f.mechanismId));
}
