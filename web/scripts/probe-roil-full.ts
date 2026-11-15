import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const t =
  "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card.";
const r = extractOracleActionsV1({ oracleId: "x", oracleText: t });
console.log(r.abilities?.map((a) => a.paragraphText.slice(0, 60)));
console.log(
  r.actions.map((a) => ({
    t: a.actionType,
    e: a.evidenceText,
    opt: a.optionalEffect,
    abi: a.abilityIndex,
  })),
);
