---
name: pardot-leads
description: How the ROI calculator delivers leads to Pardot (Account Engagement) — the /api/lead endpoint, the Form Handler field mapping, country/state validation, CAPTCHA, and what deliberately is not sent. Use when touching src/lead*.js, src/countries.js, src/states.js, server/index.js, server/pardot.js, or anything about lead capture, Salesforce, Prospects, or the lead modal.
---

# Lead submission

The browser POSTs JSON to `/api/lead`. The Hono service validates it against
[src/lead-schema.js](../../../src/lead-schema.js), checks the honeypot, optionally verifies a
CAPTCHA token, then posts server-to-server to a **Pardot (Account Engagement) Form
Handler**, which creates or updates a Prospect keyed on email. The Prospect syncs on
to a Salesforce Lead or Contact through the Pardot connector — this service never
talks to Salesforce directly.

**The handler URL is the credential.** A Form Handler has no API key or Org ID:
anyone holding the URL can inject prospects. Keeping it server-side, rather than in
the page as a normal Pardot form would, is the reason this proxy exists. It lives in
`.env` (gitignored) and deliberately not in the committed `.env.example`.

> **Never point a local `.env` at the live Pardot handler.** `pnpm server` loads
> `.env`, so every submission you make while testing would create a real Prospect in
> the client's CRM for someone to find and delete. `pnpm stub`
> ([server/stub-handler.js](../../../server/stub-handler.js)) is a local stand-in that prints
> the payload and mimics Pardot's success/error redirects — add `?fail` to the handler
> URL to exercise the rejection path. The live URL belongs only in the production
> server's `.env`.

**Never prefix a Pardot or CAPTCHA secret with `VITE_`** — that inlines it into the
browser bundle and puts the credential back on a public page.

**Confirming delivery.** A Form Handler *with* a Success Location answers 302, and
that redirect target is the accept/reject signal — so [server/pardot.js](../../../server/pardot.js)
posts with `redirect: "manual"`, since following the redirect would land on the
success page and report success for a rejection too.

A handler *without* one answers 200 inline and sends no `Location` at all. That is
the case for handler 1119553 today, so delivery confirmation is currently
transport-level only: "Pardot accepted the request", not "Pardot stored the
Prospect". Ask the client to configure a Success Location if stronger confirmation
matters.

Only a redirect to an *unexpected* place is treated as a failure; a missing
`Location` falls through to the status code. Setting `PARDOT_SUCCESS_URL` to a value
the handler does not actually redirect to would otherwise fail every delivery that
in fact succeeded — leave both URLs blank unless they come from the handler config.

Configure via `.env` (see [.env.example](../../../.env.example)). `PARDOT_FORM_HANDLER_URL` is
required; with it unset the endpoint answers 502 `not_configured` rather than
pretending to succeed. A failed delivery is logged with the full lead so an outage
does not lose it.

**CAPTCHA is optional and off by default.** It runs only when both `CAPTCHA_SECRET`
and `CAPTCHA_VERIFY_URL` are set — a half-configured pair means "off", never "reject
everyone", since a token cannot be verified without both halves. Once enabled it
fails closed: no token, an unverifiable token, or an unreachable provider all give
403. The server logs `captcha: enabled|disabled` at boot, because a typo in either
variable name would otherwise disable it silently. Note the browser does not yet
render a widget or send `captchaToken`, so enabling it today refuses every lead.

## Field mapping

`FIELD_MAP` in [server/pardot.js](../../../server/pardot.js) maps our field names onto the
handler's external names. This is the complete set the handler defines, confirmed by
the client on 2026-09-02:

| Ours | Handler field |
|---|---|
| `firstName` | `fname` |
| `lastName` | `lname` |
| `email` | `email` — Pardot keys Prospects on this |
| `company` | `company` |
| `country` | `Country` — must be a value from [src/countries.js](../../../src/countries.js) |
| `state` | `State` — optional; a validated picklist scoped to `country` |
| `optIn` | `Opt-in` — **required by the handler**, so always sent as `"true"`/`"false"` |

Salesforce validates **State against the chosen country** and flags the Prospect with
a *Field Integrity Exception* on a mismatch — which a free-text State field produced.
[src/states.js](../../../src/states.js) covers the United States and Canada; for every other
country the field is hidden and no State is sent, which is valid because the handler
does not require it. Switching country clears a state left over from the previous
one. `leadSchema` re-checks the pair server-side.

Pardot validates `Country` against its own allowed values and treats anything else
as empty — which, on a required field, means the submission is rejected and no
Prospect is created. `src/countries.js` holds that list verbatim; the browser renders
it into the country `<select>`, which cannot hold anything else, and the server
re-checks against it because a direct POST never touches that element. Do not "tidy"
those strings: `Viet Nam` and `Hong Kong S.A.R., China` look wrong and are not.

Names are **case-sensitive on the wire**: `country` would be silently dropped where
`Country` is accepted. Empty values are skipped rather than posted, so a blank never
overwrites a populated Prospect field — which is also how optional State works: a
visitor from Paris simply produces a payload with no `State` key.

**The assessment is not sent to Pardot.** The handler has no `comments` field or
equivalent, and the client chose not to add one. Headcount, salary, hours reclaimed,
FTE capacity, dollar value, the per-activity breakdown and UTM attribution therefore
reach this service but go no further — a Prospect arrives as name, email, company,
country and state only. `summarise()` writes the figures to the service log so
journald is at least a record of what each prospect calculated:

```
lead delivered: jose@example.com Ácme Sécurité | 12 FTEs @ $165,000; 6,854 hrs, 3.3 FTE, $543,738; 1 activities; source=webflow
```

If a long-text field is ever added to the handler, restoring full delivery is adding
one entry to `FIELD_MAP` and passing `summarise()` (or a longer formatter) to it.

Lead source is likewise not sent — the client tracks it on the handler side.

## Two Pardot-specific settings

- **Kiosk / Data Entry Mode must be enabled on the handler.** This service posts, not
  the visitor's browser, so without it Pardot cookies *the server* as the submitting
  prospect and associates every submission with one visitor.
- **Server-side posting breaks visitor-to-prospect stitching.** The visitor's Pardot
  tracking cookie never reaches Pardot, so a new Prospect is not linked to that
  person's earlier browsing on the marketing site. UTM attribution still arrives (in
  `comments`), but if the marketing team relies on Pardot's own visitor history,
  raise it with whoever administers Pardot before go live.

## Security posture

Client-side validation is advisory; anyone can POST directly to `/api/lead`. Every
check is therefore repeated on the server. The defences and where they live:

| Concern | Where |
|---|---|
| Field validation, length caps | zod, server-side (`maxlength` in the form is UX only) |
| Bot submissions | honeypot `#rrc-f-website`, absorbed with a 200 so a bot cannot tell |
| CAPTCHA | opt-in: off unless **both** `CAPTCHA_SECRET` and `CAPTCHA_VERIFY_URL` are set; fails closed once on |
| Rate limiting | nginx `limit_req`, 5/min per IP |
| Credentials | server-side only; nothing sensitive reaches the browser |
| TLS, HSTS, CSP, `frame-ancestors` | nginx — see [deploy/nginx.conf.example](../../../deploy/nginx.conf.example) |
| Endpoint exposure | binds `127.0.0.1` only; nginx is the sole route in |
