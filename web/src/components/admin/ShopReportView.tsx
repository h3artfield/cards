"use client";

import { asOfLabel } from "@/lib/shop-assistant/detect";
import type { ShopReportView as Report } from "@/lib/shop-assistant/chat-client";

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const day = (iso: string) => dayFormat.format(new Date(`${iso}T12:00:00Z`));

/**
 * A report on a page of its own: summary, any cautions, then each section's
 * table. Everything is rendered as text. When printed, only this element is
 * shown (see the style block), so the admin's menus stay off the paper.
 */
export function ShopReportView({ report }: { report: Report }) {
  const asOf = asOfLabel(report.asOf);
  const lookedUp = new Date(report.asOf);
  return (
    <article id="shop-report" className="mx-auto max-w-4xl rounded-xl border bg-white p-6 text-slate-900 shadow-sm">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #shop-report, #shop-report * { visibility: visible !important; }
          #shop-report { position: absolute; left: 0; top: 0; width: 100%; max-width: none; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; color: #000; background: #fff; }
          /* The admin theme remaps the slate colours to light shades for its dark
             screens. On paper they must be Tailwind's own dark-on-white values. */
          #shop-report {
            --color-slate-100: #f1f5f9; --color-slate-200: #e2e8f0; --color-slate-300: #cbd5e1;
            --color-slate-500: #64748b; --color-slate-600: #475569; --color-slate-700: #334155;
            --color-slate-800: #1e293b; --color-slate-900: #0f172a;
          }
          #shop-report .report-no-print { display: none !important; }
          #shop-report section { break-inside: avoid; }
          #shop-report tr { break-inside: avoid; }
        }
      `}</style>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{report.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {report.period
              ? report.period.from === report.period.to
                ? `${day(report.period.from)}. `
                : `${day(report.period.from)} to ${day(report.period.to)}. `
              : ""}
            {Number.isFinite(lookedUp.getTime())
              ? `Looked up ${lookedUp.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}${asOf ? ` at ${asOf}` : ""}.`
              : ""}
          </p>
        </div>
        <button
          type="button"
          className="report-no-print rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          onClick={() => window.print()}
        >
          Print
        </button>
      </header>

      <p className="mt-4 whitespace-pre-wrap text-sm text-slate-800">{report.summary}</p>

      {report.cautions.length > 0 ? (
        <div className="mt-3 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
          {report.cautions.map((caution, i) => (
            <p key={i}>{caution}</p>
          ))}
        </div>
      ) : null}

      {report.sections.map((section, index) => (
        <section key={index} className="mt-6 border-t border-slate-200 pt-4">
          <h2 className="text-sm font-semibold text-slate-900">{section.heading}</h2>
          {section.comment ? <p className="mt-1 text-sm text-slate-800">{section.comment}</p> : null}
          {section.answer.lines.map((line, i) => (
            <p key={i} className="mt-1 text-sm text-slate-600">
              {line}
            </p>
          ))}
          {section.answer.columns && section.answer.rows && section.answer.rows.length > 0 ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    {section.answer.columns.map((column) => (
                      <th key={column} className="py-1 pr-3 font-medium">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.answer.rows.map((cells, r) => (
                    <tr key={r} className="border-t border-slate-100">
                      {cells.map((cell, c) => (
                        <td key={c} className={`py-1.5 pr-3 ${c === 0 ? "font-medium text-slate-800" : "text-slate-600"}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {section.answer.note ? <p className="mt-2 text-xs text-slate-500">{section.answer.note}</p> : null}
        </section>
      ))}

      <p className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-500">
        Tables come straight from the store&apos;s records. The summary and comments were written by the assistant.
      </p>
    </article>
  );
}
