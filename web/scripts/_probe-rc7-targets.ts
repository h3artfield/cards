import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";

const cases = [
  {
    id: "vh15-0064",
    text: "At the beginning of your end step, if you have no cards in hand, draw seven cards.\nWhenever chaos ensues, discard your hand.",
  },
  {
    id: "vh16-0047",
    text: "Choose one —\n• Discard your hand, then draw cards equal to the number of cards in target opponent's hand.\n• Discard your hand, then draw cards equal to the number of cards discarded this way.",
  },
  {
    id: "vh16-0027",
    text: "You may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost. If that spell would be put into their graveyard, exile it instead.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)",
  },
  {
    id: "vh16-0038",
    text: "0: Put a loyalty counter on each red planeswalker you control.\n0: Create two 1/1 red Elemental creature tokens. They gain haste. Sacrifice them at the beginning of the next end step.\n−2: You may cast target instant or sorcery card with mana value 3 or less from your graveyard. If that spell would be put into your graveyard, exile it instead.",
  },
];

for (const c of cases) {
  const p = parseOracleSemanticsRC3({ oracleId: c.id, oracleText: c.text });
  console.log("===", c.id, "===");
  console.log(
    "actions:",
    p.actions.map((a) => ({
      type: a.actionType,
      ev: a.provenance?.actionSpan?.text?.slice(0, 90),
      ctx: a.executionContext,
      role: a.textRole,
      review: a.reviewStatus,
    })),
  );
  console.log(
    "spans:",
    p.spans
      ?.filter((s) => /discard|exile|instead|would|hand/i.test(s.text))
      .map((s) => ({ role: s.role, text: s.text.slice(0, 100) })),
  );
}
