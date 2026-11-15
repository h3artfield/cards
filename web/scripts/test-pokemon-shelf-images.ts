import assert from "node:assert/strict";
import { formatPokemonShelfText } from "../src/lib/inventory/pokemon-shelf-text";
import {
  pokemonImageLocalId,
  pokemonShelfCatalogName,
  pokemonShelfImageUrls,
  pokemonShelfSetId,
} from "../src/lib/inventory/pokemon-shelf-set";

const cases: Array<[string, string, string, string]> = [
  ["SV: Scarlet & Violet 151", "201/165", "sv3pt5", "201"],
  ["SM - Crimson Invasion", "113/111", "sm4", "113"],
  ["McDonald's Promos 2017", "008/012", "mcd17", "8"],
  ["SM - Burning Shadows", "84/147", "sm3", "84"],
  ["ME04: Chaos Rising", "090/086", "me4", "90"],
  ["SV: Scarlet & Violet Promo Cards", "016", "svp", "16"],
  ["SV: Prismatic Evolutions", "170/131", "sv8pt5", "170"],
  ["XY Base Set", "121/146", "xy1", "121"],
  ["SM Base Set", "158/149", "sm1", "158"],
  ["Base Set", "4/102", "base1", "4"],
  ["Base Set 2", "4/130", "base4", "4"],
  ["SWSH09: Brilliant Stars Trainer Gallery", "TG08/TG30", "swsh9tg", "TG08"],
  ["Generations: Radiant Collection", "RC24/RC32", "g1", "RC24"],
  ["Generations: Radiant Collection", "RC4/RC32", "g1", "RC4"],
  ["ME: Mega Evolution Promo", "065", "mep", "65"],
  ["McDonald's Promos 2024", "012/015", "mcd24", "12"],
  ["McDonald's 25th Anniversary Promos", "025/025", "mcd21", "25"],
  ["Unleashed", "95/95", "hgss2", "95"],
  ["SWSH: Sword & Shield Promo Cards", "SWSH260", "swshp", "SWSH260"],
  ["SWSH: Sword & Shield Promo Cards", "SWSH024", "swshp", "SWSH024"],
  ["XY Promos", "XY116", "xyp", "XY116"],
  ["Pokemon GO", "81/78", "pgo", "81"],
];

for (const [setName, cardNumber, setId, localId] of cases) {
  assert.equal(pokemonShelfSetId(setName, cardNumber), setId, setName);
  assert.equal(pokemonImageLocalId(cardNumber), localId, cardNumber);
  const urls = pokemonShelfImageUrls(setName, cardNumber);
  assert.equal(
    urls[0],
    `https://images.scrydex.com/pokemon/${setId}-${localId}/large`,
    setName,
  );
}

assert.equal(pokemonShelfCatalogName("Alakazam ex - 201/165"), "Alakazam ex");
assert.equal(pokemonShelfCatalogName("Alolan Golem GX (Secret)"), "Alolan Golem GX");
assert.equal(pokemonShelfCatalogName("Alolan Meowth - 8/12"), "Alolan Meowth");
assert.equal(pokemonShelfCatalogName("Alakazam (33)"), "Alakazam");
assert.equal(
  pokemonShelfCatalogName("Professor's Research [Professor Willow] (Secret)"),
  "Professor's Research",
);
assert.equal(pokemonShelfCatalogName("Charizard V - SWSH260"), "Charizard V");
assert.ok(
  pokemonShelfImageUrls("Celebrations: Classic Collection", "54/99").includes(
    "https://images.pokemontcg.io/cel25c/54_A_hires.png",
  ),
);
assert.equal(pokemonShelfSetId("Miscellaneous Cards & Products"), null);
assert.equal(pokemonImageLocalId("None"), null);
assert.equal(pokemonImageLocalId(""), null);

assert.equal(pokemonShelfSetId("Triumphant", "9/102"), "hgss4");
assert.equal(pokemonShelfSetId("Base Set (Shadowless)", "051/102"), "base1");
assert.equal(pokemonShelfSetId("Diamond and Pearl Promos", "DP43"), "dpp");
assert.equal(
  pokemonShelfSetId(
    "Miscellaneous Cards & Products",
    "SWSH039",
    "Pikachu - SWSH039 (General Mills)",
  ),
  "swshp",
);
assert.equal(
  pokemonShelfSetId(
    "Deck Exclusives",
    "020/111",
    "Gallade E4 - 20/111 (DPPt Rising Rivals)",
  ),
  "pl2",
);
assert.equal(
  pokemonShelfSetId(
    "Miscellaneous Cards & Products",
    "208/182",
    "Team Rocket's Moltres ex - 208/182 (Destined Rivals Stamp)",
  ),
  "sv10",
);
assert.equal(
  pokemonShelfSetId(
    "Deck Exclusives",
    "014/100",
    "Blastoise - 14/100 (EX Crystal Guardians)",
  ),
  "ex14",
);
assert.equal(
  pokemonShelfSetId("Jumbo Cards", "XY70", "Tyrantrum EX - XY70"),
  "xyp",
);
assert.equal(
  pokemonShelfSetId(
    "Miscellaneous Cards & Products",
    "096/149",
    "Dragonite - 96/149 (Cosmos Holo)",
  ),
  null,
);

const sprigatito = formatPokemonShelfText({
  supertype: "Pokémon",
  subtypes: ["Basic"],
  hp: "60",
  types: ["Grass"],
  attacks: [
    {
      cost: ["Grass"],
      name: "Gather Sunlight",
      text: "Search your deck for up to 2 Basic Energy cards.",
    },
  ],
  weaknesses: [{ type: "Fire", value: "×2" }],
  retreatCost: ["Colorless"],
  flavorText: "Its fluffy fur is similar in composition to plants.",
  artist: "Kouki Saitou",
  rarity: "Illustration Rare",
});
assert.equal(sprigatito?.typeLine, "Basic Pokémon · Grass · HP 60");
assert.match(sprigatito?.oracleText ?? "", /Gather Sunlight/);
assert.match(sprigatito?.oracleText ?? "", /Weakness: Fire ×2/);
assert.equal(sprigatito?.artist, "Kouki Saitou");
assert.equal(sprigatito?.flavorText, "Its fluffy fur is similar in composition to plants.");

console.log("pokemon shelf images: ok");
