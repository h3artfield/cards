import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const cases: Array<[string, string, string?]> = [
  ["Harmonic Sliver", 'All Slivers have "When this permanent enters, destroy target artifact or enchantment."'],
  ["Omniscience", "You may cast spells from your hand without paying their mana costs."],
  ["Joiner Adept", 'Lands you control have "{T}: Add one mana of any color."'],
  ["Search Premises", 'Whenever a creature attacks you or a planeswalker you control, investigate. (Create a Clue token. It\'s an artifact with "{2}, Sacrifice this token: Draw a card.")'],
  ["Glassworks front", "When you unlock this door, this Room deals 4 damage to target creature an opponent controls.\n(You may cast either half.)\n//\nAt the beginning of your end step, this Room deals 1 damage to each opponent.", "front"],
  ["Ashiok", "−1: Target player mills four cards. Then exile each opponent's graveyard."],
  ["Smallpox", "Each player loses 1 life, discards a card, sacrifices a creature of their choice, then sacrifices a land of their choice."],
  ["Sorcerer Class", 'Creatures you control have "{T}: Add {U} or {R}. Spend this mana only to cast an instant or sorcery spell or to gain a Class level."'],
  ["Faithless Looting", "Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"],
];

for (const [name, text, face] of cases) {
  const r = extractOracleActionsV1({ oracleId: "x", oracleText: text, cardFace: face });
  console.log(`\n${name}:`);
  for (const a of r.actions) {
    console.log(`  ${a.actionType}: ${a.evidenceText.slice(0, 60)} [${a.textRole}] ${a.reviewStatus}`);
  }
  if (r.actions.length === 0) console.log("  (none)");
}
