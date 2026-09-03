/**
 * Two-page report, built with jsPDF.
 *
 * This replaces ~600 lines of hand-rolled PDF object writing. Beyond the code
 * deleted, jsPDF's standard Helvetica is WinAnsi-encoded, so accented names
 * ("José Müller", "Ácme Sécurité") now render instead of being stripped to
 * ASCII as the old writer did.
 *
 * ponytail: WinAnsi covers Latin-1 only. Non-Latin scripts (CJK, Cyrillic,
 * Greek) still fall back to blanks — embed a TTF via addFileToVFS/addFont if
 * that ever matters; Liberation Sans is metric-compatible with Helvetica and
 * would not disturb this layout.
 */
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { formatCurrency, formatCurrencyCompact, formatDateToday, formatNumber, formatPercent } from "./format.js";
import logoOnPaper from "./assets/logo-dark-on-paper.jpg?inline";

const W = 612;
const H = 792;

// Brand palette, 0-255 for jsPDF.
const C = {
  paper: [250, 249, 245], // #FAF9F5 warm off-white
  white: [255, 255, 255],
  ink: [32, 31, 28], // #201F1C
  darkText: [32, 31, 28],
  bodyText: [107, 105, 97],
  midText: [170, 168, 160], // #AAA8A0
  neutralWash: [240, 238, 235],
  purpleWash: [224, 227, 238],
  coral: [255, 132, 123], // #FF847B
  coralSoft: [255, 199, 193],
  rule: [226, 223, 214], // #E2DFD6
  hairline: [235, 237, 242],
};

export function buildReportPDF(lead, state, results) {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const included = results.perTask.filter((t) => t.included);

  titlePage(doc, lead, results);
  doc.addPage();
  activityPage(doc, lead, state, results, included);

  return doc.output("blob");
}

export const reportFilename = (company) =>
  `Reach-Value-Assessment-${String(company).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")}.pdf`;

/* ---------------------------------------------------------------- page 1 */

function titlePage(doc, lead, results) {
  fill(doc, C.paper, 0, 0, W, H);
  fill(doc, C.ink, 0, 0, 6, H); // spine
  fill(doc, C.neutralWash, W - 150, 150, 40, 40);
  fill(doc, C.purpleWash, W - 110, 174, 40, 40);
  dot(doc, C.coral, 96, 250, 9);
  dot(doc, C.coralSoft, 122, 256, 7);

  const logoW = 150;
  doc.addImage(logoOnPaper, "JPEG", 56, 84, logoW, logoW * (228 / 704));

  text(doc, "REACH VALUE ASSESSMENT", 58, 300, { size: 11.5, bold: true, color: C.ink });

  const title = lead.company
    ? `The Potential Operating Value of Reach Security for ${lead.company}`
    : "Your Reach Value Assessment";
  doc.setFont("helvetica", "bold").setFontSize(26);
  let y = 342;
  for (const line of doc.splitTextToSize(title, W - 130)) {
    text(doc, line, 58, y, { size: 26, bold: true, color: C.darkText });
    y += 34;
  }

  fill(doc, C.ink, 58, y + 6, 56, 3);

  const prepared =
    `Prepared for ${lead.firstName} ${lead.lastName}` + (lead.company ? `, ${lead.company}` : "");
  text(doc, prepared, 58, y + 40, { size: 12, color: C.bodyText });
  text(doc, `Generated ${formatDateToday()}`, 58, y + 60, { size: 11, color: C.midText });

  const metrics = [
    ["Cost Savings (Annual)", formatCurrency(results.totalDollars)],
    ["Hours Reclaimed Annually", formatNumber(Math.round(results.totalHours))],
    ["Equivalent Security Capacity", `${formatNumber(results.equivalentFTECapacity, 1)} FTEs`],
  ];
  const cardW = (W - 116 - 16) / 2;
  const cardH = 66;
  metrics.forEach(([label, value], i) => {
    const x = 58 + (i % 2) * (cardW + 16);
    const cy = y + 100 + Math.floor(i / 2) * (cardH + 14);
    fill(doc, C.neutralWash, x, cy, cardW, cardH);
    fill(doc, C.ink, x, cy, 4, cardH);
    text(doc, label, x + 14, cy + 22, { size: 8.5, color: C.midText });
    text(doc, value, x + 14, cy + 48, { size: 18, bold: true, color: C.darkText });
  });

  text(
    doc,
    "Estimates combine your inputs with observed results from Reach customers. Actual results may vary.",
    58,
    H - 42,
    { size: 9, color: C.midText },
  );
}

/* ---------------------------------------------------------------- page 2 */

function activityPage(doc, lead, state, results, included) {
  fill(doc, C.white, 0, 0, W, H);
  fill(doc, C.ink, 0, 0, W, 8);

  text(doc, "Your Value by Security Activity", 56, 64, { size: 20, bold: true, color: C.darkText });
  const subline =
    (lead.company ? `${lead.company}  |  ` : "") +
    (state.teamHeadcount ? `${state.teamHeadcount} security FTEs` : "");
  text(doc, subline, 56, 84, { size: 11, color: C.midText });

  const cx = 132;
  const cy = 200;
  const rOut = 66;
  const rIn = 42;
  donut(doc, included, cx, cy, rOut, rIn);

  const centerVal = formatCurrencyCompact(results.totalDollars);
  text(doc, centerVal, cx - width(doc, centerVal, 15, true) / 2, cy + 2, {
    size: 15,
    bold: true,
    color: C.darkText,
  });
  text(doc, "Cost savings", cx - width(doc, "Cost savings", 7, false) / 2, cy + 16, {
    size: 7,
    color: C.midText,
  });

  let legY = 150;
  for (const t of included) {
    fill(doc, hexToRgb(t.color), 232, legY - 8, 10, 10);
    text(doc, t.name, 250, legY, { size: 9.5, color: C.darkText });
    const v = formatCurrency(t.dollarsAvoidable);
    text(doc, v, W - 56 - width(doc, v, 9.5, true), legY, { size: 9.5, bold: true, color: C.ink });
    legY += 17;
  }

  const tableTop = Math.max(legY, cy + rOut) + 34;
  text(doc, "Detail by activity", 56, tableTop - 12, { size: 13, bold: true, color: C.darkText });

  // Column widths reproduce the original fixed layout exactly: task at x=56,
  // reduction at 320, hours at 430, value right-aligned to the 556 margin.
  // Zero horizontal padding, so a cell edge is the text position.
  autoTable(doc, {
    startY: tableTop,
    margin: { left: 56, right: 56 },
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      textColor: C.midText,
      cellPadding: { top: 6, bottom: 6, left: 0, right: 0 },
      lineWidth: 0,
    },
    headStyles: { fontSize: 8.5, textColor: C.midText, fontStyle: "bold" },
    footStyles: { fontSize: 11, textColor: C.darkText, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 264, textColor: C.darkText },
      1: { cellWidth: 110 },
      2: { cellWidth: 63 },
      3: { cellWidth: 63, halign: "right", fontStyle: "bold", textColor: C.ink },
    },
    head: [["Task", "Reduction", "Hrs reclaimed", "Value"]],
    body: included.map((t) => [
      t.name,
      formatPercent(t.reductionRate),
      formatNumber(Math.round(t.hoursAvoidable)),
      formatCurrency(t.dollarsAvoidable),
    ]),
    foot: [["Total", "", formatNumber(Math.round(results.totalHours)), formatCurrency(results.totalDollars)]],
    // Rules are drawn here rather than as cell borders so head and body get
    // different weights, matching the original.
    // headStyles would otherwise left-align the head row over a right-aligned
    // column, so carry the column's alignment into every section.
    didParseCell: ({ cell, column }) => {
      if (column.index === 3) cell.styles.halign = "right";
    },
    didDrawCell: ({ section, cell, column }) => {
      if (column.index !== 0) return;
      const y = cell.y + cell.height;
      if (section === "head") fill(doc, C.rule, 56, y, W - 112, 1);
      if (section === "body") fill(doc, C.hairline, 56, y, W - 112, 0.5);
    },
  });

  methodology(doc, doc.lastAutoTable.finalY);

  text(doc, "reach.security", 56, H - 40, { size: 10, bold: true, color: C.ink });
  const disclaimer = "Actual results may vary.";
  text(doc, disclaimer, W - 56 - width(doc, disclaimer, 8.5, false), H - 40, {
    size: 8.5,
    color: C.midText,
  });
}

/** Methodology block, anchored above the footer rather than under the table. */
function methodology(doc, tableEndY) {
  const body =
    "Your assessment combines the information you provided about your security team with observed time " +
    "reductions from Reach customers using Reach across common security operations activities. Customer " +
    "benchmarks are expressed as time savings per employee, per month. When you supplied your own current " +
    "effort, the model applied the observed percentage reduction to your input instead of the benchmark " +
    "workload. Annual cost savings value uses base salary only and does not include benefits, taxes, " +
    "overhead, or other employment costs. This assessment provides an estimate of potential operating " +
    "benefit and is not a guarantee of future results. Actual results may vary based on your environment, " +
    "team, workflows, and deployment.";

  doc.setFont("helvetica", "normal").setFontSize(9);
  const lines = doc.splitTextToSize(body, W - 112);
  const lineH = 12;
  const headingGap = 16;

  const lastLineY = H - 40 - 30; // footer baseline, less bottom padding
  const firstLineY = lastLineY - (lines.length - 1) * lineH;
  const headingY = Math.max(firstLineY - headingGap, tableEndY + 26); // never collide with the table

  text(doc, "How This Estimate Was Calculated", 56, headingY, { size: 10, bold: true, color: C.darkText });
  lines.forEach((line, i) =>
    text(doc, line, 56, headingY + headingGap + i * lineH, { size: 9, color: [82, 87, 102] }),
  );
}

/* ---------------------------------------------------------------- helpers */

function text(doc, str, x, y, { size, bold = false, color = C.darkText }) {
  doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(...color);
  doc.text(String(str), x, y);
}

function width(doc, str, size, bold) {
  doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
  return doc.getTextWidth(String(str));
}

function fill(doc, color, x, y, w, h) {
  doc.setFillColor(...color).rect(x, y, w, h, "F");
}

function dot(doc, color, x, y, r) {
  doc.setFillColor(...color).circle(x, y, r, "F");
}

/** Donut as thick stroked arcs — one per included activity, sized by value. */
function donut(doc, included, cx, cy, rOut, rIn) {
  const ctx = doc.context2d;
  const r = (rOut + rIn) / 2;
  const total = included.reduce((s, t) => s + t.dollarsAvoidable, 0);

  ctx.lineWidth = rOut - rIn;
  if (!included.length || total <= 0) {
    ctx.strokeStyle = "#e6e8ed";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  const gap = (1.5 * Math.PI) / 180;
  let angle = -Math.PI / 2; // start at 12 o'clock, like the on-screen donut
  for (const t of included) {
    const sweep = (t.dollarsAvoidable / total) * Math.PI * 2;
    const a0 = angle + gap / 2;
    const a1 = angle + sweep - gap / 2;
    if (a1 > a0) {
      ctx.strokeStyle = t.color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a1);
      ctx.stroke();
    }
    angle += sweep;
  }
}

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
