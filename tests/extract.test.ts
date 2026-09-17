import { describe, it, expect, vi } from "vitest";
import { extractWebsite, parsePage, ExtractionError } from "../src/lib/extract";
import type { PageResponse } from "../src/lib/safe-fetch";
const paragraph =
  "Our research platform helps product teams collect customer interviews and organize insights in one shared workspace. Teams use it to learn what customers need and collaborate on better product decisions.";
function response(url: string, body: string, status = 200): PageResponse {
  return { url, body, status, type: "text/html" };
}
describe("website extraction", () => {
  it("does not mistake risk management guides or starting-a-company products for team pages", () => {
    const result = parsePage(
      '<a href="/guides/risk-management">Risk management</a><a href="/atlas">Start a company</a><a href="/about">About</a>',
      "https://stripe.com/",
    );
    expect(result.links.map((link) => link.url)).toEqual([
      "https://stripe.com/about",
    ]);
  });
  it("discovers team pages without letting repeated careers links crowd them out", async () => {
    const fetcher = vi.fn(async (url: string) =>
      response(
        url,
        url.endsWith("robots.txt")
          ? ""
          : `<main><p>${paragraph}</p><a href="/careers">Careers</a><a href="/careers/design">Design jobs</a><a href="/leadership">Our leadership</a><a href="/about">About</a></main>`,
      ),
    );
    const result = await extractWebsite("https://company.com", fetcher);
    expect(result.pages.map((page) => page.url)).toEqual([
      "https://company.com/",
      "https://company.com/leadership",
      "https://company.com/careers",
      "https://company.com/about",
    ]);
  });
  it("removes noise and duplicate text; discovers only same-origin relevant links", () => {
    const page = parsePage(
      `<nav>Navigation<a href="/careers">Careers</a></nav><script>evil()</script><main><p>${paragraph}</p><p>${paragraph}</p><a href="/about">About</a><a href="https://other.com/product">Products</a></main><footer>Copyright</footer>`,
      "https://company.com/",
    );
    expect(page.text).not.toMatch(/Navigation|evil|Copyright/);
    expect(page.text.split(paragraph)).toHaveLength(2);
    expect(page.links.map((l) => l.url)).toEqual([
      "https://company.com/careers",
      "https://company.com/about",
    ]);
  });
  it("explains JavaScript-only extraction failure", async () => {
    const fetcher = vi.fn(async (url: string) =>
      response(url, url.endsWith("robots.txt") ? "" : '<div id="app"></div>'),
    );
    await expect(
      extractWebsite("https://company.com", fetcher),
    ).rejects.toThrow(/Paste public website text/);
  });
  it("does not fetch pages blocked by robots.txt", async () => {
    const fetcher = vi.fn(async (url: string) =>
      response(url, "User-agent: *\nDisallow: /"),
    );
    await expect(
      extractWebsite("https://company.com", fetcher),
    ).rejects.toBeInstanceOf(ExtractionError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps a useful homepage when a discovered page is blocked", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("robots.txt")
        ? response(url, "")
        : url.endsWith("/careers")
          ? response(url, "Blocked", 403)
          : response(
              url,
              `<main><p>${paragraph}</p><a href="/careers">Careers</a></main>`,
            ),
    );
    const result = await extractWebsite("https://company.com", fetcher);
    expect(result.pages).toHaveLength(1);
    expect(result.careersUrl).toBeNull();
    expect(result.notes).toHaveLength(1);
  });
  it("fetches no more than three discovered pages and never guesses a path", async () => {
    const fetcher = vi.fn(async (url: string) =>
      response(
        url,
        url.endsWith("robots.txt")
          ? ""
          : `<main><p>${paragraph}</p>${[1, 2, 3, 4, 5].map((n) => `<a href="/product-${n}">Product ${n}</a>`).join("")}</main>`,
      ),
    );
    const result = await extractWebsite("https://company.com", fetcher);
    expect(result.pages).toHaveLength(4);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("converts network errors into an actionable fallback", async () => {
    await expect(
      extractWebsite("https://company.com", async () => {
        throw new Error("Timeout");
      }),
    ).rejects.toThrow("Paste public website text");
  });
});
