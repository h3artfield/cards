import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isStaffQuestion, matchStaffDestinations } from "../src/lib/staff-assistant/destinations";
import { parseStaffHandbook, rankStaffArticles } from "../src/lib/staff-assistant/handbook";

const handbook = readFileSync(
  new URL("../src/lib/staff-handbook/STAFF_HANDBOOK.md", import.meta.url),
  "utf8",
);
const articles = parseStaffHandbook(handbook);

assert.ok(articles.length >= 10, "handbook articles");
assert.equal(matchStaffDestinations("sale")[0]?.id, "register");
assert.equal(matchStaffDestinations("inventory")[0]?.id, "inventory");
assert.equal(isStaffQuestion("sale"), false);
assert.equal(isStaffQuestion("how do I add a card?"), true);

const addCard = rankStaffArticles(articles, "how do I add a card")[0];
assert.equal(addCard?.article.title, "Add one card");
assert.ok((addCard?.score ?? 0) >= 3);

const missing = rankStaffArticles(articles, "how do I refund a shopify order from mars");
assert.ok((missing[0]?.score ?? 0) < 3 || missing[0]?.article.title !== "Add one card");

console.log("staff assistant: ok");
