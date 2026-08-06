/** OpenAI embed limit is 8192; stay under with margin for estimate error. */
export const MAX_EMBED_TOKENS = 6000;

/** Rough token estimate when tiktoken is not wired (≈4 chars per token for English). */
export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Split long text into embed-safe pieces with sentence/paragraph overlap. */
export function splitToMaxEmbedSize(
  text: string,
  maxTokens: number = MAX_EMBED_TOKENS,
  overlapChars = 200,
): string[] {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return [text];

  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (lastBreak > maxChars * 0.4) end = start + lastBreak + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }
  return out;
}
