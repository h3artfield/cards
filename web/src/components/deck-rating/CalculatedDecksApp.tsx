"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  name: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  speed: number | null;
  planRate: number | null;
  resilience: number | null;
  synergy: number | null;
  score: string | null;
  executionScore: string | null;
  pendingReason: string | null;
};

const BRACKETS = [1, 2, 3, 4, 5] as const;

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

export function CalculatedDecksApp() {
  const [decks, setDecks] = useState<Row[]>([]);
  const [bracket, setBracket] = useState<number | "all">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    async function pull() {
      try {
        const res = await fetch("/api/experimental/calculated-decks", { cache: "no-store" });
        const body = (await res.json()) as { decks?: Row[] };
        if (!stopped) {
          setDecks(body.decks ?? []);
          setError(null);
        }
      } catch {
        if (!stopped) setError("The calculated deck list could not be read.");
      }
    }
    void pull();
    const timer = setInterval(() => void pull(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const shown = useMemo(() => {
    const rows = bracket === "all" ? decks : decks.filter((row) => row.bracket === bracket);
    return [...rows].sort((a, b) => {
      const aScore = a.score == null ? -1 : Number(a.score);
      const bScore = b.score == null ? -1 : Number(b.score);
      if (bScore !== aScore) return bScore - aScore;
      return (b.planRate ?? -1) - (a.planRate ?? -1) || a.name.localeCompare(b.name);
    });
  }, [bracket, decks]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="text-xs uppercase tracking-widest text-amber-400">Calculated decks</div>
        <h1 className="text-2xl font-semibold">Deck scores</h1>
        <p className="max-w-3xl text-sm text-neutral-400">
          Decks that already have a four-digit score are listed here. Pick a bracket to see that group from the highest score to the lowest.{" "}
          <Link href="/experimental/grading" className="text-amber-400 hover:text-amber-300">
            How grading works
          </Link>
        </p>
      </header>
      <main className="px-6 py-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <BracketButton active={bracket === "all"} onClick={() => setBracket("all")} label="All brackets" />
          {BRACKETS.map((value) => (
            <BracketButton key={value} active={bracket === value} onClick={() => setBracket(value)} label={`Bracket ${value}`} />
          ))}
        </div>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        {shown.length === 0 ? (
          <p className="text-sm text-neutral-400">No calculated decks in this bracket yet.</p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-xs uppercase tracking-widest text-neutral-500">
                <th className="py-2 pr-4 font-medium">Score</th>
                <th className="py-2 pr-4 font-medium">Commander</th>
                <th className="py-2 pr-4 font-medium">Bracket</th>
                <th className="py-2 pr-4 font-medium">Speed</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Resilience</th>
                <th className="py-2 font-medium">Synergy</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="border-b border-neutral-900">
                  <td className="py-3 pr-4 font-semibold tracking-wide">
                    {row.score ?? "Pending"}
                  </td>
                  <td className="py-3 pr-4">{row.name}</td>
                  <td className="py-3 pr-4">{row.bracket}</td>
                  <td className="py-3 pr-4">{row.speed ?? "—"}</td>
                  <td className="py-3 pr-4">{pct(row.planRate)}</td>
                  <td className="py-3 pr-4">{pct(row.resilience)}</td>
                  <td className="py-3">{row.synergy == null ? "—" : row.synergy.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {shown.some((row) => row.pendingReason) && (
          <p className="mt-4 max-w-3xl text-xs text-neutral-500">{shown.find((row) => row.pendingReason)?.pendingReason}</p>
        )}
      </main>
    </div>
  );
}

function BracketButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        props.active
          ? "rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-black"
          : "rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700"
      }
    >
      {props.label}
    </button>
  );
}
