"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/api-client";
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
  | { key: string; kind: "answer"; label: string; hint: string };

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

export function StaffAssistant() {
  const router = useRouter();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerHit[] | null>(null);
  const [active, setActive] = useState(0);
  const [answer, setAnswer] = useState<AnswerHit | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!open || customers) return;
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
  }, [open, customers]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

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
  const rows = useMemo<Row[]>(() => {
    const next: Row[] = pages.map((page) => ({
      key: `page:${page.id}`,
      kind: "page",
      label: page.label,
      hint: page.hint,
      href: page.href,
    }));
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
    if (question) {
      next.push({
        key: "answer",
        kind: "answer",
        label: answer?.covered ? answer.title ?? "From the handbook" : "Ask the handbook",
        hint: asking
          ? "Looking that up…"
          : answer?.answer ?? "Press enter for the steps",
      });
    }
    return next;
  }, [pages, people, question, answer, asking]);

  useEffect(() => {
    setActive(0);
    setAnswer(null);
  }, [query]);

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
      setOpen(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (row) go(row);
    }
  }

  return (
    <div ref={boxRef} className="relative mx-auto max-w-7xl px-4 pb-3">
      <label htmlFor={listId} className="sr-only">
        Search customers, pages, or ask how to do something
      </label>
      <input
        id={listId}
        value={query}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        placeholder="Search a customer, a page, or ask how to…"
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--ink-750)] px-3 py-2 text-sm text-[var(--text-hi)] placeholder:text-[var(--text-lo)] focus:border-[var(--accent)] focus:outline-none"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && rows.length > 0 ? (
        <ul
          id={`${listId}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-96 w-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-slate-900 shadow-lg"
        >
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
  );
}
