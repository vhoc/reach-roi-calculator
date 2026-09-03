/**
 * The lead contract, shared verbatim by the browser and the server.
 *
 * The browser uses it for instant feedback; the server re-validates because
 * client-side validation is advisory — anyone can POST straight to /api/lead.
 * One schema, so the two can never drift apart.
 */
import { z } from "zod";

const trimmed = (max) => z.string().trim().min(1).max(max);

export const leadSchema = z.object({
  firstName: trimmed(40),
  lastName: trimmed(80),
  email: z.email().max(80),
  company: trimmed(255),
  country: trimmed(80),
  // Optional: much of the world has no state or region, and the Form Handler
  // does not require it. An empty one is skipped rather than posted blank.
  state: z.string().trim().max(80).optional().default(""),

  // Marketing consent. Optional to give — the report is never withheld for it —
  // but always transmitted, because the handler marks the field required.
  optIn: z.boolean().optional().default(false),

  // Honeypot: a hidden field no human ever fills in. Deliberately permissive —
  // the handler absorbs a filled one with a 200 so a bot cannot tell it was
  // caught. Rejecting it here would answer 400 and teach the bot to omit it.
  website: z.string().max(200).optional().default(""),

  // Campaign attribution. The calculator now lives on its own page, so the
  // Webflow referrer/UTM context has to be carried through the link explicitly.
  utm: z
    .object({
      source: z.string().max(120).optional(),
      medium: z.string().max(120).optional(),
      campaign: z.string().max(120).optional(),
      term: z.string().max(120).optional(),
      content: z.string().max(120).optional(),
      referrer: z.string().max(500).optional(),
    })
    .partial()
    .optional()
    .default({}),

  // The assessment itself, so sales sees what the visitor actually modelled.
  assessment: z
    .object({
      teamHeadcount: z.number().positive().max(1_000_000),
      annualSalary: z.number().positive().max(100_000_000),
      totalHours: z.number().nonnegative(),
      totalDollars: z.number().nonnegative(),
      equivalentFTECapacity: z.number().nonnegative(),
      includedTasks: z
        .array(
          z.object({
            name: z.string().max(120),
            hours: z.number().nonnegative(),
            dollars: z.number().nonnegative(),
          }),
        )
        .max(50),
    })
    .optional(),

  captchaToken: z.string().max(4000).optional(),
});
