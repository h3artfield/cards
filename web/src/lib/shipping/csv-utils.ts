/** Parse CSV text into rows; preserves quoted fields and leading zeros in ZIP codes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      continue;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialize rows to UTF-8 CSV with proper escaping. */
export function stringifyCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => escapeCsvField(cell ?? "")).join(","))
    .join("\r\n");
}

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9#]+/g, "");
}

/** Build header index map tolerant of TCGplayer / USPS header variations. */
export function buildHeaderIndex(headers: string[]): Map<string, number> {
  const index = new Map<string, number>();
  headers.forEach((h, i) => {
    index.set(normalizeHeader(h), i);
  });
  return index;
}

export function getCell(
  row: string[],
  index: Map<string, number>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const idx = index.get(normalizeHeader(key));
    if (idx != null && row[idx] != null) {
      return String(row[idx]).trim();
    }
  }
  return "";
}

/** Preserve ZIP as text — pad 4-digit US ZIPs that lost leading zero. */
export function normalizePostalCode(raw: string, country: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const countryNorm = country.trim().toUpperCase();
  if (
    countryNorm === "US" ||
    countryNorm === "USA" ||
    countryNorm === "UNITED STATES" ||
    !countryNorm
  ) {
    if (/^\d{4}(-\d{4})?$/.test(trimmed)) {
      return `0${trimmed}`;
    }
  }

  return trimmed;
}

export function normalizeCountry(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (!v || v === "US" || v === "USA" || v === "UNITED STATES") return "US";
  return v;
}

export function parseMoney(raw: string): number {
  let trimmed = raw.trim();
  if (!trimmed) return 0;

  // Excel/TCGplayer locale exports sometimes use comma as the decimal separator.
  const numericOnly = trimmed.replace(/[^0-9,.-]/g, "");
  if (numericOnly.includes(",") && !numericOnly.includes(".")) {
    trimmed = numericOnly.replace(",", ".");
  } else {
    trimmed = numericOnly;
  }

  const cleaned = trimmed.replace(/[^0-9.-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Strip UTF-8 BOM so the first CSV header matches expected names. */
export function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseWeightOz(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function splitWeightOz(totalOz: number): { lbs: number; oz: number } {
  const safe = Math.max(0, totalOz);
  const lbs = Math.floor(safe / 16);
  const oz = Math.round((safe - lbs * 16) * 100) / 100;
  return { lbs, oz };
}

export function formatOz(oz: number): string {
  return `${oz.toFixed(2)} oz`;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
