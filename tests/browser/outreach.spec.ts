import { test, expect } from "@playwright/test";
import { sampleReport } from "../../src/lib/sample";
test("sample outreach profiles show role, responsibilities, evidence, and section navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample report" }).click();
  await page.getByRole("link", { name: "02 People" }).click();
  await expect(page.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await expect(page.getByText("Head of People", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "These people and roles are fictional examples, just like this sample company.",
    ),
  ).toBeVisible();
  await page.locator(".person-evidence summary").first().click();
  await expect(
    page.locator(".person-evidence blockquote").first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/premium-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("reduced motion keeps the report readable and old reports show contact fallback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const legacy = Object.fromEntries(
    Object.entries(sampleReport).filter(([key]) => key !== "contacts"),
  );
  await page.addInitScript(
    (report) =>
      localStorage.setItem(
        "startup-explorer:saved:v1",
        JSON.stringify([{ report, savedAt: "2026-09-16T12:00:00.000Z" }]),
      ),
    legacy,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Saved startups/ }).click();
  await page.getByRole("button", { name: "Sprout ↗", exact: true }).click();
  await page.getByRole("link", { name: "02 People" }).click();
  await expect(
    page.getByText("No named contacts were found on the pages we read."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === "running").length,
    ),
  ).toBe(0);
});
