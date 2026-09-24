import assert from "node:assert/strict";
import { landManaAccelerationFromOracleV1 } from "./display-facts-v1";

assert.equal(
  landManaAccelerationFromOracleV1("Basic Land — Forest", "{T}: Add {G}."),
  false,
  "a tap-for-one land is not ramp",
);
assert.equal(
  landManaAccelerationFromOracleV1("Land", "{T}: Add {C}{C}. Ancient Tomb deals 2 damage to you."),
  true,
  "Ancient Tomb taps for two",
);
assert.equal(
  landManaAccelerationFromOracleV1(
    "Legendary Land",
    "{T}: Add {C}.\n{2}{B}, {T}: Add {B} for each Swamp you control.",
  ),
  true,
  "Cabal Coffers scales past one mana",
);
assert.equal(
  landManaAccelerationFromOracleV1(
    "Land",
    "{T}: Add {C}.\n{2}, {T}, Sacrifice ~: Search your library for two basic land cards, put them onto the battlefield tapped, then shuffle.",
  ),
  true,
  "a land that fetches two extras is acceleration",
);
assert.equal(
  landManaAccelerationFromOracleV1("Land — Forest Plains", "{T}: Add {G} or {W}."),
  false,
  "a dual still taps for one",
);

console.log("display-facts-v1 selftest: all assertions passed");
