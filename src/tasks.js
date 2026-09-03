/**
 * Renders the activity picker from TASK_BENCHMARKS.
 *
 * These rows used to be hand-written in index.html, which duplicated every id,
 * name, description and reduction percentage that benchmarks.js already owns —
 * a benchmark change had to be mirrored in two files or the badge silently lied.
 */
import { TASK_BENCHMARKS } from "./benchmarks.js";
import { formatPercent } from "./format.js";

export function renderTaskRows(container) {
  if (!container) return;
  container.replaceChildren(...TASK_BENCHMARKS.map(taskRow));
}

function taskRow(b) {
  const row = el("div", "reach-roi-task-row");
  row.dataset.rrcTaskRow = b.id;

  const main = el("div", "reach-roi-task-main");

  const label = el("label", "reach-roi-switch reach-roi-switch--sm");
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.dataset.rrcTaskToggle = b.id;
  toggle.setAttribute("aria-label", `Include ${b.name}`);
  const track = el("span", "reach-roi-switch-track");
  track.setAttribute("aria-hidden", "true");
  label.append(toggle, track);

  const labels = el("div", "reach-roi-task-labels");
  labels.append(el("span", "reach-roi-task-name", b.name), el("span", "reach-roi-task-desc", b.description));
  main.append(label, labels);

  const meta = el("div", "reach-roi-task-meta");
  const reduction = el(
    "span",
    "reach-roi-task-reduction reach-roi-is-hidden",
    `Observed reduction: ${formatPercent(b.reductionRate)}`,
  );
  reduction.dataset.rrcTaskReduction = b.id;
  const state = el("span", "reach-roi-task-state", "Excluded");
  state.dataset.rrcTaskState = b.id;
  meta.append(reduction, state);

  row.append(main, meta);
  return row;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Reflects a toggle's state into its row: active styling, badge, and label. */
export function updateTaskRowState(root, taskId) {
  const toggle = root.querySelector(`[data-rrc-task-toggle="${taskId}"]`);
  if (!toggle) return;
  const included = toggle.checked;

  root.querySelector(`[data-rrc-task-row="${taskId}"]`)?.classList.toggle("reach-roi-is-active-task", included);
  const stateLabel = root.querySelector(`[data-rrc-task-state="${taskId}"]`);
  if (stateLabel) stateLabel.textContent = included ? "Included" : "Excluded";
  root
    .querySelector(`[data-rrc-task-reduction="${taskId}"]`)
    ?.classList.toggle("reach-roi-is-hidden", !included);
}
