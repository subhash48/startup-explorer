import { describe, expect, it, vi } from "vitest";
import { findCompanies } from "../src/lib/company-search";
import { looksLikeWebsite } from "../src/lib/company-schema";
const response = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
const search = {
  search: [{ id: "Q1", label: "Acme", description: "software company" }],
};
const statement = (url: string, rank = "normal", qualifiers = {}) => ({
  rank,
  qualifiers,
  mainsnak: { datavalue: { value: url } },
});
describe("company-name discovery", () => {
  it("uses directory URLs and prioritizes preferred current websites", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(search))
      .mockResolvedValueOnce(
        response({
          entities: {
            Q1: {
              claims: {
                P856: [
                  statement("https://old-acme.com"),
                  statement("https://acme.com", "preferred"),
                ],
              },
            },
          },
        }),
      );
    const result = await findCompanies("Acme", fetcher);
    expect(result).toEqual([
      {
        id: "Q1",
        name: "Acme",
        description: "software company",
        website: "https://acme.com/",
      },
    ]);
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.origin).toBe("https://www.wikidata.org");
    expect(url.searchParams.get("search")).toBe("Acme");
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  });
  it("discards private URLs, expired and deprecated statements", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(search))
      .mockResolvedValueOnce(
        response({
          entities: {
            Q1: {
              claims: {
                P856: [
                  statement("http://127.0.0.1"),
                  statement("https://old.com", "deprecated"),
                  statement("https://ended.com", "normal", { P582: [] }),
                ],
              },
            },
          },
        }),
      );
    expect(await findCompanies("Acme", fetcher)).toEqual([]);
  });
  it("does not invent a website when there are no results", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ search: [] }));
    expect(await findCompanies("Unknown Company", fetcher)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("handles upstream access failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429 }));
    await expect(findCompanies("Acme", fetcher)).rejects.toThrow(
      "temporarily unavailable",
    );
  });
  it("rejects oversized directory data", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("x".repeat(1_000_001)));
    await expect(findCompanies("Acme", fetcher)).rejects.toThrow("too large");
  });
  it.each(["Stripe", "Notion", "Acme Inc.", "Linear", "Hugging Face"])(
    "recognizes %s as a name",
    (name) => expect(looksLikeWebsite(name)).toBe(false),
  );
  it.each([
    "stripe.com",
    "https://stripe.com",
    "www.notion.so",
    "http://localhost",
    "http://127.0.0.1",
    "ftp://host.com",
  ])("routes %s to server-side URL validation", (url) =>
    expect(looksLikeWebsite(url)).toBe(true),
  );
});
