/** Value-by-activity donut: SVG arcs drawn with stroke-dasharray, plus legend. */
import { formatCurrency, formatCurrencyCompact } from "./format.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DONUT = {
  cx: 120,
  cy: 120,
  radius: 86, // arc centerline radius
  stroke: 30, // ring thickness
  gapDeg: 2, // small gap between segments, in degrees
};

/** Segments of the current render, kept for the reveal animation. */
let segments = [];

export function renderDonut(els, results) {
  if (!els.donut || !els.donutSegments) return;
  const segGroup = els.donutSegments;
  const legend = els.donutLegend;
  segGroup.replaceChildren();
  legend?.replaceChildren();
  segments = [];

  const included = results.perTask.filter((t) => t.included && t.dollarsAvoidable > 0);

  if (els.donutCenter) els.donutCenter.textContent = formatCurrencyCompact(results.totalDollars);

  if (included.length === 0) {
    // A single muted ring, so the chart never looks broken.
    segGroup.appendChild(ring({ stroke: "#1a2436" }));
    return;
  }

  const totalDollars = included.reduce((s, t) => s + t.dollarsAvoidable, 0);
  const circumference = 2 * Math.PI * DONUT.radius;
  const gapFraction = DONUT.gapDeg / 360;
  let cursor = 0; // fraction around the circle

  for (const t of included) {
    const fraction = t.dollarsAvoidable / totalDollars;
    // Reserve a gap between arcs, but never eat more than 40% of a tiny segment.
    const arcFraction = Math.max(fraction - gapFraction, fraction * 0.6);
    const arcLen = arcFraction * circumference;

    const circle = ring({
      stroke: t.color,
      dasharray: `0 ${circumference}`, // starts hidden; animateDonut fills it in
      dashoffset: -(cursor * circumference),
    });
    circle.setAttribute("class", "reach-roi-donut-seg");
    circle.dataset.arcLen = arcLen;
    circle.dataset.circ = circumference;
    circle.style.cursor = "pointer";

    const label = `${t.name}: ${formatCurrency(t.dollarsAvoidable)} (${Math.round(fraction * 100)}%)`;
    circle.addEventListener("mousemove", (e) => showTooltip(els, label, e));
    circle.addEventListener("mouseenter", () => (circle.style.opacity = "0.82"));
    circle.addEventListener("mouseleave", () => {
      circle.style.opacity = "1";
      hideTooltip(els);
    });

    segGroup.appendChild(circle);
    segments.push(circle);
    legend?.appendChild(legendItem(t));
    cursor += fraction;
  }
}

/** Grows each arc from zero. Called when the results view is revealed. */
export function animateDonut() {
  for (const circle of segments) {
    const arcLen = Number(circle.dataset.arcLen);
    const circ = Number(circle.dataset.circ);
    circle.style.transition = "none";
    circle.setAttribute("stroke-dasharray", `0 ${circ}`);
    void circle.getBoundingClientRect(); // force reflow so the reset registers
    requestAnimationFrame(() => {
      circle.style.transition = "stroke-dasharray 0.9s cubic-bezier(0.4, 0, 0.2, 1)";
      circle.setAttribute("stroke-dasharray", `${arcLen} ${circ - arcLen}`);
    });
  }
}

function ring({ stroke, dasharray, dashoffset }) {
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", DONUT.cx);
  c.setAttribute("cy", DONUT.cy);
  c.setAttribute("r", DONUT.radius);
  c.setAttribute("fill", "none");
  c.setAttribute("stroke", stroke);
  c.setAttribute("stroke-width", DONUT.stroke);
  c.setAttribute("stroke-linecap", "butt");
  if (dasharray) c.setAttribute("stroke-dasharray", dasharray);
  if (dashoffset !== undefined) c.setAttribute("stroke-dashoffset", dashoffset);
  return c;
}

function legendItem(t) {
  const li = document.createElement("li");
  li.className = "reach-roi-donut-legend-item";

  const swatch = document.createElement("span");
  swatch.className = "reach-roi-donut-swatch";
  swatch.style.background = t.color;

  const name = document.createElement("span");
  name.className = "reach-roi-donut-legend-name";
  name.textContent = t.name;

  const val = document.createElement("span");
  val.className = "reach-roi-donut-legend-val";
  val.textContent = formatCurrency(t.dollarsAvoidable);

  li.append(swatch, name, val);
  return li;
}

function showTooltip(els, text, e) {
  const tip = els.donutTooltip;
  if (!tip) return;
  tip.textContent = text;
  tip.classList.remove("reach-roi-is-hidden");
  const rect = tip.parentElement.getBoundingClientRect();
  tip.style.left = `${e.clientX - rect.left}px`;
  tip.style.top = `${e.clientY - rect.top}px`;
}

const hideTooltip = (els) => els.donutTooltip?.classList.add("reach-roi-is-hidden");
