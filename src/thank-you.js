/**
 * /thank-you — renders the assessment the calculator page handed over.
 *
 * A page of its own rather than a hidden view: the conversion is then a real
 * pageview with its own URL, which is what the analytics container triggers on.
 */
// Self-hosted: the CSP (font-src/style-src 'self') blocks Google Fonts.
import "@fontsource-variable/inter";
import "./styles.css";
import { calculateResults, generateSummary, hasCapacityWarning } from "./calc.js";
import { animateDonut, renderDonut } from "./donut.js";
import { formatCurrency, formatNumber, formatPercent } from "./format.js";
import { loadAssessment } from "./handoff.js";

const handoff = loadAssessment();

// Opened directly, or the tab lost its session: there is nothing to show, and
// the form is the only place to get it back.
if (!handoff) {
  window.location.replace("/");
} else {
  document.querySelectorAll(".reach-roi-calculator").forEach((root) => initResults(root, handoff));
}

function initResults(root, { lead, state }) {
  const els = collectElements(root);
  const results = calculateResults(state);

  renderResults(els, state, results);
  animateDonut();
  els.downloadBtn?.addEventListener("click", () => downloadReport(lead, state, results));
}

function collectElements(root) {
  const q = (sel) => root.querySelector(sel);
  return {
    downloadBtn: q("#rrc-download-btn"),
    capacityWarning: q("#rrc-capacity-warning"),
    outValue: q("#rrc-out-value"),
    outHours: q("#rrc-out-hours"),
    outFte: q("#rrc-out-fte"),
    tasksIncluded: q("#rrc-tasks-included"),
    includedList: q("#rrc-included-list"),
    summaryText: q("#rrc-summary-text"),
    donut: q("#rrc-donut"),
    donutSegments: q("#rrc-donut-segments"),
    donutLegend: q("#rrc-donut-legend"),
    donutCenter: q("#rrc-donut-center"),
    donutTooltip: q("#rrc-donut-tooltip"),
  };
}

function renderResults(els, state, results) {
  if (els.outValue) els.outValue.textContent = formatCurrency(results.totalDollars);
  if (els.outHours) els.outHours.textContent = formatNumber(Math.round(results.totalHours));
  if (els.outFte) els.outFte.textContent = `${formatNumber(results.equivalentFTECapacity, 1)} FTEs`;
  if (els.tasksIncluded) {
    const n = results.includedCount;
    els.tasksIncluded.textContent = `${n} ${n === 1 ? "task" : "tasks"} included in this assessment`;
  }
  els.capacityWarning?.classList.toggle("reach-roi-is-hidden", !hasCapacityWarning(state));

  renderIncludedTasks(els.includedList, results);
  renderDonut(els, results);
  if (els.summaryText) els.summaryText.textContent = generateSummary(state, results);
}

/** Task-level results table: Task | Reduction | Annual Hours | Value */
function renderIncludedTasks(container, results) {
  if (!container) return;
  const included = results.perTask.filter((t) => t.included);

  if (included.length === 0) {
    const empty = document.createElement("p");
    empty.className = "reach-roi-empty-tasks";
    empty.textContent = "No tasks selected. Go back and select the activities your team handles.";
    container.replaceChildren(empty);
    return;
  }

  const cell = (className, text) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  };
  const makeRow = (className, values) => {
    const row = document.createElement("div");
    row.className = className;
    row.append(
      cell("reach-roi-task-result-name", values[0]),
      ...values.slice(1).map((v) => cell("reach-roi-task-result-num", v)),
    );
    return row;
  };

  container.replaceChildren(
    makeRow("reach-roi-task-result-row reach-roi-task-result-row--head", [
      "Task",
      "Reduction",
      "Annual Hours Reclaimed",
      "Salary-Equivalent Value",
    ]),
    ...included.map((t) =>
      makeRow("reach-roi-task-result-row", [
        t.name,
        formatPercent(t.reductionRate),
        `${formatNumber(Math.round(t.hoursAvoidable))} hrs`,
        formatCurrency(t.dollarsAvoidable),
      ]),
    ),
  );
}

async function downloadReport(lead, state, results) {
  try {
    // Loaded on demand: jsPDF is dead weight for visitors who never download.
    const { buildReportPDF, reportFilename } = await import("./pdf.js");
    const blob = buildReportPDF(lead, state, results);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = reportFilename(lead.company);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("report generation failed:", err);
  }
}
