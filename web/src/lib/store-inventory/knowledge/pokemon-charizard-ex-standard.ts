/** Strategy + slot template for Charizard ex Standard (approximate meta list). */

export const CHARIZARD_EX_STANDARD_STRATEGY = `
Charizard ex is a Standard aggro/control deck that pressures with a big attacker while Pidgeot ex finds any two cards you need each turn. Rare Candy lets you skip Charmeleon and evolve straight into Charizard ex.

Core plan:
• Charizard ex — main attacker; accelerates Fire Energy and hits harder as you take prizes
• Pidgeot ex line — search your deck for any two cards once per turn
• Rare Candy — jump from Charmander directly to Charizard ex
• Basic Fire Energy — fuel the line and attack costs

Budget tip: one League Battle Deck box covers most of the expensive core if we carry it; otherwise we build from singles and skip fancy full-art printings when a cheaper version plays the same.
`.trim();

export type PokemonDeckSlot = {
  label: string;
  searchTerms: string[];
  qty: number;
  category: "pokemon" | "trainer" | "energy";
  /** Prefer names that include any of these (e.g. " ex") */
  prefer?: string[];
  /** Exclude inventory names matching these patterns */
  exclude?: RegExp[];
};

export const CHARIZARD_EX_STANDARD_TEMPLATE: PokemonDeckSlot[] = [
  { label: "Charmander", searchTerms: ["Charmander"], qty: 3, category: "pokemon", exclude: [/charizard/i] },
  { label: "Charmeleon", searchTerms: ["Charmeleon"], qty: 2, category: "pokemon", exclude: [/charizard/i] },
  {
    label: "Charizard ex",
    searchTerms: ["Charizard ex"],
    qty: 2,
    category: "pokemon",
    prefer: [" ex"],
    exclude: [/&/i, /gx/i, /vstar/i, /vmax/i, /detective/i, /promo/i],
  },
  { label: "Pidgey", searchTerms: ["Pidgey"], qty: 2, category: "pokemon", exclude: [/pidgeot/i] },
  { label: "Pidgeotto", searchTerms: ["Pidgeotto"], qty: 2, category: "pokemon", exclude: [/pidgeot ex/i] },
  {
    label: "Pidgeot ex",
    searchTerms: ["Pidgeot ex"],
    qty: 2,
    category: "pokemon",
    prefer: [" ex"],
  },
  { label: "Rare Candy", searchTerms: ["Rare Candy"], qty: 4, category: "trainer" },
  { label: "Ultra Ball", searchTerms: ["Ultra Ball"], qty: 4, category: "trainer" },
  { label: "Nest Ball", searchTerms: ["Nest Ball"], qty: 2, category: "trainer" },
  { label: "Iono", searchTerms: ["Iono"], qty: 3, category: "trainer" },
  { label: "Arven", searchTerms: ["Arven"], qty: 2, category: "trainer" },
  { label: "Boss's Orders", searchTerms: ["Boss's Orders", "Boss's Order"], qty: 2, category: "trainer" },
  { label: "Super Rod", searchTerms: ["Super Rod"], qty: 2, category: "trainer" },
  { label: "Letter of Encouragement", searchTerms: ["Letter of Encouragement"], qty: 2, category: "trainer" },
  { label: "Professor's Research", searchTerms: ["Professor's Research", "Professor Sada", "Professor Turo"], qty: 2, category: "trainer" },
  { label: "Rescue Board", searchTerms: ["Rescue Board"], qty: 1, category: "trainer" },
  { label: "Defiance Band", searchTerms: ["Defiance Band"], qty: 1, category: "trainer" },
  { label: "Basic Fire Energy", searchTerms: ["Fire Energy", "Basic Fire Energy"], qty: 8, category: "energy" },
];

export function pickArchetypeTemplate(featured: string): {
  strategy: string;
  slots: PokemonDeckSlot[];
  name: string;
} {
  const token = featured.toLowerCase();
  if (token.includes("charizard")) {
    return {
      name: "Charizard ex Standard",
      strategy: CHARIZARD_EX_STANDARD_STRATEGY,
      slots: CHARIZARD_EX_STANDARD_TEMPLATE,
    };
  }
  return {
    name: `${featured} Standard`,
    strategy: `Building a ${featured}-focused Standard list from in-stock singles.`,
    slots: [
      {
        label: featured,
        searchTerms: [featured],
        qty: 4,
        category: "pokemon",
      },
      { label: "Ultra Ball", searchTerms: ["Ultra Ball"], qty: 4, category: "trainer" },
      { label: "Nest Ball", searchTerms: ["Nest Ball"], qty: 4, category: "trainer" },
      { label: "Iono", searchTerms: ["Iono"], qty: 4, category: "trainer" },
      { label: "Professor's Research", searchTerms: ["Professor's Research"], qty: 4, category: "trainer" },
      { label: "Basic Fire Energy", searchTerms: ["Fire Energy"], qty: 8, category: "energy" },
    ],
  };
}
