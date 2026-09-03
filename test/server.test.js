import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../server/index.js";

const validLead = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  company: "Example Corp",
  country: "United Kingdom",
  state: "Greater London",
  optIn: true,
  assessment: {
    teamHeadcount: 10,
    annualSalary: 208000,
    totalHours: 2400,
    totalDollars: 240000,
    equivalentFTECapacity: 1.15,
    includedTasks: [{ name: "Security Controls Review", hours: 2400, dollars: 240000 }],
  },
};

const post = (body) =>
  app.request("/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("PARDOT_FORM_HANDLER_URL", "https://go.example.test/l/1119553/2026-08-31/5vsvpy");
  vi.stubEnv("PARDOT_SUCCESS_URL", "https://reach.example/thanks");
  vi.stubEnv("PARDOT_ERROR_URL", "https://reach.example/oops");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/lead", () => {
  /** Pardot answers with a redirect to its Success or Error Location. */
  const redirectTo = (location, status = 302) =>
    vi.fn(async () => new Response(null, { status, headers: { location } }));

  it("delivers a valid lead and reads the success redirect", async () => {
    vi.stubGlobal("fetch", redirectTo("https://reach.example/thanks"));
    const res = await post(validLead);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://go.example.test/l/1119553/2026-08-31/5vsvpy");
    // Following the redirect would land on the success page and report 200
    // even for a rejection, so the request must not follow it.
    expect(init.redirect).toBe("manual");

    const sent = new URLSearchParams(init.body.toString());
    expect(sent.get("lname")).toBe("Lovelace");
    expect(sent.get("fname")).toBe("Ada");
    expect(sent.get("email")).toBe("ada@example.com");
    expect(sent.get("Country")).toBe("United Kingdom");
    expect(sent.get("State")).toBe("Greater London");
    expect(sent.get("Opt-in")).toBe("true");
    expect(sent.has("oid")).toBe(false);
  });

  it("treats a redirect to the error location as a rejection", async () => {
    vi.stubGlobal("fetch", redirectTo("https://reach.example/oops?err=1"));
    const res = await post(validLead);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("rejected");
  });

  it("does not call an unexpected redirect a success", async () => {
    vi.stubGlobal("fetch", redirectTo("https://elsewhere.example/"));
    const res = await post(validLead);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("unexpected_redirect_302");
  });

  it("accepts a 200 with no Location even when a Success URL is configured", async () => {
    // A handler with no Success Location answers inline instead of redirecting.
    // Treating that as an unexpected redirect reported failure for leads that
    // Pardot had in fact accepted.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>thanks</html>", { status: 200 })));
    const res = await post(validLead);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("still rejects a non-2xx with no Location", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    expect((await post(validLead)).status).toBe(502);
  });

  it("does not call a redirect unexpected when nothing was configured to expect", async () => {
    // The documented safe default is both URLs blank. A handler that redirects
    // to its own thank-you page must not be reported as a failure then.
    vi.stubEnv("PARDOT_SUCCESS_URL", "");
    vi.stubEnv("PARDOT_ERROR_URL", "");
    vi.stubGlobal("fetch", redirectTo("https://www.reach.security/some-thank-you"));
    const res = await post(validLead);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("falls back to transport status when no Success Location is configured", async () => {
    vi.stubEnv("PARDOT_SUCCESS_URL", "");
    vi.stubEnv("PARDOT_ERROR_URL", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    expect((await post(validLead)).status).toBe(200);
  });

  it("re-validates server-side — the client's checks are advisory", async () => {
    vi.stubGlobal("fetch", vi.fn());
    for (const patch of [{ lastName: "" }, { email: "nope" }, { company: "x".repeat(300) }]) {
      const res = await post({ ...validLead, ...patch });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "validation" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a malformed body without throwing", async () => {
    const res = await post("not json");
    expect(res.status).toBe(400);
  });

  it("absorbs a filled honeypot with a 200 and never contacts Salesforce", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await post({ ...validLead, website: "http://spam.example" });

    // Indistinguishable from success: a 4xx would teach the bot to omit the field.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a Pardot server error rather than claiming success", async () => {
    vi.stubEnv("PARDOT_SUCCESS_URL", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const res = await post(validLead);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("pardot_500");
  });

  it("refuses to run unconfigured instead of dropping the lead silently", async () => {
    vi.stubEnv("PARDOT_FORM_HANDLER_URL", "");
    vi.stubGlobal("fetch", vi.fn());
    const res = await post(validLead);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("not_configured");
    expect(console.error).toHaveBeenCalled(); // the lead is in the log, not lost
  });

  describe("CAPTCHA", () => {
    const enable = () => {
      vi.stubEnv("CAPTCHA_SECRET", "secret");
      vi.stubEnv("CAPTCHA_VERIFY_URL", "https://captcha.example/siteverify");
    };
    const delivered = () => vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://reach.example/thanks" } }));

    it("stays off unless both the secret and the verify URL are set", async () => {
      for (const half of [
        { CAPTCHA_SECRET: "secret", CAPTCHA_VERIFY_URL: "" },
        { CAPTCHA_SECRET: "", CAPTCHA_VERIFY_URL: "https://captcha.example/siteverify" },
        { CAPTCHA_SECRET: "", CAPTCHA_VERIFY_URL: "" },
      ]) {
        for (const [k, v] of Object.entries(half)) vi.stubEnv(k, v);
        vi.stubGlobal("fetch", delivered());
        // Half-configured must mean "off", never "reject everyone".
        expect((await post(validLead)).status).toBe(200);
      }
    });

    it("fails closed once enabled and no token is supplied", async () => {
      enable();
      vi.stubGlobal("fetch", vi.fn());
      const res = await post(validLead);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("captcha");
      expect(fetch).not.toHaveBeenCalled(); // never reaches Pardot
    });

    it("rejects a token the provider does not accept", async () => {
      enable();
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: false })));
      const res = await post({ ...validLead, captchaToken: "bad-token" });
      expect(res.status).toBe(403);
    });

    it("delivers when the provider accepts the token", async () => {
      enable();
      const verify = vi.fn(async (url) =>
        String(url).includes("captcha.example")
          ? Response.json({ success: true })
          : new Response(null, { status: 302, headers: { location: "https://reach.example/thanks" } }),
      );
      vi.stubGlobal("fetch", verify);

      expect((await post({ ...validLead, captchaToken: "good-token" })).status).toBe(200);
      const sent = new URLSearchParams(verify.mock.calls[0][1].body.toString());
      expect(sent.get("secret")).toBe("secret");
      expect(sent.get("response")).toBe("good-token");
    });

    it("fails closed when the provider itself is unreachable", async () => {
      enable();
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
      expect((await post({ ...validLead, captchaToken: "good-token" })).status).toBe(403);
    });
  });
});

describe("GET /api/health", () => {
  it("answers ok", async () => {
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true });
  });
});
