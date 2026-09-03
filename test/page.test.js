/**
 * @vitest-environment happy-dom
 *
 * End-to-end smoke test of the DOM wiring: the real index.html is loaded, the
 * modules boot against it, and a visitor's path is walked through to results.
 * This is what catches a selector that no longer matches after the refactor.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// happy-dom rewrites import.meta.url, so resolve from the project root instead.
const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

beforeAll(async () => {
  document.documentElement.innerHTML = html.slice(html.indexOf("<body"), html.indexOf("</body>"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  await import("../src/main.js");
});

const $ = (sel) => document.querySelector(sel);
const setValue = (sel, value) => {
  $(sel).value = value;
  $(sel).dispatchEvent(new Event("input"));
};
const check = (id) => {
  const el = $(`[data-rrc-task-toggle="${id}"]`);
  el.checked = true;
  el.dispatchEvent(new Event("change"));
};

describe("calculator page", () => {
  it("renders every benchmark as a task row", () => {
    expect(document.querySelectorAll("[data-rrc-task-row]")).toHaveLength(10);
    expect($('[data-rrc-task-toggle="security-controls-review"]')).toBeTruthy();
    // The observed-reduction badge comes from the benchmark, not hand-written markup.
    expect($('[data-rrc-task-reduction="security-controls-review"]').textContent).toBe(
      "Observed reduction: 80%",
    );
  });

  it("reveals the reduction badge and flips the label when a task is included", () => {
    check("security-controls-review");
    expect($('[data-rrc-task-state="security-controls-review"]').textContent).toBe("Included");
    expect(
      $('[data-rrc-task-reduction="security-controls-review"]').classList.contains("reach-roi-is-hidden"),
    ).toBe(false);
  });

  it("blocks submission and shows errors until the inputs are valid", () => {
    $("#rrc-submit-btn").click();
    expect($('[data-rrc-error="headcount"]').classList.contains("reach-roi-is-hidden")).toBe(false);
    expect($("#rrc-modal-overlay").classList.contains("reach-roi-is-hidden")).toBe(true);
  });

  it("opens the lead modal once the inputs are valid", () => {
    setValue("#rrc-headcount", "10");
    setValue("#rrc-salary", "208000");
    $("#rrc-submit-btn").click();
    expect($('[data-rrc-error="headcount"]').classList.contains("reach-roi-is-hidden")).toBe(true);
    expect($("#rrc-modal-overlay").classList.contains("reach-roi-is-hidden")).toBe(false);
  });

  it("rejects an incomplete lead form", () => {
    $("#rrc-f-first").value = "Ada";
    $("#rrc-form-submit").click();
    expect($("#rrc-form-error").classList.contains("reach-roi-is-hidden")).toBe(false);
    expect($("#rrc-view-results").classList.contains("reach-roi-is-hidden")).toBe(true);
  });

  it("submits the lead and shows the computed results", async () => {
    for (const [sel, value] of [
      ["#rrc-f-last", "Lovelace"],
      ["#rrc-f-email", "ada@example.com"],
      ["#rrc-f-company", "Example Corp"],
      ["#rrc-f-country", "United Kingdom"],
      ["#rrc-f-state", "Greater London"],
    ]) {
      $(sel).value = value;
    }
    $("#rrc-f-optin").checked = true;
    $("#rrc-form-submit").click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());

    expect($("#rrc-modal-overlay").classList.contains("reach-roi-is-hidden")).toBe(true);
    expect($("#rrc-view-results").classList.contains("reach-roi-is-hidden")).toBe(false);
    expect($("#rrc-out-value").textContent).toBe("$240,000");
    expect($("#rrc-out-hours").textContent).toBe("2,400");
    expect($("#rrc-out-fte").textContent).toBe("1.2 FTEs");
    expect($("#rrc-tasks-included").textContent).toBe("1 task included in this assessment");
  });

  it("posts the lead and its assessment to the API", () => {
    const [url, init] = fetch.mock.calls.at(-1);
    expect(url).toBe("/api/lead");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.email).toBe("ada@example.com");
    expect(body.state).toBe("Greater London");
    expect(body.optIn).toBe(true);
    expect(body.website).toBe(""); // honeypot left empty
    expect(body.assessment.totalDollars).toBe(240000);
    expect(body.assessment.includedTasks).toHaveLength(1);
  });

  it("leaves the consent box unticked by default", () => {
    // A pre-ticked box is not valid consent, and submission never depended on it.
    expect(document.querySelector("#rrc-f-optin").defaultChecked).toBe(false);
  });

  it("draws one donut segment per included activity", () => {
    expect(document.querySelectorAll("#rrc-donut-segments circle")).toHaveLength(1);
    expect(document.querySelectorAll("#rrc-donut-legend li")).toHaveLength(1);
  });
});
