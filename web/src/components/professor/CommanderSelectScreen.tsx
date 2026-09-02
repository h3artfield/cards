"use client";

import { useEffect, useState } from "react";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import {
  DEFAULT_PROFESSOR_BREW_BRACKET,
  PROFESSOR_BREW_BRACKET_OPTIONS,
} from "@/lib/deck-synthesis/professor-brew-bracket-v4-v1";

type CommanderResult = {
  slug: string;
  name: string;
  colorIdentity?: string[];
  rank?: number;
};

export function CommanderSelectScreen({
  slug,
  mode,
  onModeChange,
  loading,
  error,
  onSelect,
  onStartOffline,
  onStartLive,
}: {
  slug: string;
  mode: "offline_replay" | "live";
  onModeChange: (m: "offline_replay" | "live") => void;
  loading: boolean;
  error: string | null;
  onSelect: (c: { name: string; slug: string; bracket: CommanderBracket }) => void;
  onStartOffline: () => void;
  onStartLive: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommanderResult[]>([]);
  const [bracket, setBracket] = useState<CommanderBracket>(DEFAULT_PROFESSOR_BREW_BRACKET);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/store/${slug}/deck-builder/commanders/search?${params.toString()}`);
        const data = await res.json();
        setResults((data.results ?? []).slice(0, query.trim() ? 24 : 48));
      } catch {
        setResults([]);
      }
    }, query.trim() ? 200 : 0);
    return () => clearTimeout(t);
  }, [query, slug]);

  return (
    <div className="min-h-screen bg-[#07070a] text-neutral-200">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-center text-[10px] uppercase tracking-[0.25em] text-amber-700/70">Professor</p>
        <h1 className="mt-2 text-center text-3xl font-medium text-white">Choose Your Commander</h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          Paper-legal commanders only — professors brew from oracle facts, RAG, and model knowledge.
        </p>

        <label className="mx-auto mt-6 block max-w-md text-left">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">Target bracket</span>
          <select
            value={bracket}
            onChange={(e) => setBracket(parseInt(e.target.value, 10) as CommanderBracket)}
            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-white"
          >
            {PROFESSOR_BREW_BRACKET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              onModeChange("offline_replay");
              onStartOffline();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs ${mode === "offline_replay" ? "bg-emerald-900/50 text-emerald-300 ring-1 ring-emerald-700" : "border border-neutral-800 text-neutral-500"}`}
          >
            Offline replay (0 API calls)
          </button>
          <button
            type="button"
            onClick={() => {
              onModeChange("live");
              onStartLive();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs ${mode === "live" ? "bg-amber-900/40 text-amber-200 ring-1 ring-amber-800" : "border border-neutral-800 text-neutral-500"}`}
          >
            Live mode (budgeted)
          </button>
        </div>

        <input
          type="search"
          placeholder="Search commanders…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mt-8 w-full rounded-xl border border-neutral-800 bg-neutral-950/80 px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-amber-800 focus:outline-none"
        />

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {results.map((c) => (
              <button
                key={`${c.slug}-${c.name}`}
                type="button"
                disabled={loading}
                onClick={() => onSelect({ name: c.name, slug: c.slug, bracket })}
                className="group rounded-xl border border-neutral-700 bg-neutral-900/40 px-4 py-4 text-left transition hover:border-amber-700/60 hover:bg-neutral-900/70"
              >
                <p className="font-medium text-white group-hover:text-amber-100">{c.name}</p>
              </button>
            ))}
        </div>

        {error ? <p className="mt-4 text-center text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
