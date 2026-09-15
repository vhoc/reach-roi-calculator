# Reach Value Assessment — ROI Calculator

## What this is

A standalone security ROI calculator for reach.security, linked from the Webflow
site rather than embedded in it. A visitor enters their security team's headcount and
average salary, ticks the activities the team performs, and gets an estimate of hours
reclaimed, equivalent FTE capacity and salary-equivalent annual value — plus a two-page
PDF report. Results live on their own page, `/thank-you`, so the conversion is a real
pageview for the analytics container rather than a hidden div.

It is a **lead-generation asset**: results are gated behind a lead-capture modal, and
submitting it registers the lead in Salesforce.

## Stack

Vanilla ES modules bundled by Vite. Vite is a bundler, not a framework — no component
model, no runtime, no lock-in. **Use pnpm, never npm.**

```sh
pnpm install
pnpm dev          # page on :5173, /api proxied to the lead server
pnpm server       # the lead endpoint on :8787
pnpm stub         # a fake Pardot handler on :9911
pnpm test         # vitest, 65 tests
pnpm test:watch   # the same, in watch mode
pnpm build        # -> dist/
pnpm preview      # serve the built dist/ on :4173, /api proxied the same way
```

Local development needs **three terminals**: `pnpm dev`, `pnpm server`, `pnpm stub`.
Vite proxies `/api` to :8787 so the browser sees one origin, exactly as nginx presents
it in production. Without `pnpm server` the page still works and the report still
downloads — only the lead POST fails, and Vite prints which command is missing.

> **Never point a local `.env` at the live Pardot handler** — you would create real
> Prospects in the client's CRM. Use `pnpm stub`. See the `pardot-leads` skill.

## Layout

```
index.html            the calculator page — Vite entry 1
thank-you.html        the results page, served at /thank-you — Vite entry 2
vite.config.js        page entries, aliases, the /thank-you rewrite, the /api proxies
package.json          "type": "module"; scripts above
pnpm-workspace.yaml   build scripts denied via allowBuilds (see Conventions)
.env.example          server-side config template -> copy to .env

src/
  main.js             entry 1: inputs, lead modal, handoff, navigation
  thank-you.js        entry 2: renders the handed-over assessment
  handoff.js          passes { lead, state } between the two via sessionStorage
  benchmarks.js       TASK_BENCHMARKS — single source of truth
  calc.js             the calculation engine
  format.js           currency / number / percent / date
  tasks.js            renders the activity rows from benchmarks
  donut.js            SVG donut and legend
  pdf.js              the report (jsPDF, lazy-loaded)
  lead.js             reads the form, POSTs to /api/lead
  lead-request.js     builds the request body (pure, no deps)
  lead-schema.js      zod schema — shared by the server and the tests
  countries.js        the Country values the handler accepts (browser + server)
  states.js           State/Province options, scoped by country
  empty.js            deliberate no-op; see the note below
  styles.css          all styles, scoped under .reach-roi-calculator
  assets/             brand art (4 PNGs) and the PDF logo

public/
  gtm.js              Google Tag Manager bootstrap, kept out of index.html for the CSP

server/
  index.js            Hono app: validate, honeypot, CAPTCHA, deliver
  pardot.js           Form Handler field mapping and delivery

test/
  calc.test.js        engine, incl. the baseline regression
  lead.test.js        request shape and Form Handler mapping
  pdf.test.js         decodes the generated PDF and checks its text
  page.test.js        full DOM walkthrough of index.html in happy-dom
  thank-you.test.js   the results page, from handoff to rendered numbers
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

**Flow.** Inputs → validate → lead modal → `/thank-you`. Modal submit writes
`{ lead, state }` to sessionStorage, fires the Salesforce POST (`keepalive`, not
awaited — it outlives the navigation) and navigates. `/thank-you` recomputes the
results from that state and renders them; landing there without a handoff redirects
back to `/`. The PDF is generated **only** when the visitor presses *Download
Personalized Report*. Delivery never gates the results.

The two pages are one Vite MPA build. nginx maps the extensionless route with
`try_files $uri $uri.html`; a small `vite.config.js` plugin does the same rewrite for
`pnpm dev` and `pnpm preview`, so `/thank-you` resolves the same way everywhere.

**PDF** ([src/pdf.js](src/pdf.js)) — jsPDF plus jspdf-autotable, `import()`ed on
demand so the 474 kB chunk never loads for visitors who don't download. It replaced
~600 lines of hand-rolled PDF object writing; jsPDF's WinAnsi encoding also fixed a
live bug where accented names were stripped to ASCII ("José Müller" printed as "Jos
Mller"). `test/pdf.test.js` decodes the generated PDF and asserts the accents survive.

**Lead submission** — the browser POSTs to `/api/lead`, which relays server-to-server
to a Pardot Form Handler. Field mapping, country/state validation, CAPTCHA and the
security posture live in the `pardot-leads` skill.

**Deployment** — see [README.md](README.md) and the `deploy-calculator` skill.

## Conventions

- Vanilla ESM. No framework. Dependencies are fine when they beat hand-rolling, but
  keep the browser bundle lean — zod is deliberately server-side only, which is why
  `lead-request.js` (pure) is split from `lead-schema.js` (zod).
- Every CSS selector and DOM id stays under the `reach-roi-` / `rrc-` prefixes.
- No inline `<script>` or `style=` anywhere — the CSP depends on it.
- Never prefix a secret with `VITE_`; that inlines it into the browser bundle.
- Benchmark constants, disclaimer copy and methodology text are business-approved. Do
  not reword them casually; the methodology paragraph appears in both the results card
  and the PDF and must stay in sync.
- `pnpm-workspace.yaml` denies build scripts via `allowBuilds` (`core-js: false`).
  Leave it: no dependency here needs install scripts, and that keeps one
  supply-chain foothold shut. pnpm 11+ fails `--frozen-lockfile` on any dependency
  with a build script that isn't listed there, so a new one must be added as `false`.
  pnpm 12 also records the `packageManager` pin in `pnpm-lock.yaml`
  (`packageManagerDependencies`), and a frozen install fails if the two disagree —
  change the pin with `pnpm self-update <version>`, never by hand-editing package.json.
