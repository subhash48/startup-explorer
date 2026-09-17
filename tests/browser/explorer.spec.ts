import { test, expect } from "@playwright/test";
test("provider rate limits pause resubmission while keeping the sample available", async ({
  page,
}) => {
  await page.clock.install();
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": "30" },
      body: JSON.stringify({
        error:
          "NVIDIA is rate limiting requests. Please try again in 30 seconds.",
        retryAfterSeconds: 30,
      }),
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Which startup are you curious about?")
    .fill("company.com");
  await page
    .getByRole("button", { name: "Analyze startup", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "NVIDIA" }),
  ).toContainText("30 seconds");
  await expect(
    page.getByRole("button", { name: "Please wait to retry" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Explore a sample report" }),
  ).toBeEnabled();
  await page.clock.fastForward(31000);
  await expect(
    page.getByRole("button", { name: "Analyze startup", exact: true }),
  ).toBeEnabled();
});
test("sample report saves, survives reload, reopens and removes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Understand a startupbefore you apply.",
  );
  await page.getByRole("button", { name: "Explore a sample report" }).click();
  await expect(
    page.getByText("Sample report · Fictional company"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sprout", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save startup", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Saved startups/ }).click();
  await page.getByRole("button", { name: "Sprout ↗", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Saved · Remove" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Saved · Remove" }).click();
  await page.getByRole("button", { name: /Saved startups/ }).click();
  await expect(
    page.getByText("A little curiosity goes a long way."),
  ).toBeVisible();
});
test("URL submission returns honestly labeled demo and has no horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Which startup are you curious about?")
    .fill("https://company.com");
  await page
    .getByRole("button", { name: "Analyze startup", exact: true })
    .click();
  await expect(
    page.getByText("Sample report · Fictional company"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/report-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("unsafe URL is rejected and pasted input is available", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Which startup are you curious about?")
    .fill("http://127.0.0.1");
  await page
    .getByRole("button", { name: "Analyze startup", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "We couldn’t complete" }),
  ).toContainText("public HTTP or HTTPS");
  await page
    .getByRole("button", { name: "Paste website text instead" })
    .click();
  await expect(
    page.getByLabel("Public website text", { exact: true }),
  ).toBeVisible();
});
