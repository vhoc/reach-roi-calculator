import { describe, expect, it } from "vitest";
import { TASK_BENCHMARKS } from "../src/benchmarks.js";
import { calculateResults, generateSummary, hasCapacityWarning } from "../src/calc.js";
import baseline from "../baseline/results.json" with { type: "json" };

const stateWith = ({ headcount, salary, included }) => ({
  teamHeadcount: headcount,
  annualSalary: salary,
  tasks: TASK_BENCHMARKS.map((b) => ({
    id: b.id,
    name: b.name,
    color: b.color,
    reductionRate: b.reductionRate,
    included: included.includes(b.id),
    applicableFTEs: headcount,
    currentHoursPerFTEPerMonth: b.manualHoursPerFTEPerMonth,
  })),
});

describe("calculation engine", () => {
  it("matches the pre-refactor baseline exactly", () => {
    const state = stateWith({
      headcount: 12,
      salary: 165000,
      included: [
        "security-controls-review",
        "compliance-audit-readiness",
        "endpoint-health",
        "network-security-health",
      ],
    });
    const r = calculateResults(state);

    expect(r.totalHours).toBe(baseline.totalHours);
    expect(r.totalDollars).toBe(baseline.totalDollars);
    expect(r.equivalentFTECapacity).toBe(baseline.equivalentFTECapacity);
    expect(r.weightedReductionRate).toBe(baseline.weightedReductionRate);
    expect(r.includedCount).toBe(baseline.includedCount);
    expect(
      r.perTask.map(({ id, included, hoursAvoidable, dollarsAvoidable }) => ({
        id,
        included,
        hoursAvoidable,
        dollarsAvoidable,
      })),
    ).toEqual(baseline.perTask);
  });

  it("works the documented example by hand", () => {
    // 25 h/FTE/mo * 10 FTEs * 80% * 12 months = 2,400 hours.
    // $208,000 / 2080 = $100/hour -> $240,000.
    const r = calculateResults(
      stateWith({ headcount: 10, salary: 208000, included: ["security-controls-review"] }),
    );
    expect(r.totalHours).toBe(2400);
    expect(r.totalDollars).toBe(240000);
    expect(r.equivalentFTECapacity).toBeCloseTo(1.1538, 4);
  });

  it("weights the reduction rate by hours, not by averaging percentages", () => {
    // A naive mean of 80% and 90% would be 85%; hours-weighted is not.
    const r = calculateResults(
      stateWith({
        headcount: 1,
        salary: 100000,
        included: ["security-controls-review", "attack-modeling-threat-actor-mapping"],
      }),
    );
    // (25*0.8 + 10*0.9) / 35 = 29/35
    expect(r.weightedReductionRate).toBeCloseTo(29 / 35, 10);
    expect(r.weightedReductionRate).not.toBeCloseTo(0.85, 3);
  });

  it("excludes unselected tasks from every total", () => {
    const r = calculateResults(stateWith({ headcount: 5, salary: 100000, included: [] }));
    expect(r.includedCount).toBe(0);
    expect(r.totalHours).toBe(0);
    expect(r.totalDollars).toBe(0);
    expect(r.weightedReductionRate).toBe(0);
  });

  it("flags effort that exceeds physical monthly capacity", () => {
    const state = stateWith({ headcount: 1, salary: 100000, included: ["security-controls-review"] });
    expect(hasCapacityWarning(state)).toBe(false);
    state.tasks[0].currentHoursPerFTEPerMonth = 200; // > 173.33
    expect(hasCapacityWarning(state)).toBe(true);
  });

  it("summarises with the same figures it computed", () => {
    const state = stateWith({ headcount: 10, salary: 208000, included: ["security-controls-review"] });
    const summary = generateSummary(state, calculateResults(state));
    expect(summary).toContain("2,400 hours");
    expect(summary).toContain("$240,000");
    expect(summary).toContain("1 activity");
  });
});
