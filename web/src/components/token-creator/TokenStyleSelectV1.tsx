"use client";

import { TOKEN_STYLE_CATEGORIES_V1, TOKEN_STYLES_V1 } from "@/lib/token-creator/styles-v1";

/** Every style in one dropdown, grouped by category. */
export function TokenStyleSelectV1({
  value,
  onChange,
  label,
  emptyLabel = "Choose a style…",
  exclude,
}: {
  value: string | null;
  onChange: (styleId: string | null) => void;
  label: string;
  emptyLabel?: string;
  exclude?: string | null;
}) {
  return (
    <select
      className="token-input token-input--sm"
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{emptyLabel}</option>
      {TOKEN_STYLE_CATEGORIES_V1.map((cat) => (
        <optgroup key={cat.id} label={cat.label}>
          {TOKEN_STYLES_V1.filter((s) => s.category === cat.id && s.id !== exclude).map((s) => (
            <option key={s.id} value={s.id}>
              {s.number}. {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
