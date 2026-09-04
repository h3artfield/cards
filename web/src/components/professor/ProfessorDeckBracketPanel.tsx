"use client";

import { useEffect, useState } from "react";

type Evidence = { oracleId: string; name: string };

type Signal = {
  id: string;
  label: string;
  count: number;
  bracketFloor: number | null;
  evidence: Evidence[];
  detail: string;
};

type BracketResult = {
  assignedBracket: number;
  assignedBracketName: string;
  determiningSignals: Signal[];
  signals: Signal[];
  nextBracketTriggers: string[];
  declaredOnlyBrackets: Array<{ bracket: number; reason: string }>;
  notes: string[];
};

type Fetched = {
  status: "loading" | "ready" | "error";
  result: BracketResult | null;
  unresolved: string[];
};

/** Evidence lists can run long; show enough to check the call without flooding. */
const EVIDENCE_PREVIEW = 8;

export function ProfessorDeckBracketPanel({
  storeSlug,
  commanderName,
  cards,
  requestedBracket,
}: {
  storeSlug: string;
  commanderName: string;
  cards: Array<{ name: string; copies?: number }>;
  requestedBracket?: number | null;
}) {
  const [fetched, setFetched] = useState<Fetched>({
    status: "loading",
    result: null,
    unresolved: [],
  });
  const [openSignal, setOpenSignal] = useState<string | null>(null);

  // Serialized once so an equal decklist re-render does not refetch.
  const payload = JSON.stringify({ commander: commanderName, cards });

  useEffect(() => {
    if (!commanderName || cards.length === 0) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(
          `/api/store/${encodeURIComponent(storeSlug)}/professor/bracket`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            signal: controller.signal,
          },
        );
        if (!res.ok) throw new Error(`bracket request failed: ${res.status}`);
        const data = (await res.json()) as {
          bracket: BracketResult | null;
          unresolved?: string[];
        };
        setFetched({ status: "ready", result: data.bracket, unresolved: data.unresolved ?? [] });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setFetched({ status: "error", result: null, unresolved: [] });
      }
    })();

    return () => controller.abort();
    // payload carries commanderName and cards; listing them again would refetch
    // on every render that rebuilds an equal array.
  }, [storeSlug, payload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fetched.status === "loading") {
    return <p className="professor-mtg-muted text-xs">Measuring the decklist…</p>;
  }
  if (fetched.status === "error" || !fetched.result) return null;

  const result = fetched.result;
  const missedRequest = requestedBracket != null && result.assignedBracket !== requestedBracket;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="professor-mtg-label">Measured bracket</p>
        {missedRequest ? (
          <p className="professor-mtg-label text-amber-300">you asked for {requestedBracket}</p>
        ) : null}
      </div>

      <p className="professor-mtg-body mt-1 text-lg font-bold">
        {result.assignedBracket} · {result.assignedBracketName}
      </p>

      <p className="professor-mtg-muted mt-2 text-xs leading-relaxed">
        {result.determiningSignals.length === 0
          ? "Nothing in this list pushes it above the baseline bracket."
          : `Set by ${result.determiningSignals.map((s) => s.label.toLowerCase()).join(" and ")}.`}
      </p>

      <ul className="mt-3 space-y-1">
        {result.signals.map((signal) => {
          const open = openSignal === signal.id;
          const determining = result.determiningSignals.some((s) => s.id === signal.id);
          const expandable = signal.evidence.length > 0;
          return (
            <li key={signal.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-3 text-left"
                onClick={() => setOpenSignal(open ? null : signal.id)}
                disabled={!expandable}
              >
                <span className="professor-mtg-body text-xs">
                  <span className={determining ? "font-bold text-amber-300" : undefined}>
                    {signal.label}
                  </span>
                  <span className="professor-mtg-muted ml-2">{signal.count}</span>
                </span>
                {expandable ? (
                  <span className="professor-mtg-muted shrink-0 text-[10px]">
                    {open ? "hide" : "show"}
                  </span>
                ) : null}
              </button>
              {open ? (
                <p className="professor-mtg-muted mt-1 text-[11px] leading-relaxed">
                  {signal.detail}
                  {signal.evidence.length > 0 ? (
                    <>
                      {" "}
                      {signal.evidence
                        .slice(0, EVIDENCE_PREVIEW)
                        .map((e) => e.name)
                        .join(", ")}
                      {signal.evidence.length > EVIDENCE_PREVIEW
                        ? ` and ${signal.evidence.length - EVIDENCE_PREVIEW} more`
                        : ""}
                    </>
                  ) : null}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {result.nextBracketTriggers.length > 0 ? (
        <div className="mt-3">
          <p className="professor-mtg-label">What would raise it</p>
          <ul className="professor-mtg-muted mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
            {result.nextBracketTriggers.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {fetched.unresolved.length > 0 ? (
        <p className="professor-mtg-muted mt-3 text-[11px]">
          {fetched.unresolved.length} card{fetched.unresolved.length === 1 ? "" : "s"} could not be
          read, so this may measure low.
        </p>
      ) : null}
    </div>
  );
}
