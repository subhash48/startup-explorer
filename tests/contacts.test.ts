import { describe, expect, it } from "vitest";
import { groundContacts } from "../src/lib/contacts";
import { reportSchema } from "../src/lib/schema";
import { sampleReport } from "../src/lib/sample";
import { savedSchema } from "../src/lib/storage";
const person = {
  name: "Maya Chen",
  employmentEvidence: "Maya Chen, Head of People, leads recruiting at Acme.",
  role: "Head of People",
  whatTheyDo: "Leads recruiting.",
  evidence: "Maya Chen, Head of People, leads recruiting at Acme.",
  responsibilityEvidence:
    "Maya Chen, Head of People, leads recruiting at Acme.",
  outreachReason: "Ask about the hiring process.",
};
const pages = [{ url: "https://company.com/team", text: person.evidence }];
describe("outreach evidence", () => {
  it("rejects a real testimonial author whose employer is another company", () => {
    const testimonial = {
      ...person,
      name: "Kurtis Moyer",
      role: "Lead Product Manager of Payments, Mindbody",
      evidence: "Kurtis Moyer, Lead Product Manager of Payments, Mindbody",
      employmentEvidence:
        "Kurtis Moyer, Lead Product Manager of Payments, Mindbody",
    };
    expect(
      groundContacts(
        [testimonial],
        [{ url: "https://stripe.com/", text: testimonial.evidence }],
        false,
        "Stripe",
      ),
    ).toEqual([]);
  });
  it("links a supported person to the page actually retrieved", () => {
    expect(groundContacts([person], pages, false, "Acme")[0]).toMatchObject({
      name: "Maya Chen",
      employmentEvidence:
        "Maya Chen, Head of People, leads recruiting at Acme.",
      sourceUrl: pages[0].url,
    });
  });
  it("discards invented names, roles, and quotes", () => {
    expect(
      groundContacts(
        [{ ...person, name: "Invented Person" }],
        pages,
        false,
        "Acme",
      ),
    ).toEqual([]);
    expect(
      groundContacts([{ ...person, role: "CEO" }], pages, false, "Acme"),
    ).toEqual([]);
    expect(
      groundContacts(
        [{ ...person, evidence: "Maya Chen is Head of People." }],
        pages,
        false,
        "Acme",
      ),
    ).toEqual([]);
  });
  it("does not fabricate responsibilities from a job title", () => {
    const result = groundContacts(
      [{ ...person, responsibilityEvidence: "Oversees all operations." }],
      pages,
      false,
      "Acme",
    );
    expect(result[0].whatTheyDo).toBe("Not available");
    expect(result[0].responsibilityEvidence).toBeNull();
  });
  it("keeps pasted people explicitly unverified and deduplicates names", () => {
    const result = groundContacts([person, person], pages, true, "Acme");
    expect(result).toHaveLength(1);
    expect(result[0].sourceUrl).toBeNull();
  });
  it("rejects contact links not in retrieved sources", () => {
    expect(
      reportSchema.safeParse({
        ...sampleReport,
        mode: "live",
        contacts: [{ ...person, sourceUrl: "https://invented.com/team" }],
      }).success,
    ).toBe(false);
  });
  it("keeps older saved reports readable without new contact fields", () => {
    const legacy = Object.fromEntries(
      Object.entries(sampleReport).filter(([key]) => key !== "contacts"),
    );
    const result = savedSchema.parse([
      { report: legacy, savedAt: new Date().toISOString() },
    ]);
    expect(result[0].report.contacts).toEqual([]);
  });
});
