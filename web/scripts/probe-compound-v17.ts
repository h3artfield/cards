import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const cases: Array<[string, string]> = [
  ["Rampant Growth", "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle."],
  ["Ashiok", "Target player mills four cards. Then exile each opponent's graveyard."],
  ["Fable III", "Exile this Saga, then return it to the battlefield transformed under your control."],
  ["Smallpox", "Each player loses 1 life, discards a card, sacrifices a creature of their choice, then sacrifices a land of their choice."],
  ["Living End", "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield."],
  ["discard draw", "Discard a card. If you do, draw two cards."],
];

for (const [n, t] of cases) {
  const r = extractOracleActionsV1({ oracleId: "t", oracleText: t });
  console.log(
    n,
    r.actions.map((a) => `${a.actionType}:${a.evidenceText.slice(0, 50)}`),
  );
}
