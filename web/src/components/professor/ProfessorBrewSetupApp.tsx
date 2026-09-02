"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { howCosWorksPath } from "@/lib/commander-optimization-score/v1/public-path";
import {
  DEFAULT_PROFESSOR_PLAYSTYLE_V111,
  PROFESSOR_PLAYSTYLE_CHOICES_V111,
  resolveProfessorPlaystyleV111,
} from "@/lib/deck-synthesis/professor-playstyle-choices-v1-1-1";
import {
  formatDeckThemesForPipeline,
  MAX_PROFESSOR_DECK_THEME_SELECTIONS_V111,
  PROFESSOR_DECK_THEME_CHOICES_V111,
  PROFESSOR_DECK_THEME_FEATURED_V111,
  PROFESSOR_DECK_THEME_MORE_V111,
} from "@/lib/deck-synthesis/professor-deck-theme-choices-v1-1-1";
import {
  PROFESSOR_WIN_PREFERENCE_CHOICES_V111,
  resolveProfessorWinPreferenceV111,
} from "@/lib/deck-synthesis/professor-win-preference-choices-v1-1-1";
import {
  PROFESSOR_COMMANDER_STYLE_CHOICES_V111,
  resolveProfessorCommanderStyleV111,
} from "@/lib/deck-synthesis/professor-commander-style-choices-v1-1-1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import {
  DEFAULT_PROFESSOR_BREW_BRACKET,
  PROFESSOR_BREW_BRACKET_OPTIONS,
} from "@/lib/deck-synthesis/professor-brew-bracket-v4-v1";
import { isProfessorSolDirectedGuiEnabledClient } from "@/lib/deck-synthesis/professor-sol-directed-gui-flag-v1-1-1";
import { saveSolDirectedPendingBuild } from "@/lib/deck-synthesis/professor-sol-directed-pending-build-v1-1-1";
import {
  isUserSemanticPreferencesNoneV111,
  PROFESSOR_SEMANTIC_AVOID_CHOICES_V111,
  PROFESSOR_SEMANTIC_PREFER_CHOICES_V111,
  type UserSemanticPreferencesV111,
} from "@/lib/deck-synthesis/professor-user-semantic-preferences-v1-1-1";
import {
  clearProfessorSetupPrefill,
  readProfessorSetupPrefill,
} from "@/lib/store-inventory/gathering-deck-build";
import {
  parseProfessorImportedDecklistV111,
  type ProfessorImportedDeckPreviewV111,
} from "@/lib/deck-synthesis/professor-imported-decklist-v1-1-1";
import { ProfessorMtgPageShell } from "./ProfessorMtgPageShell";

type CommanderResult = { slug: string; name: string };

function ThemeChip({
  label,
  selected,
  inactive,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  inactive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        selected
          ? "border-[var(--mtg-gold)] bg-[var(--mtg-gold)]/15 text-[var(--mtg-parchment)]"
          : inactive
            ? "border-[var(--mtg-stone-border)]/70 text-[var(--mtg-parchment-muted)]/70 hover:border-[var(--mtg-gold)]/60 hover:text-[var(--mtg-parchment-muted)]"
            : "border-[var(--mtg-stone-border)] text-[var(--mtg-parchment-muted)] hover:border-[var(--mtg-gold)]/60"
      } ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
    >
      {selected ? "✓ " : ""}
      {label}
    </button>
  );
}

export function ProfessorBrewSetupApp({ slug }: { slug: string }) {
  const router = useRouter();
  const apiBase = `/api/store/${slug}/professor/brew`;
  const commanderSearchApi = `/api/store/${slug}/deck-builder/commanders/search`;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommanderResult[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [commander, setCommander] = useState<CommanderResult | null>(null);
  const [bracket, setBracket] = useState<CommanderBracket>(DEFAULT_PROFESSOR_BREW_BRACKET);
  const [playstyleId, setPlaystyleId] = useState("");
  const [professorChoosesThemes, setProfessorChoosesThemes] = useState(true);
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);
  const [showMoreThemes, setShowMoreThemes] = useState(false);
  const [commanderStyleId, setCommanderStyleId] = useState("");
  const [winPreferenceId, setWinPreferenceId] = useState("");
  const [deckPreferencesText, setDeckPreferencesText] = useState("");
  const [showAdvancedCardPreferences, setShowAdvancedCardPreferences] = useState(false);
  const [preferSemanticIds, setPreferSemanticIds] = useState<string[]>([]);
  const [avoidSemanticIds, setAvoidSemanticIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const solDirectedEnabled = isProfessorSolDirectedGuiEnabledClient();
  const [error, setError] = useState<string | null>(null);
  const [pilePrefillNote, setPilePrefillNote] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<"build" | "optimize">("build");
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ProfessorImportedDeckPreviewV111 | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const themeLimitReached = selectedThemeIds.length >= MAX_PROFESSOR_DECK_THEME_SELECTIONS_V111;

  useEffect(() => {
    const prefill = readProfessorSetupPrefill(slug);
    if (!prefill) return;

    if (prefill.commanderName) {
      setCommander({ slug: prefill.commanderName.toLowerCase().replace(/\s+/g, "-"), name: prefill.commanderName });
      setQuery(prefill.commanderName);
    }
    if (prefill.deckPreferences) {
      setDeckPreferencesText(prefill.deckPreferences);
    }
    setPilePrefillNote(
      prefill.cardNames.length > 0
        ? `Loaded ${prefill.cardNames.length} card${prefill.cardNames.length === 1 ? "" : "s"} from your inventory pile.`
        : null,
    );
    clearProfessorSetupPrefill(slug);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBrowseLoading(true);
      try {
        const res = await fetch(commanderSearchApi);
        const data = await res.json();
        if (!cancelled && res.ok) setResults(data.results ?? []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setBrowseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commanderSearchApi]);

  useEffect(() => {
    if (!listOpen && !query.trim()) return;
    if (!query.trim() && results.length > 0) return;

    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`${commanderSearchApi}?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Commander search failed");
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, query.trim() ? 200 : 0);

    return () => clearTimeout(t);
  }, [commanderSearchApi, listOpen, query, results.length]);

  const commanderListLoading = query.trim() ? searchLoading : browseLoading && results.length === 0;

  function toggleTheme(themeId: string) {
    setProfessorChoosesThemes(false);
    setSelectedThemeIds((current) => {
      if (current.includes(themeId)) {
        return current.filter((id) => id !== themeId);
      }
      if (current.length >= MAX_PROFESSOR_DECK_THEME_SELECTIONS_V111) {
        return current;
      }
      return [...current, themeId];
    });
  }

  useEffect(() => {
    if (selectedThemeIds.length === 0) {
      setProfessorChoosesThemes(true);
    }
  }, [selectedThemeIds]);

  function enableProfessorThemes() {
    setProfessorChoosesThemes(true);
    setSelectedThemeIds([]);
  }

  async function readImportedList() {
    const decklist = importText.trim();
    if (!decklist) {
      setImportError("Paste a deck list first.");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    try {
      const parsed = parseProfessorImportedDecklistV111(decklist);
      if (parsed.rawLineCount === 0) {
        throw new Error("No cards found. Use lines like “1 Sol Ring” or a Moxfield/Arena export.");
      }
      const res = await fetch(`/api/store/${slug}/professor/import-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decklist,
          selectedCommanderName: commander?.name,
        }),
      });
      const data = (await res.json()) as { preview?: ProfessorImportedDeckPreviewV111; error?: string };
      if (!res.ok || !data.preview) throw new Error(data.error ?? "Could not read this list");
      setImportPreview(data.preview);
      if (data.preview.commanderName) {
        setCommander({
          slug: data.preview.commanderName.toLowerCase().replace(/\s+/g, "-"),
          name: data.preview.commanderName,
        });
        setQuery(data.preview.commanderName);
      }
    } catch (e) {
      setImportPreview(null);
      setImportError(e instanceof Error ? e.message : "Could not read this list");
    } finally {
      setImportLoading(false);
    }
  }

  async function buildDeck() {
    if (!commander) return;
    if (setupMode === "optimize" && !importPreview?.canOptimize) {
      setError("Read a valid imported list before optimizing.");
      return;
    }

    const playstyle = resolveProfessorPlaystyleV111(playstyleId);
    const composedDeckTheme = professorChoosesThemes
      ? undefined
      : formatDeckThemesForPipeline(selectedThemeIds);
    const winPreference = resolveProfessorWinPreferenceV111(winPreferenceId);
    const commanderStyle = resolveProfessorCommanderStyleV111(commanderStyleId);

    const composedPlaystyle = playstyle.userIntentPatch;
    const composedWinPreference = winPreference?.userIntentPatch;
    const composedCommanderStyle =
      commanderStyle?.userIntentPatch ?? "Let Professor decide commander dependence based on this commander's mechanics and bracket";
    const userSemanticPreferences: UserSemanticPreferencesV111 = {
      prefer: preferSemanticIds,
      avoid: avoidSemanticIds,
    };

    setError(null);
    try {
      if (solDirectedEnabled) {
        saveSolDirectedPendingBuild(slug, {
          commanderName: commander.name,
          bracket,
          playstyle: composedPlaystyle,
          deckTheme: composedDeckTheme,
          winPreference: composedWinPreference,
          commanderStyle: composedCommanderStyle,
          deckPreferences: deckPreferencesText.trim() || undefined,
          userSemanticPreferences: isUserSemanticPreferencesNoneV111(userSemanticPreferences)
            ? undefined
            : userSemanticPreferences,
          mode: setupMode,
          importedCards:
            setupMode === "optimize" && importPreview
              ? importPreview.cards.map((card) => ({
                  name: card.resolved ? card.name : card.sourceName,
                  copies: card.copies,
                }))
              : undefined,
        });
        router.push(`/s/${slug}/inventory/professor/build?start=1`);
        return;
      }

      setLoading(true);
      const body: Record<string, unknown> = {
        configureAndStart: {
          mode: "live",
          commanderName: commander.name,
          commanderSlug: commander.slug,
          bracket,
        },
      };
      if (composedDeckTheme) {
        const start = body.configureAndStart as Record<string, string>;
        start.archetypeChoiceId = selectedThemeIds.join(",");
        start.archetypeIntent = composedDeckTheme;
      }
      if (commanderStyle?.legacyRelationshipId) {
        const start = body.configureAndStart as Record<string, string>;
        start.relationshipChoiceId = commanderStyle.legacyRelationshipId;
        start.relationshipLens = commanderStyle.legacyLens ?? "";
        start.relationshipIntent = commanderStyle.userIntentPatch;
      }
      if (winPreference?.legacyChoiceId) {
        const start = body.configureAndStart as Record<string, string>;
        start.winPreferenceChoiceId = winPreference.legacyChoiceId;
        start.winPreferenceIntent = winPreference.userIntentPatch;
      } else if (winPreference) {
        const start = body.configureAndStart as Record<string, string>;
        start.winPreferenceIntent = winPreference.userIntentPatch;
      }

      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start brew");
      router.push(`/s/${slug}/inventory/professor/build/legacy?sessionId=${data.session.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const commanderLocked = commander !== null && query.trim() === commander.name;
  const showResults = !commanderLocked && (listOpen || Boolean(query.trim()));

  function renderThemeGrid(themes: typeof PROFESSOR_DECK_THEME_CHOICES_V111) {
    return (
      <div className="flex flex-wrap gap-2">
        {themes.map((theme) => {
          const selected = selectedThemeIds.includes(theme.id);
          const disabled = themeLimitReached && !selected;
          return (
            <ThemeChip
              key={theme.id}
              label={theme.label}
              selected={selected}
              inactive={professorChoosesThemes && !selected}
              disabled={disabled}
              onClick={() => toggleTheme(theme.id)}
            />
          );
        })}
      </div>
    );
  }

  return (
    <ProfessorMtgPageShell>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-16 pt-10">
        <div className="text-center">
          <h1 className="professor-mtg-title text-3xl leading-none sm:text-4xl">
            {setupMode === "optimize" ? "Optimize a Deck" : "Build a Deck"}
          </h1>
          <p className="professor-mtg-muted mt-3 text-sm italic">
            {setupMode === "optimize"
              ? "Paste a list you already have · bracket · playstyle"
              : "Paper-legal commanders · bracket · your playstyle"}
          </p>
          {pilePrefillNote ? (
            <p className="professor-mtg-body mt-2 text-sm text-[var(--mtg-gold)]">{pilePrefillNote}</p>
          ) : null}
        </div>

        <div className="professor-mtg-chamber mt-10">
          <div className="professor-mtg-chamber__inner relative">
            <div className="mb-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSetupMode("build");
                  setImportError(null);
                }}
                className={`rounded-lg border px-3 py-2.5 text-sm transition ${
                  setupMode === "build"
                    ? "border-[var(--mtg-gold)] bg-[var(--mtg-gold)]/15 text-[var(--mtg-parchment)]"
                    : "border-[var(--mtg-stone-border)] text-[var(--mtg-parchment-muted)] hover:border-[var(--mtg-gold)]/60"
                }`}
              >
                Build new
              </button>
              <button
                type="button"
                onClick={() => setSetupMode("optimize")}
                className={`rounded-lg border px-3 py-2.5 text-sm transition ${
                  setupMode === "optimize"
                    ? "border-[var(--mtg-gold)] bg-[var(--mtg-gold)]/15 text-[var(--mtg-parchment)]"
                    : "border-[var(--mtg-stone-border)] text-[var(--mtg-parchment-muted)] hover:border-[var(--mtg-gold)]/60"
                }`}
              >
                Import list
              </button>
            </div>

            {setupMode === "optimize" ? (
              <div className="mb-6">
                <label className="professor-mtg-label" htmlFor="imported-decklist">
                  Existing deck list
                </label>
                <textarea
                  id="imported-decklist"
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportPreview(null);
                  }}
                  rows={8}
                  placeholder={"Commander\n1 The Cabbage Merchant\n\nDeck\n1 Sol Ring\n1 Beast Within\n…"}
                  className="professor-mtg-input mt-2 w-full px-3 py-3 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => void readImportedList()}
                  disabled={importLoading || !importText.trim()}
                  className="professor-mtg-btn mt-3 px-4 py-2 text-[11px]"
                >
                  {importLoading ? "Reading list…" : "Read list"}
                </button>
                {importError ? (
                  <p className="mt-2 text-xs text-red-300">{importError}</p>
                ) : null}
                {importPreview ? (
                  <div className="professor-mtg-muted mt-3 space-y-1 text-xs leading-relaxed">
                    <p>
                      Recognized {importPreview.recognized}/{importPreview.total} cards
                      {importPreview.commanderName ? ` · commander ${importPreview.commanderName}` : ""}
                      {importPreview.libraryCount > 0
                        ? ` · ${importPreview.nonlandCount} nonlands / ${importPreview.landCount} lands`
                        : ""}
                    </p>
                    {importPreview.unresolvedNames.length > 0 ? (
                      <p>Unrecognized: {importPreview.unresolvedNames.slice(0, 8).join(", ")}</p>
                    ) : null}
                    {importPreview.offColorNames.length > 0 ? (
                      <p>Off-color: {importPreview.offColorNames.slice(0, 8).join(", ")}</p>
                    ) : null}
                    {importPreview.blockers.map((blocker) => (
                      <p key={blocker} className="text-amber-200/80">
                        {blocker}
                      </p>
                    ))}
                    {importPreview.canOptimize ? (
                      <p className="text-[var(--mtg-emerald)]">List is ready to optimize.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <label className="professor-mtg-label" htmlFor="commander-search">
              Commander
            </label>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[var(--mtg-gold)]">
                ⌕
              </span>
              <input
                id="commander-search"
                type="search"
                placeholder="Search commanders by name…"
                value={query}
                autoComplete="off"
                onFocus={() => setListOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setListOpen(false), 150);
                }}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setListOpen(true);
                  if (commander && e.target.value !== commander.name) {
                    setCommander(null);
                  }
                }}
                className="professor-mtg-input w-full py-4 pl-11 pr-4 text-base"
              />
            </div>

            {showResults ? (
              <div className="mt-3">
                {commanderListLoading ? (
                  <p className="professor-mtg-muted px-1 py-2 text-xs italic">Loading commanders…</p>
                ) : null}
                {!commanderListLoading && results.length === 0 ? (
                  <p className="professor-mtg-muted px-1 py-2 text-xs">No paper-eligible commanders found</p>
                ) : null}
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {results.map((c) => {
                    const selected = commander?.name === c.name;
                    return (
                      <li key={`${c.slug}-${c.name}`}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setCommander(c);
                            setQuery(c.name);
                            setError(null);
                            setListOpen(false);
                          }}
                          className={`professor-mtg-option w-full px-4 py-2.5 ${selected ? "professor-mtg-option--selected" : ""}`}
                        >
                          <span className="block text-left font-medium">{c.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="professor-mtg-muted mt-3 text-xs">
                Click the search bar to browse paper-eligible commanders A–Z
              </p>
            )}

            {commander ? (
              <div className="mt-6 space-y-4 border-t border-[var(--mtg-stone-border)] pt-6">
                <label className="block">
                  <span className="professor-mtg-label">Target bracket</span>
                  <select
                    value={bracket}
                    onChange={(e) => setBracket(parseInt(e.target.value, 10) as CommanderBracket)}
                    className="professor-mtg-input mt-2 w-full px-3 py-3 text-sm"
                  >
                    {PROFESSOR_BREW_BRACKET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="professor-mtg-muted mt-2 text-[11px] leading-relaxed">
                    {PROFESSOR_BREW_BRACKET_OPTIONS.find((option) => option.value === bracket)?.philosophy}
                  </p>
                </label>

                <p className="professor-mtg-label">Tell the Professor how you want to play</p>

                <label className="block">
                  <span className="professor-mtg-label">Playstyle</span>
                  <select
                    value={playstyleId}
                    onChange={(e) => setPlaystyleId(e.target.value)}
                    className="professor-mtg-input mt-2 w-full px-3 py-3 text-sm"
                  >
                    <option value="">{DEFAULT_PROFESSOR_PLAYSTYLE_V111.label} (default)</option>
                    {PROFESSOR_PLAYSTYLE_CHOICES_V111.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <p className="professor-mtg-muted mt-2 text-[11px] leading-relaxed">
                    How should the game feel while you&apos;re playing it?
                  </p>
                </label>

                <div className="block">
                  <span className="professor-mtg-label">Strategy / theme</span>
                  <p className="professor-mtg-muted mt-1 text-[11px] leading-relaxed">
                    Optional — pick up to {MAX_PROFESSOR_DECK_THEME_SELECTIONS_V111}, or let Professor decide.
                    Professor will combine compatible themes into one coherent strategy.
                  </p>
                  <div className="mt-3 space-y-3">
                    <button
                      type="button"
                      onClick={enableProfessorThemes}
                      className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition ${
                        professorChoosesThemes
                          ? "border-[var(--mtg-gold)] bg-[var(--mtg-gold)]/15 text-[var(--mtg-parchment)]"
                          : "border-[var(--mtg-stone-border)] text-[var(--mtg-parchment-muted)] hover:border-[var(--mtg-gold)]/60"
                      }`}
                    >
                      ✨ Let Professor choose
                    </button>
                    {renderThemeGrid(PROFESSOR_DECK_THEME_FEATURED_V111)}
                    {showMoreThemes ? renderThemeGrid(PROFESSOR_DECK_THEME_MORE_V111) : null}
                    <button
                      type="button"
                      onClick={() => setShowMoreThemes((v) => !v)}
                      className="professor-mtg-link text-xs"
                    >
                      {showMoreThemes ? "Show fewer themes" : "More themes…"}
                    </button>
                    {themeLimitReached ? (
                      <p className="text-[11px] text-amber-200/80">
                        Too many themes can dilute the deck&apos;s strategy — {MAX_PROFESSOR_DECK_THEME_SELECTIONS_V111}{" "}
                        selected.
                      </p>
                    ) : null}
                  </div>
                </div>

                <label className="block">
                  <span className="professor-mtg-label">Win preference</span>
                  <select
                    value={winPreferenceId}
                    onChange={(e) => setWinPreferenceId(e.target.value)}
                    className="professor-mtg-input mt-2 w-full px-3 py-3 text-sm"
                  >
                    <option value="">Let Professor choose (default)</option>
                    {PROFESSOR_WIN_PREFERENCE_CHOICES_V111.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="professor-mtg-label">Commander style</span>
                  <select
                    value={commanderStyleId}
                    onChange={(e) => setCommanderStyleId(e.target.value)}
                    className="professor-mtg-input mt-2 w-full px-3 py-3 text-sm"
                  >
                    <option value="">Let Professor decide (default)</option>
                    {PROFESSOR_COMMANDER_STYLE_CHOICES_V111.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <p className="professor-mtg-muted mt-2 text-[11px] leading-relaxed">
                    How much should the deck depend on and revolve around the commander?
                  </p>
                </label>

                {solDirectedEnabled ? (
                  <label className="block">
                    <span className="professor-mtg-label">Deck preferences</span>
                    <textarea
                      value={deckPreferencesText}
                      onChange={(e) => setDeckPreferencesText(e.target.value)}
                      placeholder="e.g. mono white only, no infinite combos, tribal cats, budget under $150"
                      rows={2}
                      className="professor-mtg-input mt-2 w-full px-3 py-3 text-sm"
                    />
                    <p className="professor-mtg-muted mt-2 text-[11px] leading-relaxed">
                      Optional constraints the Architect and Critic should respect — colors, themes, staples, or cards
                      to avoid.
                    </p>
                  </label>
                ) : null}

                {solDirectedEnabled ? (
                  <div className="block">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedCardPreferences((open) => !open)}
                      className="professor-mtg-link text-xs"
                    >
                      {showAdvancedCardPreferences ? "▾" : "▸"} Advanced Card Preferences
                    </button>
                    {showAdvancedCardPreferences ? (
                      <div className="mt-3 space-y-4 rounded-lg border border-[var(--mtg-stone-border)]/70 px-3 py-3">
                        <p className="professor-mtg-muted text-[11px] leading-relaxed">
                          Soft steering only. Leave closed and Professor chooses the optimal functions. These are not
                          hard requirements unless you also write them into Deck preferences.
                        </p>
                        <div>
                          <span className="professor-mtg-label">Prefer</span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {PROFESSOR_SEMANTIC_PREFER_CHOICES_V111.map((choice) => {
                              const selected = preferSemanticIds.includes(choice.id);
                              return (
                                <ThemeChip
                                  key={`prefer-${choice.id}`}
                                  label={choice.label}
                                  selected={selected}
                                  onClick={() =>
                                    setPreferSemanticIds((ids) =>
                                      selected ? ids.filter((id) => id !== choice.id) : [...ids, choice.id],
                                    )
                                  }
                                />
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <span className="professor-mtg-label">Avoid</span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {PROFESSOR_SEMANTIC_AVOID_CHOICES_V111.map((choice) => {
                              const selected = avoidSemanticIds.includes(choice.id);
                              return (
                                <ThemeChip
                                  key={`avoid-${choice.id}`}
                                  label={choice.label}
                                  selected={selected}
                                  onClick={() =>
                                    setAvoidSemanticIds((ids) =>
                                      selected ? ids.filter((id) => id !== choice.id) : [...ids, choice.id],
                                    )
                                  }
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                disabled={
                  !commander ||
                  loading ||
                  (setupMode === "optimize" && !importPreview?.canOptimize)
                }
                onClick={() => void buildDeck()}
                className="professor-mtg-btn w-full px-6 py-4 text-sm"
              >
                {loading
                  ? setupMode === "optimize"
                    ? "Queuing optimization…"
                    : solDirectedEnabled
                      ? "Entering the chamber…"
                      : "Starting professors…"
                  : setupMode === "optimize"
                    ? "Optimize this deck"
                    : "Build deck"}
              </button>
              <p className="professor-mtg-muted text-center text-xs italic">
                {setupMode === "optimize"
                  ? "Professor keeps your list and applies bounded upgrades"
                  : "Swap cards after the full list is built"}
              </p>
              <p className="text-center">
                <Link href={howCosWorksPath(slug)} className="professor-mtg-link">
                  How COS works
                </Link>
              </p>
            </div>

            {error ? (
              <p className="professor-mtg-muted mt-4 border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300/90">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </main>
    </ProfessorMtgPageShell>
  );
}
