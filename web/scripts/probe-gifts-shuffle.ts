import { compoundClauseSpansWithRoles } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const t =
  "Search your library for up to four cards with different names and reveal them. Target opponent chooses two of those cards. Put the chosen cards into your graveyard and the rest into your hand. Then shuffle.";
console.log("spans", compoundClauseSpansWithRoles(t).map((s) => s.text.slice(0, 60)));
const re = /\bthen shuffle(?: your library|\.)?\b/i;
for (const s of compoundClauseSpansWithRoles(t)) {
  console.log("match in span", s.text, re.test(s.text));
}
console.log("full para match", re.test(t));
