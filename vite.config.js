import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Absolute path, not "/src/empty.js": dependency pre-bundling resolves aliases
// relative to the dependency's own directory, which breaks `vite dev`.
const empty = fileURLToPath(new URL("./src/empty.js", import.meta.url));

const LEAD_SERVER = "http://localhost:8787";

/**
 * `pnpm dev` serves the page; `pnpm server` serves /api. Forgetting the second
 * one is the normal way to meet this proxy, and raw ECONNREFUSED does not say
 * so — turn it into an instruction, and answer the browser with the same JSON
 * shape the endpoint would, so the page's own error handling takes over.
 */
const apiProxy = () => ({
  "/api": {
    target: LEAD_SERVER,
    configure: (proxy) => {
      proxy.on("error", (err, _req, res) => {
        if (err.code === "ECONNREFUSED") {
          console.error(`\n  \u2717 lead server not running at ${LEAD_SERVER} — start it with \`pnpm server\`\n`);
        }
        if (typeof res?.writeHead === "function" && !res.headersSent) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "lead_server_unreachable" }));
        }
      });
    },
  },
});

export default defineConfig({
  resolve: {
    // jsPDF lazily imports these for its .html() renderer, which this report
    // never uses. Stubbing them keeps ~226 kB of dead chunks out of dist/.
    alias: { html2canvas: empty, dompurify: empty },
  },
  build: {
    // Brand art stays as files rather than being inlined back into the CSS.
    assetsInlineLimit: 4096,
  },
  // Proxy /api to the lead server so the browser sees a single origin, exactly
  // as nginx presents it in production. `preview` needs its own copy — it does
  // not inherit `server`.
  server: { proxy: apiProxy() },
  preview: { proxy: apiProxy() },
});
