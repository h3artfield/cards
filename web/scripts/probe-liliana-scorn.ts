import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const t =
  "Destroy target creature. You may search your library and/or graveyard for a card named Liliana, Death Mage, reveal it, and put it into your hand. If you search your library this way, shuffle.";
const r = extractOracleActionsV1({ oracleId: "x", oracleText: t });
console.log(r.actions.map((a) => ({ t: a.actionType, e: a.evidenceText, s: a.reviewStatus })));
