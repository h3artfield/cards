"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  searchTokenStylesV1,
  TOKEN_STYLE_CATEGORIES_V1,
  TOKEN_STYLES_V1,
  tokenStyleByIdV1,
  type TokenStyleCategoryIdV1,
  type TokenStyleV1,
} from "@/lib/token-creator/styles-v1";

const FAVORITES_KEY = "cs9k-token-style-favorites";
const RECENT_KEY = "cs9k-token-style-recent";
const MAX_RECENT = 12;

type Filter = "all" | "favorites" | "recent" | TokenStyleCategoryIdV1;

const CATEGORY_HUES: Record<TokenStyleCategoryIdV1, number> = {
  fantasy: 32,
  fine_art: 280,
  world_traditions: 12,
  drawing_painting: 200,
  print_craft: 340,
  digital_3d: 170,
  comics_retro: 50,
  tv_cartoons: 100,
  anime_comics: 320,
  retro_screen: 230,
  puppets_miniatures: 140,
  photography: 0,
};

function readIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && Boolean(tokenStyleByIdV1(id))) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage unavailable — favourites just won't persist */
  }
}

/** Remember a style the customer generated with, newest first. */
export function rememberTokenStyleV1(id: string | null) {
  if (!id || typeof window === "undefined") return;
  writeIds(RECENT_KEY, [id, ...readIds(RECENT_KEY).filter((x) => x !== id)].slice(0, MAX_RECENT));
}

const SIZE = 420;
const R_OUT = 200;
const R_IN = 58;

function segmentPath(a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(R_IN, a0)} L ${p(R_OUT, a0)} A ${R_OUT} ${R_OUT} 0 ${large} 1 ${p(R_OUT, a1)} L ${p(R_IN, a1)} A ${R_IN} ${R_IN} 0 ${large} 0 ${p(R_IN, a0)} Z`;
}

/**
 * The art style picker: a wheel of up to 100 styles with the pointer at the
 * top. Spin it by dragging, scrolling or the arrow keys; it settles on a
 * style and selects it. Search, categories, favourites and the dropdown pick
 * the same styles without spinning.
 */
export function TokenStyleWheelV1({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (styleId: string | null) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [rotation, setRotation] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [surpriseCategory, setSurpriseCategory] = useState<"any" | TokenStyleCategoryIdV1>("any");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startAngle: number; startRotation: number; moved: boolean } | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    setFavorites(readIds(FAVORITES_KEY));
    setRecent(readIds(RECENT_KEY));
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  const styles: TokenStyleV1[] = useMemo(() => {
    const base = query.trim() ? searchTokenStylesV1(query) : [...TOKEN_STYLES_V1];
    if (filter === "all") return base;
    if (filter === "favorites") return base.filter((s) => favorites.includes(s.id));
    if (filter === "recent") return recent.map((id) => base.find((s) => s.id === id)).filter((s): s is TokenStyleV1 => Boolean(s));
    return base.filter((s) => s.category === filter);
  }, [filter, query, favorites, recent]);

  const seg = styles.length ? 360 / styles.length : 360;
  const selected = tokenStyleByIdV1(value);

  /** Rotation that puts style `index` under the pointer, nearest to the current angle. */
  const rotationFor = useCallback(
    (index: number, from: number) => {
      const target = -(index * seg + seg / 2);
      const turns = Math.round((from - target) / 360);
      return target + turns * 360;
    },
    [seg],
  );

  const indexAt = useCallback(
    (rot: number) => {
      if (!styles.length) return -1;
      const a = (((-rot) % 360) + 360) % 360;
      return Math.floor(a / seg) % styles.length;
    },
    [seg, styles.length],
  );

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });
  // Keep the selected style under the pointer when the list changes.
  useEffect(() => {
    const index = styles.findIndex((s) => s.id === valueRef.current);
    if (index >= 0) setRotation((r) => rotationFor(index, r));
  }, [styles, rotationFor]);

  // A style chosen from the dropdown or search turns the wheel to it.
  useEffect(() => {
    const index = styles.findIndex((s) => s.id === value);
    if (index < 0 || indexAt(rotation) === index) return;
    setAnimating(!reducedMotion.current);
    setRotation(rotationFor(index, rotation));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const select = useCallback(
    (index: number, spins = 0) => {
      const style = styles[index];
      if (!style) return;
      setAnimating(!reducedMotion.current);
      setRotation((r) => rotationFor(index, r) - spins * 360);
      onChange(style.id);
    },
    [styles, rotationFor, onChange],
  );

  const pointerAngle = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    return (Math.atan2(y, x) * 180) / Math.PI;
  };

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    writeIds(FAVORITES_KEY, next);
  };

  const surprise = () => {
    const pool =
      surpriseCategory !== "any"
        ? TOKEN_STYLES_V1.filter((s) => s.category === surpriseCategory)
        : styles.length
          ? styles
          : [...TOKEN_STYLES_V1];
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    const index = styles.findIndex((s) => s.id === pick.id);
    if (index < 0) {
      setFilter(surpriseCategory === "any" ? "all" : surpriseCategory);
      setQuery("");
      onChange(pick.id);
      return;
    }
    select(index, reducedMotion.current ? 0 : 2);
  };

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All 100" },
    { id: "favorites", label: `★ Favorites${favorites.length ? ` (${favorites.length})` : ""}` },
    { id: "recent", label: "Recent" },
    ...TOKEN_STYLE_CATEGORIES_V1.map((c) => ({ id: c.id as Filter, label: c.label })),
  ];

  const fontSize = styles.length > 60 ? 7.5 : styles.length > 30 ? 10 : 13;
  const maxChars = styles.length > 60 ? 22 : styles.length > 30 ? 20 : 18;

  return (
    <div className="token-wheel">
      <div className="token-wheel__filters" role="tablist" aria-label="Style categories">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`token-chip${filter === f.id ? " token-chip--on" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="token-wheel__body">
        <div className="token-wheel__dial">
          <div className="token-wheel__pointer" aria-hidden />
          <svg
            ref={svgRef}
            viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
            className="token-wheel__svg"
            role="listbox"
            tabIndex={0}
            aria-label="Art style wheel"
            aria-activedescendant={value ? `token-style-${value}` : undefined}
            onKeyDown={(event) => {
              if (!styles.length) return;
              const current = Math.max(0, styles.findIndex((s) => s.id === value));
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                select((current + 1) % styles.length);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                select((current - 1 + styles.length) % styles.length);
              }
            }}
            onWheel={(event) => {
              if (!styles.length) return;
              event.preventDefault();
              const current = Math.max(0, styles.findIndex((s) => s.id === value));
              select((current + (event.deltaY > 0 ? 1 : -1) + styles.length) % styles.length);
            }}
            onPointerDown={(event) => {
              dragRef.current = { startAngle: pointerAngle(event), startRotation: rotation, moved: false };
              setAnimating(false);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const d = dragRef.current;
              if (!d) return;
              let delta = pointerAngle(event) - d.startAngle;
              if (delta > 180) delta -= 360;
              if (delta < -180) delta += 360;
              if (Math.abs(delta) > 2) d.moved = true;
              if (d.moved) setRotation(d.startRotation + delta);
            }}
            onPointerUp={(event) => {
              const d = dragRef.current;
              dragRef.current = null;
              if (!d) return;
              if (!d.moved) {
                // A tap: pick the segment under the finger.
                const rect = svgRef.current!.getBoundingClientRect();
                const x = event.clientX - (rect.left + rect.width / 2);
                const y = event.clientY - (rect.top + rect.height / 2);
                const r = (Math.hypot(x, y) / rect.width) * SIZE;
                if (r < R_IN || r > R_OUT) return;
                const a = (Math.atan2(y, x) * 180) / Math.PI + 90 - rotation;
                const index = Math.floor((((a % 360) + 360) % 360) / seg) % styles.length;
                select(index);
                return;
              }
              const index = indexAt(rotation);
              if (index >= 0) select(index);
            }}
          >
            <g
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: animating ? "transform 900ms cubic-bezier(0.16, 1, 0.3, 1)" : "none",
              }}
              onTransitionEnd={() => setAnimating(false)}
            >
              {styles.map((style, i) => {
                const a0 = ((i * seg - 90) * Math.PI) / 180;
                const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
                const mid = i * seg + seg / 2 - 90;
                const on = style.id === value;
                const hue = CATEGORY_HUES[style.category];
                const name = style.name.length > maxChars ? `${style.name.slice(0, maxChars - 1)}…` : style.name;
                return (
                  <g key={style.id} id={`token-style-${style.id}`} role="option" aria-selected={on}>
                    <path
                      d={segmentPath(a0, a1)}
                      fill={on ? `hsl(${hue} 75% 58%)` : `hsl(${hue} ${i % 2 ? 30 : 38}% ${i % 2 ? 17 : 22}%)`}
                      stroke="rgba(0,0,0,0.45)"
                      strokeWidth={0.6}
                    />
                    <text
                      transform={`rotate(${mid}) translate(${R_OUT - 8} 0)`}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize={fontSize}
                      fill={on ? "#16110a" : "rgba(255,255,255,0.88)"}
                      fontWeight={on ? 700 : 500}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {name}
                    </text>
                  </g>
                );
              })}
            </g>
            <circle r={R_IN - 2} fill="var(--ink-900, #0f0d0b)" stroke="rgba(255,255,255,0.15)" />
            <text textAnchor="middle" dominantBaseline="central" fontSize={12} fill="rgba(255,255,255,0.7)" style={{ pointerEvents: "none" }}>
              {styles.length ? `${styles.length} styles` : "No styles"}
            </text>
          </svg>
        </div>

        <div className="token-wheel__side">
          <label className="token-field">
            <span className="token-field__label">Search styles</span>
            <input
              type="search"
              className="token-input"
              placeholder="e.g. watercolor, pixel, noir"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="token-field">
            <span className="token-field__label">Or choose from the list</span>
            <select className="token-input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
              <option value="">No style — use my prompt only</option>
              {TOKEN_STYLE_CATEGORIES_V1.map((c) => (
                <optgroup key={c.id} label={c.label}>
                  {TOKEN_STYLES_V1.filter((s) => s.category === c.id).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.number}. {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="token-wheel__surprise">
            <button type="button" className="professor-mtg-btn px-3 py-2 text-xs" onClick={surprise}>
              Surprise me
            </button>
            <select
              className="token-input token-input--sm"
              aria-label="Surprise me from"
              value={surpriseCategory}
              onChange={(e) => setSurpriseCategory(e.target.value as typeof surpriseCategory)}
            >
              <option value="any">from what&apos;s on the wheel</option>
              {TOKEN_STYLE_CATEGORIES_V1.map((c) => (
                <option key={c.id} value={c.id}>
                  from {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="token-wheel__selected" aria-live="polite">
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="token-wheel__selected-name">
                      {selected.number}. {selected.name}
                    </p>
                    <p className="professor-mtg-muted text-[11px]">
                      {TOKEN_STYLE_CATEGORIES_V1.find((c) => c.id === selected.category)?.label}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`token-fav${favorites.includes(selected.id) ? " token-fav--on" : ""}`}
                    aria-pressed={favorites.includes(selected.id)}
                    title={favorites.includes(selected.id) ? "Remove from favorites" : "Add to favorites"}
                    onClick={() => toggleFavorite(selected.id)}
                  >
                    ★
                  </button>
                </div>
                <p className="mt-1 text-[12px] leading-snug">{selected.blurb}</p>
                <button type="button" className="token-link mt-2" onClick={() => onChange(null)}>
                  Clear style
                </button>
              </>
            ) : (
              <p className="professor-mtg-muted text-[12px]">
                No style chosen. The art follows your prompt alone — or spin the wheel to pick a look.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
