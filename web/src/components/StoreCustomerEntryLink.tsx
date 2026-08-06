"use client";

import Link from "next/link";
import { buildStoreEntryUrl } from "@/lib/store-slug";
import { getConfiguredAppUrl } from "@/lib/app-url";

export function StoreCustomerEntryLink({
  storeSlug,
  storeName,
}: {
  storeSlug: string;
  storeName: string;
}) {
  const path = `/s/${storeSlug}`;
  const fullUrl = buildStoreEntryUrl(storeSlug, getConfiguredAppUrl());

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
      <p className="font-medium text-slate-700">Customer QR link</p>
      <p className="mt-0.5 font-mono text-indigo-700">{path}</p>
      <p className="mt-1 break-all text-slate-500">{fullUrl}</p>
      <p className="mt-1 text-slate-400">
        Opens <strong>{storeName}</strong> — orders are tied to this store.
      </p>
    </div>
  );
}
