/**
 * Lead endpoint. Deliberately small: nginx in front handles TLS, security
 * headers, static files, and rate limiting (see deploy/nginx.conf.example).
 * This process exists only so the Pardot Form Handler URL stays off the public
 * page and so delivery failures are knowable.
 */
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { leadSchema } from "../src/lead-schema.js";
import { deliverLead, summarise } from "./pardot.js";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/lead", async (c) => {
  const parsed = leadSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ ok: false, error: "validation" }, 400);
  }
  const lead = parsed.data;

  // Honeypot: a real visitor never sees this field, so anything in it is a bot.
  // Answer 200 so the bot cannot tell it was caught and retry differently.
  if (lead.website) {
    console.warn("lead rejected: honeypot filled");
    return c.json({ ok: true });
  }

  // CAPTCHA is opt-in: it runs only when fully configured. Once on, it fails
  // closed — an unverifiable token is not a valid one.
  if (captchaEnabled() && !(await verifyCaptcha(lead.captchaToken, c.req.header("x-forwarded-for")))) {
    return c.json({ ok: false, error: "captcha" }, 403);
  }

  const result = await deliverLead(lead);
  if (!result.ok) {
    // Log the full lead so a Salesforce outage does not silently lose it.
    const detail = result.location ? ` (redirected to ${result.location})` : "";
    console.error(`lead delivery failed: ${result.error}${detail}`, JSON.stringify(lead));
    return c.json({ ok: false, error: result.error }, 502);
  }
  // The handler carries no assessment field, so this log is the only record of
  // what a prospect calculated. Print the exact payload that went on the wire,
  // not a reconstruction of it.
  console.info("lead delivered:", JSON.stringify(result.fields), "|", summarise(lead));
  // "Delivered" here means Pardot accepted the HTTP request, not that it stored
  // a Prospect. Until the handler has an Error Location, its response body is
  // the only evidence of a rejection, so record it.
  if (result.snippet) console.info("  pardot replied:", result.status ?? "", result.snippet);
  return c.json({ ok: true });
});

/**
 * CAPTCHA needs both halves to work: the secret to sign the check and the URL
 * to send it to. With either missing there is no way to verify a token, so the
 * feature stays off rather than rejecting every visitor.
 */
const captchaEnabled = () => Boolean(process.env.CAPTCHA_SECRET && process.env.CAPTCHA_VERIFY_URL);

async function verifyCaptcha(token, ip) {
  if (!token) return false;
  try {
    const res = await fetch(process.env.CAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.CAPTCHA_SECRET, response: token, remoteip: ip ?? "" }),
      signal: AbortSignal.timeout(5000),
    });
    return (await res.json()).success === true;
  } catch {
    return false; // fail closed: an unverifiable token is not a valid one
  }
}

// Only listen when run directly, so tests can exercise app.request() instead.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8787);
  // State the mode at boot: a typo in either variable name would otherwise
  // disable CAPTCHA silently, and nothing downstream would ever say so.
  console.log(`captcha: ${captchaEnabled() ? "enabled" : "disabled (set CAPTCHA_SECRET and CAPTCHA_VERIFY_URL to enable)"}`);
  // Loopback by default: nginx is the only thing that should reach this port,
  // and binding to 0.0.0.0 would expose the endpoint directly if a firewall
  // rule were ever loosened. Set HOST=0.0.0.0 to test from another device.
  const hostname = process.env.HOST ?? "127.0.0.1";
  serve({ fetch: app.fetch, port, hostname }, ({ address, port }) =>
    console.log(`lead endpoint on ${address}:${port}`),
  );
}
