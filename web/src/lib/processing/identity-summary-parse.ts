/** Parse card identity fields from vision verification prose. */
export function parseCardNameFromIdentitySummary(
  summary: string,
): string | null {
  const trimmed = summary.trim();
  if (!trimmed) return null;

  const patterns = [
    /The card is\s+(.+?)\s+with\s+(?:a\s+)?collector number/i,
    /The card is\s+(.+?)\s+from\s+the\s+/i,
    /The card is\s+(.+?)(?:[.,]|$)/i,
    /(?:confirmed as|identified as)\s+(.+?)(?:[.,]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const name = match?.[1]?.trim();
    if (name && name.length >= 2) return name;
  }

  return null;
}

export function parseSetFromIdentitySummary(summary: string): string | null {
  const match = summary.match(/from the\s+(.+?)\s+set/i);
  return match?.[1]?.trim() ?? null;
}

export function parseNumberFromIdentitySummary(summary: string): string | null {
  const explicit = summary.match(
    /collector number(?:\s+of)?\s+([\d]+(?:\/[\da-z]+)?)/i,
  );
  if (explicit?.[1]) return explicit[1];

  const inline = summary.match(/\b(\d{1,4}\/\d{1,4}[a-z]?)\b/i);
  return inline?.[1] ?? null;
}

export function identityFieldsFromSummary(summary: string): {
  name?: string;
  set?: string;
  number?: string;
} {
  const name = parseCardNameFromIdentitySummary(summary);
  const set = parseSetFromIdentitySummary(summary);
  const number = parseNumberFromIdentitySummary(summary);
  return {
    ...(name ? { name } : {}),
    ...(set ? { set } : {}),
    ...(number ? { number } : {}),
  };
}
