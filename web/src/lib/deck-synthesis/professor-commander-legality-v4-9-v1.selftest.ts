import assert from "node:assert/strict";
import { evaluateSingletonPool, isBasicLandName } from "./professor-commander-legality-v4-9-v1";

assert.equal(isBasicLandName("Forest"), true);
assert.equal(isBasicLandName("Snow-Covered Island"), true);
assert.equal(isBasicLandName("Command Tower"), false);

const monoGreenBasics = evaluateSingletonPool(["Forest", "Forest", "Forest", "Llanowar Elves"]);
assert.equal(monoGreenBasics.pass, true, "mono-green may contain many Forests");

const monoBlueBasics = evaluateSingletonPool(["Island", "Island", "Counterspell", "Island"]);
assert.equal(monoBlueBasics.pass, true, "mono-blue may contain many Islands");

const duplicateNonBasic = evaluateSingletonPool(["Sol Ring", "Sol Ring"]);
assert.equal(duplicateNonBasic.pass, false);
assert.deepEqual(duplicateNonBasic.duplicateNonBasics, ["Sol Ring"]);

console.log("professor-commander-legality-v4-9-v1: ok");
