import type { ShopCustomerName } from "./types";

/**
 * Redaction at the door: before a typed message reaches any model, or is ever
 * stored, the names of customers and staff are taken out of it.
 *
 *  - A customer's full name on file becomes a token, "[customer 1]", numbered
 *    within the conversation. The model sees the token and nothing else.
 *  - A customer the person picked is given a token the same way.
 *  - Emails and phone numbers are removed by pattern, whoever they belong to.
 *  - Staff full names are replaced with "[staff member]".
 *
 * Known gaps, on purpose: a single first name on its own is left alone (first
 * names collide with ordinary words and card names), and nicknames,
 * misspellings and people not on file are not caught.
 */

export const MAX_PICKED_CUSTOMERS = 5;
export const MAX_CUSTOMER_REFS = 30;
/** A name typed for several customers on file, before the person has said which. */
export const UNRESOLVED_CUSTOMER = "[a customer]";
export const STAFF_TOKEN = "[staff member]";

/** Which numbered token stands for which customer, for one conversation. */
export type CustomerRef = { n: number; id: string };

export type AmbiguousName = { text: string; ids: string[] };

export type Redaction = {
  text: string;
  refs: CustomerRef[];
  /** Names that matched more than one customer. The browser offers the list. */
  ambiguous: AmbiguousName[];
  /** How many things were taken out, for the audit line. */
  count: number;
};

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Ten or eleven digits in the usual groupings: 555-010-1234, (555) 010-1234, +1 555 010 1234.
const PHONE = /(?<![\w$.])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![\w])/g;

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’`]/g, "'")
    .toLowerCase();
}

/** The words of a name or a sentence, each with where it sits in the original text. */
function wordsOf(text: string): Array<{ word: string; start: number; end: number }> {
  const words: Array<{ word: string; start: number; end: number }> = [];
  const pattern = /[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu;
  for (const match of text.matchAll(pattern)) {
    // "Dave Miller's" is still Dave Miller: the possessive stays in the text, outside the name.
    const raw = match[0].replace(/['’]s$/i, "").replace(/[.'’-]+$/, "");
    if (!raw) continue;
    words.push({ word: fold(raw), start: match.index, end: match.index + raw.length });
  }
  return words;
}

const MAX_NAME_WORDS = 4;

export type Redactor = {
  /** Customer ids on file, for checking picked ids. */
  hasCustomer(id: string): boolean;
  /**
   * `picked` are customers the person attached to this message. A typed name
   * that fits several customers resolves to the picked one when exactly one
   * of them was picked: the person has already said which.
   */
  redact(text: string, refs: CustomerRef[], picked?: string[]): Redaction;
};

/**
 * Builds the matcher once for a store's customer and staff lists. Matching is
 * by whole words, without case or accents, on a full name in either order
 * ("Dave Miller", "Miller, Dave").
 */
export function buildRedactor(customers: ShopCustomerName[], staffNames: string[]): Redactor {
  // key: the folded words of a full name joined by a space
  const byName = new Map<string, Set<string>>();
  const staff = new Set<string>();
  const ids = new Set<string>();

  const keyOf = (name: string) => wordsOf(name).map((w) => w.word).join(" ");
  const add = (key: string, id: string) => {
    if (!key.includes(" ")) return; // a single word is never treated as a name
    const set = byName.get(key) ?? new Set<string>();
    set.add(id);
    byName.set(key, set);
  };

  for (const customer of customers) {
    ids.add(customer.id);
    const first = keyOf(customer.firstName ?? "");
    const last = keyOf(customer.lastName ?? "");
    if (!first || !last) continue;
    add(`${first} ${last}`, customer.id);
    add(`${last} ${first}`, customer.id);
  }
  for (const name of staffNames) {
    const key = keyOf(name);
    if (key.includes(" ")) staff.add(key);
  }

  return {
    hasCustomer: (id) => ids.has(id),
    redact(text, startRefs, picked = []) {
      const refs = [...startRefs];
      const ambiguous: AmbiguousName[] = [];
      let count = 0;

      const tokenFor = (id: string): string => {
        let ref = refs.find((r) => r.id === id);
        if (!ref && refs.length < MAX_CUSTOMER_REFS) {
          ref = { n: refs.reduce((max, r) => Math.max(max, r.n), 0) + 1, id };
          refs.push(ref);
        }
        return ref ? `[customer ${ref.n}]` : UNRESOLVED_CUSTOMER;
      };

      // Emails and phones first, so their parts are never read as words of a name.
      let working = text.replace(EMAIL, () => {
        count += 1;
        return "[email]";
      });
      working = working.replace(PHONE, () => {
        count += 1;
        return "[phone]";
      });

      const words = wordsOf(working);
      const cuts: Array<{ start: number; end: number; with: string }> = [];
      let i = 0;
      while (i < words.length) {
        let matched = 0;
        // Longest name first, so "Mary Ann Smith" is not cut at "Mary Ann".
        for (let size = Math.min(MAX_NAME_WORDS, words.length - i); size >= 2; size -= 1) {
          const key = words.slice(i, i + size).map((w) => w.word).join(" ");
          const span = { start: words[i]!.start, end: words[i + size - 1]!.end };
          const found = byName.get(key);
          if (found) {
            const list = [...found];
            const chosen = list.length === 1 ? list : list.filter((id) => picked.includes(id));
            if (chosen.length === 1) {
              cuts.push({ ...span, with: tokenFor(chosen[0]!) });
            } else {
              ambiguous.push({ text: working.slice(span.start, span.end), ids: list });
              cuts.push({ ...span, with: UNRESOLVED_CUSTOMER });
            }
            matched = size;
          } else if (staff.has(key)) {
            cuts.push({ ...span, with: STAFF_TOKEN });
            matched = size;
          }
          if (matched) break;
        }
        if (matched) {
          count += 1;
          i += matched;
        } else {
          i += 1;
        }
      }

      let out = "";
      let at = 0;
      for (const cut of cuts) {
        out += working.slice(at, cut.start) + cut.with;
        at = cut.end;
      }
      out += working.slice(at);
      return { text: out, refs, ambiguous, count };
    },
  };
}

export type ReadRefs = { ok: true; refs: CustomerRef[]; picked: string[] } | { ok: false; error: string };

/**
 * Reads the customer references a request carries: `refs`, the tokens this
 * conversation already uses, and `customers`, the ones picked for this
 * message. Every id must be a customer of this store. One that is not rejects
 * the whole request; it is never quietly dropped.
 */
export function readCustomerRefs(body: Record<string, unknown>, redactor: Redactor): ReadRefs {
  const refs: CustomerRef[] = [];
  const rawRefs = body.refs === undefined ? [] : body.refs;
  // Picked customers may take a conversation a little past the cap on typed names.
  if (!Array.isArray(rawRefs) || rawRefs.length > MAX_CUSTOMER_REFS + MAX_PICKED_CUSTOMERS) return { ok: false, error: "refs" };
  for (const raw of rawRefs) {
    const ref = raw as { n?: unknown; id?: unknown } | null;
    if (!ref || typeof ref.id !== "string" || !Number.isInteger(ref.n) || (ref.n as number) < 1 || (ref.n as number) > 999) {
      return { ok: false, error: "refs" };
    }
    if (!redactor.hasCustomer(ref.id)) return { ok: false, error: "customer" };
    if (refs.some((r) => r.n === ref.n || r.id === ref.id)) return { ok: false, error: "refs" };
    refs.push({ n: ref.n as number, id: ref.id });
  }

  const picked: string[] = [];
  const rawPicked = body.customers === undefined ? [] : body.customers;
  if (!Array.isArray(rawPicked) || rawPicked.length > MAX_PICKED_CUSTOMERS) return { ok: false, error: "customers" };
  for (const raw of rawPicked) {
    const id = (raw as { id?: unknown } | null)?.id;
    if (typeof id !== "string") return { ok: false, error: "customers" };
    if (!redactor.hasCustomer(id)) return { ok: false, error: "customer" };
    if (!picked.includes(id)) picked.push(id);
  }
  return { ok: true, refs, picked };
}

/**
 * Gives each picked customer a token and says so at the start of the message,
 * where it outweighs a pronoun or a customer from earlier in the conversation.
 * A conversation already at its limit takes no new token for a pick; the
 * message is still sent, about "[a customer]".
 */
export function attachPicked(text: string, picked: string[], refs: CustomerRef[]): { text: string; refs: CustomerRef[] } {
  if (!picked.length) return { text, refs };
  const next = [...refs];
  const tokens: string[] = [];
  for (const id of picked) {
    let ref = next.find((r) => r.id === id);
    if (!ref && next.length < MAX_CUSTOMER_REFS + MAX_PICKED_CUSTOMERS) {
      ref = { n: next.reduce((max, r) => Math.max(max, r.n), 0) + 1, id };
      next.push(ref);
    }
    tokens.push(ref ? `[customer ${ref.n}]` : UNRESOLVED_CUSTOMER);
  }
  return { text: `[This message is about ${tokens.join(" and ")}, picked by the person.] ${text}`, refs: next };
}
