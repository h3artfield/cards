/**
 * Phase 1a: redaction at the door. Customer and staff names typed by staff
 * must never reach a model. Invented people only; no Firestore, no OpenAI.
 *
 *   npx tsx scripts/test-shop-redaction.ts
 */
import { handleShopAgent, type ShopAgentAudit, type ShopAgentDeps } from "../src/lib/shop-assistant/agent-handle";
import { handleShopAssistant, type ShopAssistantDeps } from "../src/lib/shop-assistant/handle";
import type { AgentModel, AgentModelRequest } from "../src/lib/shop-assistant/openai-tools";
import {
  MAX_PICKED_CUSTOMERS,
  STAFF_TOKEN,
  UNRESOLVED_CUSTOMER,
  attachPicked,
  buildRedactor,
  readCustomerRefs,
} from "../src/lib/shop-assistant/redact";
import { createShopRedaction } from "../src/lib/shop-assistant/redact-load";
import { buildAgentPrompt } from "../src/lib/shop-assistant/agent";
import { historyFor, readAgentReply, showCustomerNames, type ChatItem } from "../src/lib/shop-assistant/chat-client";
import {
  FIXTURE_CUSTOMERS,
  FIXTURE_NOW as NOW,
  FIXTURE_STAFF_NAMES,
  FIXTURE_STORE as STORE,
  fixtureLoader,
} from "./shop-agent-fixtures";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}
function same(got: unknown, want: unknown, msg: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  assert(ok, msg);
  if (!ok) console.error(`      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
}

const names = FIXTURE_CUSTOMERS.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }));
const redactor = buildRedactor(names, FIXTURE_STAFF_NAMES);
const clean = (text: string, refs: Array<{ n: number; id: string }> = []) => redactor.redact(text, refs);
/** Anything that would identify one of the invented people. */
const LEAK = /\bsam\b|carter|\bana\b|diaz|dave miller|miller, dave|o'neil|jordan avery|example\.com|555[-.\s]?01/i;

async function main() {
  console.log("\ncustomer names");
  same(clean("what did Sam Carter trade in last week?"), { text: "what did [customer 1] trade in last week?", refs: [{ n: 1, id: "c1" }], ambiguous: [], count: 1 }, "a full name on file becomes a numbered token");
  same(clean("SAM  carter and ana diaz were in").text, "[customer 1] and [customer 2] were in", "case and spacing do not matter; each customer gets their own token");
  same(clean("Carter, Sam owes us a visit").text, "[customer 1] owes us a visit", "last name first is caught too");
  same(clean("is Sam Carter's order ready? Sam Carter.").text, "is [customer 1]'s order ready? [customer 1].", "a possessive or a full stop after the name does not hide it; the same person keeps the same token");
  same(clean("ask Mark O'Neil").text, "ask [customer 1]", "an apostrophe in a name is handled");
  same(clean("ask Mark O’Neil").text, "ask [customer 1]", "so is a curly one");
  same(clean("tell Ana Diaz hello", [{ n: 4, id: "c2" }]).text, "tell [customer 4] hello", "a customer already in the conversation keeps their token");
  same(clean("tell Sam Carter hello", [{ n: 4, id: "c2" }]).refs, [{ n: 4, id: "c2" }, { n: 5, id: "c1" }], "a new one takes the next number");

  console.log("\nseveral customers with one name");
  const two = clean("how much credit does Dave Miller have");
  same(two, { text: `how much credit does ${UNRESOLVED_CUSTOMER} have`, refs: [], ambiguous: [{ text: "Dave Miller", ids: ["c3", "c4"] }], count: 1 }, "the name is still removed, no customer is guessed, and both candidates are returned for the person to choose");

  console.log("\nwhat is left alone, on purpose");
  same(clean("do we have Mark of the Rose in stock").text, "do we have Mark of the Rose in stock", "single first names (a customer called Mark, a clerk called Rose) are not removed: they are also words and card names");
  same(clean("what would we pay for Sam's Lightning Bolt").text, "what would we pay for Sam's Lightning Bolt", "a first name alone is a known gap");
  same(clean("Samantha Carterson and Anabel Diazo").text, "Samantha Carterson and Anabel Diazo", "a name is matched on whole words only");
  same(clean("sales for 2026-11-12, top 5, $1,540.00, set 30336, 12 cards").text, "sales for 2026-11-12, top 5, $1,540.00, set 30336, 12 cards", "dates, prices and counts are not mistaken for phone numbers");

  console.log("\nstaff, emails and phones");
  same(clean("did Jordan Avery ring this up?").text, `did ${STAFF_TOKEN} ring this up?`, "a staff member's full name is replaced");
  same(clean("email sam.carter@example.com or call 555-010-1234, (555) 010-1234 or +1 555.010.1234").text, "email [email] or call [phone], [phone] or [phone]", "emails and phone numbers go by pattern, whoever they belong to");
  assert(clean("someone.new@nowhere.test rang from 312 555 0199").text === "[email] rang from [phone]", "including ones for people who are not on file");
  assert(clean("Sam Carter <sam.carter@example.com> 555-010-1234").count === 3, "the count of removals is kept for the audit line");

  console.log("\nreading the references a request carries");
  same(readCustomerRefs({}, redactor), { ok: true, refs: [], picked: [] }, "none is fine");
  same(readCustomerRefs({ refs: [{ n: 1, id: "c1" }], customers: [{ id: "c2" }, { id: "c2" }] }, redactor), { ok: true, refs: [{ n: 1, id: "c1" }], picked: ["c2"] }, "known tokens and picked customers are read; a double pick counts once");
  same(readCustomerRefs({ customers: [{ id: "c2" }, { id: "someone-elses-customer" }] }, redactor), { ok: false, error: "customer" }, "one id that is not this store's rejects the whole request");
  same(readCustomerRefs({ refs: [{ n: 1, id: "nope" }] }, redactor), { ok: false, error: "customer" }, "the same for a token that points at an unknown customer");
  assert([{ refs: "x" }, { refs: [{ n: 0, id: "c1" }] }, { refs: [{ n: 1.5, id: "c1" }] }, { refs: [{ n: 1, id: "c1" }, { n: 1, id: "c2" }] }, { refs: [{ n: 1, id: "c1" }, { n: 2, id: "c1" }] }, { customers: "c1" }, { customers: [{ id: 5 }] }, { customers: Array.from({ length: MAX_PICKED_CUSTOMERS + 1 }, () => ({ id: "c1" })) }].every((body) => !readCustomerRefs(body, redactor).ok), "malformed references, duplicate tokens and more than five picks are refused");
  same(attachPicked("what is his balance", ["c2", "c1"], [{ n: 1, id: "c1" }]), { text: "what is his balance (About [customer 2] and [customer 1].)", refs: [{ n: 1, id: "c1" }, { n: 2, id: "c2" }] }, "picked customers are named to the model by token only");
  assert(buildAgentPrompt(NOW).includes("[customer 1] stands for one customer whose name you are not shown"), "the prompt explains the tokens");

  console.log("\nthe matcher is built once per list");
  {
    const { loader } = fixtureLoader();
    let staffReads = 0;
    let clock = 0;
    const redaction = createShopRedaction(loader, async () => { staffReads += 1; return FIXTURE_STAFF_NAMES; }, () => clock);
    const first = await redaction.forStore(STORE);
    const second = await redaction.forStore(STORE);
    assert(first === second && staffReads === 1, "the same list gives the same matcher, and staff names are read once");
    clock += 61_000;
    await redaction.forStore(STORE);
    assert(staffReads === 2, "the staff list is re-read after a minute");
  }

  console.log("\nnothing identifying reaches the model: chat");
  {
    const { loader, redaction } = fixtureLoader();
    const requests: AgentModelRequest[] = [];
    const model: AgentModel = async (request) => { requests.push(JSON.parse(JSON.stringify({ ...request, signal: undefined })) as AgentModelRequest); return { text: "I can't look up one customer yet, but the store credit list is ready for you to open.", toolCalls: [] }; };
    const audits: ShopAgentAudit[] = [];
    const deps: ShopAgentDeps = { model, loader, redaction, now: () => NOW, today: () => "2026-11-16", allow: () => true, takeDailyTurn: () => true, audit: (line) => audits.push(line) };
    const ask = (body: unknown) => handleShopAgent({ body, storeId: STORE, session: { userId: "u1", role: "store" }, staff: { staffId: "st1" }, setupNeeded: false }, deps);

    const res = await ask({
      message: "how much credit does Sam Carter have? his email is sam.carter@example.com, Jordan Avery took the call on 555-010-1234",
      history: [{ role: "user", text: "Ana Diaz came in today" }, { role: "assistant", text: "Noted about Ana Diaz." }],
      customers: [{ id: "c5" }],
    });
    assert(res.status === 200, "the turn is answered");
    const sentToModel = JSON.stringify(requests);
    assert(!LEAK.test(sentToModel), "no customer name, staff name, email or phone is in anything sent to the model: message, history or picked customer");
    assert(sentToModel.includes("[customer 1] came in today") && sentToModel.includes("how much credit does [customer 2] have") && sentToModel.includes("(About [customer 3].)"), "the model sees tokens in their place, numbered across the conversation");
    if (res.status === 200) {
      same(res.body.refs, [{ n: 1, id: "c2" }, { n: 2, id: "c1" }, { n: 3, id: "c5" }], "the browser is told which token is which customer, by id only");
      assert(res.body.sent.startsWith("how much credit does [customer 2] have? his email is [email], [staff member] took the call on [phone]") && !LEAK.test(JSON.stringify(res.body)), "the response carries the cleaned message for history, and no name comes back through it");
    }
    same([audits[0]!.redactions, audits[0]!.customersPicked], [6, 1], "the audit line counts what was removed and how many were picked");
    assert(!/c1|c2|c5/.test(JSON.stringify(audits)) && !LEAK.test(JSON.stringify(audits)), "and holds no customer id and no name");

    const dup = await ask({ message: "what about Dave Miller?" });
    assert(dup.status === 200 && dup.body.ambiguous.length === 1 && dup.body.ambiguous[0]!.ids.length === 2 && dup.body.sent === `what about ${UNRESOLVED_CUSTOMER}?`, "a name two customers share is removed and both candidates come back for the person to choose");
    const before = requests.length;
    same(await ask({ message: "about this one", customers: [{ id: "another-stores-customer" }] }), { status: 400, body: { error: "That customer isn't on file for this store. Pick them again." } }, "a picked id from elsewhere is refused");
    assert(requests.length === before && audits[audits.length - 1]!.outcome === "bad_customer", "before any model call");
    const next = await ask({ message: "and Sam Carter?", refs: [{ n: 1, id: "c2" }, { n: 2, id: "c1" }, { n: 3, id: "c5" }] });
    assert(next.status === 200 && next.body.sent === "and [customer 2]?", "a later turn carries the tokens forward, so the same person keeps the same token");
  }

  console.log("\nnothing identifying reaches the model: search box");
  {
    const { loader, redaction } = fixtureLoader();
    const seen: string[] = [];
    const deps: ShopAssistantDeps = {
      loader,
      now: () => NOW,
      allow: () => true,
      audit: () => {},
      redact: async (storeId, text) => (await redaction.forStore(storeId)).redact(text, []).text,
      choose: async (question) => { seen.push(question); return { tool: null, via: "model" }; },
    };
    await handleShopAssistant({ body: { query: "does Sam Carter (sam.carter@example.com) have store credit" }, storeId: STORE, session: { userId: "u1", role: "store" }, staff: { staffId: "st1" }, setupNeeded: false }, deps);
    same(seen, ["does [customer 1] ([email]) have store credit"], "the chooser's model gets the cleaned question");
  }

  console.log("\nin the browser");
  {
    const nameOf = (id: string) => ({ c1: "Sam Carter", c2: "Ana Diaz" })[id];
    const refs = [{ n: 1, id: "c2" }, { n: 2, id: "c1" }, { n: 3, id: "gone" }];
    same(showCustomerNames("[customer 2] has credit; [customer 1] does not. [customer 3] and [customer 9] are unknown, and [a customer] was not picked.", refs, nameOf), "Sam Carter has credit; Ana Diaz does not. [customer 3] and [customer 9] are unknown, and [a customer] was not picked.", "names are put back from the browser's own list; a token it cannot resolve is shown as written");
    const reply = readAgentReply(true, { text: "[customer 1] is on the list.", panels: [], confirms: [], sent: "is [customer 1] on the list?", refs: [{ n: 1, id: "c1" }, { n: "x", id: "c2" }, null], ambiguous: [{ text: "Dave Miller", ids: ["c3", "c4", 5] }, "junk"] });
    assert(reply.kind === "reply" && reply.sent === "is [customer 1] on the list?" && reply.refs.length === 1 && reply.ambiguous.length === 1 && reply.ambiguous[0]!.ids.length === 2, "the reply's cleaned message, tokens and candidates are read; malformed ones dropped");
    const items: ChatItem[] = [
      { id: 1, kind: "user", text: "is Sam Carter on the list?", sent: "is [customer 1] on the list?", picked: [], ambiguous: [] },
      { id: 2, kind: "assistant", text: "[customer 1] is on the list.", panels: [], confirms: [] },
      { id: 3, kind: "user", text: "and Ana Diaz?", picked: [], ambiguous: [] },
    ];
    same(historyFor(items).map((t) => t.text), ["is [customer 1] on the list?", "[customer 1] is on the list.", "and Ana Diaz?"], "history sends the cleaned text once the server has returned it (the server cleans history again in any case)");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
