import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { findQuotedAbilitySpans, classifyTextRoleAt } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";

const cases = [
  ["Harmonic Sliver", 'All Slivers have "When this permanent enters, destroy target artifact or enchantment."'],
  ["Joiner Adept", 'Lands you control have "{T}: Add one mana of any color."'],
  ["Caustic Tar", 'Enchanted land has "{T}: Target player loses 3 life."'],
  ["Curious Obsession", 'Enchanted creature gets +1/+1 and has "Whenever this creature deals combat damage to a player, you may draw a card."'],
];

for (const [name, text] of cases) {
  console.log("===", name);
  console.log("quotes:", findQuotedAbilitySpans(text));
  const idx = text.indexOf("destroy") >= 0 ? text.indexOf("destroy") : text.indexOf("Add") >= 0 ? text.indexOf("Add") : text.indexOf("loses") >= 0 ? text.indexOf("loses") : text.indexOf("draw");
  if (idx >= 0) {
    console.log("role at action:", classifyTextRoleAt({ paragraph: text, localStart: idx, localEnd: idx + 10 }));
  }
  console.log("actions:", extractOracleActionsV1({ oracleId: "t", oracleText: text }).actions.map((a) => `${a.actionType}:${a.evidenceText.slice(0,40)}`));
}
