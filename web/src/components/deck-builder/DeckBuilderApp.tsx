"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomerAuthShell } from "@/components/CustomerAuthShell";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryCardGrid,
  InventoryFilterBar,
  appendInventoryColorParams,
  type InventoryFilterState,
  type InventoryGridCard,
} from "@/components/store-inventory/InventoryBrowseUI";
import { useCustomer } from "@/context/CustomerContext";
import {
  buildOwnedCardIndex,
  cardOwnershipTag,
  isCardOwned,
  type OwnershipTag,
} from "@/lib/collection/owned-index";
import type { StoreDeckCard } from "@/lib/deck-builder/types";
import type { CollectionCard } from "@/lib/types";

type WizardStep = "game" | "format" | "commander" | "theme" | "builder";

type CommanderOption = {
  slug: string;
  name: string;
  scryfallId?: string;
  colorIdentity?: string[];
  themes?: Array<{ slug: string; label: string; count: number }>;
  imageUrl?: string;
};

type InventoryCard = {
  inventoryItemId: string;
  scryfallId: string;
  name: string;
  imageUrl?: string;
  qty: number;
  listPrice?: number;
  tcgLowPrice?: number;
  synergy?: number;
  colorIdentity: string[];
  cmc: number;
  typeLine: string;
};

type RecCard = {
  scryfallId: string;
  name: string;
  category: string;
  synergy: number;
  inclusion: number;
  inStock: boolean;
  stockQty: number;
  listPrice?: number;
  imageUrl?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  adds?: Array<{ scryfallId: string; name: string; reason: string }>;
};

export function DeckBuilderApp({
  slug,
  storeName,
  logoUrl,
  initialShareToken,
  inventoryFirst = false,
  onBackToInventory,
}: {
  slug: string;
  storeName: string;
  logoUrl?: string | null;
  initialShareToken?: string;
  inventoryFirst?: boolean;
  onBackToInventory?: () => void;
}) {
  const [step, setStep] = useState<WizardStep>(
    initialShareToken ? "builder" : inventoryFirst ? "commander" : "game",
  );
  const [commanderQuery, setCommanderQuery] = useState("");
  const [commanderFilters, setCommanderFilters] = useState<InventoryFilterState>({
    ...DEFAULT_INVENTORY_FILTERS,
    game: "magic",
    cardType: "commander",
  });
  const [inventoryCommanders, setInventoryCommanders] = useState<
    InventoryGridCard[]
  >([]);
  const [commandersLoading, setCommandersLoading] = useState(false);
  const [commanderResults, setCommanderResults] = useState<CommanderOption[]>(
    [],
  );
  const [selectedCommander, setSelectedCommander] =
    useState<CommanderOption | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | undefined>();
  const [targetBracket, setTargetBracket] = useState<number | undefined>();
  const [deckCards, setDeckCards] = useState<StoreDeckCard[]>([]);
  const [inventory, setInventory] = useState<InventoryCard[]>([]);
  const [recommendations, setRecommendations] = useState<RecCard[]>([]);
  const [collection, setCollection] = useState<CollectionCard[]>([]);
  const [recTab, setRecTab] = useState<"synergy" | "stock">("synergy");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{
    valid: boolean;
    issues: Array<{ message: string }>;
    mainCount: number;
    gameChangerCount: number;
  } | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const { customer } = useCustomer();

  const apiBase = `/api/store/${encodeURIComponent(slug)}/deck-builder`;

  const commanderScryfallId = selectedCommander?.scryfallId;

  const mainCount = useMemo(
    () =>
      deckCards
        .filter((c) => c.board === "main")
        .reduce((n, c) => n + c.qty, 0),
    [deckCards],
  );

  const ownedIndex = useMemo(
    () => buildOwnedCardIndex(collection),
    [collection],
  );

  const loadBuilderData = useCallback(async () => {
    if (!selectedCommander?.slug) return;
    setLoading(true);
    setError(null);
    try {
      const invParams = new URLSearchParams({
        commanderSlug: selectedCommander.slug,
      });
      if (selectedTheme) invParams.set("themeSlug", selectedTheme);

      const [invRes, recRes] = await Promise.all([
        fetch(`${apiBase}/inventory?${invParams}`),
        fetch(`${apiBase}/recommendations?${invParams}&limit=120`),
      ]);
      const invData = await invRes.json();
      const recData = await recRes.json();
      if (!invRes.ok) throw new Error(invData.error ?? "Inventory load failed");
      if (!recRes.ok) throw new Error(recData.error ?? "Recommendations failed");

      setInventory(invData.inventory ?? []);
      setRecommendations(recData.recommendations ?? []);

      if (!selectedCommander.scryfallId && recData.commander?.scryfallId) {
        setSelectedCommander((prev) =>
          prev
            ? { ...prev, scryfallId: recData.commander.scryfallId }
            : prev,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [apiBase, selectedCommander, selectedTheme]);

  const validateDeck = useCallback(async () => {
    if (!commanderScryfallId) return;
    const res = await fetch(`${apiBase}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commanderScryfallId,
        cards: deckCards,
        targetBracket,
      }),
    });
    const data = await res.json();
    if (res.ok) setValidation(data);
  }, [apiBase, commanderScryfallId, deckCards, targetBracket]);

  useEffect(() => {
    if (step === "builder" && selectedCommander) {
      void loadBuilderData();
    }
  }, [step, selectedCommander, selectedTheme, loadBuilderData]);

  useEffect(() => {
    if (step === "builder" && commanderScryfallId) {
      const t = setTimeout(() => void validateDeck(), 400);
      return () => clearTimeout(t);
    }
  }, [step, commanderScryfallId, deckCards, targetBracket, validateDeck]);

  // The binder tells us which cards the shopper already has, so the builder
  // can say "owned" instead of asking them to buy it again.
  useEffect(() => {
    if (!customer) return;

    let active = true;
    fetch(`/api/store/${encodeURIComponent(slug)}/collection`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { cards?: CollectionCard[] };
        if (active) setCollection(data.cards ?? []);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [customer, slug]);

  useEffect(() => {
    if (!initialShareToken) return;
    fetch(`${apiBase}/decks/share/${encodeURIComponent(initialShareToken)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Deck not found");
        const deck = data.deck;
        setSelectedCommander({
          slug: deck.commanderSlug ?? "",
          name: deck.commanderName ?? "Commander",
          scryfallId: deck.commanderScryfallId,
        });
        setSelectedTheme(deck.themeSlug);
        setTargetBracket(deck.targetBracket);
        setDeckCards(deck.cards ?? []);
        setValidation(data.validation ?? null);
        setExportText(data.exportText ?? null);
        setStep("builder");
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load shared deck"),
      );
  }, [apiBase, initialShareToken]);

  useEffect(() => {
    if (commanderQuery.length < 2 && !inventoryFirst) {
      setCommanderResults([]);
      return;
    }
    if (inventoryFirst && step !== "commander") return;

    const t = setTimeout(() => {
      if (inventoryFirst) {
        setCommandersLoading(true);
        const params = new URLSearchParams();
        appendInventoryColorParams(params, commanderFilters);
        if (commanderQuery.trim()) params.set("q", commanderQuery.trim());
        fetch(`${apiBase}/commanders/inventory?${params}`)
          .then(async (r) => {
            const data = await r.json();
            if (r.ok) {
              setInventoryCommanders(
                (data.commanders ?? []).map(
                  (c: InventoryGridCard & CommanderOption) => ({
                    inventoryItemId: c.inventoryItemId,
                    scryfallId: c.scryfallId,
                    name: c.name,
                    imageUrl: c.imageUrl,
                    qty: c.qty,
                    listPrice: c.listPrice,
                    tcgLowPrice: c.tcgLowPrice,
                    setName: c.setName,
                    colorIdentity: c.colorIdentity ?? [],
                    isCommander: true,
                    slug: c.slug,
                    themes: c.themes,
                  }),
                ),
              );
            }
          })
          .catch(() => setInventoryCommanders([]))
          .finally(() => setCommandersLoading(false));
        return;
      }

      fetch(
        `${apiBase}/commanders/search?q=${encodeURIComponent(commanderQuery)}`,
      )
        .then(async (r) => {
          const data = await r.json();
          if (r.ok) setCommanderResults(data.results ?? []);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [
    apiBase,
    commanderQuery,
    inventoryFirst,
    step,
    commanderFilters.selectedColors.join(","),
    commanderFilters.colorCount,
  ]);

  function addCard(scryfallId: string, board: "main" | "commander" = "main") {
    setDeckCards((prev) => {
      const existing = prev.find(
        (c) => c.scryfallId === scryfallId && c.board === board,
      );
      if (existing) {
        return prev.map((c) =>
          c.scryfallId === scryfallId && c.board === board
            ? { ...c, qty: c.qty + 1 }
            : c,
        );
      }
      return [...prev, { scryfallId, qty: 1, board }];
    });
  }

  function removeCard(scryfallId: string, board: "main" | "commander") {
    setDeckCards((prev) => {
      const row = prev.find(
        (c) => c.scryfallId === scryfallId && c.board === board,
      );
      if (!row) return prev;
      if (row.qty <= 1) {
        return prev.filter(
          (c) => !(c.scryfallId === scryfallId && c.board === board),
        );
      }
      return prev.map((c) =>
        c.scryfallId === scryfallId && c.board === board
          ? { ...c, qty: c.qty - 1 }
          : c,
      );
    });
  }

  function cardName(scryfallId: string): string {
    return (
      inventory.find((i) => i.scryfallId === scryfallId)?.name ??
      recommendations.find((r) => r.scryfallId === scryfallId)?.name ??
      scryfallId.slice(0, 8)
    );
  }

  function deckRowTag(scryfallId: string): OwnershipTag {
    const stocked = inventory.find((i) => i.scryfallId === scryfallId);
    return cardOwnershipTag(
      {
        scryfallId,
        name: cardName(scryfallId),
        inStock: stocked ? stocked.qty > 0 : false,
      },
      ownedIndex,
    );
  }

  const deckTally = deckCards.reduce(
    (tally, row) => {
      tally[deckRowTag(row.scryfallId)] += 1;
      return tally;
    },
    { owned: 0, shop: 0, unavailable: 0 },
  );

  async function saveDeck() {
    if (!commanderScryfallId || !selectedCommander) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/decks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          commanderScryfallId,
          commanderSlug: selectedCommander.slug,
          commanderName: selectedCommander.name,
          themeSlug: selectedTheme,
          targetBracket,
          cards: deckCards,
          anonymous: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setShareUrl(data.shareUrl ?? null);
      setExportText(data.exportText ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !selectedCommander || !commanderScryfallId) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          commanderSlug: selectedCommander.slug,
          commanderName: selectedCommander.name,
          commanderScryfallId,
          themeSlug: selectedTheme,
          targetBracket,
          cards: deckCards,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed");
      setChatMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.reply,
          adds: data.suggestedAdds,
        },
      ]);
    } catch (e) {
      setChatMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: e instanceof Error ? e.message : "Chat unavailable",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  const filteredRecs =
    recTab === "stock"
      ? recommendations.filter((r) => r.inStock)
      : recommendations;

  function selectCommanderFromInventory(card: InventoryGridCard) {
    if (!card.scryfallId || !card.slug) {
      setError("This commander is not linked to card data yet. Run inventory crosswalk in admin.");
      return;
    }
    setSelectedCommander({
      slug: card.slug!,
      name: card.name,
      scryfallId: card.scryfallId,
      colorIdentity: card.colorIdentity,
      themes: card.themes,
      imageUrl: card.imageUrl,
    });
    setStep("theme");
  }

  if (step !== "builder") {
    const wizardInner = (
      <>
        {error && (
          <p className="mb-4 text-center text-sm text-red-400">{error}</p>
        )}

        {step === "game" && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Choose a game</h2>
            <button
              type="button"
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-white"
              onClick={() => setStep("format")}
            >
              Magic: The Gathering
            </button>
            <button
              type="button"
              disabled
              className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-neutral-500"
            >
              Pokémon — Coming soon
            </button>
          </div>
        )}

        {step === "format" && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Choose a format</h2>
            <button
              type="button"
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-white"
              onClick={() => setStep("commander")}
            >
              Commander
            </button>
            <button type="button" className="text-sm text-neutral-400" onClick={() => setStep("game")}>
              Back
            </button>
          </div>
        )}

        {step === "commander" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Pick your commander
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                {inventoryFirst
                  ? "Choose from commanders in stock at this store."
                  : "Search EDHREC commanders."}
              </p>
            </div>

            {inventoryFirst ? (
              <>
                <InventoryFilterBar
                  filters={commanderFilters}
                  onChange={(next) =>
                    setCommanderFilters((f) => ({ ...f, ...next }))
                  }
                  showCommanderFilter={false}
                />
                <input
                  type="search"
                  placeholder="Search commanders in stock…"
                  value={commanderQuery}
                  onChange={(e) => setCommanderQuery(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-white"
                />
                {commandersLoading ? (
                  <p className="py-8 text-center text-sm text-neutral-500">
                    Loading commanders from inventory…
                  </p>
                ) : (
                  <InventoryCardGrid
                    cards={inventoryCommanders}
                    selectable
                    onSelect={selectCommanderFromInventory}
                    emptyMessage="No commanders in stock match these filters. Try another color or run the inventory crosswalk in admin."
                  />
                )}
              </>
            ) : (
              <>
                <input
                  type="search"
                  placeholder="Search commanders…"
                  value={commanderQuery}
                  onChange={(e) => setCommanderQuery(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white"
                />
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {commanderResults.map((c) => (
                    <li key={`${c.slug}-${c.name}`}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-neutral-700 px-3 py-2 text-left text-sm text-white hover:border-indigo-500"
                        onClick={() => {
                          setSelectedCommander(c);
                          setStep("theme");
                        }}
                      >
                        {c.name}
                        {c.colorIdentity?.length ? (
                          <span className="ml-2 text-xs text-neutral-400">
                            {c.colorIdentity.join("")}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!inventoryFirst ? (
              <button type="button" className="text-sm text-neutral-400" onClick={() => setStep("format")}>
                Back
              </button>
            ) : null}
          </div>
        )}

        {step === "theme" && selectedCommander && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              Theme for {selectedCommander.name}
            </h2>
            {selectedCommander.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedCommander.imageUrl}
                alt={selectedCommander.name}
                className="mx-auto h-48 w-auto rounded-lg shadow-lg"
              />
            ) : null}
            <button
              type="button"
              className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-left text-white hover:border-indigo-500"
              onClick={() => {
                setSelectedTheme(undefined);
                if (!deckCards.some((c) => c.board === "commander") && selectedCommander.scryfallId) {
                  setDeckCards([{
                    scryfallId: selectedCommander.scryfallId,
                    qty: 1,
                    board: "commander",
                  }]);
                }
                setStep("builder");
              }}
            >
              General / No theme
            </button>
            {(selectedCommander.themes ?? []).map((t) => (
              <button
                key={t.slug}
                type="button"
                className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-left text-white hover:border-indigo-500"
                onClick={() => {
                  setSelectedTheme(t.slug);
                  if (!deckCards.some((c) => c.board === "commander") && selectedCommander.scryfallId) {
                    setDeckCards([{
                      scryfallId: selectedCommander.scryfallId,
                      qty: 1,
                      board: "commander",
                    }]);
                  }
                  setStep("builder");
                }}
              >
                {t.label}
                <span className="ml-2 text-xs text-neutral-400">{t.count} decks</span>
              </button>
            ))}
            <label className="block text-sm text-neutral-400">
              Target bracket (optional)
              <select
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white"
                value={targetBracket ?? ""}
                onChange={(e) =>
                  setTargetBracket(
                    e.target.value ? parseInt(e.target.value, 10) : undefined,
                  )
                }
              >
                <option value="">Any</option>
                {[1, 2, 3, 4, 5].map((b) => (
                  <option key={b} value={b}>
                    Bracket {b}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="text-sm text-neutral-400" onClick={() => setStep("commander")}>
              Back
            </button>
          </div>
        )}
      </>
    );

    if (inventoryFirst) {
      return (
        <div className="min-h-screen bg-neutral-950 text-white">
          <header className="border-b border-neutral-800 px-4 py-4">
            <div className="mx-auto max-w-7xl">
              <StoreBrandMark
                storeName={storeName}
                logoUrl={logoUrl}
                variant="auth"
                subtitle="Deck Builder · Commander"
              />
              {onBackToInventory ? (
                <button
                  type="button"
                  onClick={onBackToInventory}
                  className="mt-3 text-sm text-neutral-400 hover:text-white"
                >
                  ← Back to inventory
                </button>
              ) : (
                <Link
                  href={`/s/${slug}/inventory`}
                  className="mt-3 block text-sm text-neutral-400 hover:text-white"
                >
                  ← Back to inventory
                </Link>
              )}
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-4">{wizardInner}</main>
        </div>
      );
    }

    return (
      <CustomerAuthShell>
        <StoreBrandMark
          storeName={storeName}
          logoUrl={logoUrl}
          variant="auth"
          subtitle="Deck Builder"
        />
        <Link
          href={`/s/${slug}`}
          className="mb-6 block text-center text-sm text-neutral-500 hover:text-neutral-300"
        >
          ← Back to store
        </Link>
        {wizardInner}
      </CustomerAuthShell>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-neutral-800 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div>
            <Link href={`/s/${slug}`} className="text-sm text-neutral-400 hover:text-white">
              {storeName}
            </Link>
            <h1 className="text-lg font-semibold">
              {selectedCommander?.name ?? "Deck Builder"}
              {selectedTheme ? ` · ${selectedTheme}` : ""}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={mainCount === 99 ? "text-emerald-400" : "text-amber-400"}>
              {mainCount}/99 main
            </span>
            {validation && !validation.valid && (
              <span className="text-red-400">{validation.issues[0]?.message}</span>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => void saveDeck()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Save & share
            </button>
          </div>
        </div>
        {shareUrl && (
          <p className="mx-auto mt-2 max-w-7xl text-sm text-emerald-400">
            Share link:{" "}
            <Link href={shareUrl} className="underline">
              {shareUrl}
            </Link>
          </p>
        )}
      </header>

      {error && (
        <p className="px-4 py-2 text-center text-sm text-red-400">{error}</p>
      )}

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-3">
        {/* Left: inventory */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <h2 className="mb-2 text-sm font-semibold uppercase text-neutral-400">
            In stock
          </h2>
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
              {inventory.map((card) => (
                <li
                  key={card.inventoryItemId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("scryfallId", card.scryfallId);
                  }}
                  className="flex cursor-grab items-center gap-2 rounded-lg border border-neutral-800 p-2 hover:border-emerald-600"
                >
                  {card.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.imageUrl} alt="" className="h-10 w-7 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{card.name}</p>
                    <p className="text-xs text-neutral-500">
                      {card.qty} @ ${(card.listPrice ?? card.tcgLowPrice ?? 0).toFixed(2)}
                      {card.synergy != null
                        ? ` · ${Math.round(card.synergy * 100)}% syn`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded bg-emerald-700 px-2 py-1 text-xs"
                    onClick={() => addCard(card.scryfallId)}
                  >
                    +
                  </button>
                </li>
              ))}
              {!inventory.length && (
                <p className="text-sm text-neutral-500">
                  No linked inventory yet. Ask the store to run crosswalk sync.
                </p>
              )}
            </ul>
          )}
        </section>

        {/* Center: deck list */}
        <section
          className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("scryfallId");
            if (id) addCard(id);
          }}
        >
          <h2 className="mb-2 text-sm font-semibold uppercase text-neutral-400">
            Your deck
          </h2>
          {customer && deckCards.length > 0 ? (
            <p className="mb-2 text-xs text-neutral-400">
              <span className="text-amber-300">{deckTally.owned} owned</span> ·{" "}
              <span className="text-emerald-400">{deckTally.shop} in store</span>
              {deckTally.unavailable > 0
                ? ` · ${deckTally.unavailable} to source elsewhere`
                : ""}
            </p>
          ) : null}
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto text-sm">
            {deckCards.map((row) => (
              <li
                key={`${row.board}-${row.scryfallId}`}
                className="flex items-center justify-between rounded border border-neutral-800 px-2 py-1"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">
                    {row.qty}x {cardName(row.scryfallId)}
                    {row.board === "commander" ? " (CMD)" : ""}
                  </span>
                  <OwnershipBadge tag={deckRowTag(row.scryfallId)} />
                </span>
                <div className="flex gap-1">
                  <button type="button" className="px-1 text-neutral-400" onClick={() => addCard(row.scryfallId, row.board)}>+</button>
                  <button type="button" className="px-1 text-neutral-400" onClick={() => removeCard(row.scryfallId, row.board)}>−</button>
                </div>
              </li>
            ))}
          </ul>
          {exportText && (
            <textarea
              readOnly
              className="mt-3 h-24 w-full rounded border border-neutral-700 bg-neutral-950 p-2 text-xs"
              value={exportText}
            />
          )}
        </section>

        {/* Right: recs + chat */}
        <section className="flex flex-col gap-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                className={`rounded px-2 py-1 text-xs ${recTab === "synergy" ? "bg-indigo-600" : "bg-neutral-800"}`}
                onClick={() => setRecTab("synergy")}
              >
                EDHREC
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 text-xs ${recTab === "stock" ? "bg-indigo-600" : "bg-neutral-800"}`}
                onClick={() => setRecTab("stock")}
              >
                In stock recs
              </button>
            </div>
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {filteredRecs.slice(0, 40).map((r) => (
                <li
                  key={r.scryfallId}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("scryfallId", r.scryfallId)}
                  className="flex items-center gap-2 rounded border border-neutral-800 p-2 text-sm"
                >
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="h-8 w-6 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{r.name}</p>
                    <p className="text-xs text-neutral-500">
                      {Math.round(r.synergy * 100)}% · {r.category}
                      {isCardOwned(
                        { scryfallId: r.scryfallId, name: r.name },
                        ownedIndex,
                      ) ? (
                        <span className="ml-1 text-amber-300">In your binder</span>
                      ) : r.inStock ? (
                        <span className="ml-1 text-emerald-400">In store ({r.stockQty})</span>
                      ) : null}
                    </p>
                  </div>
                  <button type="button" className="text-xs text-indigo-400" onClick={() => addCard(r.scryfallId)}>Add</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-1 flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
            <h2 className="mb-2 text-sm font-semibold uppercase text-neutral-400">
              AI deck helper
            </h2>
            <ul className="mb-2 max-h-40 flex-1 space-y-2 overflow-y-auto text-sm">
              {chatMessages.map((m, i) => (
                <li key={i} className={m.role === "user" ? "text-indigo-300" : "text-neutral-300"}>
                  {m.text}
                  {m.adds?.map((a) => (
                    <button
                      key={a.scryfallId}
                      type="button"
                      className="ml-2 block text-xs text-emerald-400"
                      onClick={() => addCard(a.scryfallId)}
                    >
                      + {a.name}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void sendChat()}
                placeholder="Ask for suggestions…"
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => void sendChat()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function OwnershipBadge({ tag }: { tag: OwnershipTag }) {
  if (tag === "owned") {
    return (
      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
        Owned
      </span>
    );
  }
  if (tag === "shop") {
    return (
      <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
        Shop
      </span>
    );
  }
  return null;
}
