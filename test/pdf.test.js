import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { TASK_BENCHMARKS } from "../src/benchmarks.js";
import { calculateResults } from "../src/calc.js";
import { buildReportPDF, reportFilename } from "../src/pdf.js";

const included = ["security-controls-review", "compliance-audit-readiness", "endpoint-health", "network-security-health"];
const state = {
  teamHeadcount: 12,
  annualSalary: 165000,
  tasks: TASK_BENCHMARKS.map((b) => ({
    id: b.id, name: b.name, color: b.color, reductionRate: b.reductionRate,
    included: included.includes(b.id), applicableFTEs: 12,
    currentHoursPerFTEPerMonth: b.manualHoursPerFTEPerMonth,
  })),
};
const results = calculateResults(state);
// Deliberately accented: the old hand-rolled writer stripped these to ASCII.
const lead = { firstName: "José", lastName: "Müller", email: "j@example.com", company: "Ácme Sécurité", country: "France" };

/** Every text-drawing operator in the document, decoded. */
function pdfText(bytes) {
  const raw = Buffer.from(bytes);
  const out = [];
  for (const m of raw.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let s = Buffer.from(m[1], "latin1");
    try { s = inflateSync(s); } catch { /* not deflated */ }
    for (const t of s.toString("latin1").matchAll(/\((.*?)\)\s*Tj/g)) out.push(t[1]);
  }
  return out;
}

describe("PDF report", () => {
  it("renders two pages of valid PDF", async () => {
    const blob = buildReportPDF(lead, state, results);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const head = Buffer.from(bytes.slice(0, 8)).toString("latin1");

    expect(head).toMatch(/^%PDF-1\./);
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(Buffer.from(bytes).toString("latin1")).toContain("/Count 2");

    writeFileSync("/tmp/report-after.pdf", Buffer.from(bytes)); // for eyeballing
  });

  it("keeps accented characters instead of stripping them", async () => {
    const text = pdfText(await buildReportPDF(lead, state, results).arrayBuffer()).join("\n");
    // Latin-1 bytes: é = \xe9, ü = \xfc, Á = \xc1
    expect(text).toContain("Jos\xe9 M\xfcller");
    expect(text).toContain("\xc1cme S\xe9curit\xe9");
    expect(text).not.toContain("Jos Mller"); // the old writer's output
  });

  it("carries the headline figures and every included activity", async () => {
    const text = pdfText(await buildReportPDF(lead, state, results).arrayBuffer()).join("\n");
    expect(text).toContain("$543,738");
    expect(text).toContain("6,854");
    expect(text).toContain("3.3 FTEs");
    for (const id of included) {
      expect(text).toContain(TASK_BENCHMARKS.find((b) => b.id === id).name.replace("&", "&"));
    }
    expect(text).not.toContain("Tools Rationalization Assessment"); // excluded
  });

  it("sanitises the company name into the filename", () => {
    expect(reportFilename("Ácme Sécurité, Inc.")).toBe("Reach-Value-Assessment-cme-S-curit-Inc.pdf");
  });
});
