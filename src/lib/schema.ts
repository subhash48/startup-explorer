import { z } from "zod";
export const contactSchema = z.object({
  name: z.string().min(1).max(150),
  role: z.string().min(1).max(200),
  whatTheyDo: z.string().max(600),
  evidence: z.string().min(1).max(1000),
  employmentEvidence: z.string().min(1).max(500),
  responsibilityEvidence: z.string().max(1000).nullable(),
  outreachReason: z.string().max(600),
});
export const analysisSchema = z.object({
  companyName: z.string(),
  whatItDoes: z.string(),
  products: z.array(z.string()),
  targetCustomers: z.string(),
  industry: z.string(),
  problemSolved: z.string(),
  employeeRange: z.object({ value: z.string(), quote: z.string() }).nullable(),
  headquarters: z.object({ value: z.string(), quote: z.string() }).nullable(),
  talkingPoints: z.array(
    z.object({ insight: z.string(), evidence: z.string() }),
  ),
  contacts: z.array(contactSchema).max(4).default([]),
});
export const reportSchema = analysisSchema
  .extend({
    contacts: z
      .array(contactSchema.extend({ sourceUrl: z.url().nullable() }))
      .max(4)
      .default([]),
    website: z.url().refine((v) => /^https?:\/\//.test(v)),
    careersUrl: z.url().nullable(),
    sources: z.array(z.url()),
    analyzedAt: z.iso.datetime(),
    mode: z.enum(["live", "pasted", "sample"]),
    notes: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    for (const contact of v.contacts) {
      if (v.mode === "live" && !contact.sourceUrl)
        ctx.addIssue({
          code: "custom",
          message: "Live contacts require a retrieved source",
        });
      if (
        contact.sourceUrl &&
        (v.mode !== "live" || !v.sources.includes(contact.sourceUrl))
      )
        ctx.addIssue({
          code: "custom",
          message: "Contact sources must be retrieved report sources",
        });
    }
    if (v.careersUrl && !v.sources.includes(v.careersUrl))
      ctx.addIssue({
        code: "custom",
        message: "Careers URL must be a retrieved source",
      });
    if (v.mode !== "live" && v.sources.length)
      ctx.addIssue({
        code: "custom",
        message: "Unverified reports cannot have retrieved sources",
      });
    if (v.sources.some((s) => !/^https?:\/\//.test(s)))
      ctx.addIssue({ code: "custom", message: "Unsafe source URL" });
  });
export type Report = z.infer<typeof reportSchema>;
export const requestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  text: z.string().trim().min(150).max(24000).optional(),
});
