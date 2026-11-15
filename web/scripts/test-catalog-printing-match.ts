import assert from "node:assert/strict";
import {
  catalogPrintingMatchesInventoryItem,
  collectorNumbersAgree,
} from "../src/lib/inventory/resolve-display-image";
import {
  cardsMatchingShelfSet,
  pickScryfallShelfImage,
  pickTokenShelfCard,
  scryfallShelfImageQueries,
  scryfallShelfRulesFromCard,
  setNamesForImageSearch,
} from "../src/lib/inventory/image-fallback";
import {
  cardBackImageUrl,
  cardHasOtherFace,
  inventoryBackFacePath,
  scryfallBackFaceUrl,
} from "../src/lib/inventory/double-faced-card";
import type { InventoryItem } from "../src/lib/types";

const promoScan = {
  id: "22a178f0-3cfc-485e-92a4-d4b543d21b0a",
  name: "Reckoner Bankbuster",
  set: "pneo",
  setName: "Kamigawa: Neon Dynasty Promos",
  collectorNumber: "255p",
  cmc: 2,
  typeLine: "Artifact — Vehicle",
  colorIdentity: [],
  isCommander: false,
  tcgplayerId: "263983",
  updatedAt: "2026-01-01",
} as CatalogCard;

function row(partial: Partial<InventoryItem>): InventoryItem {
  return {
    displayName: "Reckoner Bankbuster",
    productName: "Reckoner Bankbuster",
    ...partial,
  } as InventoryItem;
}

assert.equal(
  catalogPrintingMatchesInventoryItem(
    row({
      tcgplayerProductId: "263983",
      setName: "Promo Pack: Kamigawa: Neon Dynasty",
    }),
    promoScan,
  ),
  true,
);

assert.equal(
  catalogPrintingMatchesInventoryItem(
    row({
      tcgplayerProductId: "263515",
      setName: "Prerelease Cards",
    }),
    promoScan,
  ),
  false,
);

assert.equal(
  catalogPrintingMatchesInventoryItem(
    row({ setName: "Prerelease Cards" }),
    { ...promoScan, tcgplayerId: undefined },
  ),
  false,
);

assert.equal(
  catalogPrintingMatchesInventoryItem(
    row({
      productName: "Staff of Compleation",
      displayName: "Staff of Compleation",
      setName: "Phyrexia: All Will Be One",
    }),
    {
      ...promoScan,
      name: "Staff of Compleation",
      setName: "Tarkir: Dragonstorm Commander",
      tcgplayerId: undefined,
    },
  ),
  false,
);

assert.equal(
  catalogPrintingMatchesInventoryItem(
    row({
      productName: "Staff of Compleation",
      displayName: "Staff of Compleation",
      setName: "Commander: Tarkir: Dragonstorm",
    }),
    {
      ...promoScan,
      name: "Staff of Compleation",
      setName: "Tarkir: Dragonstorm Commander",
      tcgplayerId: undefined,
    },
  ),
  true,
);

assert.equal(
  catalogPrintingMatchesInventoryItem(
    row({
      productName: "The Endstone",
      displayName: "The Endstone",
      setName: "Promo Pack: Edge of Eternities",
      cardNumber: "240",
    }),
    {
      ...promoScan,
      name: "The Endstone",
      setName: "Edge of Eternities",
      collectorNumber: "391",
      tcgplayerId: undefined,
    },
  ),
  false,
);

assert.equal(
  catalogPrintingMatchesInventoryItem(
    row({
      productName: "The Endstone",
      displayName: "The Endstone",
      setName: "Promo Pack: Edge of Eternities",
      cardNumber: "240",
      tcgplayerProductId: "641882",
    }),
    {
      ...promoScan,
      name: "The Endstone",
      setName: "Edge of Eternities",
      collectorNumber: "391",
      tcgplayerId: "641882",
    },
  ),
  false,
);

assert.equal(collectorNumbersAgree("240", "240p"), true);
assert.equal(collectorNumbersAgree("240", "391"), false);
assert.deepEqual(setNamesForImageSearch("Promo Pack: Edge of Eternities"), [
  "Edge of Eternities Promos",
  "Promo Pack: Edge of Eternities",
]);
assert.deepEqual(setNamesForImageSearch("Commander: Edge of Eternities"), [
  "Edge of Eternities Commander",
  "Commander: Edge of Eternities",
]);
assert.deepEqual(setNamesForImageSearch("Commander: FINAL FANTASY"), [
  "FINAL FANTASY Commander",
  "Commander: FINAL FANTASY",
]);
assert.deepEqual(
  setNamesForImageSearch("Universes Beyond: The Lord of the Rings: Tales of Middle-earth"),
  [
    "The Lord of the Rings: Tales of Middle-earth",
    "Universes Beyond: The Lord of the Rings: Tales of Middle-earth",
  ],
);
assert.deepEqual(setNamesForImageSearch("The Hobbit: Eternal-Legal"), [
  "The Hobbit Eternal",
  "The Hobbit: Eternal-Legal",
]);
assert.deepEqual(setNamesForImageSearch("Secret Lair Drop Series"), [
  "Secret Lair Drop",
  "Secret Lair Drop Series",
]);
assert.deepEqual(setNamesForImageSearch("The List Reprints"), [
  "The List",
  "The List Reprints",
]);
assert.deepEqual(setNamesForImageSearch("8th Edition"), [
  "Eighth Edition",
  "8th Edition",
]);
assert.deepEqual(setNamesForImageSearch("6th Edition"), [
  "Classic Sixth Edition",
  "6th Edition",
]);
assert.equal(
  pickScryfallShelfImage(
    { cardNumber: "314", setName: "8th Edition" },
    [
      {
        collector_number: "314★",
        set_name: "Eighth Edition",
        image_uris: { normal: "https://cards.scryfall.io/314star.jpg" },
      },
      {
        collector_number: "314",
        set_name: "Eighth Edition",
        image_uris: { normal: "https://cards.scryfall.io/314.jpg" },
      },
    ],
  ),
  "https://cards.scryfall.io/314.jpg",
);

const balothQueries = scryfallShelfImageQueries({
  names: ["Baloth Prime", "Baloth Prime (Extended Art)"],
  setNames: setNamesForImageSearch("Commander: Edge of Eternities"),
  collectorNumber: "33",
});
assert.equal(
  balothQueries[0]?.q,
  '!"Baloth Prime" set:"Edge of Eternities Commander" cn:33',
);
assert.equal(
  balothQueries.find((query) => query.q === '!"Baloth Prime" cn:33')?.matchSet,
  true,
);

const listQueries = scryfallShelfImageQueries({
  names: ["Akroma, Angel of Wrath"],
  setNames: setNamesForImageSearch("The List Reprints"),
  collectorNumber: "001/062",
});
assert.equal(listQueries[0]?.q, '!"Akroma, Angel of Wrath" set:"The List"');
assert.equal(listQueries[0]?.uniquePrinting, true);
assert.equal(listQueries.some((query) => query.q.includes("cn:")), false);

const dustQueries = scryfallShelfImageQueries({
  names: ["All Is Dust"],
  setNames: setNamesForImageSearch("The List Reprints"),
  collectorNumber: "1",
});
assert.equal(dustQueries[0]?.q, '!"All Is Dust" set:"The List"');
assert.equal(dustQueries[0]?.uniquePrinting, false);
assert.equal(
  pickScryfallShelfImage(
    { cardNumber: "1", setName: "The List Reprints" },
    [
      {
        collector_number: "1",
        set_name: "Rise of the Eldrazi",
        image_uris: { normal: "https://cards.scryfall.io/roe.jpg" },
      },
      {
        collector_number: "MM2-1",
        set_name: "The List",
        image_uris: { normal: "https://cards.scryfall.io/list.jpg" },
      },
    ],
  ),
  "https://cards.scryfall.io/list.jpg",
);
assert.equal(
  pickScryfallShelfImage(
    { cardNumber: "1", setName: "Rise of the Eldrazi" },
    [
      {
        collector_number: "MM2-1",
        set_name: "The List",
        image_uris: { normal: "https://cards.scryfall.io/list.jpg" },
      },
      {
        collector_number: "1",
        set_name: "Rise of the Eldrazi",
        image_uris: { normal: "https://cards.scryfall.io/roe.jpg" },
      },
    ],
  ),
  "https://cards.scryfall.io/roe.jpg",
);
assert.equal(
  pickScryfallShelfImage(
    { cardNumber: "2", setName: "The List Reprints" },
    [
      {
        collector_number: "MM2-1",
        set_name: "The List",
        image_uris: { normal: "https://cards.scryfall.io/list.jpg" },
      },
    ],
  ),
  undefined,
);

assert.deepEqual(
  cardsMatchingShelfSet(
    [
      { set_name: "Edge of Eternities" },
      { set_name: "Edge of Eternities Commander" },
    ],
    setNamesForImageSearch("Commander: Edge of Eternities"),
  ).map((card) => card.set_name),
  ["Edge of Eternities Commander"],
);

const shelf = {
  cardNumber: "240",
  setName: "Promo Pack: Edge of Eternities",
};
assert.equal(
  pickScryfallShelfImage(shelf, [
    {
      collector_number: "391",
      image_uris: { normal: "https://cards.scryfall.io/391.jpg" },
    },
    {
      collector_number: "240p",
      promo_types: ["promopack"],
      image_uris: { normal: "https://cards.scryfall.io/240p.jpg" },
    },
    {
      collector_number: "240",
      image_uris: { normal: "https://cards.scryfall.io/240.jpg" },
    },
  ]),
  "https://cards.scryfall.io/240p.jpg",
);

assert.equal(
  pickScryfallShelfImage(
    { cardNumber: "207", setName: "Avatar: The Last Airbender" },
    [
      {
        collector_number: "207",
        card_faces: [
          { image_uris: { normal: "https://cards.scryfall.io/normal/front/aang.jpg" } },
          { image_uris: { normal: "https://cards.scryfall.io/normal/back/aang.jpg" } },
        ],
      },
    ],
    "back",
  ),
  "https://cards.scryfall.io/normal/back/aang.jpg",
);
assert.equal(
  pickScryfallShelfImage(
    { cardNumber: "161", setName: "Throne of Eldraine" },
    [
      {
        collector_number: "161",
        image_uris: { normal: "https://cards.scryfall.io/normal/front/giant.jpg" },
        card_faces: [{}, {}],
      },
    ],
    "back",
  ),
  undefined,
);

assert.equal(
  cardHasOtherFace(
    "Legendary Creature — Human Avatar Ally // Legendary Creature — Avatar Ally",
  ),
  true,
);
assert.equal(cardHasOtherFace("Creature — Giant // Adventure"), false);
assert.equal(cardHasOtherFace("Instant // Sorcery"), false);
assert.equal(cardHasOtherFace("Instant"), false);
assert.equal(
  inventoryBackFacePath("/api/store/the-game-lodge/inventory/image?itemId=abc&v=16"),
  "/api/store/the-game-lodge/inventory/image?itemId=abc&v=16&face=back",
);
const extusFront =
  "https://cards.scryfall.io/normal/front/b/a/ba09360a-067e-48a5-bdc5-a19fd066a785.jpg";
assert.equal(
  scryfallBackFaceUrl(extusFront),
  "https://cards.scryfall.io/normal/back/b/a/ba09360a-067e-48a5-bdc5-a19fd066a785.jpg",
);
assert.equal(
  cardBackImageUrl({ imageUrl: extusFront }),
  "https://cards.scryfall.io/normal/back/b/a/ba09360a-067e-48a5-bdc5-a19fd066a785.jpg",
);
assert.equal(
  cardBackImageUrl({
    imageUrl: extusFront,
    imageProxyUrl: "/api/store/the-game-lodge/inventory/image?itemId=abc&v=16",
  }),
  "/api/store/the-game-lodge/inventory/image?itemId=abc&v=16&face=back",
);

assert.equal(
  scryfallShelfRulesFromCard({
    mana_cost: "{2}{W}",
    cmc: 3,
    type_line: "Legendary Creature — Human Soldier",
    oracle_text: "Sisay gets +1/+1 for each color among other legendary permanents you control.",
    power: "2",
    toughness: "2",
  }).oracleText,
  "Sisay gets +1/+1 for each color among other legendary permanents you control.",
);
assert.equal(
  scryfallShelfRulesFromCard({
    card_faces: [
      { oracle_text: "Flying", type_line: "Legendary Creature — Human Avatar Ally", power: "4", toughness: "4" },
      { oracle_text: "Flying", type_line: "Legendary Creature — Avatar Ally" },
    ],
  }).oracleText,
  "Flying\n//\nFlying",
);

const beastToken = row({
  displayName: "Beast Token (Multicolor)",
  productName: "Beast Token (Multicolor)",
  rarity: "T",
  setName: "Shards of Alara",
  cardNumber: "10",
});
assert.equal(
  pickTokenShelfCard(beastToken, [
    {
      name: "Ethersworn Canonist",
      layout: "normal",
      set_name: "Shards of Alara",
      collector_number: "10",
      type_line: "Artifact Creature — Human Cleric",
      image_uris: { normal: "https://cards.scryfall.io/normal/front/canonist.jpg" },
    },
    {
      name: "Beast",
      layout: "token",
      set_name: "Shards of Alara Tokens",
      collector_number: "10",
      colors: ["G", "R", "W"],
      type_line: "Token Creature — Beast",
      image_uris: { normal: "https://cards.scryfall.io/normal/front/beast.jpg" },
    },
    {
      name: "Beast",
      layout: "token",
      set_name: "Zendikar Tokens",
      collector_number: "10",
      colors: ["G"],
      type_line: "Token Creature — Beast",
      image_uris: { normal: "https://cards.scryfall.io/normal/front/zendikar-beast.jpg" },
    },
  ])?.image_uris?.normal,
  "https://cards.scryfall.io/normal/front/beast.jpg",
);

const doubleToken = row({
  displayName: "Zombie // Marit Lage Double-sided Token",
  productName: "Zombie // Marit Lage Double-sided Token",
  rarity: "T",
  setName: "Dominaria Remastered",
  cardNumber: "5 // 4",
});
const zombieAndMarit = [
  {
    name: "Zombie",
    layout: "token",
    set_name: "Dominaria Remastered Tokens",
    collector_number: "5",
    image_uris: { normal: "https://cards.scryfall.io/normal/front/zombie.jpg" },
  },
  {
    name: "Zombie",
    layout: "token",
    set_name: "Eldritch Moon Tokens",
    collector_number: "6",
    image_uris: { normal: "https://cards.scryfall.io/normal/front/em-zombie.jpg" },
  },
  {
    name: "Marit Lage",
    layout: "token",
    set_name: "Dominaria Remastered Tokens",
    collector_number: "4",
    image_uris: { normal: "https://cards.scryfall.io/normal/front/marit.jpg" },
  },
];
assert.equal(
  pickTokenShelfCard(doubleToken, zombieAndMarit, "front")?.image_uris?.normal,
  "https://cards.scryfall.io/normal/front/zombie.jpg",
);
assert.equal(
  pickTokenShelfCard(doubleToken, zombieAndMarit, "back")?.image_uris?.normal,
  "https://cards.scryfall.io/normal/front/marit.jpg",
);

console.log("catalog printing match: ok");
