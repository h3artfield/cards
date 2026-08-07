import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const cases = [
  {
    id: "eval-0052",
    oracleId: "x",
    oracleText:
      "{T}: Add {C}.\n{1}, {T}, Sacrifice a creature: Put a soul counter on this land. Then if there are three or more soul counters on it, remove those counters, transform it, then untap it. Activate only as a sorcery.\n//\nWhenever this creature attacks, you may exile a creature card from your graveyard. If you do, each opponent loses X life and you gain X life, where X is the number of creature cards exiled with this creature.\n{4}: This creature phases out.",
  },
  {
    id: "eval-0114",
    oracleId: "x",
    oracleText:
      "Menace\nWhenever this creature attacks, each opponent loses X life and you gain X life, where X is the number of other Squirrels, Bats, Lizards, and Rats you control.",
  },
  {
    id: "storm",
    oracleId: "x",
    oracleText:
      "Create two 1/1 red Goblin creature tokens.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
  },
];

for (const c of cases) {
  const r = extractOracleActionsV1(c);
  console.log("---", c.id);
  for (const a of r.actions) {
    console.log(a.reviewStatus, a.actionType, a.evidenceText, "face", a.faceId, "role", a.textRole);
  }
}
