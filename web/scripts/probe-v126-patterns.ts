import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const tests: Array<[string, string]> = [
  [
    "Perilous",
    "Return target nonland permanent you don't control to its owner's hand. If its mana value was 2 or less, scry 2.",
  ],
  [
    "Demonic",
    "Enchant creature\nWhen enchanted creature dies, return that card to its owner's hand.",
  ],
  [
    "Wail",
    "Descend 8 — Choose one.\n• Return target nonland permanent to its owner's hand.\n• Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard.",
  ],
  [
    "Roil",
    "Kicker {1}{U}\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card.",
  ],
];

for (const [name, text] of tests) {
  const r = extractOracleActionsV1({ oracleId: "x", oracleText: text });
  console.log(
    name,
    r.actions.map((a) => ({
      t: a.actionType,
      e: a.evidenceText.slice(0, 45),
      s: a.reviewStatus,
      opt: a.optionalEffect,
      m: a.modalOptionId,
    })),
  );
}
