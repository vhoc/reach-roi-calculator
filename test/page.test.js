/**
 * @vitest-environment happy-dom
 *
 * End-to-end smoke test of the DOM wiring: the real index.html is loaded, the
 * modules boot against it, and a visitor's path is walked through to the
 * handoff. Rendering those results is thank-you.test.js's job.
 * This is what catches a selector that no longer matches after the refactor.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// happy-dom rewrites import.meta.url, so resolve from the project root instead.
const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

beforeAll(async () => {
  // A scripting browser never renders <noscript>; happy-dom would fetch GTM's iframe from it.
  document.documentElement.innerHTML = html
    .slice(html.indexOf("<body"), html.indexOf("</body>"))
    .replace(/<noscript>[\s\S]*?<\/noscript>/, "");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  // The submit navigates to /thank-you; happy-dom would try to load it for real.
  vi.stubGlobal("location", { assign: vi.fn(), search: "", href: "http://localhost/" });
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
  it("has no inline styles, which the production CSP (style-src 'self') blocks", () => {
    expect(html).not.toMatch(/<style|\sstyle=/);
  });

  it("loads GTM from a file, which the production CSP (script-src without 'unsafe-inline') requires", () => {
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
    expect(html).toContain('<script src="/gtm.js"></script>');
    expect(html).toContain("ns.html?id=GTM-58NDHDPL");
  });

  it("offers every country as a select option, behind a placeholder", () => {
    const options = document.querySelectorAll("#rrc-f-country option");
    expect(options).toHaveLength(243);                // 242 countries + placeholder
    expect(options[0].value).toBe("");                // nothing chosen yet
    expect(options[1].value).toBe("United States");   // primary markets first
    expect(options[2].value).toBe("Canada");
    expect([...options].some((o) => o.value === "Côte d'Ivoire")).toBe(true);
  });

  it("cannot hold a value that is not on the list", () => {
    const select = $("#rrc-f-country");
    select.value = "Freedonia";
    expect(select.value).toBe("");   // a select silently refuses unknown values
  });

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

  it("Select All ticks every task, and unticking any task clears it", () => {
    const all = $("#rrc-select-all");
    const toggle = (el, on) => {
      el.checked = on;
      el.dispatchEvent(new Event("change"));
    };
    toggle(all, true);
    expect(document.querySelectorAll("[data-rrc-task-toggle]:checked")).toHaveLength(10);

    toggle($('[data-rrc-task-toggle="security-controls-review"]'), false);
    expect(all.checked).toBe(false);
    expect(document.querySelectorAll("[data-rrc-task-toggle]:checked")).toHaveLength(9);

    // Restore the single-task selection the later tests expect.
    toggle(all, false);
    check("security-controls-review");
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

  it("keeps submit disabled until every required field is valid", () => {
    const submit = $("#rrc-form-submit");
    expect(submit.disabled).toBe(true);

    const fill = (sel, value) => {
      $(sel).value = value;
      $(sel).dispatchEvent(new Event("input"));
    };
    fill("#rrc-f-first", "Ada");
    expect(submit.disabled).toBe(true);
    fill("#rrc-f-last", "Lovelace");
    fill("#rrc-f-company", "Example Corp");
    expect(submit.disabled).toBe(true);

    fill("#rrc-f-email", "not-an-email");
    fill("#rrc-f-country", "United States");   // a real option
    expect(submit.disabled).toBe(true); // email still invalid

    fill("#rrc-f-email", "ada@example.com");
    expect(submit.disabled).toBe(false);

    // State and consent are optional — neither gates the button.
    expect($("#rrc-f-state").value).toBe("");
    expect($("#rrc-f-optin").checked).toBe(false);
  });

  it("re-disables submit when a required field is emptied again", () => {
    const submit = $("#rrc-form-submit");
    $("#rrc-f-company").value = "";
    $("#rrc-f-company").dispatchEvent(new Event("input"));
    expect(submit.disabled).toBe(true);

    $("#rrc-f-company").value = "Example Corp";
    $("#rrc-f-company").dispatchEvent(new Event("input"));
    expect(submit.disabled).toBe(false);
  });

  it("shows State only for countries with a validated list", () => {
    const country = $("#rrc-f-country");
    const field = $("#rrc-state-field");
    const hidden = () => field.classList.contains("reach-roi-is-hidden");

    country.value = "United States";
    country.dispatchEvent(new Event("change"));
    expect(hidden()).toBe(false);
    expect(document.querySelectorAll("#rrc-f-state option")).toHaveLength(52); // 51 + placeholder

    country.value = "Canada";
    country.dispatchEvent(new Event("change"));
    expect(document.querySelectorAll("#rrc-f-state option")).toHaveLength(14); // 13 + placeholder

    country.value = "France";
    country.dispatchEvent(new Event("change"));
    expect(hidden()).toBe(true);
  });

  it("drops a state left over from a previous country", () => {
    const country = $("#rrc-f-country");
    country.value = "United States";
    country.dispatchEvent(new Event("change"));
    $("#rrc-f-state").value = "California";

    country.value = "France";
    country.dispatchEvent(new Event("change"));
    // Sending California with France is a Field Integrity Exception in Pardot.
    expect($("#rrc-f-state").value).toBe("");
  });

  it("will not enable submit while no country is chosen", () => {
    const select = $("#rrc-f-country");
    select.value = "";
    select.dispatchEvent(new Event("change"));
    expect($("#rrc-form-submit").disabled).toBe(true);

    select.value = "United States";
    select.dispatchEvent(new Event("change"));
    expect($("#rrc-form-submit").disabled).toBe(false);
  });

  it("hands the assessment to /thank-you and navigates there", async () => {
    for (const [sel, value] of [
      ["#rrc-f-first", "Ada"],
      ["#rrc-f-last", "Lovelace"],
      ["#rrc-f-email", "ada@example.com"],
      ["#rrc-f-company", "Example Corp"],
      ["#rrc-f-country", "United States"],
      ["#rrc-f-state", "California"],
    ]) {
      $(sel).value = value;
      $(sel).dispatchEvent(new Event("input"));
    }
    expect($("#rrc-form-submit").disabled).toBe(false);
    $("#rrc-f-optin").checked = true;
    $("#rrc-form-submit").click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());

    // The modal stays up until the browser leaves: no flash of the empty form.
    expect($("#rrc-modal-overlay").classList.contains("reach-roi-is-hidden")).toBe(false);
    expect(location.assign).toHaveBeenCalledWith("/thank-you");
    // The results page recomputes from this, so the inputs have to survive.
    const { lead, state } = JSON.parse(sessionStorage.getItem("rrc-assessment"));
    expect(lead.email).toBe("ada@example.com");
    expect(lead.company).toBe("Example Corp");
    expect(state.teamHeadcount).toBe(10);
    expect(state.annualSalary).toBe(208000);
    expect(state.tasks.filter((t) => t.included)).toHaveLength(1);
  });

  it("posts the lead and its assessment to the API", () => {
    const [url, init] = fetch.mock.calls.at(-1);
    expect(url).toBe("/api/lead");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.email).toBe("ada@example.com");
    expect(body.country).toBe("United States");
    expect(body.state).toBe("California");
    expect(body.optIn).toBe(true);
    expect(body.website).toBe(""); // honeypot left empty
    expect(body.assessment.totalDollars).toBe(240000);
    expect(body.assessment.includedTasks).toHaveLength(1);
  });

  it("leaves the consent box unticked by default", () => {
    // A pre-ticked box is not valid consent, and submission never depended on it.
    expect(document.querySelector("#rrc-f-optin").defaultChecked).toBe(false);
  });
});
