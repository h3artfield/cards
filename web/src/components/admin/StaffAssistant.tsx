"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/context/AdminContext";
import { adminFetch } from "@/lib/api-client";
import { ShopAgentDrawer } from "@/components/admin/ShopAgentDrawer";
import { ShopAnswerPanel } from "@/components/admin/ShopAnswerPanel";
import { useShopChat } from "@/components/admin/useShopChat";
import {
  isShopQuestion,
  readShopReply,
  type ShopAnswerView,
} from "@/lib/shop-assistant/detect";
import {
  isStaffQuestion,
  matchStaffDestinations,
} from "@/lib/staff-assistant/destinations";

type CustomerHit = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
};

type AnswerHit = {
  title: string | null;
  answer: string;
  covered: boolean;
};

type Row =
  | { key: string; kind: "page"; label: string; hint: string; href: string }
  | { key: string; kind: "customer"; label: string; hint: string; href: string }
  | { key: string; kind: "answer"; label: string; hint: string }
  | { key: string; kind: "confirm"; label: string; hint: string; tool: string }
  | { key: string; kind: "chat"; label: string; hint: string };

/** What the store's own numbers have to say about the typed question. */
type ShopState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "confirm"; tool: string }
  | { status: "answer"; tool: string; answer: ShopAnswerView; confirmed: boolean }
  | { status: "error"; message: string };

const SHOP_DEBOUNCE_MS = 600;

/** What a confirm row is called, by tool. */
const CONFIRM_LABELS: Record<string, string> = {
  store_credit: "Store credit",
};

function customerScore(customer: CustomerHit, query: string): number {
  const name = `${customer.firstName} ${customer.lastName}`.toLowerCase();
  const email = customer.email.toLowerCase();
  const phone = (customer.phone ?? "").replace(/\D/g, "");
  const digits = query.replace(/\D/g, "");
  if (name === query) return 100;
  if (name.startsWith(query)) return 90;
  const parts = query.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => name.includes(part))) return 85;
  if (name.includes(query)) return 70;
  if (email.startsWith(query)) return 60;
  if (digits.length >= 4 && phone.includes(digits)) return 50;
  return 0;
}

/**
 * The search box and the assistant. Everything it holds (the typed text, any
 * answer, the whole conversation) belongs to the person signed in, so it is
 * rebuilt from nothing whenever that person changes.
 */
export function StaffAssistant() {
  const { staff } = useAdmin();
  return <StaffAssistantFor key={staff?.staffId ?? "no-staff"} />;
}

function StaffAssistantFor() {
  const router = useRouter();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerHit[] | null>(null);
  const [active, setActive] = useState(0);
  const [answer, setAnswer] = useState<AnswerHit | null>(null);
  const [asking, setAsking] = useState(false);
  const [shop, setShop] = useState<ShopState>({ status: "idle" });
  /** The question the shop assistant was last asked, so reopening the box does not ask again. */
  const shopAskedFor = useRef<string | null>(null);
  const shopRequest = useRef<AbortController | null>(null);
  const chat = useShopChat();
  const [chatOpen, setChatOpen] = useState(false);

  /** Closes the box. Customer data goes back behind its confirmation. */
  const close = useCallback(() => {
    setOpen(false);
    setShop((current) =>
      current.status === "answer" && current.confirmed
        ? { status: "confirm", tool: current.tool }
        : current,
    );
  }, []);

  useEffect(() => {
    // The assistant needs the list too: it shows customers' names in place of
    // the tokens the model writes, and lets the person pick one.
    if ((!open && !chatOpen) || customers) return;
    let cancelled = false;
    adminFetch("/api/admin/customers")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load customers");
        if (!cancelled) setCustomers((data.customers ?? []) as CustomerHit[]);
      })
      .catch(() => {
        if (!cancelled) setCustomers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, chatOpen, customers]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [close]);

  const pages = useMemo(() => matchStaffDestinations(query), [query]);
  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !customers) return [];
    return customers
      .map((customer) => ({ customer, score: customerScore(customer, q) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((row) => row.customer);
  }, [customers, query]);

  const question = isStaffQuestion(query);
  const shopQuestion = isShopQuestion(query);
  const rows = useMemo<Row[]>(() => {
    const next: Row[] = [];
    if (shop.status === "confirm") {
      next.push({
        key: "shop-confirm",
        kind: "confirm",
        label: CONFIRM_LABELS[shop.tool] ?? "Customer details",
        hint: "This shows customer balances. Press Enter to show.",
        tool: shop.tool,
      });
    }
    if (shop.status === "answer" && shop.answer.href) {
      next.push({
        key: "shop-link",
        kind: "page",
        label: shop.answer.hrefLabel ?? "Open",
        hint: shop.answer.title,
        href: shop.answer.href,
      });
    }
    for (const page of pages) {
      next.push({
        key: `page:${page.id}`,
        kind: "page",
        label: page.label,
        hint: page.hint,
        href: page.href,
      });
    }
    for (const person of people) {
      const name = `${person.firstName} ${person.lastName}`.trim();
      next.push({
        key: `customer:${person.id}`,
        kind: "customer",
        label: name || person.email,
        hint: person.email,
        href: `/admin/reports?section=customers&customer=${encodeURIComponent(person.id)}`,
      });
    }
    // When the store's own data answered, "the handbook does not cover that" is noise.
    const storeAnswered = shop.status === "answer" || shop.status === "confirm";
    if (question && !(storeAnswered && !asking && answer && !answer.covered)) {
      next.push({
        key: "answer",
        kind: "answer",
        label: answer?.covered ? answer.title ?? "From the handbook" : "Ask the handbook",
        hint: asking
          ? "Looking that up…"
          : answer?.answer ?? "Press enter for the steps",
      });
    }
    // The conversation, offered last so it never displaces a jump or an answer.
    // Also for anything three words or longer ("put together a report on last
    // week"), which is a request even when it is not phrased as a question.
    const wordy = query.trim().split(/\s+/).length >= 3;
    if (chat.enabled && (!query.trim() || question || shopQuestion || wordy)) {
      next.push({
        key: "chat",
        kind: "chat",
        label: "Ask the assistant",
        hint: query.trim()
          ? "Talk it through and ask follow-up questions"
          : "Sales, stock, shelves, buy prices. Follow-up questions work.",
      });
    }
    return next;
  }, [pages, people, question, shopQuestion, answer, asking, shop, chat.enabled, query]);

  useEffect(() => {
    setActive(0);
    setAnswer(null);
    // A new question starts clean: no earlier answer carries over.
    shopRequest.current?.abort();
    shopAskedFor.current = null;
    setShop({ status: "idle" });
  }, [query]);

  const askShop = useCallback((text: string, confirmTool?: string) => {
    shopRequest.current?.abort();
    const controller = new AbortController();
    shopRequest.current = controller;
    setShop({ status: "asking" });
    adminFetch("/api/admin/shop-assistant", {
      method: "POST",
      body: JSON.stringify(
        confirmTool ? { query: text, confirm: true, tool: confirmTool } : { query: text },
      ),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data: unknown = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        const reply = readShopReply(res.ok, res.status, data);
        if (reply.kind === "answer") {
          setShop({
            status: "answer",
            tool: reply.tool,
            answer: reply.answer,
            confirmed: Boolean(confirmTool),
          });
        } else if (reply.kind === "confirm") {
          setShop({ status: "confirm", tool: reply.tool });
        } else if (reply.kind === "error") {
          setShop({ status: "error", message: reply.message });
        } else {
          setShop({ status: "idle" });
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setShop({ status: "idle" });
      });
  }, []);

  useEffect(() => {
    if (!open || !shopQuestion) return;
    const text = query.trim();
    if (shopAskedFor.current === text) return;
    const timer = window.setTimeout(() => {
      shopAskedFor.current = text;
      askShop(text);
    }, SHOP_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, shopQuestion, query, askShop]);

  useEffect(() => () => shopRequest.current?.abort(), []);

  useEffect(() => {
    if (!open || !question) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      setAsking(true);
      adminFetch("/api/admin/assistant", {
        method: "POST",
        body: JSON.stringify({ query: query.trim() }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json();
          if (!active) return;
          if (!res.ok) throw new Error(data.error ?? "Could not answer");
          setAnswer({
            title: data.title ?? null,
            answer: data.answer ?? "This handbook does not cover that.",
            covered: Boolean(data.covered),
          });
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setAnswer({
            title: null,
            answer: "This handbook does not cover that.",
            covered: false,
          });
        })
        .finally(() => {
          if (active) setAsking(false);
        });
    }, 450);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, question, query]);

  function go(row: Row) {
    if (row.kind === "answer") return;
    if (row.kind === "confirm") {
      askShop(query.trim(), row.tool);
      return;
    }
    if (row.kind === "chat") {
      const text = query.trim();
      close();
      setQuery("");
      setChatOpen(true);
      if (text) chat.send(text);
      return;
    }
    setOpen(false);
    setQuery("");
    router.push(row.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Escape") {
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (row) go(row);
    }
  }

  return (
    <div ref={boxRef} className="relative mx-auto max-w-7xl px-4 pb-3">
      <label htmlFor={listId} className="sr-only">
        Search customers, pages, or ask a question about the store
      </label>
      <input
        id={listId}
        value={query}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        placeholder="Search a customer, a page, or ask a question…"
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--ink-750)] px-3 py-2 text-sm text-[var(--text-hi)] placeholder:text-[var(--text-lo)] focus:border-[var(--accent)] focus:outline-none"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (rows.length > 0 || shop.status !== "idle") ? (
        <div className="absolute z-30 mt-1 max-h-[70vh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg">
          {shop.status === "answer" ? (
            <ShopAnswerPanel
              answer={shop.answer}
              onNavigate={() => {
                close();
                setQuery("");
              }}
            />
          ) : shop.status === "asking" ? (
            <p className="border-b border-slate-200 px-3 py-2 text-xs text-slate-600" aria-live="polite">
              Checking your store…
            </p>
          ) : shop.status === "error" ? (
            <p className="border-b border-slate-200 px-3 py-2 text-xs text-slate-600" aria-live="polite">
              {shop.message}
            </p>
          ) : null}
          {rows.length > 0 ? (
            <ul id={`${listId}-list`} role="listbox" className="py-1">
              {rows.map((row, index) => (
                <li key={row.key} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    className={`flex w-full flex-col items-start px-3 py-2 text-left ${
                      index === active ? "bg-slate-200" : "hover:bg-slate-200/60"
                    }`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(row)}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      {row.kind === "customer"
                        ? "Customer"
                        : row.kind === "page"
                          ? "Go to"
                          : row.kind === "confirm"
                            ? "Your store"
                            : row.kind === "chat"
                              ? "Assistant"
                              : "Handbook"}
                    </span>
                    <span className="text-sm font-medium">{row.label}</span>
                    <span className="whitespace-pre-wrap text-xs text-slate-600">
                      {row.hint}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {chat.enabled ? (
        <ShopAgentDrawer
          open={chatOpen}
          chat={chat}
          customers={customers ?? []}
          onClose={() => {
            setChatOpen(false);
            chat.relock();
          }}
        />
      ) : null}
    </div>
  );
}
