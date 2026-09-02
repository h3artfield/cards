import type { DecklistMatchResult } from "@/lib/inventory/inventory-decklist-match";

const DISCORD_SAFE = 1900;

export function looksLikeDecklist(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));
  if (lines.length < 2) return false;
  const qtyLines = lines.filter(
    (line) => /^\d+\s+x?\s*.+/i.test(line) || /^.+\s+x\d+$/i.test(line),
  );
  if (qtyLines.length >= 2) return true;
  return lines.length >= 4 && qtyLines.length >= 1;
}

export function inventoryPageUrl(storeSlug: string): string {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://cardscanner9000.com"
  ).replace(/\/$/, "");
  return `${base}/s/${storeSlug}/inventory`;
}

export function formatDecklistDiscordReply(
  result: DecklistMatchResult,
  storeSlug: string,
): string {
  const lines: string[] = [];
  lines.push(`**${result.inStock.length} in stock**`);
  if (result.inStock.length === 0) {
    lines.push("_None of these names are on the shelf right now._");
  } else {
    for (const card of result.inStock.slice(0, 25)) {
      const price =
        card.listPrice != null ? ` — $${card.listPrice.toFixed(2)}` : "";
      const qty = card.qty > 1 ? ` ×${card.qty}` : "";
      lines.push(`• ${card.name}${price}${qty}`);
    }
    if (result.inStock.length > 25) {
      lines.push(`_…and ${result.inStock.length - 25} more in stock._`);
    }
  }

  if (result.outOfStock.length > 0) {
    lines.push("");
    lines.push(`**${result.outOfStock.length} out of stock**`);
    for (const row of result.outOfStock.slice(0, 15)) {
      lines.push(`• ${row.name}`);
    }
    if (result.outOfStock.length > 15) {
      lines.push(`_…and ${result.outOfStock.length - 15} more._`);
    }
  }

  if (result.unmatched.length > 0) {
    lines.push("");
    lines.push(`**${result.unmatched.length} not found in inventory**`);
    for (const name of result.unmatched.slice(0, 10)) {
      lines.push(`• ${name}`);
    }
  }

  lines.push("");
  lines.push(`Browse the shelf: ${inventoryPageUrl(storeSlug)}`);
  return lines.join("\n");
}

export function formatClerkDiscordReply(reply: string, storeSlug: string): string {
  const trimmed = reply.trim() || "I couldn't check stock for that.";
  return `${trimmed}\n\nBrowse the shelf: ${inventoryPageUrl(storeSlug)}`;
}

export function chunkDiscordMessage(text: string): string[] {
  if (text.length <= DISCORD_SAFE) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= DISCORD_SAFE) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf("\n", DISCORD_SAFE);
    if (cut < DISCORD_SAFE / 3) cut = DISCORD_SAFE;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  return chunks;
}
