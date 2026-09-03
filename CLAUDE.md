# Reach Value Assessment — ROI Calculator

## What this is

A standalone security ROI calculator for reach.security, linked from the Webflow
site rather than embedded in it. A visitor enters their security team's headcount and
average salary, ticks the activities the team performs, and gets an estimate of hours
reclaimed, equivalent FTE capacity and salary-equivalent annual value — plus a two-page
PDF report.

It is a **lead-generation asset**: results are gated behind a lead-capture modal, and
submitting it registers the lead in Salesforce.

## Stack

Vanilla ES modules bundled by Vite. Vite is a bundler, not a framework — no component
model, no runtime, no lock-in. **Use pnpm, never npm.**

```sh
pnpm install
pnpm dev          # page on :5173, /api proxied to the lead server
pnpm server       # the lead endpoint on :8787
pnpm stub         # a fake Pardot handler on :9911 — see the warning below
pnpm test         # vitest, 33 tests
pnpm test:watch   # the same, in watch mode
pnpm build        # -> dist/
pnpm preview      # serve the built dist/ on :4173, /api proxied the same way
```

Local development needs **three terminals**: `pnpm dev`, `pnpm server`, `pnpm stub`.
Vite proxies `/api` to :8787 so the browser sees one origin, exactly as nginx presents
it in production. Without `pnpm server` the page still works and the report still
downloads — only the lead POST fails, and Vite prints which command is missing.

> **Never point a local `.env` at the live Pardot handler.** `pnpm server` loads
> `.env`, so every submission you make while testing would create a real Prospect in
> the client's CRM for someone to find and delete. `pnpm stub`
> ([server/stub-handler.js](server/stub-handler.js)) is a local stand-in that prints
> the payload and mimics Pardot's success/error redirects — add `?fail` to the handler
> URL to exercise the rejection path. The live URL belongs only in the production
> server's `.env`.

## Layout

```
index.html            page shell — the entry Vite builds from
vite.config.js        aliases, asset handling, the /api dev + preview proxies
package.json          "type": "module"; scripts above
pnpm-workspace.yaml   empty build-script allowlist (see Conventions)
.env.example          server-side config template -> copy to .env

src/
  main.js             bootstrap and DOM wiring
  benchmarks.js       TASK_BENCHMARKS — single source of truth
  calc.js             the calculation engine
  format.js           currency / number / percent / date
  tasks.js            renders the activity rows from benchmarks
  donut.js            SVG donut and legend
  pdf.js              the report (jsPDF, lazy-loaded)
  lead.js             reads the form, POSTs to /api/lead
  lead-request.js     builds the request body (pure, no deps)
  lead-schema.js      zod schema — shared by the server and the tests
  empty.js            deliberate no-op; see the note below
  styles.css          all styles, scoped under .reach-roi-calculator
  assets/             brand art (4 PNGs) and the PDF logo

server/
  index.js            Hono app: validate, honeypot, CAPTCHA, deliver
  pardot.js           Form Handler field mapping and delivery

test/
  calc.test.js        engine, incl. the baseline regression
  lead.test.js        request shape and Form Handler mapping
  pdf.test.js         decodes the generated PDF and checks its text
  page.test.js        full DOM walkthrough in happy-dom
  server.test.js      the endpoint, via app.request()

baseline/             pre-refactor engine output + reference PDF
deploy/               nginx site configs (bootstrap + production)
README.md             production deployment guide (Lightsail, Debian, PM2)
ecosystem.config.cjs  PM2 process definition
```

**`src/empty.js` is not dead code.** `vite.config.js` aliases jsPDF's optional
`html2canvas` and `dompurify` imports to it — they exist only for jsPDF's `.html()`
renderer, which this report never calls, and stubbing them keeps ~226 kB of dead
chunks out of `dist/`. Deleting it breaks the build.

`baseline/results.json` is the output of the original pre-refactor engine.
`test/calc.test.js` asserts against it, so any change in the numbers fails loudly.
Do not regenerate it to make a test pass.

## How it works

**Calculation** ([src/calc.js](src/calc.js)) — deliberately transparent and
deterministic. Per selected activity, using the fixed benchmarks:

```
currentMonthlyHours   = headcount * benchmarkHoursPerFTEPerMonth
monthlyHoursReclaimed = currentMonthlyHours * benchmarkReductionRate
annualHoursReclaimed  = monthlyHoursReclaimed * 12
salaryEquivalentValue = annualHoursReclaimed * (annualSalary / 2080)
```

No floors, ceilings, normalization or loaded-salary multipliers. `TASK_BENCHMARKS`
are observed customer figures — treat them as constants, do not average or "improve"
them. Weighted reduction is hours-weighted, never a mean of the per-activity
percentages.

**Flow.** Inputs → validate → lead modal → results. On modal submit the Salesforce
POST and the PDF run **in parallel**: neither gates the other, so the visitor gets
their report whatever the network does, and a delivery failure surfaces as a message
without withholding anything.

**PDF** ([src/pdf.js](src/pdf.js)) — jsPDF plus jspdf-autotable, `import()`ed on
demand so the 474 kB chunk never loads for visitors who don't download. It replaced
~600 lines of hand-rolled PDF object writing; jsPDF's WinAnsi encoding also fixed a
live bug where accented names were stripped to ASCII ("José Müller" printed as "Jos
Mller"). `test/pdf.test.js` decodes the generated PDF and asserts the accents survive.

## Lead submission

The browser POSTs JSON to `/api/lead`. The Hono service validates it against
[src/lead-schema.js](src/lead-schema.js), checks the honeypot, optionally verifies a
CAPTCHA token, then posts server-to-server to a **Pardot (Account Engagement) Form
Handler**, which creates or updates a Prospect keyed on email. The Prospect syncs on
to a Salesforce Lead or Contact through the Pardot connector — this service never
talks to Salesforce directly.

**The handler URL is the credential.** A Form Handler has no API key or Org ID:
anyone holding the URL can inject prospects. Keeping it server-side, rather than in
the page as a normal Pardot form would, is the reason this proxy exists. It lives in
`.env` (gitignored) and deliberately not in the committed `.env.example`.

**Confirming delivery.** A Form Handler *with* a Success Location answers 302, and
that redirect target is the accept/reject signal — so [server/pardot.js](server/pardot.js)
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

Configure via `.env` (see [.env.example](.env.example)). `PARDOT_FORM_HANDLER_URL` is
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

**Never prefix a Pardot or CAPTCHA secret with `VITE_`** — that inlines it into the
browser bundle and puts the credential back on a public page.

### Field mapping

`FIELD_MAP` in [server/pardot.js](server/pardot.js) maps our field names onto the
handler's external names. This is the complete set the handler defines, confirmed by
the client on 2026-09-02:

| Ours | Handler field |
|---|---|
| `firstName` | `fname` |
| `lastName` | `lname` |
| `email` | `email` — Pardot keys Prospects on this |
| `company` | `company` |
| `country` | `Country` |
| `state` | `State` — optional; omitted entirely when blank |
| `optIn` | `Opt-in` — **required by the handler**, so always sent as `"true"`/`"false"` |

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

### Two Pardot-specific settings

- **Kiosk / Data Entry Mode must be enabled on the handler.** This service posts, not
  the visitor's browser, so without it Pardot cookies *the server* as the submitting
  prospect and associates every submission with one visitor.
- **Server-side posting breaks visitor-to-prospect stitching.** The visitor's Pardot
  tracking cookie never reaches Pardot, so a new Prospect is not linked to that
  person's earlier browsing on the marketing site. UTM attribution still arrives (in
  `comments`), but if the marketing team relies on Pardot's own visitor history,
  raise it with whoever administers Pardot before go live.

### Security posture

Client-side validation is advisory; anyone can POST directly to `/api/lead`. Every
check is therefore repeated on the server. The defences and where they live:

| Concern | Where |
|---|---|
| Field validation, length caps | zod, server-side (`maxlength` in the form is UX only) |
| Bot submissions | honeypot `#rrc-f-website`, absorbed with a 200 so a bot cannot tell |
| CAPTCHA | opt-in: off unless **both** `CAPTCHA_SECRET` and `CAPTCHA_VERIFY_URL` are set; fails closed once on |
| Rate limiting | nginx `limit_req`, 5/min per IP |
| Credentials | server-side only; nothing sensitive reaches the browser |
| TLS, HSTS, CSP, `frame-ancestors` | nginx — see [deploy/nginx.conf.example](deploy/nginx.conf.example) |
| Endpoint exposure | binds `127.0.0.1` only; nginx is the sole route in |

A strict CSP is possible because the page has no inline script or style. Keep it that
way: an inline `<script>` or `style=` attribute would force the policy open.

## Deployment

See [README.md](README.md) for the full Lightsail/Debian/PM2 setup. In short:
`pnpm build`, rsync `dist/`, `server/`, `src/lead-schema.js` and the manifests, then
`pm2 reload reach-calculator`. nginx serves the static build and proxies `/api/lead`
to the Node service on loopback. The production `.env` lives at
`/srv/reach-calculator/.env` and is never deployed from here.

## Conventions

- Vanilla ESM. No framework. Dependencies are fine when they beat hand-rolling, but
  keep the browser bundle lean — zod is deliberately server-side only, which is why
  `lead-request.js` (pure) is split from `lead-schema.js` (zod).
- Every CSS selector and DOM id stays under the `reach-roi-` / `rrc-` prefixes.
- Benchmark constants, disclaimer copy and methodology text are business-approved. Do
  not reword them casually; the methodology paragraph appears in both the results card
  and the PDF and must stay in sync.
- `pnpm-workspace.yaml` declares an empty build-script allowlist. Leave it: no
  dependency here needs install scripts, and that keeps one supply-chain foothold shut.
