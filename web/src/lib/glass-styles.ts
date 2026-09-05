/**
 * Frosted glass surfaces for customer pages, including those over full-bleed
 * artwork.
 *
 * These were built for light artwork: white borders, white translucent fills,
 * near-black type and white drop-shadows to lift it. On the dark customer
 * surfaces they produced a white card in the middle of the account page and a
 * "Back to home" link that was effectively invisible. The construction is the
 * same — translucent fill, blurred backdrop, one-pixel top highlight — but
 * inverted, so a panel over artwork now reads as smoked glass rather than milk.
 */

/*
 * These fills are darkened well past what a dark page alone would need. The
 * store picker puts them over bright artwork, so a lightly tinted panel let the
 * art through and left the type unreadable. Being opaque enough to establish
 * its own ground is what makes one set of glass styles work on both a dark page
 * and a bright photograph.
 */
export const glassPanel =
  "border border-white/[0.14] bg-black/55 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.5),0_4px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]";

export const glassButton =
  "border border-white/[0.14] bg-black/40 text-[var(--text-hi)] backdrop-blur-xl shadow-[0_4px_14px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.09)] transition-all duration-200 hover:bg-black/55 hover:border-white/25 active:translate-y-0.5";

/** The single primary action, so it gets the accent rather than more glass. */
export const glassButtonPrimary =
  "border border-[var(--accent-lo)] bg-[var(--accent)] text-[var(--ink-900)] shadow-[0_6px_18px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all duration-200 hover:bg-[var(--accent-hi)] active:translate-y-0.5";

export const glassInput =
  "rounded-xl border border-white/[0.14] bg-black/45 text-[var(--text-hi)] backdrop-blur-md shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] placeholder:text-[var(--text-lo)] focus:border-[var(--accent-lo)] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),0_0_0_3px_var(--accent-wash)] focus:outline-none";

export const glassLabel = "text-sm font-semibold text-[var(--text)]";

export const glassHeading = "font-black uppercase tracking-tight text-[var(--text-hi)]";

export const glassSubtext = "text-[var(--text)]";

export const glassLink =
  "font-medium text-[var(--text)] underline decoration-[var(--text-lo)] underline-offset-4 transition hover:text-[var(--accent-hi)] hover:decoration-[var(--accent-hi)]";
