import type { Report } from "./schema";
export const sampleReport: Report = {
  companyName: "Sprout",
  website: "https://sprout.example",
  whatItDoes:
    "Sprout helps small teams keep their customer research in one place. Its workspace turns interview notes and feedback into shared, searchable insights.",
  products: [
    "Customer research workspace",
    "Interview notes & tagging",
    "Shared insight library",
  ],
  targetCustomers:
    "Product managers, designers, and researchers at small teams.",
  industry: "Research & collaboration software",
  problemSolved:
    "Customer feedback gets scattered across documents and tools, making it hard for teams to find evidence when making product decisions.",
  employeeRange: null,
  headquarters: null,
  careersUrl: null,
  contacts: [
    {
      name: "Maya Chen",
      employmentEvidence:
        "Maya Chen, Head of People, leads recruiting and onboarding at Sprout.",
      role: "Head of People",
      whatTheyDo:
        "Leads recruiting and helps new teammates settle into the company.",
      evidence:
        "Maya Chen, Head of People, leads recruiting and onboarding at Sprout.",
      responsibilityEvidence:
        "Maya Chen, Head of People, leads recruiting and onboarding at Sprout.",
      outreachReason:
        "Ask about the hiring process and which teams are growing.",
      sourceUrl: null,
    },
    {
      name: "Alex Rivera",
      employmentEvidence: "Alex Rivera is Co-founder & Product Lead at Sprout.",
      role: "Co-founder & Product Lead",
      whatTheyDo:
        "Guides product strategy and works with customers to shape the research workspace.",
      evidence:
        "Alex Rivera, Co-founder & Product Lead, guides product strategy and customer research.",
      responsibilityEvidence:
        "Alex Rivera, Co-founder & Product Lead, guides product strategy and customer research.",
      outreachReason:
        "Discuss the product problems you would be excited to help solve.",
      sourceUrl: null,
    },
  ],
  talkingPoints: [
    {
      insight:
        "Connect your experience organizing research to a more accessible insight library.",
      evidence:
        "The fictional product brings interview notes and feedback into a shared workspace.",
    },
    {
      insight:
        "Ask how the team helps small product teams put customer feedback into practice.",
      evidence:
        "The fictional product focuses on helping small teams use customer insights.",
    },
  ],
  sources: [],
  analyzedAt: "2026-09-16T12:00:00.000Z",
  mode: "sample",
  notes: [
    "Fictional company and illustrative content. No website was fetched and no live AI analysis was performed.",
  ],
};
