import { CARD_BLEED, CARD_H, CARD_W, type TokenBoxV1 } from "./design-v1";

/**
 * Print sheets for the xTool UV printer.
 *
 * Tokens are printed onto pre-cut 63 × 88 mm cards (the backs of real cards,
 * or blank stock) held in a jig on the printer bed, so nothing is cut after
 * printing. A sheet is one image the size of the whole platter with each card's
 * front at its jig position, plus matching varnish and white-base masks and a
 * jig template, all on the same canvas so they line up when placed at the
 * platter origin in xTool Studio.
 *
 * Each card is printed at trim size plus a small overprint, so slight jig play
 * never leaves a bare edge; the snapshot's 3 mm bleed supplies those pixels.
 */

export type TokenPlatterIdV1 = "large" | "small";

export const TOKEN_PLATTERS_V1: ReadonlyArray<{ id: TokenPlatterIdV1; label: string; widthMm: number; heightMm: number }> = [
  { id: "large", label: "Large platter (330 × 420 mm)", widthMm: 330, heightMm: 420 },
  { id: "small", label: "Standard platter (330 × 122 mm)", widthMm: 330, heightMm: 122 },
];

export const TOKEN_CARD_W_MM = CARD_W / 10;
export const TOKEN_CARD_H_MM = CARD_H / 10;
/** Standard trading-card corner radius (1/8 in). */
export const TOKEN_CARD_CORNER_MM = 3.175;

export type TokenSheetOrientationV1 = "auto" | "portrait" | "landscape";

export type TokenSheetOptionsV1 = {
  platter: TokenPlatterIdV1;
  /** Space between cards: the jig's walls. */
  gapMm: number;
  /** Space from the platter edge to the first card. */
  marginMm: number;
  /** How far the print runs past each card edge. */
  overprintMm: number;
  orientation: TokenSheetOrientationV1;
};

export const TOKEN_SHEET_DEFAULTS_V1: TokenSheetOptionsV1 = {
  platter: "large",
  gapMm: 4,
  marginMm: 5,
  overprintMm: 0.5,
  orientation: "auto",
};

/** One card position on the bed, in mm from the platter's top-left corner. */
export type TokenSheetSlotV1 = { index: number; xMm: number; yMm: number; wMm: number; hMm: number };

export type TokenSheetLayoutV1 = {
  widthMm: number;
  heightMm: number;
  /** Landscape cells hold cards turned 90° clockwise. */
  rotated: boolean;
  cols: number;
  rows: number;
  slots: TokenSheetSlotV1[];
};

function grid(widthMm: number, heightMm: number, cellW: number, cellH: number, gap: number, margin: number) {
  const cols = Math.max(0, Math.floor((widthMm - margin * 2 + gap) / (cellW + gap)));
  const rows = Math.max(0, Math.floor((heightMm - margin * 2 + gap) / (cellH + gap)));
  return { cols, rows, count: cols * rows };
}

/** Lays as many cards as fit, centred on the platter. */
export function tokenSheetLayoutV1(options: TokenSheetOptionsV1): TokenSheetLayoutV1 {
  const platter = TOKEN_PLATTERS_V1.find((p) => p.id === options.platter) ?? TOKEN_PLATTERS_V1[0]!;
  const { widthMm, heightMm } = platter;
  const gap = Math.max(0, options.gapMm);
  const margin = Math.max(0, options.marginMm);
  const portrait = grid(widthMm, heightMm, TOKEN_CARD_W_MM, TOKEN_CARD_H_MM, gap, margin);
  const landscape = grid(widthMm, heightMm, TOKEN_CARD_H_MM, TOKEN_CARD_W_MM, gap, margin);
  const rotated =
    options.orientation === "landscape" || (options.orientation === "auto" && landscape.count > portrait.count);
  const g = rotated ? landscape : portrait;
  const cellW = rotated ? TOKEN_CARD_H_MM : TOKEN_CARD_W_MM;
  const cellH = rotated ? TOKEN_CARD_W_MM : TOKEN_CARD_H_MM;
  const usedW = g.cols * cellW + Math.max(0, g.cols - 1) * gap;
  const usedH = g.rows * cellH + Math.max(0, g.rows - 1) * gap;
  const x0 = (widthMm - usedW) / 2;
  const y0 = (heightMm - usedH) / 2;
  const slots: TokenSheetSlotV1[] = [];
  for (let r = 0; r < g.rows; r += 1) {
    for (let c = 0; c < g.cols; c += 1) {
      slots.push({
        index: slots.length,
        xMm: round2(x0 + c * (cellW + gap)),
        yMm: round2(y0 + r * (cellH + gap)),
        wMm: cellW,
        hMm: cellH,
      });
    }
  }
  return { widthMm, heightMm, rotated, cols: g.cols, rows: g.rows, slots };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type TokenVarnishModeV1 = "foil" | "art" | "card" | "none";

export const TOKEN_VARNISH_MODES_V1: ReadonlyArray<{ id: TokenVarnishModeV1; label: string }> = [
  { id: "foil", label: "Gloss on the art of Foil-finish cards" },
  { id: "art", label: "Gloss on the art of every card" },
  { id: "card", label: "Gloss over every whole card" },
  { id: "none", label: "No varnish" },
];

/** One printed card on a sheet. */
export type TokenSheetItemV1 = {
  frontUrl: string;
  finish: string;
  /** The art's area on the trimmed card, in card units. */
  artArea: TokenBoxV1 | null;
  label: string;
};

/** Splits items over as many sheets as needed, in order. */
export function paginateTokenSheetV1<T>(items: readonly T[], perSheet: number): T[][] {
  if (perSheet <= 0) return [];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perSheet) pages.push(items.slice(i, i + perSheet));
  return pages;
}

export function tokenSheetPixelsV1(layout: TokenSheetLayoutV1, dpi: number): { width: number; height: number } {
  return { width: Math.round((layout.widthMm / 25.4) * dpi), height: Math.round((layout.heightMm / 25.4) * dpi) };
}

// --- browser rendering ---------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

/** Runs `draw` in a card's slot with card-mm coordinates (0..63 × 0..88), turned for landscape cells. */
function inCardSpace(ctx: Ctx, slot: TokenSheetSlotV1, rotated: boolean, pxPerMm: number, draw: () => void) {
  ctx.save();
  ctx.translate(slot.xMm * pxPerMm, slot.yMm * pxPerMm);
  ctx.scale(pxPerMm, pxPerMm);
  if (rotated) {
    ctx.translate(TOKEN_CARD_H_MM, 0);
    ctx.rotate(Math.PI / 2);
  }
  draw();
  ctx.restore();
}

export type TokenSheetLayerV1 = "color" | "varnish" | "white" | "preview";

/**
 * Draws one sheet layer. `color` is the artwork; `varnish` and `white` are
 * black-on-transparent masks of where those inks go; `preview` is the colour
 * layer with card outlines, for checking on screen.
 */
export function drawTokenSheetV1(
  ctx: Ctx,
  input: {
    layout: TokenSheetLayoutV1;
    items: ReadonlyArray<{ item: TokenSheetItemV1; image: CanvasImageSource | null }>;
    pxPerMm: number;
    overprintMm: number;
    layer: TokenSheetLayerV1;
    varnish: TokenVarnishModeV1;
  },
) {
  const { layout, pxPerMm, overprintMm, layer } = input;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (layer === "preview") {
    ctx.fillStyle = "#f4f4f2";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  const op = Math.max(0, Math.min(CARD_BLEED / 10, overprintMm));
  const bleedMm = CARD_BLEED / 10;

  input.items.forEach(({ item, image }, i) => {
    const slot = layout.slots[i];
    if (!slot) return;
    inCardSpace(ctx, slot, layout.rotated, pxPerMm, () => {
      if (layer === "color" || layer === "preview") {
        if (!image) return;
        const img = image as CanvasImageSource & { width: number; height: number };
        const srcPerMm = img.width / (TOKEN_CARD_W_MM + bleedMm * 2);
        const inset = (bleedMm - op) * srcPerMm;
        ctx.drawImage(
          image,
          inset,
          inset,
          img.width - inset * 2,
          img.height - inset * 2,
          -op,
          -op,
          TOKEN_CARD_W_MM + op * 2,
          TOKEN_CARD_H_MM + op * 2,
        );
        if (layer === "preview") {
          ctx.strokeStyle = "rgba(220,30,60,0.9)";
          ctx.lineWidth = 0.35;
          roundedRectMm(ctx, 0, 0, TOKEN_CARD_W_MM, TOKEN_CARD_H_MM, TOKEN_CARD_CORNER_MM);
          ctx.stroke();
        }
        return;
      }
      ctx.fillStyle = "#000000";
      if (layer === "white") {
        ctx.fillRect(-op, -op, TOKEN_CARD_W_MM + op * 2, TOKEN_CARD_H_MM + op * 2);
        return;
      }
      const mode = input.varnish;
      if (mode === "none" || (mode === "foil" && item.finish !== "foil")) return;
      if (mode === "card" || !item.artArea) {
        roundedRectMm(ctx, 0.6, 0.6, TOKEN_CARD_W_MM - 1.2, TOKEN_CARD_H_MM - 1.2, TOKEN_CARD_CORNER_MM);
        ctx.fill();
        return;
      }
      const a = item.artArea;
      ctx.fillRect(a.x / 10, a.y / 10, a.w / 10, a.h / 10);
    });
  });

  if (layer === "preview") {
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    for (const slot of layout.slots.slice(input.items.length)) {
      ctx.strokeRect(slot.xMm * pxPerMm, slot.yMm * pxPerMm, slot.wMm * pxPerMm, slot.hMm * pxPerMm);
    }
    ctx.setLineDash([]);
  }
}

function roundedRectMm(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The jig as an SVG in millimetres: the platter outline, one rounded pocket per
 * card (with clearance so cards drop in), and slot numbers. Cut it from
 * acrylic or board so the pockets sit where the sheet prints.
 */
export function tokenJigSvgV1(layout: TokenSheetLayoutV1, clearanceMm = 0.3): string {
  const w = layout.widthMm;
  const h = layout.heightMm;
  const r = TOKEN_CARD_CORNER_MM;
  const pockets = layout.slots
    .map((s) => {
      const x = round2(s.xMm - clearanceMm);
      const y = round2(s.yMm - clearanceMm);
      const pw = round2(s.wMm + clearanceMm * 2);
      const ph = round2(s.hMm + clearanceMm * 2);
      return [
        `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${r}" ry="${r}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`,
        `<text x="${round2(s.xMm + s.wMm / 2)}" y="${round2(s.yMm + s.hMm / 2)}" font-size="6" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#0000ff">${s.index + 1}</text>`,
      ].join("");
    })
    .join("\n  ");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,
    `  <!-- Red: cut lines. Blue: slot numbers (engrave or skip). Cards are ${TOKEN_CARD_W_MM} x ${TOKEN_CARD_H_MM} mm${layout.rotated ? ", turned 90° clockwise" : ""}. -->`,
    `  <rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`,
    `  ${pockets}`,
    `</svg>`,
  ].join("\n");
}

// --- PNG resolution metadata ----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Adds a pHYs chunk so the PNG opens at its true physical size (canvas PNGs
 * carry no DPI, and most tools then assume 72 or 96).
 */
export function pngWithDpiV1(png: Uint8Array, dpi: number): Uint8Array {
  const IHDR_END = 8 + 25;
  if (png.length < IHDR_END) return png;
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, IHDR_END), 0);
  out.set(chunk, IHDR_END);
  out.set(png.subarray(IHDR_END), IHDR_END + chunk.length);
  return out;
}
