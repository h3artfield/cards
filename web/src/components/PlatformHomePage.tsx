"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandedPageShell } from "@/components/BrandedPageShell";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import { glassButton, glassPanel } from "@/lib/glass-styles";
import { storeEntryPath } from "@/lib/store-slug";

type PublicStore = {
  name: string;
  slug: string;
  logoUrl?: string | null;
};

export function PlatformHomePage() {
  const [stores, setStores] = useState<PublicStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d) => setStores(d.stores ?? []))
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <BrandedPageShell card={false}>
      <div className="storefront-theme space-y-4">
        <div className={`${glassPanel} px-8 py-10 text-center`}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-lo)]">
            Card buyback platform
          </p>
          <h1 className="mt-3 text-2xl font-black uppercase tracking-tight text-[var(--text-hi)]">
            Trade-in
          </h1>
          <p className="mt-3 text-sm font-medium text-[var(--text)]">
            Customers: scan the QR code at your local shop, or pick your store
            below.
          </p>
        </div>

        <div className={`${glassPanel} px-6 py-5`}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-lo)]">
            Stores
          </p>
          {loading ? (
            <p className="mt-4 text-sm text-[var(--text-lo)]">Loading stores…</p>
          ) : stores.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-lo)]">No stores configured yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stores.map((store) => (
                <li key={store.slug}>
                  <Link
                    href={storeEntryPath(store.slug)}
                    className={`flex min-h-[4rem] items-center gap-3 px-4 py-3 ${glassButton}`}
                  >
                    <StoreBrandMark
                      storeName={store.name}
                      logoUrl={store.logoUrl}
                      variant="header"
                    />
                    <span className="ml-auto text-xl opacity-80" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${glassPanel} px-6 py-5`}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-lo)]">
            Staff sign in
          </p>
          <div className="mt-3 space-y-2">
            <StaffLink href="/login" title="Store owner login" />
            <StaffLink href="/admin/login" title="Platform admin login" />
          </div>
        </div>
      </div>
    </BrandedPageShell>
  );
}

function StaffLink({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      className={`flex min-h-[3.5rem] items-center justify-between px-5 py-3 text-sm font-bold uppercase tracking-wide ${glassButton}`}
    >
      <span>{title}</span>
      <span className="text-lg opacity-80" aria-hidden>
        →
      </span>
    </Link>
  );
}
