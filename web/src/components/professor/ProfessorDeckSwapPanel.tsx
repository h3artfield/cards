"use client";

import { useState } from "react";

type Suggestion = {
  out: { oracleId: string; name: string };
  in: { oracleId: string; name: string };
  source: "semantic_neighbor" | "role_upgrade";
  semanticDistance: number | null;
  sharedRoles: string[];
  bracketBefore: number;
  bracketAfter: number;
  stock: { quantity: number; priceUsd: number | null } | null;
  verdict: "UPGRADE" | "SIDEGRADE" | "DOWNGRADE" | "UNKNOWN";
  playRateLift: number | null;
  incomingPlayRate: number | null;
  notes: string[];
};

type RejectedSwap = { oracleId: string; name: string; code: string; detail: string };

type Intent = "play_rate" | "price";

const INTENTS: Array<{ id: Intent; label: string; hint: string }> = [
  { id: "play_rate", label: "Stronger", hint: "Ranked by how often tournament players run it." },
  { id: "price", label: "Cheaper", hint: "Ranked by your shelf price, closest function first." },
];

export function ProfessorDeckSwapPanel({
  storeSlug,
  commanderName,
  commanderColorIdentity,
  cards,
  requestedBracket,
}: {
  storeSlug: string;
  commanderName: string;
  commanderColorIdentity: string[];
  cards: Array<{ name: string; copies?: number }>;
  requestedBracket?: number | null;
}) {
  const [swapOut, setSwapOut] = useState("");
  const [intent, setIntent] = useState<Intent>("play_rate");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [rejected, setRejected] = useState<RejectedSwap[]>([]);
  const [stockAvailable, setStockAvailable] = useState(true);

  async function run(cardName: string, rankBy: Intent, requireInStock: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeSlug)}/professor/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commander: commanderName,
          commanderColorIdentity,
          cards,
          swapOut: cardName,
          rankBy,
          requireInStock,
          // Keeping the deck inside the bracket it was built for is the point
          // of the preview, so the request doubles as the ceiling.
          maxBracket: requestedBracket ?? null,
        }),
      });
      if (!res.ok) throw new Error(`swap request failed: ${res.status}`);
      const data = (await res.json()) as {
        suggestions?: Suggestion[];
        rejected?: RejectedSwap[];
        stockAvailable?: boolean;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setSuggestions(data.suggestions ?? []);
      setRejected(data.rejected ?? []);
      setStockAvailable(data.stockAvailable ?? true);
    } catch (err) {
      setError((err as Error).message);
      setSuggestions(null);
    } finally {
      setBusy(false);
    }
  }

  const raisesBracket = rejected.filter((r) => r.code === "RAISES_BRACKET");

  return (
    <div>
      <p className="professor-mtg-label">Swap a card</p>
      <p className="professor-mtg-muted mt-1 text-xs leading-relaxed">
        Every option below is legal in this commander&apos;s colors and shows what it would do to
        the deck&apos;s bracket.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="professor-mtg-body min-w-0 flex-1 rounded border border-[var(--mtg-stone-border)] bg-transparent px-2 py-1.5 text-xs"
          value={swapOut}
          onChange={(e) => {
            setSwapOut(e.target.value);
            setSuggestions(null);
            if (e.target.value) void run(e.target.value, intent, inStockOnly);
          }}
        >
          <option value="">Choose a card to replace…</option>
          {cards.map((card) => (
            <option key={card.name} value={card.name}>
              {card.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {INTENTS.map((option) => (
          <button
            key={option.id}
            type="button"
            title={option.hint}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
              intent === option.id
                ? "bg-[var(--mtg-emerald)] text-black"
                : "professor-mtg-muted border border-[var(--mtg-stone-border)]"
            }`}
            onClick={() => {
              setIntent(option.id);
              if (swapOut) void run(swapOut, option.id, inStockOnly);
            }}
          >
            {option.label}
          </button>
        ))}
        <label className="professor-mtg-muted flex items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => {
              setInStockOnly(e.target.checked);
              if (swapOut) void run(swapOut, intent, e.target.checked);
            }}
          />
          In stock only
        </label>
      </div>

      {busy ? <p className="professor-mtg-muted mt-3 text-xs">Checking options…</p> : null}
      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}

      {!busy && suggestions?.length === 0 ? (
        <p className="professor-mtg-muted mt-3 text-xs leading-relaxed">
          Nothing here is a clear improvement on {swapOut}
          {inStockOnly ? " that is also on the shelf" : ""}. That is a real answer, not a gap in
          the data.
        </p>
      ) : null}

      {!busy && suggestions && suggestions.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {suggestions.map((s) => {
            const price = s.stock?.priceUsd;
            return (
              <li
                key={s.in.oracleId}
                className="border-b border-[var(--mtg-stone-border)] pb-2 last:border-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="professor-mtg-body text-sm font-semibold">{s.in.name}</p>
                  <p className="professor-mtg-muted text-[11px]">
                    {s.stock && s.stock.quantity > 0 ? (
                      <span className="text-[var(--mtg-emerald)]">
                        {s.stock.quantity} in stock
                        {price != null ? ` · $${price.toFixed(2)}` : ""}
                      </span>
                    ) : stockAvailable ? (
                      "not on the shelf"
                    ) : null}
                  </p>
                </div>
                <p className="professor-mtg-muted mt-0.5 text-[11px] leading-relaxed">
                  {s.notes.join(" ")}
                </p>
                {s.bracketAfter !== s.bracketBefore ? (
                  <p className="mt-0.5 text-[11px] text-amber-300">
                    Bracket {s.bracketBefore} → {s.bracketAfter}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!busy && raisesBracket.length > 0 ? (
        <p className="professor-mtg-muted mt-3 text-[11px] leading-relaxed">
          Held back for pushing the deck past bracket {requestedBracket}:{" "}
          {raisesBracket.slice(0, 5).map((r) => r.name).join(", ")}
          {raisesBracket.length > 5 ? ` and ${raisesBracket.length - 5} more` : ""}.
        </p>
      ) : null}
    </div>
  );
}
