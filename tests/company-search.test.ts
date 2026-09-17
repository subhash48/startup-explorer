import { describe, expect, it, vi } from "vitest";
import { findCompanies } from "../src/lib/company-search";
import { looksLikeWebsite } from "../src/lib/company-schema";

const response = (data: unknown) => new Response(JSON.stringify(data));
const search = {
  search: [{ id: "Q1", label: "Acme", description: "software company" }],
};
const statement = (url: string, rank = "normal", qualifiers = {}) => ({
  rank,
  qualifiers,
  mainsnak: { datavalue: { value: url } },
});
const emptyDirectories = (url: URL) => {
  if (url.hostname === "autocomplete.clearbit.com") return response([]);
  if (url.hostname === "suggestqueries.google.com") return response(["Acme", []]);
  return response(search);
};

describe("company-name discovery", () => {
  it("uses Wikidata URLs and prioritizes preferred current websites", async () => {
    const fetcher = vi.fn(async (url: URL, _init?: RequestInit) => {
      void _init;
      if (url.searchParams.get("action") === "wbgetentities")
        return response({
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
        });
      return emptyDirectories(url);
    });

    await expect(findCompanies("Acme", fetcher as typeof fetch)).resolves.toEqual([
      {
        id: "Q1",
        name: "Acme",
        description: "software company",
        website: "https://acme.com/",
        source: "wikidata",
      },
    ]);
    const url = fetcher.mock.calls.find(
      ([request]) => (request as URL).hostname === "www.wikidata.org",
    )?.[0] as URL;
    expect(url.origin).toBe("https://www.wikidata.org");
    expect(url.searchParams.get("search")).toBe("Acme");
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it("discards private URLs, expired and deprecated statements", async () => {
    const fetcher = vi.fn(async (url: URL, _init?: RequestInit) => {
      void _init;
      if (url.searchParams.get("action") === "wbgetentities")
        return response({
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
        });
      return emptyDirectories(url);
    });
    await expect(findCompanies("Acme", fetcher as typeof fetch)).resolves.toEqual([]);
  });

  it("adds newer startups from a company directory", async () => {
    const fetcher = vi.fn(async (url: URL) =>
      url.hostname === "autocomplete.clearbit.com"
        ? response([{ name: "Tavus", domain: "tavus.io" }])
        : url.hostname === "suggestqueries.google.com"
          ? response(["Tavus", []])
          : response({ search: [] }),
    );
    await expect(findCompanies("Tavus", fetcher as typeof fetch)).resolves.toEqual([
      {
        id: "directory:tavus.io",
        name: "Tavus",
        description: "Company-directory match. Confirm this is the startup you mean.",
        website: "https://tavus.io/",
        source: "directory",
      },
    ]);
  });

  it("finds a new startup from a matching public web result", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.hostname === "www.bing.com")
        return new Response(`
          <ol id="b_results">
            <li class="b_algo"><h2><a href="http://127.0.0.1">MintMCP</a></h2></li>
            <li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1aHR0cHM6Ly93d3cubWludG1jcC5jb20v">MintMCP: Enterprise MCP gateway</a></h2><div class="b_caption"><p>Govern AI agent access.</p></div></li>
          </ol>
        `);
      if (url.hostname === "suggestqueries.google.com")
        return response(["mintmcp", []]);
      if (url.hostname === "autocomplete.clearbit.com") return response([]);
      return response({ search: [] });
    });

    await expect(findCompanies("mintmcp", fetcher as typeof fetch)).resolves.toEqual([
      {
        id: "web:mintmcp.com",
        name: "MintMCP: Enterprise MCP gateway",
        description: "Govern AI agent access.",
        website: "https://www.mintmcp.com/",
        source: "web",
      },
    ]);
  });

  it("uses a close spelling correction to find a startup", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.hostname === "suggestqueries.google.com")
        return response(["strpe", ["stripe"]]);
      if (url.hostname === "autocomplete.clearbit.com")
        return response(
          url.searchParams.get("query") === "stripe"
            ? [{ name: "Stripe", domain: "stripe.com" }]
            : [{ name: "STRPEPP", domain: "strpepp.org" }],
        );
      return response({ search: [] });
    });
    await expect(findCompanies("strpe", fetcher as typeof fetch)).resolves.toEqual([
      {
        id: "directory:stripe.com",
        name: "Stripe",
        description: 'Closest spelling match for "stripe" from a company directory.',
        website: "https://stripe.com/",
        source: "directory",
        correction: "stripe",
      },
      {
        id: "directory:strpepp.org",
        name: "STRPEPP",
        description: "Company-directory match. Confirm this is the startup you mean.",
        website: "https://strpepp.org/",
        source: "directory",
      },
    ]);
  });

  it("does not invent a website when every directory is empty", async () => {
    const fetcher = vi.fn(async (url: URL) =>
      url.hostname === "suggestqueries.google.com"
        ? response(["Unknown Company", []])
        : url.hostname === "autocomplete.clearbit.com"
          ? response([])
          : response({ search: [] }),
    );
    await expect(findCompanies("Unknown Company", fetcher as typeof fetch)).resolves.toEqual([]);
  });

  it("handles upstream access failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    await expect(findCompanies("Acme", fetcher as typeof fetch)).rejects.toThrow(
      "temporarily unavailable",
    );
  });

  it("rejects oversized directory data", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("x".repeat(1_000_001)));
    await expect(findCompanies("Acme", fetcher as typeof fetch)).rejects.toThrow("too large");
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
