/**
 * Carries the assessment from the calculator page to /thank-you.
 *
 * sessionStorage, not the URL: the payload holds the visitor's name, employer
 * and salary figures, and a query string ends up in nginx logs, the Referer
 * header and every analytics hit.
 */
const KEY = "rrc-assessment";

/** Fails quietly — /thank-you sends the visitor back to the form if nothing arrives. */
export function saveAssessment(lead, state) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ lead, state }));
  } catch {
    /* storage disabled or full */
  }
}

export function loadAssessment() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}
