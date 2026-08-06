import { readFileSync } from "fs";
import { parseCsv } from "../../../src/lib/shipping/csv-utils";

export function parseCsvRecords(filePath: string): Record<string, string>[] {
  const text = readFileSync(filePath, "utf8");
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const headers = rows[0]!.map((h) => h.trim());
  const out: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    const rec: Record<string, string> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c++) {
      const val = (cells[c] ?? "").trim();
      if (val) hasValue = true;
      rec[headers[c]!] = val;
    }
    if (hasValue) out.push(rec);
  }

  return out;
}

export function splitPipeList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function splitCommaList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
