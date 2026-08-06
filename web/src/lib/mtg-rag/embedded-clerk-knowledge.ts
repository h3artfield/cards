import type { MtgKnowledgeHit } from "./hybrid-retrieval";
import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
} from "./constants";
import type { MtgKnowledgeChunk } from "./types";
import { Timestamp } from "firebase-admin/firestore";

type EmbeddedEntry = {
  id: string;
  title: string;
  terms: string[];
  corpus: MtgKnowledgeChunk["corpus"];
  text: string;
  citationLabel: string;
};

const EMBEDDED_CLERK_KNOWLEDGE: EmbeddedEntry[] = [
  {
    id: "embedded-attack-harmonicon",
    title: "Attack Harmonicon",
    terms: ["attack harmonicon", "harmonicon", "attack trigger doubler"],
    corpus: "glossary",
    citationLabel: "Glossary: Attack Harmonicon",
    text: `Term: Attack Harmonicon. Category: slang/archetype.
"Attack Harmonicon" is unofficial MTG slang for an effect that makes abilities triggered by attacking trigger an additional time.
The name comes from Panharmonicon, which doubles certain enter-the-battlefield triggers. An Attack Harmonicon does the same for attack triggers.
Example: Isshin, Two Heavens as One — "If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time."
So when you attack with a creature that says "Whenever this creature attacks, create a Treasure token," you create two Treasures instead of one.
Common Attack Harmonicon commanders: Isshin, Two Heavens as One; Wulfgar of Icewind Dale.
Not an official rules term — community shorthand for an attack-trigger doubler.`,
  },
  {
    id: "embedded-blink-flicker",
    title: "Blink and Flicker",
    terms: [
      "blink",
      "flicker",
      "flickerwisp",
      "ephemerate",
      "cloudshift",
      "exile return battlefield",
    ],
    corpus: "glossary",
    citationLabel: "Glossary: Blink / Flicker",
    text: `Term: Blink / Flicker. Category: mechanics.
Blink or flicker cards temporarily exile a permanent and then return it to the battlefield.
Example wording: "Exile target creature, then return it to the battlefield under its owner's control."
Players use blink to: reuse ETB abilities; save a creature from removal; remove counters/Auras/Equipment; untap a creature; reset transformed or copied permanents.
Flicker often means immediate return (Cloudshift). Blink may mean return later, often at the next end step (Flickerwisp).
When the permanent returns, the game treats it as a new object with no memory of its previous existence.
Popular blink cards: Ephemerate, Cloudshift, Momentary Blink, Flickerwisp, Teleportation Circle, Thassa Deep-Dwelling.
Commanders built around blink: Brago King Eternal, Yorion Sky Nomad, Aminatou the Fateshifter.`,
  },
  {
    id: "embedded-elf-tribal",
    title: "Elf Tribal",
    terms: ["elf tribal", "elves tribal", "elf deck", "elf typal"],
    corpus: "glossary",
    citationLabel: "Glossary: Elf Tribal",
    text: `Term: Elf tribal. Category: archetype.
An Elf tribal deck is built around the Elf creature type, using many Elves and payoffs for controlling them.
Elf decks commonly: produce huge amounts of mana (Llanowar Elves); create Elf tokens; give all Elves bonuses with lords (Elvish Archdruid); draw based on Elf count; overwhelm with a large army or one explosive turn.
Typical sequence: play cheap mana Elves, cast more Elves, boost the team (Elvish Clancaller), attack for lethal or use Craterhoof Behemoth.
Usually green; Commander versions may add other colors.
Popular Elf commanders: Lathril Blade of the Elves, Ezuri Renegade Leader, Marwyn the Nurturer, Selvala Heart of the Wilds.
"Tribal" / "typal" = creature-type-focused deck.`,
  },
  {
    id: "embedded-prepared-spells",
    title: "Prepared Spells (Strixhaven)",
    terms: [
      "prepared spell",
      "prepared spells",
      "prepare spell",
      "strixhaven prepared",
      "cast from exile prepared",
      "pia nalaar",
    ],
    corpus: "commander_primer",
    citationLabel: "Primer: Prepared Spells commanders",
    text: `Archetype: Prepared spells (Strixhaven mechanic).
Prepared creates a copy of a creature's Prepare spell in exile; you cast that copy from exile.
Best direct commander: Pia Nalaar, Consul of Revival — "Whenever you play a land from exile or cast a spell from exile, create a 1/1 Thopter artifact creature token with flying." Each prepared spell cast from exile triggers Pia and makes a Thopter. Pia gives Thopters haste. Drawback: red-white color identity limits Prepared cards to Boros.
Other options: Rocco Street Chef (RGW) — each prepared spell gives Food and +1/+1 counter; Faldorn Dread Wolf Herald (RG) — each prepared spell creates a 2/2 Wolf; Vega the Watcher (WU) — each prepared spell draws a card because it was cast from somewhere other than your hand.
Recommendation: Pia for most direct "prepared spells become an army"; Rocco for broader Prepared card access and value.`,
  },
  {
    id: "embedded-voltron",
    title: "Voltron",
    terms: ["voltron", "voltron commander", "voltron deck"],
    corpus: "glossary",
    citationLabel: "Glossary: Voltron",
    text: `Term: Voltron. Category: slang/archetype.
Voltron is community slang for a Commander deck that focuses on making one creature extremely powerful, then attacking for lethal commander damage (21+).
Typical plan: choose an evasive or protected commander, suit it up with equipment and auras, and win through combat.
Common Voltron commanders: Sigarda Host of Herons, Uril the Mistwalker, Light-Paws Empress's Equal.
Not an official rules term — community shorthand.`,
  },
  {
    id: "embedded-card-advantage",
    title: "Card Advantage",
    terms: ["card advantage", "card adv", "two for one", "2-for-1"],
    corpus: "glossary",
    citationLabel: "Glossary: Card Advantage",
    text: `Term: Card advantage. Category: fundamentals.
Card advantage means ending up with more useful cards than your opponent — in hand, on the battlefield, or in access to resources.
A "two-for-one" is a single card that answers two of your opponent's cards, or generates extra value (e.g. removal that also draws).
In Commander, card advantage often comes from repeatable draw engines, recursion, or effects that generate multiple cards from one spell.`,
  },
  {
    id: "embedded-mana-dork",
    title: "Mana Dork",
    terms: ["mana dork", "mana dorks", "dork"],
    corpus: "glossary",
    citationLabel: "Glossary: Mana Dork",
    text: `Term: Mana dork. Category: slang/fundamentals.
A mana dork is a cheap creature (usually 1–2 mana) that taps for mana, like **Llanowar Elves** or **Elvish Mystic**.
They accelerate your curve by adding extra mana early. Community slang — not an official rules term.`,
  },
  {
    id: "embedded-board-wipe",
    title: "Board Wipe",
    terms: ["board wipe", "board wipes", "mass removal", "wrath"],
    corpus: "glossary",
    citationLabel: "Glossary: Board Wipe",
    text: `Term: Board wipe. Category: slang/fundamentals.
A board wipe is a spell or effect that destroys or exiles most creatures (or all permanents) on the battlefield at once — e.g. **Wrath of God**, **Damnation**, **Blasphemous Act**.
Community slang for mass removal. Not an official rules term.`,
  },
];

function entryMatchesQuestion(entry: EmbeddedEntry, question: string): boolean {
  const q = question.toLowerCase();
  return entry.terms.some((term) => q.includes(term.toLowerCase()));
}

function entryToChunk(entry: EmbeddedEntry): MtgKnowledgeChunk {
  return {
    chunkId: entry.id,
    sourceId: "embedded-clerk-knowledge",
    corpus: entry.corpus,
    authorityTier: "curated_internal",
    title: entry.title,
    sectionTitle: entry.title,
    sectionPath: `embedded/${entry.id}`,
    text: entry.text,
    retrievalText: entry.text,
    citationLabel: entry.citationLabel,
    sourceLocator: entry.id,
    chunkIndex: 0,
    aliases: entry.terms,
    normalizedTerms: entry.terms,
    keywords: entry.terms,
    tags: ["embedded", "clerk"],
    embeddingModel: MTG_RAG_EMBEDDING_MODEL,
    embeddingDimensions: MTG_RAG_EMBEDDING_DIMENSIONS,
    tokenCount: Math.ceil(entry.text.length / 4),
    chunkHash: entry.id,
    active: true,
    importedAt: Timestamp.now(),
  };
}

export function lookupEmbeddedClerkKnowledge(
  question: string,
): MtgKnowledgeHit[] {
  return EMBEDDED_CLERK_KNOWLEDGE.filter((entry) =>
    entryMatchesQuestion(entry, question),
  ).map((entry) => ({
    chunk: entryToChunk(entry),
    score: 1,
    method: "alias_exact" as const,
  }));
}
