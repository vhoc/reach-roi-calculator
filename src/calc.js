/**
 * Core calculation engine — deliberately transparent and deterministic.
 * No result floors, ceilings, normalization, loaded-salary, or
 * percentage-of-team-time logic.
 *
 * Per selected task (benchmark hours are PER APPLICABLE FTE, PER MONTH):
 *   currentMonthlyHours   = applicableFTEs * currentHoursPerFTEPerMonth
 *   monthlyHoursReclaimed = currentMonthlyHours * reductionRate
 *   annualHoursReclaimed  = monthlyHoursReclaimed * 12
 *   salaryEquivValue      = annualHoursReclaimed * (annualSalary / 2080)
 *
 * 2080 is used only to (a) turn salary into an hourly value and (b) turn
 * reclaimed hours into equivalent FTE capacity.
 */
import { formatCurrency, formatNumber } from "./format.js";

export const WORK_HOURS_PER_YEAR = 2080;
export const MONTHS_PER_YEAR = 12;
export const MAX_HOURS_PER_FTE_PER_MONTH = WORK_HOURS_PER_YEAR / MONTHS_PER_YEAR; // 173.33

export function calculateResults(state) {
  const hourlySalaryValue = state.annualSalary / WORK_HOURS_PER_YEAR;

  let totalAnnualCurrentHours = 0;
  let totalAnnualHoursReclaimed = 0;
  let totalAnnualHoursWithReach = 0;
  let includedCount = 0;

  const perTask = state.tasks.map((t) => {
    const currentMonthlyHours = t.applicableFTEs * t.currentHoursPerFTEPerMonth;
    const monthlyHoursReclaimed = currentMonthlyHours * t.reductionRate;
    const monthlyHoursWithReach = currentMonthlyHours - monthlyHoursReclaimed;

    const annualCurrentHours = currentMonthlyHours * MONTHS_PER_YEAR;
    const annualHoursReclaimed = monthlyHoursReclaimed * MONTHS_PER_YEAR;
    const annualHoursWithReach = monthlyHoursWithReach * MONTHS_PER_YEAR;

    if (t.included) {
      totalAnnualCurrentHours += annualCurrentHours;
      totalAnnualHoursReclaimed += annualHoursReclaimed;
      totalAnnualHoursWithReach += annualHoursWithReach;
      includedCount += 1;
    }

    // Field names kept compatible with the donut and PDF renderers:
    //   dollarsAvoidable -> salary-equivalent value
    //   hoursAvoidable   -> annual hours reclaimed
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      included: t.included,
      applicableFTEs: t.applicableFTEs,
      currentHoursPerFTEPerMonth: t.currentHoursPerFTEPerMonth,
      reductionRate: t.reductionRate,
      annualCurrentHours,
      hoursAvoidable: annualHoursReclaimed,
      annualHoursWithReach,
      dollarsAvoidable: annualHoursReclaimed * hourlySalaryValue,
    };
  });

  return {
    perTask,
    includedCount,
    totalAnnualCurrentHours,
    totalHours: totalAnnualHoursReclaimed, // hours reclaimed (engine-compatible name)
    totalAnnualHoursWithReach,
    equivalentFTECapacity: totalAnnualHoursReclaimed / WORK_HOURS_PER_YEAR,
    totalDollars: totalAnnualHoursReclaimed * hourlySalaryValue,
    // Hours-weighted, never an average of the per-task percentages.
    weightedReductionRate:
      totalAnnualCurrentHours > 0 ? totalAnnualHoursReclaimed / totalAnnualCurrentHours : 0,
  };
}

/** True when an included task's per-FTE effort exceeds physical monthly capacity. */
export const hasCapacityWarning = (state) =>
  state.tasks.some(
    (t) => t.included && t.currentHoursPerFTEPerMonth > MAX_HOURS_PER_FTE_PER_MONTH + 0.05,
  );

export function generateSummary(state, results) {
  const hours = formatNumber(Math.round(results.totalHours));
  const n = results.includedCount;
  const activityWord = n === 1 ? "activity" : "activities";
  const fte = formatNumber(results.equivalentFTECapacity, 1);
  const value = formatCurrency(results.totalDollars);
  return (
    `Based on your inputs, Reach could reclaim an estimated ${hours} hours of security ` +
    `work annually across the ${n} ${activityWord} included in your assessment. That is ` +
    `equivalent to approximately ${fte} FTEs of security capacity and ${value} in ` +
    `salary-equivalent annual value.`
  );
}
