import { it, expect } from "vitest";
import { analyze } from "../src/lib/analyze";

it.skipIf(process.env.RUN_LIVE_CONTACT_TEST !== "true")(
  "grounds an explicit contact from pasted public text through NVIDIA",
  async () => {
    const report = await analyze(
      "https://company.com/",
      {
        pages: [
          {
            url: "User-provided text",
            text: "Acme builds research software for product teams. Acme organizes interviews and customer feedback in a shared workspace. Ava Patel is Head of Recruiting at Acme. Ava Patel manages recruitment, interviews, and onboarding at Acme. Acme serves product managers at small technology companies.",
          },
        ],
        careersUrl: null,
        notes: [],
      },
      true,
    );
    expect(report.contacts[0]?.name).toBe("Ava Patel");
    expect(report.contacts[0]?.sourceUrl).toBeNull();
  },
  50000,
);
