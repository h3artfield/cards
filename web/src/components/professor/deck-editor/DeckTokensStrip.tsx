"use client";

import Link from "next/link";
import { useState } from "react";
import { CardMentionV1, useCardHoverPreviewV1 } from "../CardNameHoverPreview";
import { deckTokenLabelV1, type DeckTokensV1, type DeckTokenV1 } from "@/lib/deck-tokens/deck-tokens-v1";

function tokenCreatorHref(slug: string, deckId: string | undefined, token: DeckTokenV1): string {
  const q = new URLSearchParams();
  if (deckId) q.set("deck", deckId);
  q.set("name", token.name);
  q.set("type", token.typeLine);
  if (token.power) q.set("power", token.power);
  if (token.toughness) q.set("toughness", token.toughness);
  if (token.colors.length) q.set("colors", token.colors.join(""));
  if (token.text) q.set("text", token.text);
  if (token.setCode) q.set("set", token.setCode);
  return `/s/${encodeURIComponent(slug)}/tokens/create?${q.toString()}`;
}

function TokenTile({ token, designHref }: { token: DeckTokenV1; designHref: string | null }) {
  const hover = useCardHoverPreviewV1(token.name, token.imageUrl ?? undefined);
  return (
    <li className="flex gap-2.5 rounded-md border border-[var(--mtg-stone-border)] p-2">
      {token.imageUrl ? (
        <img
          src={token.imageUrl}
          alt={token.name}
          loading="lazy"
          className="h-[84px] w-[60px] shrink-0 rounded object-cover"
          {...hover.handlers}
        />
      ) : null}
      {hover.preview}
      <div className="min-w-0 text-xs">
        <p className="font-semibold">{deckTokenLabelV1(token)}</p>
        <p className="professor-mtg-muted text-[11px]">{token.typeLine}</p>
        {token.text ? <p className="mt-0.5 line-clamp-2 text-[11px]">{token.text}</p> : null}
        <p className="professor-mtg-muted mt-1 text-[11px]">
          Made by{" "}
          {token.madeBy.map((name, index) => (
            <span key={name}>
              {index > 0 ? ", " : ""}
              <CardMentionV1 name={name} />
            </span>
          ))}
        </p>
        {designHref ? (
          <Link href={designHref} className="deck-token-design-link mt-1.5 inline-block">
            Design this token →
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function DeckTokensStrip({ tokens, slug, deckId }: { tokens: DeckTokensV1; slug?: string; deckId?: string }) {
  const [open, setOpen] = useState(false);
  const tokenCount = tokens.tokens.length;
  const emblemCount = tokens.emblems.length;
  const href = (token: DeckTokenV1) => (slug ? tokenCreatorHref(slug, deckId, token) : null);

  return (
    <div className="border-b border-[var(--mtg-stone-border)] px-4 pb-4 pt-3 sm:px-5 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`deck-toolbar-chip${open ? " deck-toolbar-chip--on" : ""}`}
          aria-expanded={open}
          disabled={tokenCount + emblemCount === 0}
          onClick={() => setOpen((v) => !v)}
        >
          Tokens {tokenCount}
          {emblemCount > 0 ? ` · Emblems ${emblemCount}` : ""}
          {tokenCount + emblemCount > 0 ? (open ? " ▴" : " ▾") : ""}
        </button>
        {slug && tokenCount + emblemCount > 0 ? (
          <button
            type="button"
            className="deck-toolbar-chip deck-toolbar-chip--accent"
            onClick={() => setOpen(true)}
            title="Pick one of this deck's tokens and design a custom printed version"
          >
            Design tokens for this deck
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 space-y-3">
          {slug ? (
            <p className="professor-mtg-muted text-[11px]">
              Pick a token to design a custom printed card for it — $5 each.
            </p>
          ) : null}
          {tokenCount > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tokens.tokens.map((token) => (
                <TokenTile key={token.tokenId} token={token} designHref={href(token)} />
              ))}
            </ul>
          ) : null}
          {emblemCount > 0 ? (
            <div>
              <h4 className="professor-mtg-label mb-1 text-[11px]">Emblems</h4>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tokens.emblems.map((token) => (
                  <TokenTile key={token.tokenId} token={token} designHref={href(token)} />
                ))}
              </ul>
            </div>
          ) : null}
          <p className="professor-mtg-muted text-[10px]">
            From Scryfall&apos;s token links. Cards that copy other permanents may need extra tokens.
          </p>
        </div>
      ) : null}
    </div>
  );
}
