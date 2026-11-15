"use client";

import { useEffect, useState } from "react";
import type { TokenCardV1 } from "@/lib/token-creator/design-v1";
import { tokenSetIndexEntryV1 } from "@/lib/token-creator/set-index-v1";

export type TokenSetSampleV1 = {
  image: string;
  name: string;
  /** Whether the real token has rules text, which decides where its boxes sit. */
  hasText: boolean;
  hasPt: boolean;
  /** The real token's WUBRG colours, which colour the design's bars; null when unknown. */
  colors: string[] | null;
  /**
   * "same": the same token; "shape": a token laid out like the customer's (rules
   * text or not, P/T or not) in the same colour; "other": the set has none.
   */
  match: "same" | "shape" | "other";
};

type SetToken = { image: string; name: string; colors: string[]; hasText: boolean; hasPt: boolean };

type ScryfallCard = {
  name?: string;
  colors?: string[];
  oracle_text?: string;
  power?: string;
  image_uris?: { normal?: string };
  card_faces?: Array<{ name?: string; colors?: string[]; oracle_text?: string; power?: string; image_uris?: { normal?: string } }>;
};

const cache = new Map<string, Promise<SetToken[] | null>>();
let queue: Promise<unknown> = Promise.resolve();

/** Scryfall allows about two searches a second, so searches run one at a time. */
const SEARCH_GAP_MS = 550;
/** Sets looked up per search; a picker page asks for a dozen at once. */
const SETS_PER_SEARCH = 8;

function paced<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  const gap = () => new Promise((r) => setTimeout(r, SEARCH_GAP_MS));
  queue = run.then(gap, gap);
  return run;
}

function toSetToken(c: ScryfallCard): SetToken | null {
  const face = c.image_uris?.normal ? c : c.card_faces?.find((f) => f.image_uris?.normal);
  if (!face?.image_uris?.normal) return null;
  return {
    image: face.image_uris.normal,
    name: face.name ?? c.name ?? "",
    colors: face.colors ?? c.colors ?? [],
    hasText: Boolean((face.oracle_text ?? c.oracle_text ?? "").trim()),
    hasPt: Boolean(face.power ?? c.power),
  };
}

async function searchPage(url: string): Promise<{ data: Array<ScryfallCard & { set?: string }>; next: string | null }> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await paced(() => fetch(url, { headers: { Accept: "application/json" } }));
    if (res.status === 404) return { data: [], next: null };
    if (res.ok) {
      const body = (await res.json()) as { data?: Array<ScryfallCard & { set?: string }>; has_more?: boolean; next_page?: string };
      return { data: body.data ?? [], next: body.has_more && body.next_page ? body.next_page : null };
    }
    if (attempt >= 3) throw new Error(`Scryfall ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

async function searchSets(codes: string[]): Promise<Map<string, SetToken[]>> {
  const q = `(${codes.map((c) => `set:${c}`).join(" or ")}) t:token`;
  let url: string | null = `https://api.scryfall.com/cards/search?unique=cards&order=set&q=${encodeURIComponent(q)}`;
  const out = new Map<string, SetToken[]>(codes.map((c) => [c, []]));
  while (url) {
    const page = await searchPage(url);
    for (const c of page.data) {
      const t = toSetToken(c);
      if (t && c.set) out.get(c.set)?.push(t);
    }
    url = page.next;
  }
  return out;
}

const waiting: Array<{ code: string; resolve: (t: SetToken[]) => void; reject: (e: unknown) => void }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  while (waiting.length) {
    const batch = waiting.splice(0, SETS_PER_SEARCH);
    searchSets([...new Set(batch.map((w) => w.code))]).then(
      (found) => batch.forEach((w) => w.resolve(found.get(w.code) ?? [])),
      (err) => batch.forEach((w) => w.reject(err)),
    );
  }
}

/** The set's tokens, or null when Scryfall could not be reached (not cached, so it is asked again). */
function setTokens(code: string): Promise<SetToken[] | null> {
  let hit = cache.get(code);
  if (!hit) {
    hit = new Promise<SetToken[]>((resolve, reject) => {
      waiting.push({ code, resolve, reject });
      flushTimer ??= setTimeout(flush, 60);
    }).catch(() => {
      cache.delete(code);
      return null;
    });
    cache.set(code, hit);
  }
  return hit;
}

type CardShape = Pick<TokenCardV1, "name" | "colors" | "rulesText" | "power" | "toughness">;

function pick(tokens: SetToken[], card: CardShape): TokenSetSampleV1 | null {
  const hasText = Boolean(card.rulesText.trim());
  const hasPt = Boolean(card.power || card.toughness);
  const name = card.name.trim().toLowerCase();
  const colors = card.colors.join("");
  let best: { t: SetToken; score: number } | null = null;
  for (const t of tokens) {
    const score =
      (t.hasText === hasText ? 8 : 0) +
      (t.hasPt === hasPt ? 4 : 0) +
      (t.colors.join("") === colors ? 3 : 0) +
      (t.name.toLowerCase() === name ? 2 : 0);
    if (!best || score > best.score) best = { t, score };
  }
  if (!best) return null;
  const { t } = best;
  const shape = t.hasText === hasText && t.hasPt === hasPt && t.colors.join("") === colors;
  return {
    image: t.image,
    name: t.name,
    hasText: t.hasText,
    hasPt: t.hasPt,
    colors: t.colors,
    match: shape && t.name.toLowerCase() === name ? "same" : shape ? "shape" : "other",
  };
}

/**
 * A real token from the set laid out like the customer's card: one with rules
 * text when theirs has some, with a P/T box when theirs has one, since those
 * decide where a modern token's boxes sit; then the same colour, which sets the
 * bar colours; then the same name.
 */
export function useTokenSetSampleV1(setCode: string | null | undefined, card: CardShape): TokenSetSampleV1 | null {
  const set = tokenSetIndexEntryV1(setCode);
  const code = set?.code ?? "";
  const [found, setFound] = useState<{ code: string; tokens: SetToken[] } | null>(null);
  useEffect(() => {
    if (!code) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      void setTokens(code).then((tokens) => {
        if (!active) return;
        if (tokens) setFound({ code, tokens });
        else retry = setTimeout(load, 15000);
      });
    };
    load();
    return () => {
      active = false;
      clearTimeout(retry);
    };
  }, [code]);
  if (!set || found?.code !== code) return null;
  return (
    pick(found.tokens, card) ??
    (set.sample ? { image: set.sample, name: "", hasText: true, hasPt: true, colors: null, match: "other" } : null)
  );
}
