"use client";

import Link from "next/link";
import { asOfLabel, type ShopAnswerView } from "@/lib/shop-assistant/detect";

/**
 * One answer from the store's own data: title, lines, table, note, link and
 * the time it was looked up. Everything is rendered as text; nothing in an
 * answer is treated as HTML.
 */
export function ShopAnswerPanel({
  answer,
  onNavigate,
  className = "border-b border-slate-200 px-3 py-3",
}: {
  answer: ShopAnswerView;
  onNavigate: () => void;
  /** The frame. The search box and the chat drawer each pass their own. */
  className?: string;
}) {
  const asOf = asOfLabel(answer.asOf);
  return (
    <div className={className} aria-live="polite">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        Your store
      </div>
      <div className="text-sm font-semibold text-slate-900">{answer.title}</div>
      {answer.lines.map((line, i) => (
        <p key={i} className="mt-1 text-sm text-slate-800">
          {line}
        </p>
      ))}
      {answer.columns && answer.rows && answer.rows.length > 0 ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                {answer.columns.map((column) => (
                  <th key={column} className="py-1 pr-3 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {answer.rows.map((cells, r) => (
                <tr key={r} className="border-t border-slate-100">
                  {cells.map((cell, c) => (
                    <td
                      key={c}
                      className={`py-1.5 pr-3 ${c === 0 ? "font-medium text-slate-800" : "text-slate-600"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {answer.note ? <p className="mt-2 text-xs text-slate-500">{answer.note}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
        {answer.href ? (
          <Link
            href={answer.href}
            className="font-medium text-indigo-600 hover:underline"
            onClick={onNavigate}
          >
            {answer.hrefLabel ?? "Open"}
          </Link>
        ) : null}
        {asOf ? <span>As of {asOf}</span> : null}
      </div>
    </div>
  );
}
