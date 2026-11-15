import assert from "node:assert/strict";
import { familiesFromCardV1_1 } from "./tag-families-v1.1";

function tags(typeLine: string, text: string): string[] {
  return [...familiesFromCardV1_1({ typeLine, oracleText: text })].sort();
}

function has(typeLine: string, text: string, fam: string): boolean {
  return familiesFromCardV1_1({ typeLine, oracleText: text }).has(fam as never);
}

assert.equal(has("Enchantment — Aura", "Enchanted creature gets +2/+0 and has trample.\nWhen Rancor is put into a graveyard from the battlefield, return Rancor to its owner's hand.", "ramp"), false, "Rancor is not ramp");
assert.equal(has("Creature — Snake", "{2}{G}: Narnam Cobra gains deathtouch until end of turn.", "ramp"), false, "Narnam Cobra is not ramp");
assert.equal(has("Land — Forest", "({T}: Add {G}.)", "ramp"), false, "basic land is mana base");
assert.equal(has("Land — Plains Island", "({T}: Add {W} or {U}.)", "ramp"), false, "dual land is mana base");
assert.equal(has("Artifact", "{T}: Add {C}{C}.", "ramp"), true, "Sol Ring");
assert.equal(has("Creature — Elf Druid", "{T}: Add {G}.", "ramp"), true, "Llanowar Elves");
assert.equal(
  has("Sorcery", "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.", "ramp"),
  true,
  "Rampant Growth",
);
assert.equal(
  has("Sorcery", "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.", "ramp"),
  true,
  "Cultivate",
);
assert.equal(
  has("Enchantment", "At the beginning of your upkeep, if an opponent controls more lands than you, you may search your library for up to three basic land cards, reveal them, put them into your hand, then shuffle.", "ramp"),
  false,
  "Land Tax is land to hand",
);
assert.equal(
  has("Land", "{T}: Add {C}.\n{3}{G}, {T}, Sacrifice this land: Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.", "ramp"),
  true,
  "Blighted Woodland extra lands",
);
assert.equal(has("Artifact", "{T}: Add {C}{C}{C}.", "ramp"), true, "Mana Vault");
assert.equal(has("Instant", "Counter target spell.", "interact"), true);
assert.equal(has("Instant", "Lightning Bolt deals 3 damage to any target.", "interact"), true);
assert.equal(
  has("Legendary Creature — Cat Druid", "At the beginning of your end step, exile target creature you control, then return it to the battlefield under its owner's control.", "interact"),
  false,
  "flicker is not interaction",
);
assert.equal(has("Creature — Human Wizard", "Illusion creatures you control get +1/+1 and have hexproof.", "protect"), true);
assert.equal(has("Creature — Goblin Scout", "Protection from white", "protect"), false, "self keyword only");
assert.equal(has("Artifact — Equipment", "Equipped creature gets +1/+2 and has hexproof.\nEquip {3}", "protect"), true);
assert.equal(has("Sorcery", "Return target creature card from your graveyard to the battlefield.", "recur"), true);
assert.equal(has("Land", "When this land enters, exile target player's graveyard.\n{T}: Add {B}.", "recur"), false);
assert.equal(has("Sorcery", "Search your library for a card, put it into your hand, then shuffle.", "tutor"), true);
assert.equal(has("Sorcery", "Search your library for any number of land cards, exile them, then shuffle.", "tutor"), false);
assert.equal(has("Instant", "Draw two cards.", "draw"), true);
assert.equal(has("Artifact Creature — Human Wizard", "Cycling {U/B} ({U/B}, Discard this card: Draw a card.)", "draw"), true);

console.log(`tag-families-v1.1.selftest ${tags("Artifact", "{T}: Add {C}{C}.")} ok`);
