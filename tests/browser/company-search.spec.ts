import { test, expect } from "@playwright/test";
import { sampleReport } from "../../src/lib/sample";
test("finds a company by name and analyzes its selected website", async ({
  page,
}) => {
  await page.route("**/api/companies?*", (route) =>
    route.fulfill({
      json: {
        matches: [
          {
            id: "Q7624104",
            name: "Stripe",
            description: "Payment technology company",
            website: "https://stripe.com/",
          },
          {
            id: "Q2",
            name: "Stripe Studio",
            description: "Design studio",
            website: "https://studio.com/",
          },
        ],
      },
    }),
  );
  let submittedUrl = "";
  await page.route("**/api/analyze", (route) => {
    submittedUrl = route.request().postDataJSON().url;
    return route.fulfill({ json: { report: sampleReport } });
  });
  await page.goto("/");
  await page.getByLabel("Which startup are you curious about?").fill("Stripe");
  await page
    .getByRole("button", { name: "Analyze startup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose the company you mean" }),
  ).toBeVisible();
  expect(submittedUrl).toBe("");
  await page
    .getByRole("button", { name: "Analyze Stripe at stripe.com", exact: true })
    .click();
  await expect(
    page.getByText("Sample report · Fictional company"),
  ).toBeVisible();
  expect(submittedUrl).toBe("https://stripe.com/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("unmatched names have a helpful fallback and editing clears old matches", async ({
  page,
}) => {
  await page.route("**/api/companies?*", (route) =>
    route.fulfill({ json: { matches: [] } }),
  );
  await page.goto("/");
  await page
    .getByLabel("Which startup are you curious about?")
    .fill("Unlisted startup");
  await page
    .getByRole("button", { name: "Analyze startup", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "find a website" }),
  ).toBeVisible();
  await page.getByLabel("Which startup are you curious about?").fill("Stripe");
  await expect(
    page.getByRole("alert").filter({ hasText: "find a website" }),
  ).toHaveCount(0);
});
