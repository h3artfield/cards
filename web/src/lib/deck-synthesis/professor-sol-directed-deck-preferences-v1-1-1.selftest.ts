import assert from "node:assert/strict";
import {
  isDeckPreferencesSetConstrained,
  parseDeckSetRestrictions,
} from "./professor-sol-directed-deck-preferences-v1-1-1";

const prefs =
  "mono white only, only cards from the lord of the rings set and the hobbit set";
assert.equal(isDeckPreferencesSetConstrained(prefs), true);

const restrictions = parseDeckSetRestrictions(prefs);
assert.ok(restrictions);
assert.ok(restrictions!.restrictToSetCodes.has("ltr"));
assert.ok(restrictions!.restrictToSetCodes.has("ltc"));
assert.ok(restrictions!.restrictToSetCodes.has("hob"));

assert.equal(parseDeckSetRestrictions("mono white aggro"), null);

console.log("professor-sol-directed-deck-preferences-v1-1-1.selftest: ok");
