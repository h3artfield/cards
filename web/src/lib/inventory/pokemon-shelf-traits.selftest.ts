import assert from "node:assert/strict";
import {
  matchesPokemonShelfFilters,
  pokemonTraitsFromCatalogId,
} from "./pokemon-shelf-traits";

const sprigatito = { setName: "SV02: Paldea Evolved", cardNumber: "196/193" };
const supporter = { setName: "Black & White", cardNumber: "101/114" };
const dual = { setName: "EX Delta Species", cardNumber: "1/113" };
const unresolved = { setName: "Miscellaneous Cards & Products", cardNumber: "" };

const traits = pokemonTraitsFromCatalogId("sv2-196");
assert.equal(traits?.supertype, "Pokémon");
assert.deepEqual(traits?.types, ["Grass"]);
assert.deepEqual(traits?.subtypes, ["Basic"]);

const none = { types: [], cards: [], stages: [], trainers: [] };
assert.equal(matchesPokemonShelfFilters(sprigatito, { ...none, types: ["grass"] }), true);
assert.equal(matchesPokemonShelfFilters(sprigatito, { ...none, types: ["fire"] }), false);
assert.equal(matchesPokemonShelfFilters(sprigatito, { ...none, cards: ["pokemon"] }), true);
assert.equal(matchesPokemonShelfFilters(sprigatito, { ...none, stages: ["basic"] }), true);
assert.equal(
  matchesPokemonShelfFilters(sprigatito, { ...none, types: ["grass"], stages: ["basic"] }),
  true,
);
assert.equal(
  matchesPokemonShelfFilters(sprigatito, { ...none, stages: ["basic"], trainers: ["supporter"] }),
  false,
);
assert.equal(matchesPokemonShelfFilters(sprigatito, { ...none, trainers: ["supporter"] }), false);

assert.equal(matchesPokemonShelfFilters(supporter, { ...none, trainers: ["supporter"] }), true);
assert.equal(matchesPokemonShelfFilters(supporter, { ...none, cards: ["trainer"] }), true);
assert.equal(matchesPokemonShelfFilters(supporter, { ...none, stages: ["basic"] }), false);

assert.equal(matchesPokemonShelfFilters(dual, { ...none, types: ["grass"] }), true);
assert.equal(matchesPokemonShelfFilters(dual, { ...none, types: ["metal"] }), true);
assert.equal(matchesPokemonShelfFilters(dual, { ...none, stages: ["stage2"] }), true);

assert.equal(matchesPokemonShelfFilters(unresolved, { ...none, types: ["grass"] }), false);
assert.equal(matchesPokemonShelfFilters(unresolved, none), true);

console.log("pokemon shelf traits: ok");
