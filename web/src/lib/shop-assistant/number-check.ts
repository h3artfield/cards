/**
 * Checks the figures in a sentence the model wrote against the figures the
 * store's own lookups returned. The model is told never to invent a number;
 * this is the check that it did not.
 *
 * A figure is supported when it appears in the sources. Two kinds may also be
 * worked out, because a clerk would say "up $12 on yesterday" or "that's 40%
 * of the week":
 *   - a dollar amount that is the sum or difference of two dollar amounts in
 *     the sources;
 *   - a percentage that is one source figure as a share of, or change from,
 *     another of the same kind.
 * A plain count ("37 cards") has to appear in the sources as written.
 */

type Kind = "money" | "percent" | "plain";
type Figure = { text: string; value: number; decimals: number; kind: Kind };

const NUMBER = /(\$\s?)?(\d[\d,]*(?:\.\d+)?)(\s?%)?/g;

export function figuresIn(text: string): Figure[] {
  // Dates, clock times and card numbers are not store figures.
  const cleaned = text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/#\d+\b/g, " ");
  const found: Figure[] = [];
  for (const match of cleaned.matchAll(NUMBER)) {
    const raw = match[2]!.replace(/,/g, "");
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const dot = raw.indexOf(".");
    found.push({
      text: match[0].trim(),
      value,
      decimals: dot < 0 ? 0 : raw.length - dot - 1,
      kind: match[1] ? "money" : match[3] ? "percent" : "plain",
    });
  }
  return found;
}

function close(a: number, b: number, decimals: number): boolean {
  return Math.abs(a - b) <= 0.5 * 10 ** -decimals + 1e-9;
}

/**
 * Figures in `text` that the sources do not support, as written. Empty means
 * every figure checks out.
 */
export function unsupportedFigures(text: string, sources: string[]): string[] {
  const known = sources.flatMap(figuresIn);
  const all = new Set(known.map((f) => f.value));
  const money = [...new Set(known.filter((f) => f.kind === "money").map((f) => f.value))];
  const plain = [...new Set(known.filter((f) => f.kind === "plain").map((f) => f.value))];
  const missing: string[] = [];

  const pairs = (values: number[], test: (a: number, b: number) => boolean) =>
    values.some((a) => values.some((b) => test(a, b)));

  for (const figure of figuresIn(text)) {
    const { value, decimals, kind } = figure;
    if (all.has(value)) continue;
    let derived = false;
    if (kind === "money") {
      derived = pairs(money, (a, b) => close(a + b, value, decimals) || close(a - b, value, decimals));
    } else if (kind === "percent") {
      const share = (a: number, b: number) =>
        b !== 0 && (close((a / b) * 100, value, decimals) || close(((a - b) / b) * 100, value, decimals));
      derived = pairs(money, share) || pairs(plain, share);
    }
    if (!derived && !missing.includes(figure.text)) missing.push(figure.text);
  }
  return missing;
}
