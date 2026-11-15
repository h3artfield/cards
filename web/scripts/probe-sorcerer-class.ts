import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const t =
  '(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, draw two cards, then discard two cards.\n{U}{R}: Level 2\nCreatures you control have "{T}: Add {U} or {R}. Spend this mana only to cast an instant or sorcery spell or to gain a Class level."\n{3}{U}{R}: Level 3\nWhenever you cast an instant or sorcery spell, that spell deals damage to each opponent equal to the number of instant and sorcery spells you\'ve cast this turn.';
const r = extractOracleActionsV1({ oracleId: "x", oracleText: t });
for (const a of r.actions) {
  console.log(a.reviewStatus, a.actionType, a.evidenceText, "start", a.evidenceStart);
}
