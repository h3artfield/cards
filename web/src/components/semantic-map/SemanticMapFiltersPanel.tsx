"use client";

import { useEffect, useState } from "react";
import type { SemanticMapFilters, SemanticMapPoint } from "@/lib/semantic-visualization/types";
import { PRIMITIVE_ACTION_TYPES } from "@/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { DERIVED_ROLE_NAMES } from "@/lib/semantic-visualization/derived-features-v1";

const CARD_TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Land",
  "Battle",
  "Kindred",
];

const ABILITY_TYPES = [
  "triggered",
  "activated",
  "static",
  "replacement",
  "modal",
  "loyalty",
  "spell_effect",
];

const ZONES = ["hand", "library", "graveyard", "battlefield", "exile", "stack"];
const SEMANTIC_OWNERS = ["source_card", "granted_object", "created_object", "granted_ability"];

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs ${active ? "bg-amber-700 text-white" : "bg-neutral-800 text-neutral-300"}`}
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-neutral-800 px-3 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

export function SemanticMapFiltersPanel({
  slug,
  filters,
  onChange,
  points,
  onCompare,
  showEdges,
  onShowEdgesChange,
}: {
  slug: string;
  filters: SemanticMapFilters;
  onChange: (f: SemanticMapFilters) => void;
  points: SemanticMapPoint[];
  onCompare: () => void;
  showEdges: {
    semanticNeighbors: boolean;
    sharedActions: boolean;
    zoneFlow: boolean;
    grantedAbility: boolean;
  };
  onShowEdgesChange: (v: typeof showEdges) => void;
}) {
  const [commanderQuery, setCommanderQuery] = useState("");
  const [commanderResults, setCommanderResults] = useState<SemanticMapPoint[]>([]);
  const [centerQuery, setCenterQuery] = useState("");
  const [centerResults, setCenterResults] = useState<SemanticMapPoint[]>([]);

  useEffect(() => {
    if (commanderQuery.trim().length < 2) {
      setCommanderResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/store/${slug}/semantic-map/search?q=${encodeURIComponent(commanderQuery)}&limit=12`,
      );
      if (!res.ok) return;
      const body = (await res.json()) as { results: SemanticMapPoint[] };
      setCommanderResults((body.results ?? []).filter((p) => p.commanderEligible));
    }, 200);
    return () => clearTimeout(t);
  }, [commanderQuery, slug]);

  useEffect(() => {
    if (centerQuery.trim().length < 2) {
      setCenterResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/store/${slug}/semantic-map/search?q=${encodeURIComponent(centerQuery)}&limit=12`,
      );
      if (!res.ok) return;
      const body = (await res.json()) as { results: SemanticMapPoint[] };
      setCenterResults((body.results ?? []).filter((p) => p.commanderEligible));
    }, 200);
    return () => clearTimeout(t);
  }, [centerQuery, slug]);

  const patch = (partial: Partial<SemanticMapFilters>) => onChange({ ...filters, ...partial });

  const toggleArray = (key: keyof SemanticMapFilters, value: string) => {
    const current = (filters[key] as string[]) ?? [];
    patch({
      [key]: current.includes(value) ? current.filter((x) => x !== value) : [...current, value],
    } as Partial<SemanticMapFilters>);
  };

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-950 text-sm">
      <Section title="Show">
        <div className="flex flex-wrap gap-2">
          <ToggleChip
            active={filters.showScope === "all"}
            label="All cards"
            onClick={() => patch({ showScope: "all" })}
          />
          <ToggleChip
            active={filters.showScope === "inventory"}
            label="Inventory only"
            onClick={() => patch({ showScope: "inventory" })}
          />
        </div>
      </Section>

      <Section title="Color">
        <div className="flex flex-wrap gap-2">
          {(["all", "W", "U", "B", "R", "G", "C", "multicolor"] as const).map((c) => (
            <ToggleChip
              key={c}
              active={filters.colorMode === c}
              label={c === "all" ? "All" : c === "multicolor" ? "Multi" : c}
              onClick={() => patch({ colorMode: c })}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">Includes color</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {["W", "U", "B", "R", "G"].map((c) => (
            <ToggleChip
              key={c}
              active={filters.includesColors.includes(c)}
              label={c}
              onClick={() => toggleArray("includesColors", c)}
            />
          ))}
        </div>
      </Section>

      <Section title="Commander">
        <div className="flex flex-wrap gap-2">
          {(["all", "yes", "no"] as const).map((v) => (
            <ToggleChip
              key={v}
              active={filters.commanderEligible === v}
              label={v === "all" ? "All" : v === "yes" ? "Eligible" : "Not eligible"}
              onClick={() => patch({ commanderEligible: v })}
            />
          ))}
        </div>
        <input
          value={commanderQuery}
          onChange={(e) => setCommanderQuery(e.target.value)}
          placeholder="Choose commander (filters color identity)"
          className="mt-2 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
        />
        {commanderResults.length > 0 && (
          <div className="mt-1 max-h-32 overflow-auto rounded border border-neutral-800">
            {commanderResults.map((c) => (
              <button
                key={c.oracleId}
                type="button"
                onClick={() => {
                  patch({ commanderOracleId: c.oracleId });
                  setCommanderQuery(c.name);
                  setCommanderResults([]);
                }}
                className="block w-full px-2 py-1 text-left text-xs hover:bg-neutral-800"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {filters.commanderOracleId && (
          <button
            type="button"
            className="mt-1 text-xs text-amber-400"
            onClick={() => patch({ commanderOracleId: undefined })}
          >
            Clear commander filter
          </button>
        )}
      </Section>

      <Section title="Center on commander">
        <input
          value={centerQuery}
          onChange={(e) => setCenterQuery(e.target.value)}
          placeholder="Commander for semantic neighborhood"
          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {[25, 50, 100, 250].map((n) => (
            <ToggleChip
              key={n}
              active={filters.neighborLimit === n}
              label={`Top ${n}`}
              onClick={() => patch({ neighborLimit: n })}
            />
          ))}
        </div>
        {centerResults.length > 0 && (
          <div className="mt-1 max-h-32 overflow-auto rounded border border-neutral-800">
            {centerResults.map((c) => (
              <button
                key={`center-${c.oracleId}`}
                type="button"
                onClick={() => {
                  patch({
                    centerCommanderOracleId: c.oracleId,
                    commanderOracleId: c.oracleId,
                    neighborLimit: filters.neighborLimit ?? 50,
                  });
                  setCenterQuery(c.name);
                }}
                className="block w-full px-2 py-1 text-left text-xs hover:bg-neutral-800"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Card type">
        <div className="flex flex-wrap gap-1">
          {CARD_TYPES.map((t) => (
            <ToggleChip
              key={t}
              active={filters.cardTypes.includes(t)}
              label={t}
              onClick={() => toggleArray("cardTypes", t)}
            />
          ))}
        </div>
        <input
          value={filters.subtypeQuery ?? ""}
          onChange={(e) => patch({ subtypeQuery: e.target.value })}
          placeholder="Subtype search (Elf, Equipment…)"
          className="mt-2 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
        />
      </Section>

      <Section title="Mana value">
        <div className="flex items-center gap-2 text-xs">
          <input
            type="number"
            min={0}
            max={20}
            value={filters.manaValueMin}
            onChange={(e) => patch({ manaValueMin: parseInt(e.target.value, 10) || 0 })}
            className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1 py-1"
          />
          <span>to</span>
          <input
            type="number"
            min={0}
            max={99}
            value={filters.manaValueMax}
            onChange={(e) => patch({ manaValueMax: parseInt(e.target.value, 10) || 99 })}
            className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1 py-1"
          />
        </div>
      </Section>

      <Section title="Semantic action">
        <div className="mb-2 flex gap-2">
          <ToggleChip
            active={filters.semanticActionMode === "any"}
            label="ANY"
            onClick={() => patch({ semanticActionMode: "any" })}
          />
          <ToggleChip
            active={filters.semanticActionMode === "all"}
            label="ALL"
            onClick={() => patch({ semanticActionMode: "all" })}
          />
        </div>
        <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
          {PRIMITIVE_ACTION_TYPES.map((a) => (
            <ToggleChip
              key={a}
              active={filters.semanticActions.includes(a)}
              label={a.replace(/_/g, " ")}
              onClick={() => toggleArray("semanticActions", a)}
            />
          ))}
        </div>
      </Section>

      <Section title="Ability structure">
        <div className="flex flex-wrap gap-1">
          {ABILITY_TYPES.map((a) => (
            <ToggleChip
              key={a}
              active={filters.abilityTypes.includes(a)}
              label={a}
              onClick={() => toggleArray("abilityTypes", a)}
            />
          ))}
        </div>
      </Section>

      <Section title="Zone interaction">
        <div className="flex flex-wrap gap-1">
          {ZONES.map((z) => (
            <ToggleChip
              key={z}
              active={filters.zones.includes(z)}
              label={z}
              onClick={() => toggleArray("zones", z)}
            />
          ))}
        </div>
      </Section>

      <Section title="Semantic owner">
        <div className="flex flex-wrap gap-1">
          {SEMANTIC_OWNERS.map((o) => (
            <ToggleChip
              key={o}
              active={filters.semanticOwners.includes(o)}
              label={o.replace(/_/g, " ")}
              onClick={() => toggleArray("semanticOwners", o)}
            />
          ))}
        </div>
      </Section>

      <Section title="Parser quality">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["all", "All"],
              ["publishable", "Publishable"],
              ["needs_review", "Needs review"],
              ["quarantined", "Quarantined"],
            ] as const
          ).map(([v, label]) => (
            <ToggleChip
              key={v}
              active={filters.qualityFilter === v}
              label={label}
              onClick={() => patch({ qualityFilter: v })}
            />
          ))}
        </div>
      </Section>

      <Section title="Deckbuilding functions (derived)">
        <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
          {DERIVED_ROLE_NAMES.map((role) => (
            <ToggleChip
              key={role}
              active={filters.derivedRoles.includes(role)}
              label={role.replace(/_/g, " ")}
              onClick={() => toggleArray("derivedRoles", role)}
            />
          ))}
        </div>
        <p className="mt-2 text-[10px] text-neutral-500">
          Derived roles are visualization-only — not canonical Oracle truth.
        </p>
      </Section>

      <Section title="Compare two cards">
        <select
          value={filters.compareA ?? ""}
          onChange={(e) => patch({ compareA: e.target.value || undefined })}
          className="mb-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
        >
          <option value="">Card A</option>
          {points.slice(0, 200).map((p) => (
            <option key={`a-${p.oracleId}`} value={p.oracleId}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={filters.compareB ?? ""}
          onChange={(e) => patch({ compareB: e.target.value || undefined })}
          className="mb-2 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
        >
          <option value="">Card B</option>
          {points.slice(0, 200).map((p) => (
            <option key={`b-${p.oracleId}`} value={p.oracleId}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCompare}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-white hover:bg-neutral-700"
        >
          Compare
        </button>
      </Section>

      <Section title="Relationship edges (selected card)">
        <div className="space-y-1 text-xs">
          {(
            [
              ["semanticNeighbors", "Semantic neighbors"],
              ["sharedActions", "Shared actions"],
              ["zoneFlow", "Zone-flow similarity"],
              ["grantedAbility", "Granted-ability relationships"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showEdges[key]}
                onChange={(e) => onShowEdgesChange({ ...showEdges, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </Section>

      <div className="px-3 py-4 text-[10px] text-neutral-600">
        UMAP axes are Semantic dimension 1/2/3 — distance/neighborhood is the meaningful signal.
      </div>
    </aside>
  );
}
