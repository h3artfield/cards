import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

const patterns = [
  { label: "may_if_you_do", re: /has "[^"]*(Whenever|When)[^"]*you may[^"]*\. If you do/i },
  { label: "add_mana_symbol", re: /has "[^"]*Add \{[^}]+\}/i },
  { label: "any_color", re: /has "[^"]*Add one mana of any color/i },
  { label: "untap_this_perm", re: /has "[^"]*Untap this permanent/i },
  { label: "untap_this_creature", re: /has "[^"]*Untap this creature/i },
  { label: "tap_or_untap", re: /has "[^"]*tap or untap target/i },
  { label: "plus_counter", re: /has "[^"]*\+1\/\+1 counter/i },
  { label: "minus_counter", re: /has "[^"]*-1\/-1 counter/i },
  { label: "target_player_may", re: /Target player may draw/i },
  { label: "creatures_have_mana", re: /Creatures you control have "[^"]*Add/i },
  { label: "equipment_activated", re: /Equipped creature has "[^"]*\{[^}]+\}[^"]*:/i },
  { label: "static_hexproof", re: /has hexproof/i },
];

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const hits = new Map<string, string[]>();
  for (const card of catalog.byOracleId.values()) {
    const text = combinedGoldenOracleText(card);
    for (const p of patterns) {
      if (p.re.test(text)) {
        if (!hits.has(p.label)) hits.set(p.label, []);
        const arr = hits.get(p.label)!;
        if (arr.length < 10) arr.push(card.canonicalName);
      }
    }
  }
  for (const [k, v] of hits) console.log(`${k}: ${v.join(" | ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
