"use client";

import { useState } from "react";
import type { ClerkDeckList } from "@/lib/store-inventory/clerk-types";
import type { CommanderDeckBuildSession } from "@/lib/store-inventory/clerk-tools/commander-deck-build-state";
import {
  answerSourceLabel,
  classifyClerkRequest,
} from "@/lib/store-inventory/clerk-request-classifier";
import type { ClerkPickCard } from "./ClerkPicksPanel";
import {
  filtersToLegacyColor,
  type InventoryFilterState,
  type InventoryGridCard,
  type LegacyInventoryColorFilter,
} from "./InventoryBrowseUI";
import type { GatheringCard } from "./clerk-gathering";

type ClerkMessage = {
  role: "user" | "assistant";
  text: string;
  footerNote?: string;
};

function summarizeClerkHistory(messages: ClerkMessage[]): string {
  return messages
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Customer" : "Clerk"}: ${m.text}`)
    .join("\n");
}

function clerkLoadingMessage(
  query: string,
  history: ClerkMessage[],
  deckStage?: string,
): string {
  if (deckStage) return deckStage;
  const classification = classifyClerkRequest({
    question: query,
    conversationSummary: summarizeClerkHistory(history),
  });
  if (classification.useStagedDeckBuild) {
    return "Building your deck in stages — cards will appear as each section completes…";
  }
  if (classification.mode === "knowledge") {
    return "Looking up MTG/Pokémon knowledge…";
  }
  return "Checking what's in stock…";
}

function clerkFooterNote(data: {
  deckList?: ClerkDeckList;
  suggestedCards?: InventoryGridCard[];
  clearBrowseFilters?: boolean;
  searchQuery?: string;
  answerSourceLabel?: string;
}): string | undefined {
  const parts: string[] = [];
  if (data.answerSourceLabel) {
    parts.push(data.answerSourceLabel);
  }
  if (data.deckList) {
    parts.push(`↓ Full ${data.deckList.totalCards}-card list shown below`);
  } else {
    const pickCount = data.suggestedCards?.length ?? 0;
    if (data.clearBrowseFilters && pickCount > 0) {
      parts.push(`↓ ${pickCount} in-stock pick${pickCount === 1 ? "" : "s"} shown below`);
    } else if (data.searchQuery) {
      parts.push("↓ Matching cards shown in inventory below");
    }
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

async function parseClerkResponse(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as Record<string, unknown>;
  }
  const text = await res.text();
  const timedOut =
    res.status === 504 ||
    /upstream request timeout|gateway timeout/i.test(text);
  throw new Error(
    timedOut
      ? "That took too long — deck builds can take a minute. Try again in a moment."
      : "Clerk unavailable — try again in a moment.",
  );
}

export function StoreClerkChat({
  slug,
  storeName,
  filters,
  onApplyClerk,
  onAddToGathering: _onAddToGathering,
}: {
  slug: string;
  storeName: string;
  filters: InventoryFilterState;
  onApplyClerk: (input: {
    searchQuery?: string;
    game?: InventoryFilterState["game"];
    color?: LegacyInventoryColorFilter;
    cardType?: InventoryFilterState["cardType"];
    highlightIds?: string[];
    deckList?: ClerkDeckList;
    clearSearch?: boolean;
    clearBrowseFilters?: boolean;
    picks?: ClerkPickCard[];
  }) => void;
  onAddToGathering?: (card: GatheringCard) => void;
}) {
  const [messages, setMessages] = useState<ClerkMessage[]>([
    {
      role: "assistant",
      text: `Hey! I'm your clerk at ${storeName}. Ask about stock, prices, rules, or deck ideas — I'll explain the game and show what we have in stock.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  async function runStagedDeckBuild(text: string, history: ClerkMessage[]) {
    let session: CommanderDeckBuildSession | undefined;
    let complete = false;
    let lastReply = "";
    const conversationSummary = summarizeClerkHistory(history);

    while (!complete) {
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/inventory/clerk/deck-build`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: session ? undefined : text,
            conversationSummary: session ? undefined : conversationSummary,
            session,
          }),
        },
      );
      const data = await parseClerkResponse(res);
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Deck build failed",
        );
      }

      session = data.session as CommanderDeckBuildSession;
      complete = Boolean(data.complete);
      lastReply = String(data.reply ?? "");
      const deckList = data.deckList as ClerkDeckList | undefined;
      const stageLabel = String(data.stageLabel ?? "");
      const stageIndex = Number(data.stageIndex ?? 0);
      const totalStages = Number(data.totalStages ?? 7);

      setLoadingMessage(
        complete
          ? "Finishing deck list…"
          : `Adding ${stageLabel.toLowerCase()} (${stageIndex + 1}/${totalStages})…`,
      );

      if (deckList) {
        onApplyClerk({
          deckList,
          highlightIds: deckList.lines
            .map((l) => l.inventoryItemId)
            .filter(Boolean) as string[],
          clearSearch: true,
          clearBrowseFilters: true,
        });
      }
    }

    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: lastReply,
        footerNote: "↓ Deck list updated below as each stage completed",
      },
    ]);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    const history = messages;
    setLoadingMessage(clerkLoadingMessage(text, history));

    try {
      const conversationSummary = summarizeClerkHistory(history);
      const classification = classifyClerkRequest({
        question: text,
        conversationSummary,
      });

      if (classification.useStagedDeckBuild) {
        await runStagedDeckBuild(text, history);
        return;
      }

      const historyPayload = history.map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch(
        `/api/store/${encodeURIComponent(slug)}/inventory/clerk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: historyPayload,
            filters: {
              game: filters.game,
              color: filtersToLegacyColor(filters),
              cardType: filters.cardType,
              q: filters.q,
            },
          }),
        },
      );
      const data = await parseClerkResponse(res);
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Clerk unavailable",
        );
      }

      const suggestedCards = (data.suggestedCards ?? []) as InventoryGridCard[];
      const recommendations = (data.recommendations ?? []) as Array<{
        inventoryItemId?: string;
        reason?: string;
      }>;
      const deckList = data.deckList as ClerkDeckList | undefined;

      const picks: ClerkPickCard[] = suggestedCards.map((card) => {
        const rec = recommendations.find(
          (r) => r.inventoryItemId === card.inventoryItemId,
        );
        return { ...card, reason: rec?.reason };
      });

      const classificationMeta = data.classification as
        | { answerSourceLabel?: string; redirectToInventorySearch?: string }
        | undefined;
      const sourceLabel =
        classificationMeta?.answerSourceLabel ??
        (classificationMeta?.redirectToInventorySearch
          ? answerSourceLabel("inventory")
          : undefined);

      const footerNote = clerkFooterNote({
        deckList,
        suggestedCards,
        clearBrowseFilters: Boolean(data.clearBrowseFilters),
        searchQuery:
          typeof data.searchQuery === "string"
            ? data.searchQuery
            : classificationMeta?.redirectToInventorySearch,
        answerSourceLabel: sourceLabel,
      });

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: String(data.reply ?? ""),
          footerNote,
        },
      ]);

      onApplyClerk({
        searchQuery:
          typeof data.searchQuery === "string"
            ? data.searchQuery
            : classificationMeta?.redirectToInventorySearch,
        game: data.game as InventoryFilterState["game"] | undefined,
        color: data.color as LegacyInventoryColorFilter | undefined,
        cardType: data.cardType as InventoryFilterState["cardType"] | undefined,
        highlightIds: data.highlightItemIds as string[] | undefined,
        deckList,
        picks: deckList ? undefined : picks,
        clearSearch: Boolean(deckList || data.clearBrowseFilters),
        clearBrowseFilters: Boolean(data.clearBrowseFilters),
      });
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text:
            e instanceof Error
              ? e.message
              : "Sorry — I'm having trouble right now. Try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">Ask the clerk</p>
        <span className="text-[10px] uppercase tracking-wide text-indigo-400">
          AI · knowledge + in-stock picks
        </span>
      </div>

      <ul className="mb-3 max-h-72 space-y-2 overflow-y-auto text-sm">
        {messages.map((m, i) => (
          <li
            key={i}
            className={
              m.role === "user" ? "text-indigo-300" : "text-neutral-300"
            }
          >
            <span className="whitespace-pre-line">{m.text}</span>
            {m.footerNote ? (
              <p className="mt-1 text-[10px] text-indigo-400">{m.footerNote}</p>
            ) : null}
          </li>
        ))}
        {loading && loadingMessage ? (
          <li className="flex items-center gap-2.5 py-1 text-neutral-400">
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-500/25 border-t-indigo-400"
              aria-hidden
            />
            <span className="text-xs">{loadingMessage}</span>
          </li>
        ) : null}
      </ul>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          disabled={loading}
          placeholder="Stock, prices, rules, or deck ideas — e.g. Sol Ring, Witch-maw colors, deck under $100"
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void send()}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? (
            <>
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                aria-hidden
              />
              <span className="sr-only">Working…</span>
            </>
          ) : (
            "Ask"
          )}
        </button>
      </div>
    </div>
  );
}
