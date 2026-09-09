/**
 * Whether a signup should ask which deck the player is bringing.
 *
 * The calendar category is the primary signal, but stores often create
 * Commander nights under "Other" or "Magic" anyway. If the title says
 * "commander bracket 3" and the picker only appears when category ===
 * "commander", the bracket never gets collected and pod seating is blind.
 */
export function eventWantsDeckRegistrationV1(event: {
  category: string;
  title?: string;
  description?: string;
}): boolean {
  if (event.category === "commander") return true;

  const haystack = `${event.title ?? ""} ${event.description ?? ""}`.toLowerCase();
  return (
    /\bcommander\b/.test(haystack) ||
    /\bedh\b/.test(haystack) ||
    /\bcedh\b/.test(haystack) ||
    /\bbracket\s*[1-5]\b/.test(haystack) ||
    /\bbracketed\b/.test(haystack)
  );
}
