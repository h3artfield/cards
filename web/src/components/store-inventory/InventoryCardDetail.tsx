"use client";

import { useEffect, useId, useState } from "react";
import {
  cardBackImageUrl,
  cardHasOtherFace,
} from "@/lib/inventory/double-faced-card";
import { useCart } from "@/hooks/useCart";
import { CartPanel } from "./CartPanel";
import { gatheringCardToCartLine } from "./clerk-gathering";
import type { InventoryGridCard } from "./InventoryBrowseUI";

type CardDetail = {
  name: string;
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  oracleText?: string;
  keywords?: string[];
  colorIdentity?: string[];
  flavorText?: string;
  artist?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  legalities?: Record<string, string>;
  setName?: string;
  collectorNumber?: string;
  rarity?: string;
  condition?: string;
  finishLabel?: string | null;
  qty?: number;
  listPrice?: number;
  inventoryItemId?: string;
  imageProxyUrl?: string;
  tcgMarketPrice?: number;
  marketPriceAt?: string;
  quantityInStore?: number;
  quantityOnline?: number;
  history?: { points: Array<[number, number]>; min1y: number | null; max1y: number | null } | null;
};

export type InventoryCardDetailData = CardDetail;

const RARITY_LETTERS: Record<string, string> = {
  c: "Common",
  u: "Uncommon",
  r: "Rare",
  m: "Mythic",
  s: "Special",
  t: "Token",
  l: "Land",
  p: "Promo",
};

const FORMAT_LABELS: Record<string, string> = {
  commander: "Commander",
  standard: "Standard",
  modern: "Modern",
  pioneer: "Pioneer",
  legacy: "Legacy",
  vintage: "Vintage",
  pauper: "Pauper",
};

const PIP_CLASS: Record<string, string> = {
  W: "bg-amber-100 text-amber-950",
  U: "bg-blue-600 text-white",
  B: "bg-neutral-950 text-white ring-1 ring-neutral-200",
  R: "bg-red-600 text-white",
  G: "bg-green-600 text-white",
  C: "bg-neutral-300 text-neutral-950",
};

function spelledRarity(rarity?: string): string | null {
  const trimmed = rarity?.trim();
  if (!trimmed) return null;
  if (trimmed.length === 1) return RARITY_LETTERS[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
  return trimmed.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function money(value?: number): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `$${value.toFixed(2)}`;
}

function ManaPip({ symbol }: { symbol: string }) {
  const raw = symbol.replace(/[{}]/g, "").toUpperCase();
  const letter = raw.length === 1 && PIP_CLASS[raw] ? raw : null;
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none ${
        letter ? PIP_CLASS[letter] : "bg-neutral-200 text-neutral-950"
      }`}
    >
      {raw}
    </span>
  );
}

function ManaText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.startsWith("{") && part.endsWith("}") ? (
          <ManaPip key={`${part}-${index}`} symbol={part} />
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </span>
  );
}

function shortDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function changeSince(points: Array<[number, number]>, days: number): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const cutoff = last[0] - days * 86_400;
  const then =
    [...points].reverse().find(([t]) => t <= cutoff) ??
    (points[0] && last[0] - points[0][0] >= (days - 7) * 86_400 ? points[0] : undefined);
  if (!then || !(then[1] > 0)) return null;
  return ((last[1] - then[1]) / then[1]) * 100;
}

function Change({ label, value }: { label: string; value: number | null }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className={up ? "text-emerald-300" : "text-rose-300"}>
      {label} {up ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

function PriceChart({ points, shelfPrice }: { points: Array<[number, number]>; shelfPrice?: number }) {
  const width = 560;
  const height = 168;
  const padL = 48;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const values = points.map(([, v]) => v);
  if (shelfPrice != null && shelfPrice > 0) values.push(shelfPrice);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const t0 = points[0]![0];
  const tSpan = points[points.length - 1]![0] - t0 || 1;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xAt = (t: number) => padL + ((t - t0) / tSpan) * plotW;
  const yAt = (v: number) => padT + (1 - (v - min) / span) * plotH;
  const line = points.map(([t, v]) => `${xAt(t).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
  const lastX = xAt(points[points.length - 1]![0]);
  const area = `${padL},${(padT + plotH).toFixed(1)} ${line} ${lastX.toFixed(1)},${(padT + plotH).toFixed(1)}`;
  const shelfY = shelfPrice != null && shelfPrice > 0 ? yAt(shelfPrice) : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full text-amber-300"
      role="img"
      aria-label={`Market price from ${shortDate(t0)} to ${shortDate(points[points.length - 1]![0])}`}
    >
      <line x1={padL} x2={width - padR} y1={padT + plotH} y2={padT + plotH} stroke="currentColor" strokeOpacity="0.25" />
      <text x={padL - 6} y={padT + 4} textAnchor="end" className="fill-neutral-400 text-[11px]">
        {money(max)}
      </text>
      <text x={padL - 6} y={padT + plotH} textAnchor="end" className="fill-neutral-400 text-[11px]">
        {money(min)}
      </text>
      <polygon points={area} fill="currentColor" fillOpacity="0.16" />
      <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={line} />
      {shelfY != null ? (
        <line x1={padL} x2={width - padR} y1={shelfY} y2={shelfY} stroke="white" strokeDasharray="4 4" strokeOpacity="0.7" />
      ) : null}
      <text x={padL} y={height - 6} className="fill-neutral-400 text-[11px]">
        {shortDate(t0)}
      </text>
      <text x={width - padR} y={height - 6} textAnchor="end" className="fill-neutral-400 text-[11px]">
        {shortDate(points[points.length - 1]![0])}
      </text>
    </svg>
  );
}

function legalitySentence(legalities?: Record<string, string>): string | null {
  if (!legalities) return null;
  const legal: string[] = [];
  const banned: string[] = [];
  for (const [format, status] of Object.entries(legalities)) {
    const label = FORMAT_LABELS[format] ?? format;
    if (status === "legal") legal.push(label);
    else if (status === "banned" || status === "restricted") banned.push(`${label} (${status})`);
  }
  const parts: string[] = [];
  if (legal.length) parts.push(`Legal in ${legal.join(", ")}`);
  if (banned.length) parts.push(`Not playable in ${banned.join(", ")}`);
  return parts.length ? `${parts.join(". ")}.` : null;
}

export function SpyglassIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M14.2 14.2 L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function FlipCardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        d="M3 12a9 9 0 0 1 15-6.7L21 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 3v5h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12a9 9 0 0 1-15 6.7L3 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 21v-5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CardFlipButton({
  pressed,
  onFlip,
}: {
  pressed: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={pressed ? "Show the front face" : "Flip card"}
      aria-pressed={pressed}
      title="Flip card"
      className="absolute bottom-1.5 left-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-950/85 text-white ring-1 ring-white/50 transition hover:bg-white hover:text-neutral-950"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onFlip();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <FlipCardIcon />
    </button>
  );
}

export function CardInspectButton({ onInspect }: { onInspect: () => void }) {
  return (
    <button
      type="button"
      aria-label="Card details"
      title="Card details"
      className="absolute bottom-1.5 right-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-950/85 text-white ring-1 ring-white/50 transition hover:bg-white hover:text-neutral-950"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onInspect();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <SpyglassIcon />
    </button>
  );
}

function CartControls({
  slug,
  card,
  onViewCart,
}: {
  slug: string;
  card: InventoryGridCard;
  onViewCart: () => void;
}) {
  const cart = useCart(slug);
  const line = gatheringCardToCartLine(card);
  if (!line) {
    return <p className="mt-3 text-center text-sm text-neutral-400">Sold out</p>;
  }
  const inCart = cart.lines.find((l) => l.inventoryItemId === card.inventoryItemId)?.quantity ?? 0;
  const atMax = inCart >= card.qty;

  if (inCart === 0) {
    return (
      <button
        type="button"
        onClick={() => cart.add(line)}
        className="mt-3 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-base font-semibold text-neutral-950 hover:bg-emerald-400"
      >
        Add to cart
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/60 bg-emerald-950/40 px-2 py-1.5">
        <button
          type="button"
          aria-label="One fewer"
          onClick={() => cart.setQuantity(card.inventoryItemId, inCart - 1)}
          className="h-8 w-8 rounded-md border border-neutral-600 text-lg leading-none text-white hover:bg-neutral-800"
        >
          −
        </button>
        <span className="text-sm font-medium text-emerald-200">{inCart} in your cart</span>
        <button
          type="button"
          aria-label="One more"
          disabled={atMax}
          onClick={() => cart.setQuantity(card.inventoryItemId, inCart + 1)}
          className="h-8 w-8 rounded-md border border-neutral-600 text-lg leading-none text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          +
        </button>
      </div>
      {atMax && card.qty > 1 ? (
        <p className="text-center text-xs text-neutral-400">That&apos;s all {card.qty} we have.</p>
      ) : null}
      <button
        type="button"
        onClick={onViewCart}
        className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-base font-semibold text-neutral-950 hover:bg-emerald-400"
      >
        View cart &amp; check out
      </button>
    </div>
  );
}

export function InventoryCardDetail({
  slug,
  card,
  onClose,
}: {
  slug?: string;
  card: InventoryGridCard;
  onClose: () => void;
}) {
  const titleId = useId();
  const [view, setView] = useState<"card" | "cart">("card");
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rulesReady, setRulesReady] = useState(false);
  const [face, setFace] = useState<"front" | "back">("front");
  const [backUnavailable, setBackUnavailable] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!slug || !card.inventoryItemId) {
      setRulesReady(true);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setRulesReady(false);
    setDetail(null);
    setError(null);
    fetch(
      `/api/store/${encodeURIComponent(slug)}/inventory/card?itemId=${encodeURIComponent(card.inventoryItemId)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (res) => {
        const body = (await res.json()) as CardDetail & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Could not load this card");
        return body;
      })
      .then((body) => {
        if (!cancelled) {
          setDetail(body);
          setRulesReady(true);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Could not load this card");
        setRulesReady(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [slug, card.inventoryItemId]);

  useEffect(() => {
    setFace("front");
    setBackUnavailable(false);
    setView("card");
  }, [card.inventoryItemId]);

  const name = detail?.name || card.name;
  const manaCost = detail?.manaCost || card.manaCost;
  const typeLine = detail?.typeLine || card.typeLine;
  const oracleText = detail?.oracleText || card.oracleText;
  const setName = detail?.setName || card.setName;
  const number = detail?.collectorNumber || card.cardNumber;
  const rarity = spelledRarity(detail?.rarity || card.rarity);
  const condition = detail?.condition || card.condition;
  const finish = detail?.finishLabel || card.finishLabel;
  const qty = detail?.qty ?? card.qty;
  const price = money(detail?.listPrice ?? card.listPrice);
  const frontImage = card.imageProxyUrl || card.imageUrl;
  const backImage = cardBackImageUrl(card);
  const canFlip = cardHasOtherFace(typeLine) && Boolean(backImage) && !backUnavailable;
  const image = face === "back" && backImage ? backImage : frontImage;
  const pt =
    detail?.power && detail?.toughness
      ? `${detail.power}/${detail.toughness}`
      : detail?.loyalty
        ? detail.loyalty
        : null;
  const rules = legalitySentence(detail?.legalities);
  const points = detail?.history?.points ?? [];
  const split =
    detail?.quantityInStore != null || detail?.quantityOnline != null
      ? { inStore: detail?.quantityInStore ?? 0, online: detail?.quantityOnline ?? 0 }
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-950 text-neutral-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3">
          {view === "cart" ? (
            <h2 id={titleId} className="text-lg font-semibold text-white">
              Your cart
            </h2>
          ) : (
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-semibold text-white">
                {name}
              </h2>
              <p className="truncate text-xs text-neutral-400">
                {[setName, number ? `#${number}` : null, rarity].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}
          <div className="flex shrink-0 gap-2">
            {view === "cart" ? (
              <button
                type="button"
                onClick={() => setView("card")}
                className="rounded-lg border border-neutral-700 px-2.5 py-1 text-sm text-neutral-300 hover:text-white"
              >
                Back to card
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-700 px-2.5 py-1 text-sm text-neutral-300 hover:text-white"
            >
              {view === "cart" ? "Keep shopping" : "Close"}
            </button>
          </div>
        </div>

        {view === "cart" && slug ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <CartPanel slug={slug} />
          </div>
        ) : (
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[240px_1fr]">
          <div className="mx-auto w-full max-w-[240px]">
            <div className="relative overflow-hidden rounded-xl bg-neutral-900">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt={name}
                  className="aspect-[5/7] w-full object-contain"
                  onError={() => {
                    if (face === "back") {
                      setFace("front");
                      setBackUnavailable(true);
                    }
                  }}
                />
              ) : (
                <div className="flex aspect-[5/7] items-center justify-center px-3 text-center text-sm text-neutral-500">
                  {name}
                </div>
              )}
              {canFlip ? (
                <CardFlipButton
                  pressed={face === "back"}
                  onFlip={() =>
                    setFace((current) => (current === "front" ? "back" : "front"))
                  }
                />
              ) : null}
            </div>
            {price ? (
              <p className="mt-3 text-center text-2xl font-semibold text-white">{price}</p>
            ) : null}
            <p className="mt-1 text-center text-xs text-neutral-400">
              {[
                condition,
                finish && !condition?.toLowerCase().includes(finish.toLowerCase()) ? finish : null,
                qty > 0 && !split ? `Qty ${qty}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {split ? (
              <p className="mt-1 text-center text-xs text-neutral-300">
                {split.inStore} in store · {split.online} online
              </p>
            ) : null}
            {slug ? (
              <CartControls
                slug={slug}
                card={{
                  ...card,
                  qty,
                  listPrice: detail?.listPrice ?? card.listPrice,
                  onlineQty: split ? Math.min(qty, split.online) : card.onlineQty,
                }}
                onViewCart={() => setView("cart")}
              />
            ) : null}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {manaCost ? <ManaText text={manaCost} className="inline-flex flex-wrap items-center gap-1" /> : null}
                {detail?.cmc != null ? (
                  <span className="text-xs text-neutral-400">Mana value {detail.cmc}</span>
                ) : null}
              </div>
              {typeLine ? (
                <p className="mt-2 text-sm font-medium text-neutral-100">
                  {typeLine}
                  {pt ? <span className="float-right font-semibold text-white">{pt}</span> : null}
                </p>
              ) : null}
              {error ? (
                <p className="mt-3 text-sm text-rose-300">{error}</p>
              ) : oracleText ? (
                <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-100">
                  {oracleText.split("\n").map((line, index) => (
                    <p key={`${index}-${line}`}>
                      <ManaText text={line} className="inline" />
                    </p>
                  ))}
                </div>
              ) : rulesReady ? null : (
                <p className="mt-3 text-sm text-neutral-500">Rules text is still loading.</p>
              )}
              {detail?.flavorText ? (
                <p className="mt-3 text-sm italic text-neutral-400">{detail.flavorText}</p>
              ) : null}
              {detail?.artist ? (
                <p className="mt-2 text-xs text-neutral-500">Illustrated by {detail.artist}</p>
              ) : null}
            </div>

            {rules ? <p className="text-sm text-neutral-300">{rules}</p> : null}

            {points.length > 1 || detail?.tcgMarketPrice != null ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-white">
                    TCG market{detail?.tcgMarketPrice != null ? ` ${money(detail.tcgMarketPrice)}` : ""}
                  </p>
                  <p className="flex flex-wrap gap-3 text-xs">
                    <Change label="30d" value={changeSince(points, 30)} />
                    <Change label="90d" value={changeSince(points, 90)} />
                    <Change label="1y" value={changeSince(points, 365)} />
                  </p>
                </div>
                {points.length > 1 ? (
                  <>
                    <p className="mt-1 text-xs text-neutral-500">
                      Past year{price ? " · dashed line is our price" : ""}
                    </p>
                    <div className="mt-3">
                      <PriceChart points={points} shelfPrice={detail?.listPrice ?? card.listPrice} />
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
