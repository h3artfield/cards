"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const ITEMS = [
  { id: "rules", label: "Rules", href: "/admin/pricing?section=rules", pricingSection: true },
  { id: "buy", label: "Buy %", href: "/admin/pricing?section=buy", pricingSection: true },
  {
    id: "conditions",
    label: "Conditions",
    href: "/admin/pricing?section=conditions",
    pricingSection: true,
  },
  {
    id: "providers",
    label: "Providers",
    href: "/admin/pricing?section=providers",
    pricingSection: true,
  },
  { id: "v2-knowledge", label: "V2 Knowledge", href: "/admin/v2/knowledge", pricingSection: false },
  {
    id: "v2-review",
    label: "V2 review",
    href: "/admin/v2/review",
    pricingSection: false,
  },
  {
    id: "staff-queue",
    label: "Staff queue",
    href: "/admin/v2/staff-confirmation",
    pricingSection: false,
  },
] as const;

export function AdminPricingHeader() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900">Pricing</h2>
      <p className="mt-1 text-sm text-slate-600">
        Store rules, buy percentages, condition multipliers, data providers, and V2 reference
        guides.
      </p>
    </div>
  );
}

function AdminPricingSubNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = searchParams.get("section") ?? "rules";

  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {ITEMS.map((item) => {
        const isActive = item.pricingSection
          ? pathname === "/admin/pricing" && section === item.id
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function AdminPricingSubNav() {
  return (
    <Suspense fallback={<div className="h-10" aria-hidden />}>
      <AdminPricingSubNavInner />
    </Suspense>
  );
}
