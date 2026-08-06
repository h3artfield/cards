import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const cases: Array<[string, string]> = [
  ["eval-0098", "You may create a 1/1 token."],
  [
    "eval-0120",
    "Deathtouch\nWhenever you exile a card, create a Treasure token.\nWhenever you sacrifice a Treasure, exile the top card of your library. You may play that card this turn.",
  ],
  ["eval-0017", "Whenever an opponent draws a card, that player may pay {2}. If they don't, you draw a card."],
  ["dev-opt-011", "As an additional cost to cast this spell, you may sacrifice a creature."],
  ["dev-opt-033", "An opponent may sacrifice a creature rather than pay this spell's mana cost."],
  ["eval-0109", "Exile target instant or sorcery card from your graveyard. Copy it. You may cast the copy."],
];

for (const [id, text] of cases) {
  const r = extractOracleActionsV1({ oracleId: id, oracleText: text });
  console.log(
    id,
    JSON.stringify(
      r.actions.map((a) => ({
        t: a.actionType,
        e: a.evidenceText.slice(0, 55),
        oe: a.optionalEffect,
        oc: a.optionalCost,
        ctrl: a.optionalityController,
      })),
    ),
    "abstain",
    r.abstainedClauses.length,
  );
}
