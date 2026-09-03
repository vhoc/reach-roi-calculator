/** Bootstrap and DOM wiring for the Reach Value Assessment calculator. */
import "./styles.css";
import { TASK_BENCHMARKS } from "./benchmarks.js";
import { calculateResults, generateSummary, hasCapacityWarning } from "./calc.js";
import { animateDonut, renderDonut } from "./donut.js";
import { formatCurrency, formatNumber, formatPercent } from "./format.js";
import { submitLead } from "./lead.js";
import { renderTaskRows, updateTaskRowState } from "./tasks.js";

/** Last computed state/results, shared by the results view and the report. */
const last = { state: null, results: null };
let lead = null;

document.querySelectorAll(".reach-roi-calculator").forEach(initCalculator);

function initCalculator(root) {
  const els = collectElements(root);

  renderTaskRows(els.taskList);

  for (const el of [els.headcount, els.salary]) {
    el?.addEventListener("input", () => hideError(root, el === els.headcount ? "headcount" : "salary"));
  }

  for (const b of TASK_BENCHMARKS) {
    root.querySelector(`[data-rrc-task-toggle="${b.id}"]`)?.addEventListener("change", () => {
      updateTaskRowState(root, b.id);
      hideError(root, "tasks");
    });
  }

  els.submitBtn?.addEventListener("click", () => {
    if (!validateInputs(root, els)) return;
    if (!lead) return openModal(els);
    renderResults(root, els);
    showView(root, els, "results");
  });

  els.downloadBtn?.addEventListener("click", () => downloadReport(root, els));

  els.modalClose?.addEventListener("click", () => closeModal(els));
  els.modalOverlay?.addEventListener("click", (e) => {
    if (e.target === els.modalOverlay) closeModal(els);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modalOverlay?.classList.contains("reach-roi-is-hidden")) closeModal(els);
  });
  els.formSubmit?.addEventListener("click", () => handleFormSubmit(root, els));

  for (const b of TASK_BENCHMARKS) updateTaskRowState(root, b.id);
}

function collectElements(root) {
  const q = (sel) => root.querySelector(sel);
  return {
    root,
    headcount: q("#rrc-headcount"),
    salary: q("#rrc-salary"),
    taskList: q("#rrc-task-list"),
    submitBtn: q("#rrc-submit-btn"),
    downloadBtn: q("#rrc-download-btn"),
    viewInputs: q("#rrc-view-inputs"),
    viewResults: q("#rrc-view-results"),
    subtitleInputs: q("#rrc-subtitle-inputs"),
    subtitleResults: q("#rrc-subtitle-results"),
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
    modalOverlay: q("#rrc-modal-overlay"),
    modalClose: q("#rrc-modal-close"),
    formFirst: q("#rrc-f-first"),
    formLast: q("#rrc-f-last"),
    formEmail: q("#rrc-f-email"),
    formCompany: q("#rrc-f-company"),
    formCountry: q("#rrc-f-country"),
    formState: q("#rrc-f-state"),
    formOptIn: q("#rrc-f-optin"),
    formWebsite: q("#rrc-f-website"),
    formError: q("#rrc-form-error"),
    formSubmit: q("#rrc-form-submit"),
  };
}

/* ------------------------------------------------------------------ state */

function getState(root) {
  const teamHeadcount = parseFloat(root.querySelector("#rrc-headcount")?.value);
  const annualSalary = parseFloat(root.querySelector("#rrc-salary")?.value);

  // Public version: no per-task customization. Every included task uses the
  // observed customer benchmark, applied across the full team headcount.
  const tasks = TASK_BENCHMARKS.map((b) => ({
    id: b.id,
    name: b.name,
    color: b.color,
    reductionRate: b.reductionRate,
    included: !!root.querySelector(`[data-rrc-task-toggle="${b.id}"]`)?.checked,
    applicableFTEs: teamHeadcount,
    currentHoursPerFTEPerMonth: b.manualHoursPerFTEPerMonth,
  }));

  return { teamHeadcount, annualSalary, tasks };
}

function validateInputs(root, els) {
  let ok = true;
  const check = (key, valid) => {
    valid ? hideError(root, key) : showError(root, key);
    ok &&= valid;
  };

  check("headcount", parseFloat(els.headcount?.value) > 0);
  check("salary", parseFloat(els.salary?.value) > 0);
  check(
    "tasks",
    TASK_BENCHMARKS.some((b) => root.querySelector(`[data-rrc-task-toggle="${b.id}"]`)?.checked),
  );
  return ok;
}

const showError = (root, key) =>
  root.querySelector(`[data-rrc-error="${key}"]`)?.classList.remove("reach-roi-is-hidden");
const hideError = (root, key) =>
  root.querySelector(`[data-rrc-error="${key}"]`)?.classList.add("reach-roi-is-hidden");

/* ------------------------------------------------------------------ views */

function showView(root, els, viewName) {
  const toResults = viewName === "results";
  els.viewInputs?.classList.toggle("reach-roi-is-hidden", toResults);
  els.viewResults?.classList.toggle("reach-roi-is-hidden", !toResults);
  // Header subtitle: two-sentence version on inputs, short version on results.
  els.subtitleInputs?.classList.toggle("reach-roi-is-hidden", toResults);
  els.subtitleResults?.classList.toggle("reach-roi-is-hidden", !toResults);

  const target = toResults ? els.viewResults : els.viewInputs;
  target?.focus?.({ preventScroll: false });
  if (toResults) animateDonut();
  root.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function renderResults(root, els) {
  const state = getState(root);
  const results = calculateResults(state);
  last.state = state;
  last.results = results;

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

/* ------------------------------------------------------------- lead + PDF */

const openModal = (els) => {
  els.modalOverlay?.classList.remove("reach-roi-is-hidden");
  els.formError?.classList.add("reach-roi-is-hidden");
  els.formFirst?.focus();
};
const closeModal = (els) => els.modalOverlay?.classList.add("reach-roi-is-hidden");

async function handleFormSubmit(root, els) {
  const candidate = {
    firstName: els.formFirst.value.trim(),
    lastName: els.formLast.value.trim(),
    email: els.formEmail.value.trim(),
    company: els.formCompany.value.trim(),
    country: els.formCountry.value.trim(),
    state: els.formState.value.trim(),
    // Not in `required`: consent bundled into access is not freely given.
    optIn: els.formOptIn?.checked ?? false,
    website: els.formWebsite?.value ?? "",
  };

  const required = ["firstName", "lastName", "email", "company", "country"];
  if (required.some((k) => !candidate[k]) || !isValidEmail(candidate.email)) {
    return showFormError(els, "Please complete all required fields with a valid work email.");
  }
  els.formError?.classList.add("reach-roi-is-hidden");

  lead = candidate;
  els.formSubmit.disabled = true; // no double submissions

  closeModal(els);
  renderResults(root, els);
  showView(root, els, "results");

  // Delivery and the report run in parallel — the visitor gets their PDF
  // whatever the network does. A failure surfaces without blocking anything.
  const delivery = submitLead(lead, last.state, last.results);
  downloadReport(root, els);

  const result = await delivery;
  els.formSubmit.disabled = false;
  if (!result.ok) {
    console.warn("lead submission failed:", result.error);
    showFormError(els, "We could not record your details. Your report has still downloaded.");
  }
}

function showFormError(els, message) {
  if (!els.formError) return;
  els.formError.textContent = message;
  els.formError.classList.remove("reach-roi-is-hidden");
}

// Cheap shape check for instant feedback; lead-schema.js is the real validator.
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

async function downloadReport(root, els) {
  if (!lead) return openModal(els);
  if (!last.results) renderResults(root, els);

  try {
    // Loaded on demand: jsPDF is dead weight for visitors who never download.
    const { buildReportPDF, reportFilename } = await import("./pdf.js");
    const blob = buildReportPDF(lead, last.state, last.results);

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
