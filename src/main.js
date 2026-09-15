/** Bootstrap and DOM wiring for the Reach Value Assessment calculator. */
// Self-hosted: the CSP (font-src/style-src 'self') blocks Google Fonts.
import "@fontsource-variable/inter";
import "./styles.css";
import { TASK_BENCHMARKS } from "./benchmarks.js";
import { calculateResults } from "./calc.js";
import { COUNTRIES } from "./countries.js";
import { statesFor } from "./states.js";
import { saveAssessment } from "./handoff.js";
import { submitLead } from "./lead.js";
import { renderTaskRows, updateTaskRowState } from "./tasks.js";

document.querySelectorAll(".reach-roi-calculator").forEach(initCalculator);

function initCalculator(root) {
  const els = collectElements(root);

  renderTaskRows(els.taskList);
  renderCountryOptions(els.formCountry);
  renderStateOptions(els);

  for (const el of [els.headcount, els.salary]) {
    el?.addEventListener("input", () => hideError(root, el === els.headcount ? "headcount" : "salary"));
  }

  const taskToggle = (id) => root.querySelector(`[data-rrc-task-toggle="${id}"]`);
  // "Select All" is on exactly when every task is, so unticking any task clears it.
  const syncSelectAll = () => {
    const all = TASK_BENCHMARKS.every((b) => taskToggle(b.id)?.checked);
    if (els.selectAll) els.selectAll.checked = all;
    els.selectAllRow?.classList.toggle("reach-roi-is-active-task", all);
  };

  for (const b of TASK_BENCHMARKS) {
    taskToggle(b.id)?.addEventListener("change", () => {
      updateTaskRowState(root, b.id);
      syncSelectAll();
      hideError(root, "tasks");
    });
  }

  els.selectAll?.addEventListener("change", () => {
    for (const b of TASK_BENCHMARKS) {
      const toggle = taskToggle(b.id);
      if (toggle) toggle.checked = els.selectAll.checked;
      updateTaskRowState(root, b.id);
    }
    syncSelectAll();
    hideError(root, "tasks");
  });

  els.submitBtn?.addEventListener("click", () => {
    if (validateInputs(root, els)) openModal(els);
  });

  els.modalClose?.addEventListener("click", () => closeModal(els));
  els.modalOverlay?.addEventListener("click", (e) => {
    if (e.target === els.modalOverlay) closeModal(els);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modalOverlay?.classList.contains("reach-roi-is-hidden")) closeModal(els);
  });
  // Keep the modal's submit button in step with the fields.
  for (const field of leadFields(els)) {
    field?.addEventListener("input", () => updateFormSubmitState(els));
    field?.addEventListener("change", () => updateFormSubmitState(els));
  }
  // The valid states depend on the country, so the field follows it.
  els.formCountry?.addEventListener("change", () => renderStateOptions(els));
  updateFormSubmitState(els);

  els.formSubmit?.addEventListener("click", () => handleFormSubmit(root, els));

  for (const b of TASK_BENCHMARKS) updateTaskRowState(root, b.id);
  syncSelectAll();
}

/**
 * Fills the country select.
 *
 * A select cannot hold a value that is not on the list, which is what Pardot
 * requires — so no client-side country validation is needed beyond "something
 * is chosen". The server still re-checks, since a direct POST never touches
 * this element.
 */
function renderCountryOptions(select) {
  if (!select) return;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a country";

  select.replaceChildren(
    placeholder,
    ...COUNTRIES.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      return option;
    }),
  );
}

/**
 * Rebuilds the State select for the chosen country, and hides the field for
 * countries with no validated list.
 *
 * Salesforce rejects a State it does not recognise for that country with a
 * Field Integrity Exception, so offering a free-text or wrongly-scoped value is
 * worse than offering none: State is optional on the handler.
 */
function renderStateOptions(els) {
  const select = els.formState;
  if (!select) return;

  const states = statesFor(els.formCountry?.value);
  els.stateField?.classList.toggle("reach-roi-is-hidden", states.length === 0);

  if (states.length === 0) {
    select.replaceChildren();
    select.value = "";     // never submit a state left over from another country
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a state / province";

  select.replaceChildren(
    placeholder,
    ...states.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      return option;
    }),
  );
}

function collectElements(root) {
  const q = (sel) => root.querySelector(sel);
  return {
    root,
    headcount: q("#rrc-headcount"),
    salary: q("#rrc-salary"),
    taskList: q("#rrc-task-list"),
    selectAll: q("#rrc-select-all"),
    selectAllRow: q("#rrc-select-all-row"),
    submitBtn: q("#rrc-submit-btn"),
    modalOverlay: q("#rrc-modal-overlay"),
    modalClose: q("#rrc-modal-close"),
    formFirst: q("#rrc-f-first"),
    formLast: q("#rrc-f-last"),
    formEmail: q("#rrc-f-email"),
    formCompany: q("#rrc-f-company"),
    formCountry: q("#rrc-f-country"),
    formState: q("#rrc-f-state"),
    stateField: q("#rrc-state-field"),
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

/* ----------------------------------------------------------------- lead */

// Declarations, not const arrows: initCalculator runs at module load and calls
// these, which a const would put in the temporal dead zone.
function leadFields(els) {
  return [
    els.formFirst,
    els.formLast,
    els.formEmail,
    els.formCompany,
    els.formCountry,
    els.formState,
    els.formOptIn,
  ];
}

/**
 * Whether the modal is ready to submit. Country counts as filled once it
 * matches the list case-insensitively, so the button enables while the visitor
 * types rather than waiting for the field to be left and snapped.
 */
function isLeadFormValid(els) {
  return Boolean(
    els.formFirst?.value.trim() &&
      els.formLast?.value.trim() &&
      els.formCompany?.value.trim() &&
      isValidEmail(els.formEmail?.value.trim() ?? "") &&
      els.formCountry?.value,
  );
}

/** Gates the submit button. State and the consent box are not required. */
function updateFormSubmitState(els) {
  if (els.formSubmit) els.formSubmit.disabled = !isLeadFormValid(els);
}

const openModal = (els) => {
  els.modalOverlay?.classList.remove("reach-roi-is-hidden");
  els.formError?.classList.add("reach-roi-is-hidden");
  updateFormSubmitState(els);
  els.formFirst?.focus();
};
const closeModal = (els) => els.modalOverlay?.classList.add("reach-roi-is-hidden");

function handleFormSubmit(root, els) {
  const candidate = {
    firstName: els.formFirst.value.trim(),
    lastName: els.formLast.value.trim(),
    email: els.formEmail.value.trim(),
    company: els.formCompany.value.trim(),
    country: els.formCountry.value,
    state: els.formState.value.trim(),
    // Not in `required`: consent bundled into access is not freely given.
    optIn: els.formOptIn?.checked ?? false,
    website: els.formWebsite?.value ?? "",
  };

  const required = ["firstName", "lastName", "email", "company", "country"];
  if (required.some((k) => !candidate[k]) || !isValidEmail(candidate.email)) {
    return showFormError(els, "Please complete all required fields with a valid work email.");
  }
  // Pardot validates Country against its own list and treats anything else as
  // empty, which would reject the submission. Catch it here instead.
  if (!COUNTRIES.includes(candidate.country)) {
    return showFormError(els, "Please choose a country from the list.");
  }
  els.formError?.classList.add("reach-roi-is-hidden");

  els.formSubmit.disabled = true; // no double submissions

  const state = getState(root);
  saveAssessment(candidate, state);

  // Fired, not awaited: `keepalive` carries the POST across the navigation, and
  // delivery has never gated the visitor's results.
  submitLead(candidate, state, calculateResults(state)).then((result) => {
    if (!result.ok) console.warn("lead submission failed:", result.error);
  });

  window.location.assign("/thank-you");
}

function showFormError(els, message) {
  if (!els.formError) return;
  els.formError.textContent = message;
  els.formError.classList.remove("reach-roi-is-hidden");
}

// Cheap shape check for instant feedback; lead-schema.js is the real validator.
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
