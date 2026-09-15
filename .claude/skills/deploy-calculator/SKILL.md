---
name: deploy-calculator
description: Deploying the ROI calculator and the nginx/CSP/GTM setup that fronts it. Use when touching deploy/, ecosystem.config.cjs, public/gtm.js, the CSP, Google Tag Manager, or when asked how to ship, release, or deploy this app.
---

# Deployment

See [README.md](../../../README.md) for the full Lightsail/Debian/PM2 setup. In short: the
server holds a git checkout at `/srv/reach-calculator` (read-only deploy key) and
builds there — push to `main`, then on the server `git pull --ff-only`,
`pnpm install --frozen-lockfile` (dev deps included; Vite does the build),
`pnpm test && pnpm build`, `pm2 reload reach-calculator`. nginx serves the static
build and proxies `/api/lead` to the Node service on loopback. The results page is a
second HTML entry served extensionless at `/thank-you`, which needs `$uri.html` in the
`location /` `try_files` — a config-only change, so `git pull` alone will not ship it. The production `.env`
lives at `/srv/reach-calculator/.env` and is never deployed from here.

## CSP

A strict CSP is possible because the page has no inline script or style. Keep it that
way: an inline `<script>` or `style=` attribute would force the policy open.

## Google Tag Manager

The client's GTM snippet is split: the bootstrap is
[public/gtm.js](../../../public/gtm.js) (GTM-58NDHDPL), kept out of `index.html` for the CSP,
and the noscript iframe uses `hidden` in place of its inline style. The CSP's
third-party hosts are exactly what the container loads (GA4, Google Ads, LinkedIn
Insight, HubSpot), found by loading the page in Chrome under the policy. When the
client adds a tag in GTM, repeat that and add its hosts.

Two things stay blocked on purpose: regional Google domains (`google.com.mx`, and so
on), used only for Ads audiences, and GTM **Custom HTML** tags, which need
`'unsafe-inline'`. The one Custom HTML tag in the container today tracks
HubSpot/Webflow form submissions, and this page has neither.
