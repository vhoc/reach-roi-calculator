/**
 * Shapes the request body from the lead and the calculator's state. Pure and
 * dependency-free, so the browser bundle does not pull in zod — the schema in
 * lead-schema.js validates this same shape on the server, where it is a trust
 * boundary.
 *
 * `calcState` is the calculator's inputs, not to be confused with `lead.state`,
 * which is the visitor's State / Region.
 */
export function buildLeadRequest(lead, calcState, results, utm = {}) {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    country: lead.country,
    state: lead.state,
    optIn: lead.optIn ?? false,
    website: lead.website ?? "",
    utm,
    assessment: calcState &&
      results && {
        teamHeadcount: calcState.teamHeadcount,
        annualSalary: calcState.annualSalary,
        totalHours: results.totalHours,
        totalDollars: results.totalDollars,
        equivalentFTECapacity: results.equivalentFTECapacity,
        includedTasks: results.perTask
          .filter((t) => t.included)
          .map((t) => ({ name: t.name, hours: t.hoursAvoidable, dollars: t.dollarsAvoidable })),
      },
  };
}
