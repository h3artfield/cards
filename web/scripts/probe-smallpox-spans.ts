import { compoundClauseSpansWithRoles } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";

const t =
  "Each player loses 1 life, discards a card, sacrifices a creature of their choice, then sacrifices a land of their choice.";
const re = /\bsacrifices? (?:a |an |all )?[\w ]+(?: of their choice)?/gi;
for (const span of compoundClauseSpansWithRoles(t, "t:front:0")) {
  const matches = [...span.text.matchAll(re)];
  console.log(JSON.stringify({ text: span.text, matches: matches.map((m) => m[0]) }));
}
