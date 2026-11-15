"use client";

import type { ReactNode } from "react";
import {
  themeForColorsV1,
  TOKEN_FONTS_V1,
  type TokenAlignV1,
  type TokenArtModeV1,
  type TokenBoxV1,
  type TokenCardV1,
  type TokenFinishV1,
  type TokenFontIdV1,
  type TokenFrameStyleV1,
  type TokenPanelStyleV1,
  type TokenPlateShapeV1,
  type TokenTextEffectV1,
  type TokenTreatmentV1,
} from "@/lib/token-creator/design-v1";
import { tokenKindByIdV1 } from "@/lib/token-creator/templates-v1";
import { TokenSymbolPickerV1 } from "./TokenSymbolPickerV1";

export type TokenControlsTabV1 = "text" | "frame" | "title" | "type" | "rules" | "pt" | "art" | "finish";

const FRAMES: Array<[TokenFrameStyleV1, string]> = [
  ["classic", "Classic border"],
  ["ornate", "Ornate"],
  ["stone", "Carved stone"],
  ["metal", "Metal"],
  ["parchment", "Parchment"],
  ["borderless", "Borderless"],
  ["full_art", "Full art, thin edge"],
  ["none", "No frame"],
];
const PLATES: Array<[TokenPlateShapeV1, string]> = [
  ["bar", "Simple bar"],
  ["engraved", "Engraved plate"],
  ["stone", "Stone slab"],
  ["scroll", "Scroll ribbon"],
  ["curved_metal", "Curved metal"],
  ["torn", "Torn paper"],
  ["runic", "Runic band"],
  ["none", "No plate (text only)"],
];
const PANELS: Array<[TokenPanelStyleV1, string]> = [
  ["box", "Text box"],
  ["parchment", "Parchment"],
  ["tablet", "Stone tablet"],
  ["glass", "Frosted glass"],
  ["translucent", "Translucent dark"],
  ["gothic", "Gothic window"],
  ["plaque", "Metal plaque"],
  ["leather", "Leather"],
  ["glow", "Magic glow"],
  ["integrated", "Painted into the art"],
  ["none", "No panel"],
];
const TREATMENTS: Array<[TokenTreatmentV1, string]> = [
  ["flat", "Flat colour"],
  ["gold", "Gold leaf"],
  ["silver", "Silver"],
  ["stone", "Carved stone"],
  ["wood", "Wood"],
  ["ink", "Ink"],
  ["parchment", "Parchment"],
  ["magic", "Magic"],
];
const EFFECTS: Array<[TokenTextEffectV1, string]> = [
  ["none", "None"],
  ["outline", "Outline"],
  ["shadow", "Drop shadow"],
  ["glow", "Glow"],
  ["emboss", "Embossed"],
  ["engrave", "Engraved"],
];
const ART_MODES: Array<[TokenArtModeV1, string]> = [
  ["window", "Inside an art window"],
  ["full", "Full card art"],
  ["beyond", "Breaks out of the window"],
  ["under_text", "Full art under the text"],
];
const ALIGNS: Array<[TokenAlignV1, string]> = [
  ["left", "Left"],
  ["center", "Centre"],
  ["right", "Right"],
];
const FINISHES: Array<[TokenFinishV1, string]> = [
  ["none", "None"],
  ["vignette", "Vignette"],
  ["foil", "Foil shimmer"],
  ["grain", "Film grain"],
];
const COLORS: Array<[string, string]> = [
  ["W", "White"],
  ["U", "Blue"],
  ["B", "Black"],
  ["R", "Red"],
  ["G", "Green"],
];

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="token-field">
      <span className="token-field__label">{label}</span>
      {children}
      {hint ? <span className="token-field__hint">{hint}</span> : null}
    </label>
  );
}

function Select<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <select className="token-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  );
}

function FontSelect({ value, onChange }: { value: TokenFontIdV1; onChange: (v: TokenFontIdV1) => void }) {
  return (
    <Select
      value={value}
      options={TOKEN_FONTS_V1.map((f) => [f.id, f.label] as [TokenFontIdV1, string])}
      onChange={onChange}
    />
  );
}

function Range({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <span className="token-range">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="token-range__value">{format ? format(value) : value}</span>
    </span>
  );
}

function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="color" className="token-color" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="token-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function BoxControls({ box, onChange }: { box: TokenBoxV1; onChange: (b: TokenBoxV1) => void }) {
  const mm = (v: number) => `${(v / 10).toFixed(1)} mm`;
  return (
    <div className="token-grid-2">
      <Field label="Left">
        <Range value={box.x} min={-30} max={600} onChange={(x) => onChange({ ...box, x })} format={mm} />
      </Field>
      <Field label="Top">
        <Range value={box.y} min={-30} max={860} onChange={(y) => onChange({ ...box, y })} format={mm} />
      </Field>
      <Field label="Width">
        <Range value={box.w} min={40} max={690} onChange={(w) => onChange({ ...box, w })} format={mm} />
      </Field>
      <Field label="Height">
        <Range value={box.h} min={20} max={940} onChange={(h) => onChange({ ...box, h })} format={mm} />
      </Field>
    </div>
  );
}

const TABS: Array<[TokenControlsTabV1, string]> = [
  ["text", "Words"],
  ["frame", "Frame"],
  ["title", "Name"],
  ["type", "Type line"],
  ["rules", "Rules box"],
  ["pt", "P/T"],
  ["art", "Artwork"],
  ["finish", "Finish"],
];

/**
 * Every editable part of a card, one tab per layer. The frame, name plate,
 * rules box and art are independent, so any frame works with any name style
 * or rules panel.
 */
export function TokenLayerControlsV1({
  card,
  onChange,
  tab,
  onTab,
  uploadApi,
}: {
  card: TokenCardV1;
  onChange: (card: TokenCardV1) => void;
  tab: TokenControlsTabV1;
  onTab: (tab: TokenControlsTabV1) => void;
  /** The token API base, for uploading a type-line icon. */
  uploadApi?: string;
}) {
  const set = <K extends keyof TokenCardV1>(key: K, value: TokenCardV1[K]) => onChange({ ...card, [key]: value });
  const title = (patch: Partial<TokenCardV1["title"]>) => set("title", { ...card.title, ...patch });
  const type = (patch: Partial<TokenCardV1["type"]>) => set("type", { ...card.type, ...patch });
  const rules = (patch: Partial<TokenCardV1["rules"]>) => set("rules", { ...card.rules, ...patch });
  const pt = (patch: Partial<TokenCardV1["pt"]>) => set("pt", { ...card.pt, ...patch });
  const art = (patch: Partial<TokenCardV1["art"]>) => set("art", { ...card.art, ...patch });
  const frame = (patch: Partial<TokenCardV1["frame"]>) => set("frame", { ...card.frame, ...patch });
  const kind = tokenKindByIdV1(card.kindId);
  const officialText = kind.rulesSource === "official" ? kind.rulesText : "";

  return (
    <div className="token-controls">
      <div className="token-controls__tabs" role="tablist" aria-label="Card layers">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`token-chip${tab === id ? " token-chip--on" : ""}`}
            onClick={() => onTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="token-controls__panel" role="tabpanel">
        {tab === "text" ? (
          <>
            <Field label="Token name">
              <input className="token-input" value={card.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Type line" hint="For example: Token Creature — Zombie">
              <input className="token-input" value={card.typeLine} maxLength={80} onChange={(e) => set("typeLine", e.target.value)} />
            </Field>
            <Field label="Rules text" hint="Use {T} for tap, {Q} for untap, and {1}, {W}, {U}, {B}, {R}, {G}, {C} for mana.">
              <textarea
                className="token-input token-textarea"
                rows={4}
                value={card.rulesText}
                maxLength={600}
                onChange={(e) =>
                  onChange({
                    ...card,
                    rulesText: e.target.value,
                    rulesSource: !e.target.value.trim()
                      ? "none"
                      : officialText && e.target.value === officialText
                        ? "official"
                        : "custom",
                  })
                }
              />
            </Field>
            <div className="token-rules-source">
              {card.rulesSource === "official" ? (
                <span className="token-badge token-badge--ok">Official wording</span>
              ) : card.rulesSource === "custom" ? (
                <span className="token-badge token-badge--warn">Custom text — not official rules wording</span>
              ) : (
                <span className="token-badge">No rules text</span>
              )}
              {officialText && card.rulesText !== officialText ? (
                <button
                  type="button"
                  className="token-link"
                  onClick={() => onChange({ ...card, rulesText: officialText, rulesSource: "official" })}
                >
                  Restore official {kind.label} wording
                </button>
              ) : null}
            </div>
            <Field label="Flavor text (optional)">
              <textarea
                className="token-input token-textarea"
                rows={2}
                value={card.flavorText}
                maxLength={240}
                onChange={(e) => set("flavorText", e.target.value)}
              />
            </Field>
            <div className="token-grid-2">
              <Field label="Power">
                <input className="token-input" value={card.power} maxLength={4} onChange={(e) => set("power", e.target.value)} />
              </Field>
              <Field label="Toughness">
                <input className="token-input" value={card.toughness} maxLength={4} onChange={(e) => set("toughness", e.target.value)} />
              </Field>
            </div>
            <Field label="Colors">
              <span className="token-colors">
                {COLORS.map(([id, label]) => {
                  const on = card.colors.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      title={label}
                      className={`token-mana token-mana--${id}${on ? " token-mana--on" : ""}`}
                      onClick={() => {
                        const colors = on ? card.colors.filter((c) => c !== id) : [...card.colors, id];
                        onChange({ ...card, colors });
                      }}
                    >
                      {id}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="token-link"
                  onClick={() => {
                    const theme = themeForColorsV1(card.colors);
                    frame({ color: theme.frame, accent: theme.accent });
                  }}
                  title="Set the frame colours from the card's colours"
                >
                  Match frame to colors
                </button>
              </span>
            </Field>
          </>
        ) : null}

        {tab === "frame" ? (
          <>
            <Field label="Frame">
              <Select value={card.frame.style} options={FRAMES} onChange={(style) => frame({ style })} />
            </Field>
            <div className="token-grid-2">
              <Field label="Frame colour">
                <Color value={card.frame.color} onChange={(color) => frame({ color })} />
              </Field>
              <Field label="Accent colour">
                <Color value={card.frame.accent} onChange={(accent) => frame({ accent })} />
              </Field>
            </div>
          </>
        ) : null}

        {tab === "title" ? (
          <>
            <Toggle checked={card.title.show} onChange={(show) => title({ show })} label="Show the name" />
            <Field label="Name plate">
              <Select value={card.title.plate} options={PLATES} onChange={(plate) => title({ plate })} />
            </Field>
            <div className="token-grid-2">
              <Field label="Plate colour">
                <Color value={card.title.plateColor} onChange={(plateColor) => title({ plateColor })} />
              </Field>
              <Field label="Plate opacity">
                <Range value={card.title.plateOpacity} min={0} max={1} step={0.05} onChange={(plateOpacity) => title({ plateOpacity })} format={(v) => `${Math.round(v * 100)}%`} />
              </Field>
            </div>
            <Field label="Font">
              <FontSelect value={card.title.font} onChange={(font) => title({ font })} />
            </Field>
            <Toggle checked={Boolean(card.title.smallCaps)} onChange={(smallCaps) => title({ smallCaps })} label="Small caps (like modern Magic tokens)" />
            <div className="token-toggles">
              <Toggle checked={Boolean(card.title.crown)} onChange={(crown) => title({ crown })} label="Legendary crown" />
              <Toggle checked={Boolean(card.title.starfield)} onChange={(starfield) => title({ starfield })} label="Starfield name bar" />
            </div>
            <div className="token-grid-2">
              <Field label="Size">
                <Range value={card.title.size} min={14} max={120} onChange={(size) => title({ size })} />
              </Field>
              <Field label="Letter spacing">
                <Range value={card.title.letterSpacing} min={-2} max={20} onChange={(letterSpacing) => title({ letterSpacing })} />
              </Field>
              <Field label="Text colour">
                <Color value={card.title.color} onChange={(color) => title({ color })} />
              </Field>
              <Field label="Weight">
                <Select
                  value={String(card.title.weight) as "400" | "700"}
                  options={[["400", "Regular"], ["700", "Bold"]]}
                  onChange={(w) => title({ weight: w === "400" ? 400 : 700 })}
                />
              </Field>
              <Field label="Lettering">
                <Select value={card.title.treatment} options={TREATMENTS} onChange={(treatment) => title({ treatment })} />
              </Field>
              <Field label="Effect">
                <Select value={card.title.effect} options={EFFECTS} onChange={(effect) => title({ effect })} />
              </Field>
            </div>
            <Field label="Alignment">
              <Select value={card.title.align} options={ALIGNS} onChange={(align) => title({ align })} />
            </Field>
            <p className="token-field__hint">Drag the name on the preview to move it, or set its position here.</p>
            <BoxControls box={card.title.box} onChange={(box) => title({ box })} />
          </>
        ) : null}

        {tab === "type" ? (
          <>
            <Toggle checked={card.type.show} onChange={(show) => type({ show })} label="Show the type line" />
            <Field label="Plate">
              <Select value={card.type.plate} options={PLATES} onChange={(plate) => type({ plate })} />
            </Field>
            <div className="token-grid-2">
              <Field label="Plate colour">
                <Color value={card.type.plateColor} onChange={(plateColor) => type({ plateColor })} />
              </Field>
              <Field label="Plate opacity">
                <Range value={card.type.plateOpacity} min={0} max={1} step={0.05} onChange={(plateOpacity) => type({ plateOpacity })} format={(v) => `${Math.round(v * 100)}%`} />
              </Field>
              <Field label="Size">
                <Range value={card.type.size} min={12} max={60} onChange={(size) => type({ size })} />
              </Field>
              <Field label="Text colour">
                <Color value={card.type.color} onChange={(color) => type({ color })} />
              </Field>
            </div>
            <Field label="Font">
              <FontSelect value={card.type.font} onChange={(font) => type({ font })} />
            </Field>
            <TokenSymbolPickerV1 card={card} onChange={onChange} uploadApi={uploadApi} />
            <BoxControls box={card.type.box} onChange={(box) => type({ box })} />
          </>
        ) : null}

        {tab === "rules" ? (
          <>
            <Toggle checked={card.rules.show} onChange={(show) => rules({ show })} label="Show the rules box" />
            <Field label="Panel">
              <Select value={card.rules.panel} options={PANELS} onChange={(panel) => rules({ panel })} />
            </Field>
            <div className="token-grid-2">
              <Field label="Panel colour">
                <Color value={card.rules.panelColor} onChange={(panelColor) => rules({ panelColor })} />
              </Field>
              <Field label="Panel opacity">
                <Range value={card.rules.panelOpacity} min={0} max={1} step={0.05} onChange={(panelOpacity) => rules({ panelOpacity })} format={(v) => `${Math.round(v * 100)}%`} />
              </Field>
              <Field label="Border">
                <Range value={card.rules.borderWidth} min={0} max={16} onChange={(borderWidth) => rules({ borderWidth })} />
              </Field>
              <Field label="Padding">
                <Range value={card.rules.padding} min={0} max={60} onChange={(padding) => rules({ padding })} />
              </Field>
              <Field label="Text size" hint="Long text shrinks to fit.">
                <Range value={card.rules.size} min={12} max={60} onChange={(size) => rules({ size })} />
              </Field>
              <Field label="Line spacing">
                <Range value={card.rules.lineHeight} min={0.9} max={2} step={0.05} onChange={(lineHeight) => rules({ lineHeight })} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Text colour">
                <Color value={card.rules.color} onChange={(color) => rules({ color })} />
              </Field>
              <Field label="Alignment">
                <Select value={card.rules.align} options={ALIGNS} onChange={(align) => rules({ align })} />
              </Field>
            </div>
            <Field label="Font">
              <FontSelect value={card.rules.font} onChange={(font) => rules({ font })} />
            </Field>
            <div className="token-toggles">
              <Toggle checked={card.rules.shadow} onChange={(shadow) => rules({ shadow })} label="Text shadow" />
              <Toggle checked={card.rules.ornaments} onChange={(ornaments) => rules({ ornaments })} label="Corner ornaments" />
              <Toggle checked={card.rules.showFlavor} onChange={(showFlavor) => rules({ showFlavor })} label="Show flavor text" />
            </div>
            <BoxControls box={card.rules.box} onChange={(box) => rules({ box })} />
          </>
        ) : null}

        {tab === "pt" ? (
          <>
            <Toggle checked={card.pt.show} onChange={(show) => pt({ show })} label="Show power/toughness" />
            <Field label="Plate">
              <Select value={card.pt.plate} options={PLATES} onChange={(plate) => pt({ plate })} />
            </Field>
            <div className="token-grid-2">
              <Field label="Plate colour">
                <Color value={card.pt.plateColor} onChange={(plateColor) => pt({ plateColor })} />
              </Field>
              <Field label="Text colour">
                <Color value={card.pt.color} onChange={(color) => pt({ color })} />
              </Field>
              <Field label="Size">
                <Range value={card.pt.size} min={14} max={90} onChange={(size) => pt({ size })} />
              </Field>
            </div>
            <Field label="Font">
              <FontSelect value={card.pt.font} onChange={(font) => pt({ font })} />
            </Field>
            <BoxControls box={card.pt.box} onChange={(box) => pt({ box })} />
          </>
        ) : null}

        {tab === "art" ? (
          <>
            <Field label="How the art sits on the card">
              <Select value={card.art.mode} options={ART_MODES} onChange={(mode) => art({ mode })} />
            </Field>
            <div className="token-grid-2">
              <Field label="Zoom">
                <Range value={card.art.zoom} min={1} max={4} step={0.05} onChange={(zoom) => art({ zoom })} format={(v) => `${v.toFixed(2)}×`} />
              </Field>
              <span />
              <Field label="Slide left / right">
                <Range value={card.art.offsetX} min={-1} max={1} step={0.02} onChange={(offsetX) => art({ offsetX })} format={(v) => v.toFixed(2)} />
              </Field>
              <Field label="Slide up / down">
                <Range value={card.art.offsetY} min={-1} max={1} step={0.02} onChange={(offsetY) => art({ offsetY })} format={(v) => v.toFixed(2)} />
              </Field>
            </div>
            {card.art.mode === "window" || card.art.mode === "beyond" ? (
              <>
                <p className="token-field__hint">Art window</p>
                <BoxControls box={card.art.window} onChange={(window) => art({ window })} />
              </>
            ) : null}
          </>
        ) : null}

        {tab === "finish" ? (
          <Field label="Finish">
            <Select value={card.finish} options={FINISHES} onChange={(finish) => set("finish", finish)} />
          </Field>
        ) : null}
      </div>
    </div>
  );
}
