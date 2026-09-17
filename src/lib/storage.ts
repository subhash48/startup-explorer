import { z } from "zod";
import { reportSchema, type Report } from "./schema";
export const STORAGE_KEY = "startup-explorer:saved:v1";
export const savedSchema = z
  .array(z.object({ report: reportSchema, savedAt: z.iso.datetime() }))
  .max(50);
export type Saved = z.infer<typeof savedSchema>;
export function websiteKey(website: string) {
  const url = new URL(website);
  return url.hostname.toLowerCase().replace(/^www\./, "");
}
export function addSaved(saved: Saved, report: Report): Saved {
  return [
    { report, savedAt: new Date().toISOString() },
    ...saved.filter(
      (s) => websiteKey(s.report.website) !== websiteKey(report.website),
    ),
  ].slice(0, 50);
}
