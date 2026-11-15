import assert from "node:assert/strict";
import {
  deckMatchesEventBracketV1,
  eventRequiredBracketV1,
} from "./event-required-bracket-v1";

assert.equal(
  eventRequiredBracketV1({ title: "commander bracket 3", requiredBracket: undefined }),
  3,
);
assert.equal(
  eventRequiredBracketV1({ title: "FNM", requiredBracket: 4 }),
  4,
);
assert.equal(
  eventRequiredBracketV1({ title: "commander night", requiredBracket: undefined }),
  null,
);
assert.equal(deckMatchesEventBracketV1({ deckBracket: 3, requiredBracket: 3 }), true);
assert.equal(deckMatchesEventBracketV1({ deckBracket: 4, requiredBracket: 3 }), false);

console.log("event-required-bracket-v1 selftest passed");
