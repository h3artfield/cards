"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps a finished deck on screen when one child throws.
 *
 * The completed-build panel used to take down the whole route: a missing
 * Head Professor field became a client exception, Next.js swapped the page
 * for "this page can't be loaded", and the list the customer just waited
 * for was gone.
 */
export class ProfessorClientErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle?: string; fallbackBody?: string },
  { failed: boolean; message: string | null }
> {
  state = { failed: false, message: null as string | null };

  static getDerivedStateFromError(error: Error): { failed: boolean; message: string | null } {
    return { failed: true, message: error?.message?.trim() || null };
  }

  componentDidCatch(error: Error) {
    console.error("[professor-panel] client render failed", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="professor-mtg-card mx-auto max-w-2xl border-red-900/40 p-6">
          <p className="professor-mtg-label text-red-300/90">
            {this.props.fallbackTitle ?? "The deck is ready, but this panel hit an error"}
          </p>
          <p className="mt-2 text-sm text-[var(--mtg-parchment-muted)]">
            {this.props.fallbackBody ??
              "Refresh the page to try again. Your build was saved — the list is not lost."}
          </p>
          {this.state.message ? (
            <p className="professor-mtg-muted mt-3 break-words font-mono text-[11px]">
              {this.state.message}
            </p>
          ) : null}
        </div>
      );
    }
    return this.props.children;
  }
}
