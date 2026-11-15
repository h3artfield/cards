/**
 * Tests for the deck synergy index.
 *
 * The failure this is really guarding against is a synergy view that lights up
 * half the deck: if every card that draws a card counts as synergy, clicking a
 * card tells you nothing. The ubiquity ceiling and the common-role exclusion
 * are the two mechanisms preventing that, so both are pinned here. The verified
 * combo lookup is injected, because the real detector reads a ~100 MB artifact
 * pair and the ranking rules are what this module owns.
 */
import assert from "node:assert/strict";
import { buildDeckSynergyIndexV1 } from "./synergy-v1";
import type { ComboSourceV1 } from "./synergy-v1";
import type { DeckEditorSemanticFactsV1 } from "./semantic-facts-v1";
import type { EditableDeckCardV1, EditableDeckV1 } from "./types-v1";

type CardWithSemantics = EditableDeckCardV1 & { semantic?: DeckEditorSemanticFactsV1 };

const COMMANDER = { oracleId: "cmd-fynn", name: "Fynn, the Fangbearer", colorIdentity: ["G"] };

function card(name: string, over: Partial<CardWithSemantics> = {}): CardWithSemantics {
  return {
    cardKey: name.toLowerCase().replace(/\s+/g, "-"),
    oracleId: `oid-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    copies: 1,
    board: "mainboard",
    isLand: false,
    isBasicLand: false,
    origin: "professor",
    professor: null,
    markerIds: [],
    primaryMarkerId: null,
    ...over,
  } as CardWithSemantics;
}

function semantic(roles: string[]): DeckEditorSemanticFactsV1 {
  return { derivedRoles: roles, clusterId: 1, topActions: [] };
}

function pkg(names: string[]) {
  return {
    primaryArchitectRequirement: "req",
    primaryRole: "role",
    secondaryRoles: [],
    packageMembership: names,
    whyInThisDeck: "because",
    structuralNecessity: "FLEX" as const,
  };
}

function deckOf(cards: CardWithSemantics[]): EditableDeckV1 {
  return { commander: COMMANDER, cards, markers: [], revision: 0 } as unknown as EditableDeckV1;
}

const noCombos: ComboSourceV1 = async () => ({ comboSets: [] });

function comboOf(
  cards: Array<{ oracleId: string; name: string }>,
  winsOnResolution = false,
): ComboSourceV1 {
  return async () => ({ comboSets: [{ cards, winsOnResolution }] });
}

async function main() {
  // --- a verified combo outranks a shared package ---------------------------
  {
    const a = card("Thassa's Oracle", { professor: pkg(["wincon"]), semantic: semantic(["mill"]) });
    const b = card("Demonic Consultation", { professor: pkg(["wincon"]), semantic: semantic(["tutor"]) });
    const index = await buildDeckSynergyIndexV1({
      deck: deckOf([a, b]),
      cards: [a, b],
      comboSource: comboOf(
        [
          { oracleId: a.oracleId!, name: a.name },
          { oracleId: b.oracleId!, name: b.name },
        ],
        true,
      ),
    });
    const links = index.linksByCardKey[a.cardKey];
    assert.equal(links.length, 1, "one row per partner, not one row per reason");
    assert.equal(links[0].kind, "combo", "a verified line beats the package it shares");
    assert.match(links[0].detail, /Wins the game/, "a game-winning line says so");
    assert.equal(index.comboCount, 1);
  }

  // --- a two-card line with the commander still links the one real card ----
  {
    const a = card("Thassa's Oracle");
    const index = await buildDeckSynergyIndexV1({
      deck: deckOf([a]),
      cards: [a],
      comboSource: comboOf([
        { oracleId: a.oracleId!, name: a.name },
        { oracleId: COMMANDER.oracleId, name: COMMANDER.name },
      ]),
    });
    const links = index.linksByCardKey[a.cardKey];
    assert.equal(links?.length, 1, "a line with the commander is still worth showing");
    assert.match(links[0].name, /Fynn/, "and it names the commander as the partner");
  }

  // --- a ubiquitous role does not become synergy ---------------------------
  {
    // Twelve of twenty cards tagged token_generation is over the 25% ceiling,
    // so it describes the deck rather than any pair inside it.
    const many = Array.from({ length: 12 }, (_, i) =>
      card(`Token Maker ${i}`, { semantic: semantic(["token_generation"]) }),
    );
    const filler = Array.from({ length: 8 }, (_, i) => card(`Filler ${i}`, { semantic: semantic([]) }));
    const all = [...many, ...filler];
    const index = await buildDeckSynergyIndexV1({
      deck: deckOf(all),
      cards: all,
      comboSource: noCombos,
    });
    assert.equal(
      index.linksByCardKey[many[0].cardKey],
      undefined,
      "a role held by most of the deck creates no links",
    );
  }

  // --- a rare role does become synergy -------------------------------------
  {
    const a = card("Outlet", { semantic: semantic(["sacrifice_outlet"]) });
    const b = card("Payoff", { semantic: semantic(["sacrifice_outlet"]) });
    const filler = Array.from({ length: 18 }, (_, i) => card(`Filler ${i}`, { semantic: semantic([]) }));
    const all = [a, b, ...filler];
    const index = await buildDeckSynergyIndexV1({
      deck: deckOf(all),
      cards: all,
      comboSource: noCombos,
    });
    assert.equal(index.linksByCardKey[a.cardKey]?.length, 1, "two cards sharing a rare role link up");
    assert.equal(index.linksByCardKey[a.cardKey][0].kind, "role");
    assert.match(index.linksByCardKey[a.cardKey][0].detail, /sacrifice outlet/i);
  }

  // --- broad roles never link, however rare --------------------------------
  {
    const a = card("Cultivate", { semantic: semantic(["ramp"]) });
    const b = card("Kodama's Reach", { semantic: semantic(["ramp"]) });
    const index = await buildDeckSynergyIndexV1({
      deck: deckOf([a, b]),
      cards: [a, b],
      comboSource: noCombos,
    });
    assert.equal(
      index.linksByCardKey[a.cardKey],
      undefined,
      "ramp is excluded outright, since every deck ramps",
    );
  }

  // --- cards parked outside the deck are not in any line -------------------
  {
    const inDeck = card("In Deck", { professor: pkg(["combo"]) });
    const parked = card("Parked", { board: "considering", professor: pkg(["combo"]) });
    const index = await buildDeckSynergyIndexV1({
      deck: deckOf([inDeck, parked]),
      cards: [inDeck, parked],
      comboSource: noCombos,
    });
    assert.equal(
      index.linksByCardKey[inDeck.cardKey],
      undefined,
      "a card in Considering is not yet part of the deck's synergies",
    );
  }

  // --- missing combo artifacts degrade instead of throwing -----------------
  {
    const a = card("A", { professor: pkg(["x"]) });
    const b = card("B", { professor: pkg(["x"]) });
    const index = await buildDeckSynergyIndexV1({
      deck: deckOf([a, b]),
      cards: [a, b],
      comboSource: async () => {
        throw new Error("artifact missing");
      },
    });
    assert.equal(index.comboCount, 0, "a combo failure reports zero rather than erroring");
    assert.equal(
      index.linksByCardKey[a.cardKey]?.[0].kind,
      "package",
      "and the other sources still work",
    );
  }

  // --- links are symmetric -------------------------------------------------
  {
    const a = card("A", { professor: pkg(["x"]) });
    const b = card("B", { professor: pkg(["x"]) });
    const index = await buildDeckSynergyIndexV1({
      deck: deckOf([a, b]),
      cards: [a, b],
      comboSource: noCombos,
    });
    assert.equal(index.linksByCardKey[a.cardKey][0].cardKey, b.cardKey);
    assert.equal(index.linksByCardKey[b.cardKey][0].cardKey, a.cardKey);
  }

  console.log("synergy-v1 selftest: all assertions passed");
}

void main();
