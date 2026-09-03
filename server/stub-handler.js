/**
 * A local stand-in for the Pardot Form Handler, for development.
 *
 * The real handler writes to the client's live CRM: every submission against it
 * creates a real Prospect that someone has to find and delete. Point
 * PARDOT_FORM_HANDLER_URL at this instead and the whole path — validation,
 * honeypot, field mapping, redirect handling — is exercised for real, while the
 * payload is only printed.
 *
 * Mirrors Pardot's behaviour: 302 to the Success Location, or to the Error
 * Location when `?fail` is in the query, so both branches can be tested.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 9911);
const SUCCESS = process.env.STUB_SUCCESS_URL ?? "http://localhost:9911/thanks";
const ERROR = process.env.STUB_ERROR_URL ?? "http://localhost:9911/oops";

createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const fields = Object.fromEntries(new URLSearchParams(body));
    const failing = req.url.includes("fail");
    console.log(`\n${failing ? "REJECTED" : "ACCEPTED"} ${req.method} ${req.url}`);
    console.log(JSON.stringify(fields, null, 2));
    res.writeHead(302, { location: failing ? ERROR : SUCCESS });
    res.end();
  });
}).listen(PORT, () => {
  console.log(`stub form handler on :${PORT}`);
  console.log("  nothing is sent anywhere — submissions are printed here\n");
});
