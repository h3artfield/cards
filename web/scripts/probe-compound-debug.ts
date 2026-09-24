import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { compoundClauseSpansWithRoles } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { segmentCompoundClauses } from "../src/lib/deck-builder/golden-catalog/oracle-compound-clause-segmentation";

const tests: Array<[string, string]> = [
  ["put", "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle."],
  ["ashiok", "-1: Target player mills four cards. Then exile each opponent's graveyard."],
  ["fable", "III — Exile this Saga, then return it to the battlefield transformed under your control."],
  ["smallpox", "Each player loses 1 life, discards a card, sacrifices a creature of their choice, then sacrifices a land of their choice."],
  ["living", "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield."],
];

for (const [n, t] of tests) {
  console.log("===", n);
  console.log("spans:", compoundClauseSpansWithRoles(t).map((s) => `[${s.role}] ${s.text.slice(0, 70)}`));
  console.log(
    "seg:",
    segmentCompoundClauses({ parentAbilityId: "a", paragraph: t }).map(
      (s) => `[${s.dependency.kind}] ${s.text.slice(0, 70)}`,
    ),
  );
  console.log(
    "actions:",
    extractOracleActionsV1({ oracleId: "t", oracleText: t }).actions.map(
      (a) => `${a.actionType}:${a.evidenceText.slice(0, 45)} [${a.reviewStatus}] role=${a.textRole}`,
    ),
  );
}
