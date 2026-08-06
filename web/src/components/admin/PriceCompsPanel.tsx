"use client";

import { useState } from "react";
import type { CardSalesComps } from "@/lib/types";

const PREVIEW_COUNT = 3;

export function PriceCompsPanel({ salesComps }: { salesComps: CardSalesComps }) {
  const [open, setOpen] = useState(false);
  const comps = salesComps.recentSales;
  if (!comps.length) return null;

  const preview = comps.slice(0, PREVIEW_COUNT);
  const previewLabel = preview
    .map((s) => `$${s.price.toFixed(2)}`)
    .join(", ");

  return (
    <div className="rounded-lg border border-gray-200 bg-white text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col px-2.5 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="font-semibold text-gray-800">
            Price comps
            <span className="ml-1.5 font-normal text-gray-500">
              ({comps.length})
            </span>
          </span>
          <span className="text-[10px] font-medium text-indigo-600">
            {open ? "Hide" : "Show all"}
          </span>
        </span>
        {!open && (
          <span className="mt-0.5 text-[10px] text-gray-500">
            {previewLabel}
            {comps.length > PREVIEW_COUNT ? "…" : ""}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-2.5 pb-2.5 pt-1">
          <ul className="max-h-48 space-y-0.5 overflow-y-auto text-gray-700">
            {comps.map((s, i) => (
              <li key={`${s.source}-${s.condition ?? ""}-${i}`}>
                ${s.price.toFixed(2)} · {s.condition ?? s.source}
              </li>
            ))}
          </ul>
          {salesComps.trendNote && (
            <p className="mt-1.5 text-[10px] text-gray-500">
              {salesComps.trendNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
