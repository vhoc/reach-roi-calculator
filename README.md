# Reach Value Assessment — Deployment

A standalone security ROI calculator, linked from the Webflow site. Visitors get an
on-screen assessment plus a PDF report; their details are registered as a Pardot
Prospect. See [CLAUDE.md](CLAUDE.md) for how the application itself works.

Two things run in production:

| Part               | Served by                   | Where                            |
| ------------------ | --------------------------- | -------------------------------- |
| The page (`dist/`) | nginx, directly             | `/srv/reach-calculator/dist`     |
| `POST /api/lead`   | Node, behind an nginx proxy | `127.0.0.1:8787`, managed by PM2 |

The Node service exists so the Pardot Form Handler URL never reaches the browser.
It binds to loopback only — nginx is the sole route in.

---

## 1. Lightsail instance

**Create the instance**

- Region: closest to the client's buyers; it only affects latency.
- Blueprint: **OS Only → Debian**. Pick **Debian 13 (trixie)** if it is offered;
  otherwise Debian 12 is fine (see the note below).
- Plan: the smallest is enough. This serves static files and makes one outbound POST
  per lead; 512 MB–1 GB RAM is comfortable.
- Name it something you will recognise in a year, e.g. `reach-calculator`.

> **Which Debian?** Debian 13 has full security-team support until August 2028.
> Debian 12's regular support ended on **12 July 2026** — it is now on LTS, a
> narrower-scope effort, until June 2028. Prefer 13 for a new box.
>
> Lightsail blueprints lag upstream, though, and Debian 13 may not be listed yet.
> Check before assuming:
>
> ```sh
> aws lightsail get-blueprints --query \
>   "blueprints[?group=='debian'].[blueprintId,name,isActive]" --output table
> ```
>
> If only Debian 12 is available, it is an acceptable choice here: LTS still covers
> amd64 until June 2028, and the two components actually exposed to the internet —
> nginx and Node — are patched independently of the base system anyway. The
> alternative, if you would rather have full (non-LTS) support, is Ubuntu 24.04 LTS,
> which Lightsail does offer and which supports everything below unchanged.

**Attach a static IP** — Networking → _Create static IP_ → attach to the instance.

Do this **before** setting up DNS. An instance's default public IP changes when it is
stopped and started, which would silently break the subdomain. A static IP is free
while attached to a running instance, and billed only if you leave it unattached.

**Firewall** — Networking → IPv4 Firewall. You want exactly:

| Application | Protocol | Port | Restricted to                    |
| ----------- | -------- | ---- | -------------------------------- |
| SSH         | TCP      | 22   | your IP, if you have a fixed one |
| HTTP        | TCP      | 80   | anywhere                         |
| HTTPS       | TCP      | 443  | anywhere                         |

**Never open 8787.** The lead endpoint binds to `127.0.0.1`, so it is unreachable from
outside regardless, but leaving the port closed keeps that true even if someone later
sets `HOST=0.0.0.0`.

If the client wants IPv6, enable it on the instance and mirror the three rules in the
IPv6 firewall tab.

**Snapshots** — enable automatic snapshots. The only state on this box is `.env` and
the logs, but recreating the TLS and nginx setup by hand is an afternoon.

---

## 2. Subdomain

Ask the client for a subdomain, e.g. `calculator.reach.security`, and have whoever
controls DNS for `reach.security` add **one record**:

| Type | Name         | Value                   | TTL |
| ---- | ------------ | ----------------------- | --- |
| A    | `calculator` | the Lightsail static IP | 300 |

Add an `AAAA` record to the instance's IPv6 address only if you enabled IPv6.

The apex domain staying on Webflow does not matter — a subdomain A record is
independent of it, and nothing about the Webflow site changes. Use a low TTL (300)
until everything works, then raise it.

**Wait for propagation before touching certbot.** Let's Encrypt validates over HTTP;
if DNS has not caught up, issuance fails and repeated attempts hit rate limits:

```sh
dig +short calculator.reach.security      # must print the static IP
```

---

## 3. Debian prerequisites

SSH in as `admin` (Debian's default Lightsail user), then:

```sh
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates gnupg git nginx

# Unattended security updates — this box is internet-facing and mostly unattended.
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

**Node.js.** The service uses `node --env-file`, which needs **20.6+**. Check what
the distro offers before reaching for a third-party repo:

```sh
apt policy nodejs
```

Debian 12 ships Node 18 — too old, so use NodeSource. Debian 13 ships Node 20.19+,
which is sufficient; prefer the distro package there, as it is patched with the rest
of the system.

```sh
# Only if the distro's version is below 20.6:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v          # must be >= v20.6
```

**pnpm**, via the Corepack that ships with Node:

```sh
sudo corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

**PM2**, installed globally:

```sh
sudo npm install -g pm2
pm2 -v
```

**Application directory**, owned by a login user so deploys need no `sudo`:

```sh
sudo mkdir -p /srv/reach-calculator /var/log/reach-calculator
sudo chown -R admin:admin /srv/reach-calculator /var/log/reach-calculator
```

---

## 4. Configuration

Create `/srv/reach-calculator/.env` — this file holds the only credential in the
system and is never in git:

```sh
cat > /srv/reach-calculator/.env <<'EOF'
PARDOT_FORM_HANDLER_URL=
PARDOT_SUCCESS_URL=
PARDOT_ERROR_URL=

CAPTCHA_SECRET=
CAPTCHA_VERIFY_URL=

PORT=8787
EOF

chmod 600 /srv/reach-calculator/.env
```

- **`PARDOT_FORM_HANDLER_URL`** is the credential: anyone holding it can inject
  Prospects. `chmod 600` matters.
- **Leave the Success/Error URLs blank** unless the client configures them on the Form
  Handler and gives you the real values. A wrong value is worse than none — delivery
  would be judged against a URL Pardot never redirects to. Handler 1119553 currently
  answers `200` inline and does not redirect at all.
- **Leave the CAPTCHA pair blank.** The check runs only when _both_ are set, and the
  browser does not yet render a widget, so enabling it now would refuse every lead.

---

## 5. First deploy

Build locally, then copy up. Nothing is built on the server.

```sh
# On your machine
pnpm install --frozen-lockfile
pnpm test
pnpm build

rsync -a --delete dist/    admin@<static-ip>:/srv/reach-calculator/dist/
rsync -a --delete --exclude stub-handler.js \
                  server/  admin@<static-ip>:/srv/reach-calculator/server/
rsync -a src/lead-schema.js  admin@<static-ip>:/srv/reach-calculator/src/
rsync -a package.json pnpm-lock.yaml pnpm-workspace.yaml ecosystem.config.cjs \
         admin@<static-ip>:/srv/reach-calculator/
```

> **Never run `rsync --delete` against `/srv/reach-calculator/` itself.** `.env`
> belongs to no source tree, so rsync would delete it and the service would restart
> answering 502 `not_configured`. Deletion is scoped to `dist/` and `server/`.

Then on the server:

```sh
cd /srv/reach-calculator
pnpm install --prod --frozen-lockfile     # hono, @hono/node-server, zod only
```

---

## 6. PM2

```sh
cd /srv/reach-calculator
pm2 start ecosystem.config.cjs
pm2 save                                   # remember this process list

# Generate and install the boot service. Run the sudo command it prints.
pm2 startup systemd -u admin --hp /home/admin
```

Log rotation matters more here than usual: because the Form Handler has no field for
the assessment, **these logs are the only record of what each prospect calculated.**

```sh
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 90
pm2 set pm2-logrotate:compress true
```

Check it is up:

```sh
pm2 status
pm2 logs reach-calculator --lines 50
curl -s localhost:8787/api/health          # {"ok":true}
```

The startup line states the CAPTCHA mode, so a typo in either variable name is
visible rather than silently disabling the check:

```
captcha: disabled (set CAPTCHA_SECRET and CAPTCHA_VERIFY_URL to enable)
lead endpoint on 127.0.0.1:8787
```

---

## 7. nginx and TLS

Install the site config, point `server_name` at the subdomain, and let certbot do
the TLS work.

```sh
sudo apt install -y certbot python3-certbot-nginx

sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/reach-calculator
sudo nano /etc/nginx/sites-available/reach-calculator     # set server_name
sudo ln -s /etc/nginx/sites-available/reach-calculator /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```

At this point the site should answer over plain HTTP — check before going further,
because certbot validates by serving a challenge from this very block:

```sh
curl -sI http://calculator.reach.security | head -1        # 200
```

Now issue the certificate:

```sh
sudo certbot --nginx -d calculator.reach.security \
  --agree-tos -m ops@reach.security --no-eff-email --redirect
```

certbot edits the config in place: it adds `listen 443 ssl` and the
`ssl_certificate` lines to your server block, and `--redirect` generates a second
block on port 80 that sends everything to HTTPS. The headers, rate limit and proxy
you installed carry over into the TLS block untouched.

`server_name` must match the `-d` argument exactly, or certbot cannot find the block
to modify and will fall back to asking.

**Renewal is automatic.** The package installs a `certbot.timer` that runs twice
daily, and because the nginx installer is recorded in the renewal config, certbot
reloads nginx itself after each renewal — no deploy hook needed. Confirm it works
before you walk away:

```sh
sudo certbot renew --dry-run
systemctl list-timers certbot.timer
```

The finished config gives you TLS, HSTS, a strict CSP, `frame-ancestors 'none'`, and
a 5 requests/minute per-IP limit on `/api/lead`. See
[deploy/nginx.conf.example](deploy/nginx.conf.example).

## 8. Verify

```sh
curl -sI https://calculator.reach.security | head -1            # 200
curl -s  https://calculator.reach.security/api/health           # {"ok":true}
curl -sI https://calculator.reach.security | grep -i strict-transport
curl -sI http://calculator.reach.security | head -1             # 301
```

Then in a browser: open the subdomain, fill the calculator, submit the form. Confirm
the PDF downloads, `pm2 logs` shows `lead delivered:` with the posted fields, and the
Prospect appears in Pardot.

> The form writes to the client's **live CRM**. Use a taggable address such as
> `you+rvac-test@example.com` so the test Prospect is easy to find and delete.

Finally, ask the client to link the subdomain from the Webflow site — and to append
UTM parameters to that link, since the calculator now sits on its own origin and the
Webflow campaign context arrives only if the link carries it.

---

## Subsequent releases

```sh
# Locally
pnpm install --frozen-lockfile && pnpm test && pnpm build
rsync -a --delete dist/ admin@<static-ip>:/srv/reach-calculator/dist/
rsync -a --delete --exclude stub-handler.js \
                  server/ admin@<static-ip>:/srv/reach-calculator/server/
rsync -a src/lead-schema.js admin@<static-ip>:/srv/reach-calculator/src/
rsync -a package.json pnpm-lock.yaml pnpm-workspace.yaml ecosystem.config.cjs \
         admin@<static-ip>:/srv/reach-calculator/

# On the server
ssh admin@<static-ip> 'cd /srv/reach-calculator \
  && pnpm install --prod --frozen-lockfile \
  && pm2 reload reach-calculator'
```

A front-end-only change needs just the `dist/` sync — no restart, nginx picks it up
immediately.

## Troubleshooting

| Symptom                       | Cause                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 502 from `/api/lead`          | Node is down — `pm2 status`, `pm2 logs reach-calculator`                                                                 |
| `not_configured` in the logs  | `PARDOT_FORM_HANDLER_URL` empty; check `.env` is where `node_args` points                                                |
| 429 on submit                 | nginx rate limit; expected under load testing, not for real visitors                                                     |
| `unexpected_redirect_*`       | `PARDOT_SUCCESS_URL` does not match where the handler actually redirects — blank it                                      |
| Every lead 403s               | Both CAPTCHA variables set but no widget sends a token; blank them                                                       |
| Page loads, form does nothing | Check the browser console against the CSP in the nginx config                                                            |
| Certbot fails                 | DNS not propagated (`dig +short <subdomain>` must show the static IP), or `server_name` does not match the `-d` argument |
