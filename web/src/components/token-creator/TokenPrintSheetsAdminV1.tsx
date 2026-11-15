"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { TokenBoxV1 } from "@/lib/token-creator/design-v1";
import {
  drawTokenSheetV1,
  paginateTokenSheetV1,
  pngWithDpiV1,
  TOKEN_PLATTERS_V1,
  TOKEN_SHEET_DEFAULTS_V1,
  TOKEN_VARNISH_MODES_V1,
  tokenJigSvgV1,
  tokenSheetLayoutV1,
  tokenSheetPixelsV1,
  type TokenSheetItemV1,
  type TokenSheetLayerV1,
  type TokenSheetLayoutV1,
  type TokenSheetOptionsV1,
  type TokenVarnishModeV1,
} from "@/lib/token-creator/print-sheet-v1";

const DPI = 300;
const PREVIEW_WIDTH = 330;

export type TokenSheetOrderV1 = {
  orderId: string;
  title: string;
  productionState: string;
  lines: Array<{
    snapshotId: string;
    name: string;
    quantity: number;
    frontUrl: string;
    finish?: string;
    artArea?: TokenBoxV1 | null;
  }>;
};

const bitmapCache = new Map<string, Promise<ImageBitmap>>();

function loadBitmap(url: string): Promise<ImageBitmap> {
  let p = bitmapCache.get(url);
  if (!p) {
    p = adminFetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load a print file");
        return res.blob();
      })
      .then((blob) => createImageBitmap(blob));
    p.catch(() => bitmapCache.delete(url));
    bitmapCache.set(url, p);
  }
  return p;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function renderSheetPng(
  layout: TokenSheetLayoutV1,
  items: TokenSheetItemV1[],
  layer: TokenSheetLayerV1,
  overprintMm: number,
  varnish: TokenVarnishModeV1,
): Promise<Blob> {
  const images = await Promise.all(items.map((it) => (layer === "color" ? loadBitmap(it.frontUrl) : Promise.resolve(null))));
  const size = tokenSheetPixelsV1(layout, DPI);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  drawTokenSheetV1(ctx, {
    layout,
    items: items.map((item, i) => ({ item, image: images[i] ?? null })),
    pxPerMm: DPI / 25.4,
    overprintMm,
    layer,
    varnish,
  });
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the sheet"))), "image/png"),
  );
  const bytes = pngWithDpiV1(new Uint8Array(await blob.arrayBuffer()), DPI);
  return new Blob([bytes as BlobPart], { type: "image/png" });
}

function SheetPreview({
  layout,
  items,
  overprintMm,
}: {
  layout: TokenSheetLayoutV1;
  items: TokenSheetItemV1[];
  overprintMm: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pxPerMm = PREVIEW_WIDTH / layout.widthMm;
  useEffect(() => {
    let active = true;
    void Promise.all(items.map((it) => loadBitmap(it.frontUrl).catch(() => null))).then((images) => {
      const canvas = ref.current;
      if (!active || !canvas) return;
      canvas.width = Math.round(layout.widthMm * pxPerMm * 2);
      canvas.height = Math.round(layout.heightMm * pxPerMm * 2);
      drawTokenSheetV1(canvas.getContext("2d")!, {
        layout,
        items: items.map((item, i) => ({ item, image: images[i] ?? null })),
        pxPerMm: pxPerMm * 2,
        overprintMm,
        layer: "preview",
        varnish: "none",
      });
    });
    return () => {
      active = false;
    };
  }, [layout, items, overprintMm, pxPerMm]);
  return (
    <canvas
      ref={ref}
      className="rounded border border-gray-300"
      style={{ width: PREVIEW_WIDTH, height: Math.round(layout.heightMm * pxPerMm) }}
      aria-label="Sheet preview"
    />
  );
}

/**
 * Builds platter-sized print sheets from paid orders for the xTool UV
 * printer: the artwork, a varnish mask, a white-base mask and a jig template,
 * all aligned to the platter's top-left corner.
 */
export function TokenPrintSheetsAdminV1({
  orders,
  onMarkPrinting,
}: {
  orders: TokenSheetOrderV1[];
  onMarkPrinting: (orderIds: string[]) => Promise<void>;
}) {
  const printable = useMemo(
    () => orders.filter((o) => o.productionState === "paid" || o.productionState === "ready" || o.productionState === "printing"),
    [orders],
  );
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [options, setOptions] = useState<TokenSheetOptionsV1>(TOKEN_SHEET_DEFAULTS_V1);
  const [varnish, setVarnish] = useState<TokenVarnishModeV1>("foil");
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPicked = (o: TokenSheetOrderV1) => picked[o.orderId] ?? o.productionState !== "printing";
  const selected = useMemo(
    () => printable.filter((o) => picked[o.orderId] ?? o.productionState !== "printing"),
    [printable, picked],
  );
  const layout = useMemo(() => tokenSheetLayoutV1(options), [options]);
  const items = useMemo<TokenSheetItemV1[]>(
    () =>
      selected.flatMap((o) =>
        o.lines.flatMap((l) =>
          Array.from({ length: l.quantity }, () => ({
            frontUrl: l.frontUrl,
            finish: l.finish ?? "none",
            artArea: l.artArea ?? null,
            label: `${o.title} · ${l.name}`,
          })),
        ),
      ),
    [selected],
  );
  const sheets = useMemo(() => paginateTokenSheetV1(items, layout.slots.length), [items, layout]);
  const platter = TOKEN_PLATTERS_V1.find((p) => p.id === options.platter)!;
  const prefix = `tokens-${options.platter}-${new Date().toISOString().slice(0, 10)}`;

  const set = <K extends keyof TokenSheetOptionsV1>(key: K, value: TokenSheetOptionsV1[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));
  const num = (value: string, min: number, max: number, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  async function run(key: string, task: () => Promise<void>) {
    setWorking(key);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setWorking(null);
    }
  }

  const sheetHasVarnish = (sheet: TokenSheetItemV1[]) =>
    varnish !== "none" && (varnish !== "foil" || sheet.some((it) => it.finish === "foil"));

  if (!printable.length) return null;

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-gray-900">Print sheets (xTool UV)</h2>
      <p className="mt-1 text-sm text-gray-700">
        Lays paid cards out on a platter for printing onto pre-cut 63×88 mm cards in a jig — the backs of real cards or
        blank stock. Every file is the full platter at {DPI} DPI, so place each one at the platter&apos;s top-left corner
        (X 0, Y 0) in xTool Studio and they line up.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-600">Orders on these sheets</legend>
            <ul className="mt-1 space-y-1">
              {printable.map((o) => {
                const count = o.lines.reduce((n, l) => n + l.quantity, 0);
                return (
                  <li key={o.orderId}>
                    <label className="flex items-center gap-2 text-sm text-gray-900">
                      <input
                        type="checkbox"
                        checked={isPicked(o)}
                        onChange={(e) => setPicked((p) => ({ ...p, [o.orderId]: e.target.checked }))}
                      />
                      {o.title} · {count} card{count === 1 ? "" : "s"}
                      {o.productionState === "printing" ? <span className="text-xs text-gray-600">(already printing)</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-900">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Platter</span>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5"
                value={options.platter}
                onChange={(e) => set("platter", e.target.value as TokenSheetOptionsV1["platter"])}
              >
                {TOKEN_PLATTERS_V1.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-900">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Card direction</span>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5"
                value={options.orientation}
                onChange={(e) => set("orientation", e.target.value as TokenSheetOptionsV1["orientation"])}
              >
                <option value="auto">Whichever fits most</option>
                <option value="portrait">Upright</option>
                <option value="landscape">Sideways</option>
              </select>
            </label>
            <label className="text-sm text-gray-900">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Gap between cards (mm)</span>
              <input
                type="number"
                step={0.5}
                min={0}
                max={20}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5"
                value={options.gapMm}
                onChange={(e) => set("gapMm", num(e.target.value, 0, 20, options.gapMm))}
              />
            </label>
            <label className="text-sm text-gray-900">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Edge margin (mm)</span>
              <input
                type="number"
                step={0.5}
                min={0}
                max={40}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5"
                value={options.marginMm}
                onChange={(e) => set("marginMm", num(e.target.value, 0, 40, options.marginMm))}
              />
            </label>
            <label className="text-sm text-gray-900">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Overprint past card edge (mm)</span>
              <input
                type="number"
                step={0.1}
                min={0}
                max={3}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5"
                value={options.overprintMm}
                onChange={(e) => set("overprintMm", num(e.target.value, 0, 3, options.overprintMm))}
              />
            </label>
            <label className="text-sm text-gray-900">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">Varnish</span>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5"
                value={varnish}
                onChange={(e) => setVarnish(e.target.value as TokenVarnishModeV1)}
              >
                {TOKEN_VARNISH_MODES_V1.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-sm text-gray-700">
            {layout.slots.length
              ? `${layout.cols} × ${layout.rows} = ${layout.slots.length} cards per sheet${layout.rotated ? ", turned sideways" : ""}. `
              : "No cards fit with these settings. "}
            {items.length} card{items.length === 1 ? "" : "s"} selected → {sheets.length} sheet{sheets.length === 1 ? "" : "s"}.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!layout.slots.length}
              onClick={() => download(new Blob([tokenJigSvgV1(layout)], { type: "image/svg+xml" }), `${prefix}-jig.svg`)}
            >
              Jig template (SVG)
            </Button>
            <Button
              variant="secondary"
              disabled={working !== null || !selected.some((o) => o.productionState !== "printing")}
              onClick={() =>
                void run("mark", () => onMarkPrinting(selected.filter((o) => o.productionState !== "printing").map((o) => o.orderId)))
              }
            >
              {working === "mark" ? "Saving…" : "Mark these orders printing"}
            </Button>
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <details className="text-sm text-gray-700">
            <summary className="cursor-pointer font-semibold text-gray-900">Printing in xTool Studio</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                Cut the jig from the SVG (red lines; the pockets have 0.3 mm clearance), lay it in the corner of the{" "}
                {platter.label.toLowerCase()} and drop the cards in.
              </li>
              <li>
                Import the artwork PNG and place it at X 0, Y 0. It is {platter.widthMm} × {platter.heightMm} mm at {DPI} DPI.
              </li>
              <li>
                On white card stock, print CMYK only. On the back of a real card (dark), add white under the colour: use the
                white-base PNG as the white layer, or Studio&apos;s white fill for the image area.
              </li>
              <li>Import the varnish PNG at X 0, Y 0 too and assign it to gloss varnish. Black marks where varnish goes.</li>
              <li>Stamp the original backs afterwards so the tokens can&apos;t be mistaken for real cards.</li>
            </ol>
          </details>
        </div>
      </div>

      {sheets.length ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {sheets.map((sheet, i) => {
            const n = i + 1;
            const name = `${prefix}-sheet${n}`;
            return (
              <li key={i} className="rounded-lg border border-gray-200 p-3">
                <p className="mb-2 text-sm font-semibold text-gray-900">
                  Sheet {n} · {sheet.length} card{sheet.length === 1 ? "" : "s"}
                </p>
                <SheetPreview layout={layout} items={sheet} overprintMm={options.overprintMm} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    disabled={working !== null}
                    onClick={() =>
                      void run(`c${i}`, async () =>
                        download(await renderSheetPng(layout, sheet, "color", options.overprintMm, varnish), `${name}-artwork.png`),
                      )
                    }
                  >
                    {working === `c${i}` ? "Rendering…" : "Artwork PNG"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={working !== null || !sheetHasVarnish(sheet)}
                    onClick={() =>
                      void run(`v${i}`, async () =>
                        download(await renderSheetPng(layout, sheet, "varnish", options.overprintMm, varnish), `${name}-varnish.png`),
                      )
                    }
                  >
                    {working === `v${i}` ? "Rendering…" : sheetHasVarnish(sheet) ? "Varnish PNG" : "No varnish on this sheet"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={working !== null}
                    onClick={() =>
                      void run(`w${i}`, async () =>
                        download(await renderSheetPng(layout, sheet, "white", options.overprintMm, varnish), `${name}-white.png`),
                      )
                    }
                  >
                    {working === `w${i}` ? "Rendering…" : "White base PNG"}
                  </Button>
                </div>
                <ol className="mt-2 list-decimal pl-5 text-xs text-gray-700">
                  {sheet.map((it, j) => (
                    <li key={j}>{it.label}</li>
                  ))}
                </ol>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
