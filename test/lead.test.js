import { describe, expect, it } from "vitest";
import { buildLeadRequest } from "../src/lead-request.js";
import { leadSchema } from "../src/lead-schema.js";
import { summarise, toFormHandlerFields } from "../server/pardot.js";

const lead = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  company: "Example Corp",
  country: "United Kingdom",
  state: "Greater London",
  optIn: true,
};
const calcState = { teamHeadcount: 10, annualSalary: 208000 };
const results = {
  totalHours: 2400,
  totalDollars: 240000,
  equivalentFTECapacity: 1.1538,
  perTask: [
    { name: "Security Controls Review", included: true, hoursAvoidable: 2400, dollarsAvoidable: 240000 },
    { name: "Compliance & Audit Readiness", included: false, hoursAvoidable: 99, dollarsAvoidable: 99 },
  ],
};

describe("lead schema", () => {
  it("accepts a complete lead", () => {
    expect(leadSchema.safeParse(buildLeadRequest(lead, calcState, results)).success).toBe(true);
  });

  it("rejects a missing name, a bad email, and an over-long field", () => {
    for (const patch of [{ lastName: "" }, { email: "not-an-email" }, { company: "x".repeat(256) }]) {
      expect(leadSchema.safeParse({ ...lead, ...patch }).success).toBe(false);
    }
  });

  it("carries only the included activities", () => {
    const body = buildLeadRequest(lead, calcState, results);
    expect(body.assessment.includedTasks).toHaveLength(1);
    expect(body.assessment.includedTasks[0].name).toBe("Security Controls Review");
  });

  it("keeps campaign attribution", () => {
    const body = buildLeadRequest(lead, calcState, results, { source: "webflow", campaign: "q3" });
    expect(leadSchema.parse(body).utm).toEqual({ source: "webflow", campaign: "q3" });
  });
});

describe("Pardot Form Handler mapping", () => {
  const parsed = leadSchema.parse(buildLeadRequest(lead, calcState, results, { source: "webflow" }));

  // The handler's confirmed external field names: email, fname, lname,
  // Country, State, company.
  it("uses the handler's exact field names, case included", () => {
    const f = toFormHandlerFields(parsed);
    expect(f.fname).toBe("Ada");
    expect(f.lname).toBe("Lovelace");
    expect(f.email).toBe("ada@example.com"); // Pardot keys prospects on this
    expect(f.company).toBe("Example Corp");
    // Capital C and S — form field names are case-sensitive on the wire.
    expect(f.Country).toBe("United Kingdom");
    expect(f.State).toBe("Greater London");
  });

  it("does not send the names the handler does not have", () => {
    const f = toFormHandlerFields(parsed);
    for (const stale of ["first_name", "last_name", "country", "oid"]) {
      expect(f).not.toHaveProperty(stale);
    }
  });

  it("posts exactly the fields the handler defines, and nothing else", () => {
    // The handler has no field for the assessment or the lead source, so
    // neither is sent — they would be silently discarded.
    expect(Object.keys(toFormHandlerFields(parsed)).sort()).toEqual([
      "Country",
      "Opt-in",
      "State",
      "company",
      "email",
      "fname",
      "lname",
    ]);
  });

  it("always sends Opt-in, since the handler marks it required", () => {
    // A blank required field fails validation and no Prospect is created —
    // silently, because the handler has no Error Location.
    expect(toFormHandlerFields({ ...parsed, optIn: true })["Opt-in"]).toBe("true");
    expect(toFormHandlerFields({ ...parsed, optIn: false })["Opt-in"]).toBe("false");
    expect(toFormHandlerFields({ ...parsed, optIn: undefined })).toHaveProperty("Opt-in", "false");
  });

  it("skips an empty value rather than blanking a populated Prospect field", () => {
    expect(toFormHandlerFields({ ...parsed, company: "" })).not.toHaveProperty("company");
  });

  it("defaults consent to declined when the box is never touched", () => {
    const { optIn: _o, ...noConsent } = lead;
    const body = leadSchema.parse(buildLeadRequest(noConsent, calcState, results));
    expect(body.optIn).toBe(false);
  });

  it("accepts a lead with no state and simply omits the field", () => {
    const { state: _region, ...noState } = lead;
    const body = leadSchema.parse(buildLeadRequest(noState, calcState, results));
    expect(body.state).toBe("");
    expect(toFormHandlerFields(body)).not.toHaveProperty("State");
  });

  it("summarises the assessment for the log, since no field carries it", () => {
    const line = summarise(parsed);
    expect(line).toContain("$240,000");
    expect(line).toContain("10 FTEs");
    expect(line).toContain("source=webflow");
  });
});
