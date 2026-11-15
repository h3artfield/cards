import assert from "node:assert/strict";
import { matchScryfallSetCode } from "./scryfall-set-resolver";

const entries = [
  { name: "Avatar: The Last Airbender", code: "tla" },
  { name: "Limited Edition Alpha", code: "lea" },
  { name: "Ravnica Allegiance", code: "rna" },
  { name: "Legends", code: "leg" },
];

assert.equal(matchScryfallSetCode("Prerelease Cards", entries), null);
assert.equal(matchScryfallSetCode("Limited Edition Alpha", entries), "lea");
assert.equal(matchScryfallSetCode("lea", entries), "lea");
assert.equal(
  matchScryfallSetCode("Avatar: The Last Airbender: Eternal-Legal", entries),
  "tla",
);
assert.equal(matchScryfallSetCode("eternal-legal", entries), null);

console.log("scryfall set resolver: ok");
