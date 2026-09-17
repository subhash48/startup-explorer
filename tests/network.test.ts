import { it, expect } from "vitest";
import { extractWebsite } from "../src/lib/extract";
it.skipIf(process.env.RUN_NETWORK_TEST !== "true")(
  "extracts a real public website through the pinned transport",
  async () => {
    const result = await extractWebsite("https://www.iana.org/about");
    expect(result.pages[0].url).toBe("https://www.iana.org/about");
    expect(result.pages[0].text).toContain("Internet");
  },
  30000,
);
