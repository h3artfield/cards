"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Shell for the panels that used to be stacked underneath the decklist.
 *
 * The bracket read-out, the swap suggestions and the Professor's changelog were
 * each a permanently expanded section, which pushed the actual deck most of a
 * screen down the page. They are reference material consulted occasionally
 * rather than while editing, so they live behind buttons now and the deck gets
 * the space back.
 */
export function DeckInsightDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="professor-mtg-page professor-mtg-modal professor-mtg-chamber__inner relative z-10 my-auto max-h-[85vh] w-full max-w-3xl overflow-y-auto p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="professor-mtg-label">{title}</p>
            {subtitle ? (
              <p className="professor-mtg-muted mt-1 text-xs leading-relaxed">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="professor-mtg-link shrink-0 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
