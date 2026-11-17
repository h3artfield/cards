"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShopAnswerPanel } from "@/components/admin/ShopAnswerPanel";
import type { ShopChat } from "@/components/admin/useShopChat";
import {
  CHAT_MESSAGE_MAX_CHARS,
  REPORT_PAGE_PATH,
  confirmLabel,
  showCustomerNames,
  type ShopReportView,
} from "@/lib/shop-assistant/chat-client";
import { useAdmin } from "@/context/AdminContext";
import { storeReport } from "@/lib/shop-assistant/report-storage";

const STARTERS = ["How are we doing today?", "What needs to move?", "Which shelves are slowest?"];
const PANEL_FRAME = "mt-2 rounded-lg border border-slate-200 px-3 py-3";
const MAX_PICKED = 5;

/** A customer as the admin's own list holds them. Names stay in the browser. */
export type DrawerCustomer = { id: string; firstName: string; lastName: string; email: string };

function fullName(customer: DrawerCustomer): string {
  return `${customer.firstName} ${customer.lastName}`.trim() || customer.email;
}

/**
 * The conversation with the store assistant, in a panel on the right. It only
 * shows what `useShopChat` holds; replies are rendered as text.
 */
export function ShopAgentDrawer({
  open,
  chat,
  customers,
  onClose,
}: {
  open: boolean;
  chat: ShopChat;
  /** The admin's customer list, for picking a customer and for showing names. */
  customers: DrawerCustomer[];
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [find, setFind] = useState("");
  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const nameOf = (id: string) => {
    const customer = byId.get(id);
    return customer ? fullName(customer) : undefined;
  };
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (q.length < 2) return [];
    return customers
      .filter((c) => !picked.includes(c.id) && `${fullName(c)} ${c.email}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [customers, find, picked]);

  /**
   * The words the person typed for a name that fit several customers, in the
   * message this reply answers. The model wrote "[a customer]" in its place.
   */
  function typedBefore(itemId: number): string | undefined {
    const at = chat.items.findIndex((item) => item.id === itemId);
    for (let i = at - 1; i >= 0; i -= 1) {
      const item = chat.items[i]!;
      if (item.kind === "user") return item.ambiguous.length === 1 ? item.ambiguous[0]!.text : undefined;
    }
    return undefined;
  }

  function pick(id: string) {
    setPicked((current) => (current.includes(id) || current.length >= MAX_PICKED ? current : [...current, id]));
    setPicking(false);
    setFind("");
    inputRef.current?.focus();
  }
  const { staff } = useAdmin();
  const [draft, setDraft] = useState("");
  const [reportTrouble, setReportTrouble] = useState<number | null>(null);

  function openReport(itemId: number, report: ShopReportView) {
    // The new tab starts with a copy of this tab's session storage, so the
    // report is there when the page loads. It must not be opened "noopener".
    if (storeReport(report, staff?.staffId ?? null) && window.open(REPORT_PAGE_PATH, "_blank")) {
      setReportTrouble(null);
    } else {
      setReportTrouble(itemId);
    }
  }
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, chat.items, chat.busy]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function submit(text: string) {
    if (!text.trim() || chat.busy) return;
    chat.send(text, picked);
    setDraft("");
    setPicked([]);
  }

  return (
    <aside
      role="dialog"
      aria-label="Store assistant"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white text-slate-900 shadow-lg"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Store assistant</h2>
        <div className="flex items-center gap-3 text-xs">
          {chat.items.length > 0 ? (
            <button
              type="button"
              className="font-medium text-indigo-600 hover:underline"
              onClick={() => {
                setPicked([]);
                chat.reset();
              }}
            >
              New conversation
            </button>
          ) : null}
          <button type="button" className="font-medium text-slate-600 hover:underline" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {chat.items.length === 0 ? (
          <div className="text-sm text-slate-600">
            <p>
              Ask about sales, stock, shelves, what to pay for a card, or what needs to move. Follow-up
              questions work.
            </p>
            <p className="mt-1 text-xs text-slate-500">It can look things up. It can&apos;t change anything.</p>
            <div className="mt-3 flex flex-col items-start gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-200/60"
                  onClick={() => submit(starter)}
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {chat.items.map((item) =>
          item.kind === "user" ? (
            <div key={item.id} className="mt-3 flex flex-col items-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-slate-200 px-3 py-2 text-sm text-slate-900">
                {item.text}
              </p>
              {item.picked.length > 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  About {item.picked.map((id) => nameOf(id) ?? "a customer").join(", ")}
                </p>
              ) : null}
              {item.ambiguous.map((name) => (
                <div key={name.text} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-600">
                    More than one customer is called {name.text}. Which one? Pick, then ask again.
                  </p>
                  <div className="mt-1 flex flex-col items-start gap-1">
                    {name.ids.map((id) => {
                      const customer = byId.get(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="rounded-lg border border-slate-200 px-3 py-1 text-left text-sm text-slate-800 hover:bg-slate-200/60"
                          onClick={() => pick(id)}
                        >
                          {customer ? `${fullName(customer)} · ${customer.email}` : "Customer"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : item.kind === "error" ? (
            <p key={item.id} className="mt-3 text-sm text-slate-600">
              {item.text}
            </p>
          ) : (
            <div key={item.id} className="mt-3">
              {/* Names are put back here, from the admin's own list. The model wrote only tokens. */}
              <p className="whitespace-pre-wrap text-sm text-slate-800">
                {showCustomerNames(item.text, chat.refs, nameOf, typedBefore(item.id))}
              </p>
              {item.caution ? (
                <p className="mt-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
                  {item.caution}
                </p>
              ) : null}
              {item.report ? (
                <div className={PANEL_FRAME}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Report</div>
                  <div className="text-sm font-semibold text-slate-900">{item.report.title}</div>
                  <p className="mt-1 text-sm text-slate-800">{item.report.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.report.sections.map((section) => section.heading).join(" · ")}
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    onClick={() => openReport(item.id, item.report!)}
                  >
                    Open report
                  </button>
                  {reportTrouble === item.id ? (
                    <p className="mt-2 text-xs text-slate-600">
                      Couldn&apos;t open the report. Allow pop-ups for this site and try again.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {item.panels.map((panel, index) => (
                <ShopAnswerPanel key={index} answer={panel.answer} onNavigate={onClose} className={PANEL_FRAME} />
              ))}
              {item.confirms.map((confirm) =>
                confirm.state === "shown" && confirm.answer ? (
                  <ShopAnswerPanel key={confirm.tool} answer={confirm.answer} onNavigate={onClose} className={PANEL_FRAME} />
                ) : (
                  <div key={confirm.tool} className={PANEL_FRAME}>
                    <div className="text-sm font-semibold text-slate-900">{confirmLabel(confirm.tool)}</div>
                    <p className="mt-1 text-xs text-slate-600">
                      {confirm.state === "failed"
                        ? (confirm.message ?? "Couldn't open that just now.")
                        : "This shows customer names and balances. The assistant does not see them."}
                    </p>
                    <button
                      type="button"
                      disabled={confirm.state === "loading"}
                      className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                      onClick={() => chat.confirm(item.id, confirm.tool)}
                    >
                      {confirm.state === "loading" ? "Opening…" : "Show the list"}
                    </button>
                  </div>
                ),
              )}
            </div>
          ),
        )}
        {chat.busy ? <p className="mt-3 text-xs text-slate-500">Looking that up…</p> : null}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-slate-200 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {picked.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-slate-800">
              {nameOf(id) ?? "Customer"}
              <button
                type="button"
                aria-label={`Remove ${nameOf(id) ?? "customer"}`}
                className="font-medium text-slate-500 hover:text-slate-900"
                onClick={() => setPicked((current) => current.filter((x) => x !== id))}
              >
                ×
              </button>
            </span>
          ))}
          {picked.length < MAX_PICKED ? (
            <button
              type="button"
              className="font-medium text-indigo-600 hover:underline"
              onClick={() => setPicking((value) => !value)}
            >
              {picking ? "Cancel" : "About a customer…"}
            </button>
          ) : null}
        </div>
        {picking ? (
          <div className="mb-2">
            <label htmlFor="shop-agent-customer" className="sr-only">
              Find a customer
            </label>
            <input
              id="shop-agent-customer"
              value={find}
              autoFocus
              placeholder="Type a name or email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-600 focus:outline-none"
              onChange={(event) => setFind(event.target.value)}
            />
            {matches.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-200/60"
                onClick={() => pick(customer.id)}
              >
                {fullName(customer)} <span className="text-xs text-slate-500">{customer.email}</span>
              </button>
            ))}
            {find.trim().length >= 2 && matches.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">No customer matches.</p>
            ) : null}
            <p className="mt-1 text-xs text-slate-500">The assistant is told a customer was picked, never the name.</p>
          </div>
        ) : null}
        <label htmlFor="shop-agent-input" className="sr-only">
          Message the store assistant
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="shop-agent-input"
            ref={inputRef}
            value={draft}
            rows={2}
            maxLength={CHAT_MESSAGE_MAX_CHARS}
            placeholder="Ask a question…"
            className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-600 focus:outline-none"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(draft);
              }
            }}
          />
          <button
            type="submit"
            disabled={chat.busy || !draft.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}
