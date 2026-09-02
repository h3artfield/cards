import {
  looksLikeDecklist,
  chunkDiscordMessage,
} from "./discord-inventory-reply-v1";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(!looksLikeDecklist("do you have Sol Ring?"), "single question is clerk");
assert(!looksLikeDecklist("Sol Ring"), "single name is clerk");
assert(
  looksLikeDecklist("1 Sol Ring\n1 Command Tower"),
  "two qty lines are a list",
);
assert(
  looksLikeDecklist("1 Path to Exile\n1 Swords to Plowshares\n1 Generous Gift"),
  "three qty lines are a list",
);

const chunks = chunkDiscordMessage("a".repeat(4000));
assert(chunks.length >= 2, "long replies split");
assert(chunks.every((c) => c.length <= 1900), "chunks stay under Discord cap");

console.log("discord-inventory-reply-v1.selftest: ok");
