import type { CosV1Score } from "@/lib/commander-optimization-score/v1/types";
import type { SolDirectedHeadProfessorWholeDeckVerdictV111 } from "./professor-sol-directed-head-professor-v1-1-1";
import type { ProfessorDeckGradeV4 } from "./professor-deck-grade-v4-v1";
import type { SolDirectedDeckDisplayCard, SolDirectedDeckDisplayCategory } from "./professor-sol-directed-deck-display-v1-1-1";
import {
  buildSolDirectedDeckReportModelV111,
  type DeckReportModelV111,
} from "./professor-sol-directed-deck-report-model-v1-1-1";

const INK = { r: 28, g: 24, b: 18 };
const GOLD = { r: 154, g: 123, b: 47 };
const MUTED = { r: 92, g: 83, b: 72 };
const RULE = { r: 196, g: 184, b: 160 };
const BOX = { r: 246, g: 241, b: 230 };
const BAR = { r: 201, g: 162, b: 39 };
const BAR_BG = { r: 228, g: 220, b: 200 };

function pdfSafe(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
}

export async function downloadSolDirectedDeckReportPdf(args: {
  commanderName: string;
  bracket: number;
  playstyle: string;
  headProfessor: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
  grade: ProfessorDeckGradeV4 | null;
  deckListText: string;
  cos?: CosV1Score | null;
  thesis?: string;
  gamePlan?: { earlyGame?: string[]; midGame?: string[]; lateGame?: string[] };
  winPaths?: { primary?: string[]; secondary?: string[] };
  nonlands?: Array<{ name: string; primaryArchitectRequirement?: string; primaryRole?: string; typeLine?: string }>;
  lands?: Array<{ name: string; copies: number }>;
  grouped?: Record<SolDirectedDeckDisplayCategory, SolDirectedDeckDisplayCard[]>;
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentW = pageW - margin * 2;
  let y = margin;

  const model = buildSolDirectedDeckReportModelV111({
    commanderName: args.commanderName,
    bracket: args.bracket,
    playstyle: args.playstyle,
    thesis: args.thesis,
    gamePlan: args.gamePlan,
    winPaths: args.winPaths,
    cos: args.cos ?? args.grade?.cos ?? null,
    nonlands: args.nonlands,
    lands: args.lands,
    grouped: args.grouped,
  });
  const manaCurve = await fetchManaCurveHistogram([
    ...(args.nonlands ?? []).map((card) => card.name),
    args.commanderName,
  ]);

  function ensure(space: number) {
    if (y + space <= pageH - 36) return;
    doc.addPage();
    y = margin;
  }

  function setInk(color = INK) {
    doc.setTextColor(color.r, color.g, color.b);
  }

  function wrap(text: string, width: number): string[] {
    return doc.splitTextToSize(pdfSafe(text), width) as string[];
  }

  function heading(text: string, size: number) {
    doc.setFont("times", "bold");
    doc.setFontSize(size);
    setInk();
    for (const row of wrap(text, contentW)) {
      ensure(size + 6);
      doc.text(row, margin, y);
      y += size + 3;
    }
  }

  function mutedLine(text: string, size = 9) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    setInk(MUTED);
    for (const row of wrap(text, contentW)) {
      ensure(size + 5);
      doc.text(row, margin, y);
      y += size + 3;
    }
  }

  function para(text: string, size = 10) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    setInk();
    for (const row of wrap(text, contentW)) {
      ensure(size + 5);
      doc.text(row, margin, y);
      y += size + 3;
    }
  }

  function section(label: string) {
    y += 8;
    ensure(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setInk(GOLD);
    doc.text(pdfSafe(label.toUpperCase()), margin, y);
    y += 5;
    doc.setDrawColor(RULE.r, RULE.g, RULE.b);
    doc.setLineWidth(0.7);
    doc.line(margin, y, pageW - margin, y);
    y += 12;
  }

  function filledBox(x: number, top: number, w: number, h: number) {
    doc.setFillColor(BOX.r, BOX.g, BOX.b);
    doc.roundedRect(x, top, w, h, 3, 3, "F");
  }

  function scoreBoxes() {
    const gap = 12;
    const boxW = (contentW - gap) / 2;
    const boxH = 64;
    ensure(boxH + 8);
    const items = [
      {
        label: "Competitive Strength",
        value:
          model.competitiveStrength != null
            ? `${model.competitiveStrength} / 100`
            : model.competitiveStrengthNote ?? "Unavailable",
        detail:
          model.competitiveStrength != null
            ? "How strong is this deck overall?"
            : "No calibrated commander intercept",
      },
      {
        label: "Build Optimization",
        value: model.buildOptimizationLabel,
        detail: "How well is this 99 built for its commander?",
      },
    ];
    items.forEach((item, i) => {
      const x = margin + i * (boxW + gap);
      filledBox(x, y, boxW, boxH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setInk(GOLD);
      doc.text(pdfSafe(item.label.toUpperCase()), x + 12, y + 18);
      doc.setFont("times", "bold");
      doc.setFontSize(item.value.length > 16 ? 11 : 20);
      setInk();
      doc.text(pdfSafe(item.value), x + 12, y + 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setInk(MUTED);
      doc.text(pdfSafe(item.detail), x + 12, y + 56);
    });
    y += boxH + 8;
  }

  function insightBoxes() {
    const gap = 8;
    const boxW = (contentW - gap * 2) / 3;
    const texts = [
      { label: "What it does", body: model.whatItDoes },
      { label: "Biggest strengths", body: model.strengths.join(" · ") || "—" },
      { label: "Most optimization headroom", body: model.headroom.join(" · ") || "—" },
    ];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const heights = texts.map((item) => 28 + wrap(item.body, boxW - 16).length * 10);
    const boxH = Math.max(...heights, 56);
    ensure(boxH + 8);
    texts.forEach((item, i) => {
      const x = margin + i * (boxW + gap);
      filledBox(x, y, boxW, boxH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      setInk(GOLD);
      doc.text(pdfSafe(item.label.toUpperCase()), x + 8, y + 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setInk();
      wrap(item.body, boxW - 16).forEach((row, idx) => {
        doc.text(row, x + 8, y + 28 + idx * 10);
      });
    });
    y += boxH + 6;
  }

  function bars(rows: DeckReportModelV111["profileBars"]) {
    const drawGroup = (items: typeof rows) => {
      for (const row of items) {
        ensure(15);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        setInk();
        doc.text(pdfSafe(row.label), margin, y + 7);
        const barX = margin + 120;
        const barW = contentW - 160;
        // An axis with no basis gets no bar and no number: a full-width empty
        // track reading "0" says the deck failed at something it was never
        // measured on.
        if (row.measurable === false) {
          doc.setFont("helvetica", "normal");
          setInk(MUTED);
          doc.text(pdfSafe("not measurable - no verified combo line"), barX, y + 7);
          setInk();
          y += 14;
          continue;
        }
        doc.setFillColor(BAR_BG.r, BAR_BG.g, BAR_BG.b);
        doc.roundedRect(barX, y, barW, 9, 2, 2, "F");
        doc.setFillColor(BAR.r, BAR.g, BAR.b);
        doc.roundedRect(barX, y, Math.max(3, (Math.min(100, row.percentile) / 100) * barW), 9, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.text(String(row.percentile), barX + barW + 8, y + 7);
        y += 14;
      }
    };
    const drivers = rows.filter((row) => row.band === "Strength drivers");
    const traits = rows.filter((row) => row.band !== "Strength drivers");
    if (drivers.length) {
      mutedLine("Strength drivers", 8);
      y += 1;
      drawGroup(drivers);
    }
    if (traits.length) {
      y += 3;
      mutedLine("Deck characteristics", 8);
      y += 1;
      drawGroup(traits);
    }
  }

  function flow() {
    if (!model.flow.length) return;
    model.flow.forEach((step, i) => {
      ensure(36);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setInk();
      doc.text(pdfSafe(step.title), margin, y);
      y += 13;
      if (step.detail) para(step.detail, 8);
      if (step.cards.length) para(step.cards.join("  ·  "), 9);
      if (i < model.flow.length - 1) {
        mutedLine("then", 8);
      }
    });
  }

  function twoColTable(headers: [string, string], rows: Array<[string, string]>) {
    const col1 = contentW * 0.38;
    const col2 = contentW * 0.62;
    ensure(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setInk(GOLD);
    doc.text(pdfSafe(headers[0]), margin, y);
    doc.text(pdfSafe(headers[1]), margin + col1, y);
    y += 10;
    for (const [left, right] of rows) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const leftLines = wrap(left, col1 - 8);
      const rightLines = wrap(right, col2 - 4);
      const h = Math.max(leftLines.length, rightLines.length) * 10 + 4;
      ensure(h);
      setInk();
      leftLines.forEach((row, i) => doc.text(row, margin, y + i * 10));
      setInk(MUTED);
      rightLines.forEach((row, i) => doc.text(row, margin + col1, y + i * 10));
      y += h;
    }
  }

  function curve(hist: Record<number, number>) {
    const buckets = [1, 2, 3, 4, 5, 6];
    const max = Math.max(1, ...buckets.map((mv) => hist[mv] ?? 0));
    if (max <= 1 && buckets.every((mv) => (hist[mv] ?? 0) === 0)) {
      mutedLine("Mana curve unavailable.");
      return;
    }
    const barH = 52;
    const gap = 8;
    const colW = (contentW - gap * 5) / 6;
    ensure(barH + 24);
    buckets.forEach((mv, i) => {
      const count = hist[mv] ?? 0;
      const h = (count / max) * barH;
      const x = margin + i * (colW + gap);
      doc.setFillColor(BAR_BG.r, BAR_BG.g, BAR_BG.b);
      doc.roundedRect(x, y, colW, barH, 2, 2, "F");
      if (count > 0) {
        doc.setFillColor(BAR.r, BAR.g, BAR.b);
        doc.roundedRect(x, y + barH - h, colW, Math.max(4, h), 2, 2, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setInk();
      doc.text(mv === 6 ? "6+" : String(mv), x + colW / 2, y + barH + 12, { align: "center" });
      setInk(MUTED);
      if (count > 0) doc.text(String(count), x + colW / 2, y + barH - h - 3, { align: "center" });
    });
    y += barH + 20;
  }

  // Page 1
  heading(model.commanderName, 26);
  mutedLine(model.subtitle, 11);
  y += 10;
  scoreBoxes();
  section("COS profile");
  if (model.profileBars.length) bars(model.profileBars);
  else mutedLine("COS profile was not available for this list.");
  y += 8;
  insightBoxes();

  // Page 2
  doc.addPage();
  y = margin;
  heading("How the deck works", 18);
  section("Game plan");
  flow();
  section("Key synergies");
  if (model.synergies.length) {
    twoColTable(
      ["Cards", "Why they work together"],
      model.synergies.map((row) => [row.cards, row.why]),
    );
  } else {
    para("No verified card-pair writeup. This section only lists CommanderSpellbook lines, not guessed synergies.");
  }
  section("Verified CommanderSpellbook combos");
  if (model.combosNone) {
    para("None detected.");
  } else {
    twoColTable(
      ["Pieces", "Result"],
      model.combos.map((combo) => [
        combo.pieces,
        `${combo.result} · commander required: ${combo.commanderRequired}`,
      ]),
    );
  }
  if (model.winConditions.length) {
    section("Win conditions");
    for (const wc of model.winConditions) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setInk();
      ensure(14);
      doc.text(pdfSafe(`${wc.rank} — ${wc.title}`), margin, y);
      y += 12;
      para(wc.detail, 9);
    }
  }
  if (model.whyTheScore.length) {
    section("Why this deck scores this way");
    for (const line of model.whyTheScore) para(line, 9);
  }

  // Page 3
  doc.addPage();
  y = margin;
  heading("How it's built", 18);
  if (model.roleRows.length) {
    section("Functional construction");
    twoColTable(
      ["Role", "Cards"],
      model.roleRows.map((row) => [`${row.label} (${row.count})`, row.cards.join(", ")]),
    );
  }
  if (model.landSummary) {
    y += 4;
    mutedLine(model.landSummary);
  }
  section("Mana curve");
  curve(manaCurve);
  if (model.headroom.length) {
    section("Recommended optimization targets");
    para(model.headroom.join(" · "));
  }

  // Appendix
  if (model.appendix.length) {
    doc.addPage();
    y = margin;
    heading("Appendix — full list", 16);
    mutedLine("Grouped by card type.", 8);
    y += 6;
    const colW = (contentW - 16) / 3;
    const colX = [margin, margin + colW + 8, margin + (colW + 8) * 2];
    let col = 0;
    let colY = [y, y, y];
    const startPage = () => {
      col = 0;
      colY = [y, y, y];
    };
    for (const group of model.appendix) {
      const needed = 16 + group.cards.length * 10;
      if (colY[col]! + needed > pageH - 36) {
        col += 1;
        if (col > 2) {
          doc.addPage();
          y = margin;
          heading("Appendix — full list (continued)", 14);
          startPage();
        }
      }
      const x = colX[col]!;
      let cy = colY[col]!;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setInk(GOLD);
      doc.text(pdfSafe(group.label.toUpperCase()), x, cy);
      cy += 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setInk();
      for (const card of group.cards) {
        if (cy > pageH - 36) {
          col += 1;
          if (col > 2) {
            doc.addPage();
            heading("Appendix — full list (continued)", 14);
            startPage();
          }
          cy = colY[col]!;
        }
        doc.text(pdfSafe(`${card.copies} ${card.name}`), colX[col]!, cy);
        cy += 10;
      }
      colY[col] = cy + 10;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text("COS v1", margin, pageH - 18);
    doc.text(`${page} / ${pageCount}`, pageW - margin, pageH - 18, { align: "right" });
  }

  const safeName = args.commanderName.replace(/[^\w\s-]+/g, "").trim() || "deck";
  doc.save(`${safeName}-deck-report.pdf`);
}

async function fetchManaCurveHistogram(names: string[]): Promise<Record<number, number>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const hist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (let i = 0; i < unique.length; i += 75) {
    const batch = unique.slice(i, i + 75);
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: Array<{ cmc?: number }> };
      for (const card of json.data ?? []) {
        const mv = Number(card.cmc ?? 0);
        if (!Number.isFinite(mv) || mv <= 0) continue;
        const bucket = mv >= 6 ? 6 : Math.max(1, Math.round(mv));
        hist[bucket] = (hist[bucket] ?? 0) + 1;
      }
    } catch {
      /* omit empty buckets */
    }
  }
  return hist;
}

export function solDirectedDeckReportPdfFilename(commanderName: string): string {
  const safeName = commanderName.replace(/[^\w\s-]+/g, "").trim() || "deck";
  return `${safeName}-deck-report.pdf`;
}
