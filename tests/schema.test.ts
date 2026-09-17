import { describe, it, expect } from "vitest";
import { reportSchema } from "../src/lib/schema";
import { sampleReport } from "../src/lib/sample";
import { groundAnalysis } from "../src/lib/analyze";
import { addSaved } from "../src/lib/storage";
describe("report validation and grounding", () => {
  it("accepts the labeled sample", () =>
    expect(reportSchema.parse(sampleReport).mode).toBe("sample"));
  it("rejects malformed reports", () =>
    expect(reportSchema.safeParse({ companyName: "Test" }).success).toBe(
      false,
    ));
  it("rejects fabricated careers sources", () =>
    expect(
      reportSchema.safeParse({
        ...sampleReport,
        mode: "live",
        careersUrl: "https://company.com/jobs",
      }).success,
    ).toBe(false));
  it("rejects unverified source links", () =>
    expect(
      reportSchema.safeParse({
        ...sampleReport,
        mode: "pasted",
        sources: ["https://company.com"],
      }).success,
    ).toBe(false));
  it("drops unsupported sensitive facts and talking points", () => {
    const result = groundAnalysis(
      {
        ...sampleReport,
        employeeRange: { value: "50", quote: "We employ 50 people" },
        headquarters: { value: "Paris", quote: "Based in Paris" },
      },
      "We make software.",
    );
    expect(result.employeeRange).toBeNull();
    expect(result.headquarters).toBeNull();
    expect(result.talkingPoints).toEqual([]);
  });
  it("retains exact grounded facts", () =>
    expect(
      groundAnalysis(
        {
          ...sampleReport,
          headquarters: { value: "Paris", quote: "Based in Paris" },
        },
        "Based in Paris",
      ).headquarters?.value,
    ).toBe("Paris"));
  it("deduplicates saved websites across protocol, www and path", () => {
    const first = { ...sampleReport, website: "http://www.company.com/about" };
    const second = { ...sampleReport, website: "https://company.com/" };
    const saved = addSaved(addSaved([], first), second);
    expect(saved).toHaveLength(1);
    expect(saved[0].report.website).toBe(second.website);
  });
});
