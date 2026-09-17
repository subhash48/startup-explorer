import { z } from "zod";
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
});
export const reportSchema = analysisSchema
  .extend({
    website: z.url().refine((v) => /^https?:\/\//.test(v)),
    careersUrl: z.url().nullable(),
    sources: z.array(z.url()),
    analyzedAt: z.iso.datetime(),
    mode: z.enum(["live", "pasted", "sample"]),
    notes: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
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
