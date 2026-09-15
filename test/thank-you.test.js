/**
 * @vitest-environment happy-dom
 *
 * The results page. It owns no inputs: it renders whatever the calculator page
 * handed over in sessionStorage, and sends the visitor back to the form when
 * nothing did.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TASK_BENCHMARKS } from "../src/benchmarks.js";

const html = readFileSync(resolve(process.cwd(), "thank-you.html"), "utf8");

// Exactly what main.js's getState() stores: ten tasks, one of them included.
const state = {
  teamHeadcount: 10,
  annualSalary: 208000,
  tasks: TASK_BENCHMARKS.map((b) => ({
    id: b.id,
    name: b.name,
    color: b.color,
    reductionRate: b.reductionRate,
    included: b.id === "security-controls-review",
    applicableFTEs: 10,
    currentHoursPerFTEPerMonth: b.manualHoursPerFTEPerMonth,
  })),
};
const lead = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", company: "Example Corp" };

const $ = (sel) => document.querySelector(sel);

const loadPage = () => {
  // A scripting browser never renders <noscript>; happy-dom would fetch GTM's iframe from it.
  document.documentElement.innerHTML = html
    .slice(html.indexOf("<body"), html.indexOf("</body>"))
    .replace(/<noscript>[\s\S]*?<\/noscript>/, "");
};

beforeAll(async () => {
  loadPage();
  sessionStorage.setItem("rrc-assessment", JSON.stringify({ lead, state }));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
  await import("../src/thank-you.js");
});

describe("thank-you page", () => {
  it("has no inline styles, which the production CSP (style-src 'self') blocks", () => {
    expect(html).not.toMatch(/<style|\sstyle=/);
  });

  it("loads GTM from a file, which the production CSP (script-src without 'unsafe-inline') requires", () => {
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
    expect(html).toContain('<script src="/gtm.js"></script>');
    expect(html).toContain("ns.html?id=GTM-58NDHDPL");
  });

  it("renders the results recomputed from the handoff", () => {
    expect($("#rrc-out-value").textContent).toBe("$240,000");
    expect($("#rrc-out-hours").textContent).toBe("2,400");
    expect($("#rrc-out-fte").textContent).toBe("1.2 FTEs");
    expect($("#rrc-tasks-included").textContent).toBe("1 task included in this assessment");
    expect($("#rrc-summary-text").textContent).not.toBe("");
  });

  it("draws one donut segment per included activity", () => {
    expect(document.querySelectorAll("#rrc-donut-segments circle")).toHaveLength(1);
    expect(document.querySelectorAll("#rrc-donut-legend li")).toHaveLength(1);
  });

  it("builds the report only when the download button is pressed", async () => {
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    $("#rrc-download-btn").click();
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
  });
});

describe("opened without an assessment", () => {
  it("sends the visitor back to the form", async () => {
    sessionStorage.clear();
    loadPage();
    const replace = vi.fn();
    vi.stubGlobal("location", { replace, search: "", href: "http://localhost/thank-you" });
    vi.resetModules();
    await import("../src/thank-you.js");
    expect(replace).toHaveBeenCalledWith("/");
    expect($("#rrc-out-value").textContent).toBe("$0"); // nothing rendered
  });
});
