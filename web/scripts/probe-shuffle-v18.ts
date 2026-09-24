import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const t1 =
  "Search your library for up to four cards with different names and reveal them. Target opponent chooses two of those cards. Put the chosen cards into your graveyard and the rest into your hand. Then shuffle.";
const t2 = "Search your library for a card, then shuffle and put that card on top. You lose 2 life.";
console.log(
  "Gifts",
  extractOracleActionsV1({ oracleId: "t", oracleText: t1 }).actions.map((a) => `${a.actionType}:${a.evidenceText}`),
);
console.log(
  "Vamp",
  extractOracleActionsV1({ oracleId: "t", oracleText: t2 }).actions.map((a) => `${a.actionType}:${a.evidenceText}`),
);
