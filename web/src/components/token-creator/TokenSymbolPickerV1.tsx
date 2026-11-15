"use client";

import { useContext, useRef, useState } from "react";
import type { TokenCardV1, TokenSymbolV1 } from "@/lib/token-creator/design-v1";
import { TOKEN_ICONS_V1 } from "@/lib/token-creator/icons-v1";
import { TokenAssetUrlContextV1 } from "./useTokenAssetsV1";

const SWATCHES = ["#e8e2cf", "#111111", "#d8b04c", "#c0c6cf", "#b8732c", "#c23b2a", "#2f6fc0", "#2f8a4a"];

/**
 * The icon at the right end of the type line, where real cards show their set
 * symbol: one of our own icons or the customer's upload (a shop logo, say).
 */
export function TokenSymbolPickerV1({
  card,
  onChange,
  uploadApi,
}: {
  card: TokenCardV1;
  onChange: (card: TokenCardV1) => void;
  /** The token API base; without it the upload option is hidden. */
  uploadApi?: string;
}) {
  const toUrl = useContext(TokenAssetUrlContextV1);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sym = card.symbol ?? null;
  const set = (patch: Partial<TokenSymbolV1> | null) =>
    onChange({
      ...card,
      symbol: patch === null ? null : { icon: "star", path: null, color: SWATCHES[0]!, scale: 1, ...sym, ...patch },
    });

  async function upload(file: File) {
    if (!uploadApi) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("image", file);
      const res = await fetch(`${uploadApi}/uploads`, { method: "POST", credentials: "include", body: form });
      const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !data.path) throw new Error(data.error ?? "Could not upload that image");
      set({ icon: "upload", path: data.path });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="token-symbol-picker">
      <span className="token-field__label">Type-line icon</span>
      <div className="token-symbol-picker__grid" role="group" aria-label="Type-line icon">
        <button
          type="button"
          className={`token-symbol-btn${!sym ? " token-symbol-btn--on" : ""}`}
          aria-pressed={!sym}
          onClick={() => set(null)}
          title="No icon"
        >
          <span className="text-[10px]">None</span>
        </button>
        {TOKEN_ICONS_V1.map((icon) => (
          <button
            key={icon.id}
            type="button"
            className={`token-symbol-btn${sym?.icon === icon.id ? " token-symbol-btn--on" : ""}`}
            aria-pressed={sym?.icon === icon.id}
            title={icon.label}
            onClick={() => set({ icon: icon.id, path: null })}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d={icon.path} fill="currentColor" fillRule="evenodd" />
            </svg>
          </button>
        ))}
        {uploadApi ? (
          <button
            type="button"
            className={`token-symbol-btn${sym?.icon === "upload" ? " token-symbol-btn--on" : ""}`}
            aria-pressed={sym?.icon === "upload"}
            title="Upload your own icon"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {sym?.icon === "upload" && sym.path && toUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={toUrl(sym.path)} alt="Your icon" width={18} height={18} style={{ objectFit: "contain" }} />
            ) : (
              <span className="text-[10px]">{uploading ? "…" : "Upload"}</span>
            )}
          </button>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Upload an icon"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {sym ? (
        <div className="token-symbol-picker__opts">
          {sym.icon !== "upload" ? (
            <span className="token-symbol-picker__swatches">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`token-swatch${sym.color === c ? " token-swatch--on" : ""}`}
                  style={{ background: c }}
                  aria-label={`Icon colour ${c}`}
                  onClick={() => set({ color: c })}
                />
              ))}
              <input type="color" className="token-color" value={sym.color} onChange={(e) => set({ color: e.target.value })} />
            </span>
          ) : null}
          <label className="token-range">
            <span className="token-field__hint">Size</span>
            <input type="range" min={0.6} max={1.6} step={0.05} value={sym.scale} onChange={(e) => set({ scale: Number(e.target.value) })} />
          </label>
        </div>
      ) : null}
      <span className="token-field__hint">
        Our own icons or yours (a shop logo works well). Real Magic set symbols aren&apos;t offered.
      </span>
      {error ? <p className="token-error mt-1">{error}</p> : null}
    </div>
  );
}
