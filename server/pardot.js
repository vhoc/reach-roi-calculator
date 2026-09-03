/**
 * Pardot (Account Engagement) Form Handler delivery. Server-only.
 *
 * A Form Handler has no API key: the handler URL *is* the credential, so
 * anyone holding it can inject prospects. Keeping it server-side — rather than
 * in the page as a normal Pardot form would — is the point of this proxy.
 *
 * Unlike Salesforce Web-to-Lead, which answers 200 whether or not it accepted
 * the record, a Form Handler redirects to its configured Success or Error
 * Location. That redirect target is the only real accept/reject signal, and it
 * is readable only server-side.
 */

const env = (k, fallback = "") => process.env[k] ?? fallback;

/**
 * Our field names -> the external field names configured on the Form Handler,
 * confirmed by the client on 2026-09-02:
 *
 *     email · fname · lname · Country · State · company
 *
 * That is the complete set — the handler has no field for the assessment
 * figures or the lead source, so neither is posted (see CLAUDE.md). Names are
 * case-sensitive on the wire, hence `Country` and `State`.
 */
const FIELD_MAP = {
  firstName: "fname",
  lastName: "lname",
  email: "email",
  company: "company",
  country: "Country",
  state: "State",
};

/**
 * Marketing consent. The handler marks this field required, so it is sent on
 * every submission — a blank fails validation and no Prospect is created,
 * which is exactly how the first live tests failed silently.
 *
 * CONFIRM the external name and the accepted values against the handler's
 * configuration. Pardot checkbox fields define their own allowed values, and a
 * value the field does not recognise is as good as an empty one.
 */
const OPT_IN_FIELD = "Opt-in";
const OPT_IN_VALUES = { granted: "true", declined: "false" };

/** Maps a validated lead onto the Form Handler's field names. */
export function toFormHandlerFields(lead) {
  const fields = {};
  for (const [key, name] of Object.entries(FIELD_MAP)) {
    const value = lead[key];
    // Skip empty values: posting a blank can overwrite a populated Prospect field.
    if (value !== undefined && value !== null && value !== "") fields[name] = value;
  }
  fields[OPT_IN_FIELD] = lead.optIn ? OPT_IN_VALUES.granted : OPT_IN_VALUES.declined;
  return fields;
}

/**
 * One-line summary of what the visitor modelled.
 *
 * The handler has no field to carry this, so it goes to the service log rather
 * than being discarded outright — journald is then the only record of what any
 * given prospect actually calculated. Give it a home on the handler and this
 * becomes a `comments` mapping again.
 */
export function summarise({ assessment, utm }) {
  if (!assessment) return "no assessment";
  const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
  const campaign = Object.entries(utm ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  return (
    `${assessment.teamHeadcount} FTEs @ ${money(assessment.annualSalary)}; ` +
    `${Math.round(assessment.totalHours).toLocaleString("en-US")} hrs, ` +
    `${assessment.equivalentFTECapacity.toFixed(1)} FTE, ${money(assessment.totalDollars)}; ` +
    `${assessment.includedTasks.length} activities` +
    (campaign ? `; ${campaign}` : "")
  );
}

// A handler that accepts but has no Success Location still answers 2xx/3xx.
const TRANSPORT_OK = new Set([200, 201, 204, 301, 302, 303, 307, 308]);

/**
 * Posts the prospect. `redirect: "manual"` is essential — following the
 * redirect would land on the success page and report 200 for a rejection too.
 */
export async function deliverLead(lead, { timeoutMs = 8000 } = {}) {
  const url = env("PARDOT_FORM_HANDLER_URL");
  if (!url) return { ok: false, error: "not_configured" };

  const fields = toFormHandlerFields(lead);
  const body = new URLSearchParams(fields);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, error: err.name === "TimeoutError" ? "timeout" : "network" };
  }

  const location = res.headers.get("location") ?? "";
  const successUrl = env("PARDOT_SUCCESS_URL");
  const errorUrl = env("PARDOT_ERROR_URL");

  if (errorUrl && location.startsWith(errorUrl)) return { ok: false, error: "rejected", fields };
  if (successUrl && location.startsWith(successUrl)) return { ok: true, fields };

  // "Unexpected" only means anything once we have been told what to expect. With
  // both URLs blank — the documented safe default — a handler that redirects to
  // its own thank-you page was being reported as a failure on every success.
  const expectationsSet = Boolean(successUrl || errorUrl);
  if (expectationsSet && location) {
    return { ok: false, error: `unexpected_redirect_${res.status}`, location, fields };
  }
  // Unconfigured but redirecting: log where it went, so the Success Location can
  // simply be read off the logs instead of chased through the client.
  if (location) return { ok: true, fields, status: res.status, snippet: `redirected to ${location}` };

  // No redirect: all this proves is that the request was accepted at the
  // transport level, not that Pardot stored the Prospect. A handler with no
  // Error Location reports a rejected submission in the response body — the
  // only place left to look — so keep a bounded snippet of it for the log.
  const replied = await res.text().catch(() => "");
  const snippet = replied.replace(/\s+/g, " ").trim().slice(0, 400);

  return TRANSPORT_OK.has(res.status)
    ? { ok: true, fields, status: res.status, snippet }
    : { ok: false, error: `pardot_${res.status}`, fields, snippet };
}
