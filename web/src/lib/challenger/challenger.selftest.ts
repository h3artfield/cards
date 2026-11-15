import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { challengerApiAuth } from "./api-auth";
import { validateDisplayName } from "./display-name";
import {
  createChallengerHandoffToken,
  parseChallengerHandoffToken,
} from "./handoff-token";

process.env.CHALLENGER_HANDOFF_SECRET = "test-handoff-secret";
process.env.CHALLENGER_API_SECRET = "test-api-secret";

const token = createChallengerHandoffToken({ uid: "user-1", name: "Ada Lovecard" });
assert.ok(token);
const parsed = parseChallengerHandoffToken(token!);
assert.ok(parsed);
assert.equal(parsed!.uid, "user-1");
assert.equal(parsed!.name, "Ada Lovecard");
assert.ok(parsed!.exp > Math.floor(Date.now() / 1000));
assert.deepEqual(Object.keys(JSON.parse(Buffer.from(token!.slice(0, token!.lastIndexOf(".")), "base64url").toString("utf8"))).sort(), [
  "exp",
  "jti",
  "name",
  "uid",
]);

const [payload, sig] = token!.split(".");
const expected = createHmac("sha256", "test-handoff-secret").update(payload).digest("base64url");
assert.equal(sig, expected);

const expired = createChallengerHandoffToken({
  uid: "user-1",
  name: "Ada Lovecard",
  exp: Math.floor(Date.now() / 1000) - 10,
});
assert.equal(parseChallengerHandoffToken(expired!), null);

const previous = process.env.CHALLENGER_HANDOFF_SECRET;
process.env.CHALLENGER_HANDOFF_SECRET = "other-secret";
assert.equal(parseChallengerHandoffToken(token!), null);
process.env.CHALLENGER_HANDOFF_SECRET = previous;

assert.equal(validateDisplayName("Al").ok, false);
assert.equal(validateDisplayName("Professor").ok, false);
assert.equal(validateDisplayName("Ada Lovecard").ok, true);
const taken = validateDisplayName("  Ada   Lovecard  ");
assert.equal(taken.ok && taken.name, "Ada Lovecard");

const okReq = new Request("https://example.test/api/challenger/decks", {
  headers: { authorization: "Bearer test-api-secret" },
});
assert.equal(challengerApiAuth(okReq), "ok");
const badReq = new Request("https://example.test/api/challenger/decks", {
  headers: { authorization: "Bearer no" },
});
assert.equal(challengerApiAuth(badReq), "unauthorized");

console.log("challenger handoff: ok");
