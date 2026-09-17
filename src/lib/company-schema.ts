import { z } from "zod";

export const companyQuerySchema = z.string().trim().min(2).max(100);
export const companyMatchesSchema = z
  .array(
    z.object({
      id: z.string().regex(/^(?:Q\d+|directory:[a-z\d.-]+)$/i),
      name: z.string().max(300),
      description: z.string().max(500),
      website: z.url().refine((value) => /^https?:\/\//.test(value)),
      source: z.enum(["wikidata", "directory"]).optional(),
      correction: z.string().max(100).optional(),
    }),
  )
  .max(8);
export type CompanyMatch = z.infer<typeof companyMatchesSchema>[number];

// This only chooses the input flow. The server still applies full URL/DNS safety.
export function looksLikeWebsite(input: string) {
  const value = input.trim();
  return (
    /^[a-z][a-z\d+.-]*:\/\//i.test(value) ||
    /^[^\s/]+\.[a-z\d-]{2,}(?:[/:?#]|$)/i.test(value) ||
    /^(?:localhost|\[|\d{1,3}\.\d{1,3}\.)/i.test(value)
  );
}
