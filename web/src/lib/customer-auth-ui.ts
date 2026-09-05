/**
 * Customer auth UI — sign-in, password reset and email verification.
 *
 * These pages used to be their own black-and-white island: pure `bg-black`,
 * white-on-black buttons, `neutral-*` greys. They now draw on the application
 * palette in globals.css, so a customer moving between auth, the storefront and
 * their dashboard sees one surface instead of three.
 */

export const authPage = "min-h-screen bg-[var(--ink-850)] text-[var(--text)]";
export const authContainer = "mx-auto flex min-h-screen max-w-md flex-col px-6 py-10";
export const authHeading = "text-2xl font-semibold tracking-tight text-[var(--text-hi)]";
export const authSubtext = "text-sm leading-relaxed text-[var(--text-lo)]";
export const authLabel = "block text-xs font-medium uppercase tracking-wide text-[var(--text-lo)]";
export const authInput =
  "mt-2 w-full rounded-md border border-[var(--line-subtle)] bg-[var(--ink-900)] px-4 py-3 text-[16px] text-[var(--text-hi)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] outline-none transition placeholder:text-[var(--text-lo)] focus:border-[var(--accent-lo)] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4),0_0_0_3px_var(--accent-wash)]";
export const authLink =
  "text-sm text-[var(--text)] underline underline-offset-4 transition hover:text-[var(--accent-hi)]";
export const authError =
  "rounded-md border border-[var(--bad-line)] bg-[var(--bad-wash)] px-4 py-3 text-sm text-[var(--bad)]";
/**
 * Solid accent with near-black text. A filled gold button is the highest
 * contrast element available on this ground, which is what a page's single
 * primary action should be.
 */
export const authButton =
  "w-full rounded-md bg-[var(--accent)] px-4 py-3.5 text-center text-sm font-semibold uppercase tracking-wide text-[var(--ink-900)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:bg-[var(--accent-hi)] disabled:opacity-50";
export const authButtonSecondary =
  "w-full rounded-md border border-[var(--line)] bg-[var(--ink-750)] px-4 py-3.5 text-center text-sm font-semibold uppercase tracking-wide text-[var(--text-hi)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-[var(--line-strong)] disabled:opacity-50";
