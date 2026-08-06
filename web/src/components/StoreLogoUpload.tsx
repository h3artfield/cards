"use client";

import { ChangeEvent, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import { compressLogoDataUrl } from "@/lib/camera/compress-logo";

export function StoreLogoUpload({
  logoUrl,
  storeName,
  onUpdated,
}: {
  logoUrl?: string | null;
  storeName: string;
  onUpdated: (logoUrl: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, or WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Logo must be under 5 MB.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const compressed = await compressLogoDataUrl(dataUrl);
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ storeLogoUrl: compressed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not save logo");
      }
      onUpdated(data.settings.storeLogoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    setUploading(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ storeLogoUrl: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not remove logo");
      }
      onUpdated(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove logo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-6">
      <h3 className="font-medium text-gray-900">Store logo</h3>
      <p className="mt-1 text-sm text-gray-500">
        Shown on your customer pages and admin header. Square or wide logos work
        best; PNG with transparency is supported.
      </p>

      <div className="mt-4 flex items-center gap-4">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={`${storeName} logo`}
            width={80}
            height={80}
            className="h-20 w-20 rounded-xl border object-contain"
            unoptimized={logoUrl.startsWith("data:")}
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed bg-gray-50 text-2xl text-gray-400">
            🃏
          </div>
        )}

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Saving..." : logoUrl ? "Replace logo" : "Upload logo"}
          </Button>
          {logoUrl && (
            <button
              type="button"
              disabled={uploading}
              onClick={removeLogo}
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              Remove logo
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
