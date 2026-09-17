import type { z } from "zod";
import type { contactSchema } from "./schema";
import type { Extracted } from "./extract";

const clean = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

export function groundContacts(
  contacts: z.infer<typeof contactSchema>[],
  pages: Extracted["pages"],
  pasted: boolean,
  companyName: string,
) {
  const seen = new Set<string>();
  return contacts.flatMap((contact) => {
    const evidence = clean(contact.evidence);
    const name = clean(contact.name);
    const role = clean(contact.role);
    const employment = clean(contact.employmentEvidence);
    const company = clean(companyName);
    // Name, role, and their association must occur together in a real page excerpt.
    const page = pages.find(
      (page) => evidence && clean(page.text).includes(evidence),
    );
    if (
      !page ||
      !name ||
      !role ||
      !evidence.includes(name) ||
      !evidence.includes(role) ||
      !company ||
      company === "not available" ||
      !employment.includes(name) ||
      !employment.includes(company) ||
      !clean(page.text).includes(employment) ||
      seen.has(name)
    )
      return [];
    seen.add(name);
    const responsibilityQuote = clean(contact.responsibilityEvidence ?? "");
    const supportedResponsibility =
      responsibilityQuote && clean(page.text).includes(responsibilityQuote);
    return [
      {
        ...contact,
        whatTheyDo: supportedResponsibility
          ? contact.whatTheyDo
          : "Not available",
        responsibilityEvidence: supportedResponsibility
          ? contact.responsibilityEvidence
          : null,
        sourceUrl: pasted ? null : page.url,
      },
    ];
  });
}
