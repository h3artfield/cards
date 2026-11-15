"use client";

import { useRef, useState } from "react";
import type { TokenReferenceV1 } from "@/lib/token-creator/types-v1";

const EXAMPLES = [
  "Turn the person or pet in my photo into this token's creature",
  "Keep my drawing's composition and repaint it as finished fantasy art",
  "Put the person in my photo into the scene as the hero",
  "Use only its colours and mood; paint a new scene",
];

/**
 * An optional picture the four artworks are made from. Once one is uploaded,
 * the customer says in their own words what to do with it; generation waits
 * for that answer.
 */
export function TokenReferenceUploadV1({
  api,
  assetUrl,
  value,
  onChange,
  disabled = false,
}: {
  api: string;
  assetUrl: (path: string) => string;
  value: TokenReferenceV1 | null;
  onChange: (next: TokenReferenceV1 | null) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("image", file);
      const res = await fetch(`${api}/uploads`, { method: "POST", credentials: "include", body: form });
      const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !data.path) throw new Error(data.error ?? "Could not upload that image");
      onChange({ path: data.path, use: value?.use ?? "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const choose = () => fileRef.current?.click();

  return (
    <section className="token-reference">
      <span className="token-section-title">Start from your own image (optional)</span>
      <p className="token-field__hint">
        Upload a photo, sketch or scene (your pet, your playgroup, a drawing) and the artwork is made from it.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Upload an image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {value ? (
        <div className="token-reference__body">
          <div className="token-reference__thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(value.path)} alt="Your uploaded image" />
            <div className="flex gap-2">
              <button type="button" className="token-link text-[11px]" disabled={disabled || uploading} onClick={choose}>
                {uploading ? "Uploading…" : "Replace"}
              </button>
              <button type="button" className="token-link text-[11px]" disabled={disabled || uploading} onClick={() => onChange(null)}>
                Remove
              </button>
            </div>
          </div>
          <label className="token-field min-w-0 flex-1">
            <span className="token-field__label">How do you want to use this image in the card art?</span>
            <textarea
              className="token-input token-textarea"
              rows={3}
              maxLength={600}
              value={value.use}
              disabled={disabled}
              placeholder="e.g. Make my cat the zombie, keep her orange stripes and green eyes"
              onChange={(e) => onChange({ ...value, use: e.target.value })}
            />
            <span className="token-reference__examples">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className={`token-chip${value.use === ex ? " token-chip--on" : ""}`}
                  disabled={disabled}
                  onClick={() => onChange({ ...value, use: ex })}
                >
                  {ex}
                </button>
              ))}
            </span>
            {!value.use.trim() ? (
              <span className="token-field__hint text-[var(--warn,#e0b44c)]">Tell us how to use it before generating.</span>
            ) : null}
          </label>
        </div>
      ) : (
        <button type="button" className="deck-toolbar-chip mt-2" disabled={disabled || uploading} onClick={choose}>
          {uploading ? "Uploading…" : "Upload an image"}
        </button>
      )}
      {error ? <p className="token-error mt-2">{error}</p> : null}
    </section>
  );
}
