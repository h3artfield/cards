import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { CardLabelV1 } from "./card-label";

/** DYMO 30336: 2-1/8" × 1", fed landscape. One label per page, in points. */
const W = 153;
const H = 72;
const PAD = 4;
const QR = H - PAD * 2;
const TEXT_X = PAD + QR + 5;
const TEXT_W = W - TEXT_X - PAD;
const RIGHT = W - PAD;
const LEADING = 1.12;
const MIN_SCALE = 0.45;

type Block = { text: string; bold: boolean; size: number };

function wrap(doc: jsPDF, block: Block, scale: number): string[] {
  doc.setFont("helvetica", block.bold ? "bold" : "normal");
  doc.setFontSize(block.size * scale);
  return doc.splitTextToSize(block.text, TEXT_W) as string[];
}

/** Largest scale at which every block wraps into the space above the location. */
function layout(doc: jsPDF, blocks: Block[], location: Block | null) {
  for (let scale = 1; ; scale = Math.max(MIN_SCALE, scale - 0.05)) {
    const lines = blocks.map((b) => wrap(doc, b, scale));
    const locLines = location ? wrap(doc, location, scale) : [];
    const height = blocks.reduce((h, b, i) => h + lines[i].length * b.size * scale * LEADING, 0);
    const locHeight = location ? locLines.length * location.size * scale * LEADING : 0;
    if (height + locHeight + 1 <= H - PAD * 2 || scale === MIN_SCALE) {
      return { scale, lines, locLines };
    }
  }
}

/**
 * Printable sheet for the DYMO LabelWriter: QR on the left; name, set,
 * condition, F/NF (Magic) with rarity and card number, and the shelf location
 * right-aligned on the right, since the label folds over the card's right edge.
 * Text wraps rather than truncating. No price, since prices move nightly.
 */
export async function buildCardLabelPdfV1(
  labels: CardLabelV1[],
  opts: { perCopy: boolean },
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [W, H], compress: true });
  const qrCache = new Map<string, string>();
  let first = true;

  for (const label of labels) {
    const count = opts.perCopy ? Math.max(1, label.copies) : 1;
    let qr = qrCache.get(label.url);
    if (!qr) {
      qr = await QRCode.toDataURL(label.url, { margin: 0, errorCorrectionLevel: "M", width: 240 });
      qrCache.set(label.url, qr);
    }

    const meta = [label.foil, label.rarity, label.number ? `#${label.number}` : ""].filter(Boolean).join(" · ");
    const blocks: Block[] = [
      { text: label.name, bold: true, size: 8 },
      ...[label.setName, label.condition, meta]
        .filter((t): t is string => Boolean(t))
        .map((text) => ({ text, bold: false, size: 6.5 })),
    ];
    const location: Block | null = label.location ? { text: label.location, bold: true, size: 10 } : null;
    const { scale, lines, locLines } = layout(doc, blocks, location);

    for (let n = 0; n < count; n++) {
      if (!first) doc.addPage([W, H], "landscape");
      first = false;
      doc.addImage(qr, "PNG", PAD, PAD, QR, QR);

      let y = PAD;
      blocks.forEach((block, i) => {
        doc.setFont("helvetica", block.bold ? "bold" : "normal");
        doc.setFontSize(block.size * scale);
        for (const line of lines[i]) {
          y += block.size * scale * LEADING;
          doc.text(line, RIGHT, y - block.size * scale * 0.22, { align: "right" });
        }
      });

      if (location) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(location.size * scale);
        const step = location.size * scale * LEADING;
        let ly = H - PAD - 1 - step * (locLines.length - 1);
        for (const line of locLines) {
          doc.text(line, RIGHT, ly, { align: "right" });
          ly += step;
        }
      }
    }
  }
  return doc.output("blob");
}
