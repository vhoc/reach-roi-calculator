/** Client side of lead capture: read the form, validate, POST to our own API. */
import { buildLeadRequest } from "./lead-request.js";

const ENDPOINT = import.meta.env.VITE_LEAD_ENDPOINT || "/api/lead";

/** UTM params off the current URL, captured once at load. */
export const utm = readUtm();

function readUtm() {
  const p = new URLSearchParams(window.location.search);
  const out = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const v = p.get(`utm_${k}`);
    if (v) out[k] = v.slice(0, 120);
  }
  if (document.referrer) out.referrer = document.referrer.slice(0, 500);
  return out;
}

/**
 * Posts the lead. Resolves { ok } — the caller surfaces failure but does not
 * block on it: the visitor gets their report either way.
 */
export async function submitLead(lead, state, results) {
  const body = buildLeadRequest(lead, state, results, utm);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true, // survives the visitor navigating away mid-post
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}
