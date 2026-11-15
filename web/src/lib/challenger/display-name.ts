const MIN_LENGTH = 3;
const MAX_LENGTH = 24;

/** Whole-name blocks, compared with spaces and punctuation removed. */
const RESERVED = new Set([
  "admin",
  "administrator",
  "mod",
  "moderator",
  "staff",
  "support",
  "professor",
  "official",
  "system",
  "cardscanner",
  "cardscanner9000",
  "gamelodge",
  "thegamelodge",
]);

/**
 * Compact-form contains. Short ordinary words stay off this list so names
 * like "class" are not rejected.
 */
const BLOCKED_CONTAINS = [
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "kike",
  "chink",
  "spic",
  "cunt",
  "slut",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "porn",
];

export type DisplayNameResult =
  | { ok: true; name: string; key: string }
  | { ok: false; error: string };

export function compactDisplayName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function validateDisplayName(raw: unknown): DisplayNameResult {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) {
    return { ok: false, error: "Display name must be 3 to 24 characters." };
  }
  if (!/^[\p{L}\p{N}](?:[\p{L}\p{N} '’-]*[\p{L}\p{N}])?$/u.test(name)) {
    return {
      ok: false,
      error: "Use letters, numbers, spaces, apostrophes, and hyphens.",
    };
  }
  const key = name.toLowerCase();
  const compact = compactDisplayName(name);
  const reservedHit =
    RESERVED.has(compact) ||
    [...RESERVED].some((word) => word.length >= 6 && compact.includes(word));
  if (!compact || reservedHit || BLOCKED_CONTAINS.some((word) => compact.includes(word))) {
    return { ok: false, error: "That display name is not allowed." };
  }
  return { ok: true, name, key };
}
