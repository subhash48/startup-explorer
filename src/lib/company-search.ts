import { z } from "zod";
import * as cheerio from "cheerio";
import { companyMatchesSchema, companyQuerySchema } from "./company-schema";
import { normalizeUrl } from "./url-safety";

const searchSchema = z.object({
  search: z.array(
    z.object({
      id: z.string().regex(/^Q\d+$/),
      label: z.string(),
      description: z.string().optional(),
    }),
  ),
});
const autocompleteSchema = z.array(
  z.object({
    name: z.string(),
    domain: z.string(),
  }),
);
const correctionSchema = z
  .tuple([z.string(), z.array(z.string())])
  .rest(z.unknown());
const statementSchema = z.object({
  rank: z.string().optional(),
  qualifiers: z.record(z.string(), z.unknown()).optional(),
  mainsnak: z.object({
    datavalue: z.object({ value: z.unknown() }).optional(),
  }),
});
const entitiesSchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      claims: z
        .object({ P856: z.array(statementSchema).optional() })
        .optional(),
    }),
  ),
});
type ScoredMatch = {
  id: string;
  name: string;
  description: string;
  website: string;
  source: "wikidata" | "directory" | "web";
  correction?: string;
  score: number;
};

function withoutScore(match: ScoredMatch) {
  return {
    id: match.id,
    name: match.name,
    description: match.description,
    website: match.website,
    source: match.source,
    ...(match.correction ? { correction: match.correction } : {}),
  };
}

async function boundedJsonRequest(
  url: URL,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  const response = await fetcher(url, {
    signal,
    redirect: "error",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "StartupExplorer/1.0 (company website discovery)",
    },
  });
  if (!response.ok || !response.body)
    throw new Error(
      "Company search is temporarily unavailable. Try again shortly or enter a website.",
    );
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_000_000) {
      await reader.cancel();
      throw new Error("Directory response is too large.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function boundedTextRequest(
  url: URL,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  const response = await fetcher(url, {
    signal,
    redirect: "error",
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "StartupExplorer/1.0 (company website discovery)",
    },
  });
  if (!response.ok || !response.body)
    throw new Error("Web discovery is temporarily unavailable.");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_000_000) {
      await reader.cancel();
      throw new Error("Web discovery response is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function directoryRequest(
  params: Record<string, string>,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  // Fixed public endpoint, encoded query parameters, no user-controlled host or redirects.
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({
    format: "json",
    maxlag: "5",
    ...params,
  }).toString();
  return boundedJsonRequest(url, signal, fetcher);
}

function normalizedName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const saved = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + Number(left[i - 1] !== right[j - 1]),
      );
      diagonal = saved;
    }
  }
  return previous[right.length];
}

function isCloseSpelling(input: string, suggestion: string) {
  const left = normalizedName(input);
  const right = normalizedName(suggestion);
  if (!left || !right || left === right) return false;
  const allowed =
    left.length <= 4 ? 1 : Math.max(2, Math.floor(left.length * 0.3));
  return editDistance(left, right) <= allowed;
}

function matchScore(
  input: string,
  candidate: string,
  correction?: string,
): number {
  if (correction)
    return Math.min(1_200, matchScore(correction, candidate) + 200);
  const left = normalizedName(input);
  const right = normalizedName(candidate);
  if (left === right) return 1_000;
  if (right.startsWith(left) || left.startsWith(right)) return 800;
  return Math.max(0, 500 - editDistance(left, right) * 40);
}

async function spellingCorrections(
  name: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  const url = new URL("https://suggestqueries.google.com/complete/search");
  url.search = new URLSearchParams({ client: "firefox", q: name }).toString();
  const suggestions = correctionSchema.parse(
    await boundedJsonRequest(url, signal, fetcher),
  )[1];
  return suggestions
    .filter((suggestion) => isCloseSpelling(name, suggestion))
    .slice(0, 2);
}

async function autocompleteCompanies(
  name: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  const url = new URL("https://autocomplete.clearbit.com/v1/companies/suggest");
  url.search = new URLSearchParams({ query: name }).toString();
  const results = autocompleteSchema.parse(
    await boundedJsonRequest(url, signal, fetcher),
  );
  return results.slice(0, 8);
}

function isRelevantWebResult(name: string, title: string, hostname: string) {
  const query = normalizedName(name);
  const titleText = normalizedName(title);
  const domainText = normalizedName(hostname.replace(/\.(?:com|io|ai|co|app|dev|org|net)$/i, ""));
  return (
    titleText.includes(query) ||
    domainText.includes(query) ||
    query.includes(domainText)
  );
}

function resultDestination(href: string) {
  const result = new URL(href);
  if (
    !/(^|\.)bing\.com$/i.test(result.hostname) ||
    !result.pathname.startsWith("/ck/")
  )
    return result.href;
  const encoded = result.searchParams.get("u");
  if (!encoded?.startsWith("a1")) return result.href;
  const destination = Buffer.from(encoded.slice(2), "base64url").toString("utf8");
  return /^https?:\/\//i.test(destination) ? destination : result.href;
}

async function webDiscovery(
  name: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  const url = new URL("https://www.bing.com/search");
  url.search = new URLSearchParams({
    q: `${name} official website`,
    count: "8",
    setlang: "en-US",
  }).toString();
  const $ = cheerio.load(await boundedTextRequest(url, signal, fetcher));
  const results: Array<{ name: string; website: string; description: string }> = [];
  $("#b_results .b_algo").each((_, element) => {
    if (results.length >= 5) return;
    const anchor = $(element).find("h2 a[href]").first();
    const title = anchor.text().replace(/\s+/g, " ").trim();
    const href = anchor.attr("href");
    if (!title || !href) return;
    try {
      const website = normalizeUrl(resultDestination(href));
      if (!isRelevantWebResult(name, title, website.hostname)) return;
      results.push({
        name: title.slice(0, 300),
        website: website.href,
        description:
          $(element).find(".b_caption p").first().text().replace(/\s+/g, " ").trim().slice(0, 500) ||
          "Public web discovery result. Confirm this is the startup you mean.",
      });
    } catch {
      /* Discard unsafe or malformed result URLs. */
    }
  });
  return results;
}

export async function findCompanies(
  query: string,
  fetcher: typeof fetch = fetch,
) {
  const name = companyQuerySchema.parse(query);
  const signal = AbortSignal.timeout(12000);
  const [initialSearch, initialDirectory, correctionsResult, webResults] =
    await Promise.allSettled([
      directoryRequest(
        {
          action: "wbsearchentities",
          search: name,
          language: "en",
          type: "item",
          limit: "12",
        },
        signal,
        fetcher,
      ).then((value) => searchSchema.parse(value).search),
      autocompleteCompanies(name, signal, fetcher),
      spellingCorrections(name, signal, fetcher),
      webDiscovery(name, signal, fetcher),
    ]);
  const corrections =
    correctionsResult.status === "fulfilled" ? correctionsResult.value : [];
  const correctedSearches = await Promise.allSettled(
    corrections.map((correction) =>
      Promise.all([
        directoryRequest(
          {
            action: "wbsearchentities",
            search: correction,
            language: "en",
            type: "item",
            limit: "8",
          },
          signal,
          fetcher,
        ).then((value) => searchSchema.parse(value).search),
        autocompleteCompanies(correction, signal, fetcher),
      ]),
    ),
  );
  if (
    initialSearch.status === "rejected" &&
    initialDirectory.status === "rejected" &&
    webResults.status === "rejected" &&
    correctedSearches.every((result) => result.status === "rejected")
  )
    throw initialSearch.reason instanceof Error
      ? initialSearch.reason
      : new Error("Company search is temporarily unavailable.");

  const searchHits =
    initialSearch.status === "fulfilled" ? [...initialSearch.value] : [];
  const directoryHits: Array<{
    result: z.infer<typeof autocompleteSchema>[number];
    correction?: string;
  }> =
    initialDirectory.status === "fulfilled"
      ? initialDirectory.value.map((result) => ({ result, correction: undefined }))
      : [];
  for (let index = 0; index < correctedSearches.length; index++) {
    const result = correctedSearches[index];
    if (result.status !== "fulfilled") continue;
    const [search, directory] = result.value;
    searchHits.push(...search);
    directoryHits.push(...directory.map((item) => ({ result: item, correction: corrections[index] })));
  }
  const hits = Array.from(new Map(searchHits.map((hit) => [hit.id, hit])).values()).slice(0, 20);
  const matches: ScoredMatch[] = [];
  const seen = new Set<string>();
  if (webResults.status === "fulfilled") {
    for (const result of webResults.value) {
      const key = new URL(result.website).hostname.replace(/^www\./, "");
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        id: `web:${key}`,
        name: result.name,
        description: result.description,
        website: result.website,
        source: "web",
        score: matchScore(name, `${result.name} ${key}`) + 100,
      });
    }
  }
  for (const { result, correction } of directoryHits) {
    try {
      const website = normalizeUrl(result.domain).href;
      const key = new URL(website).hostname.replace(/^www\./, "");
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        id: `directory:${key}`,
        name: result.name.slice(0, 300),
        description: correction
          ? `Closest spelling match for "${correction}" from a company directory.`
          : "Company-directory match. Confirm this is the startup you mean.",
        website,
        source: "directory",
        ...(correction ? { correction } : {}),
        score: matchScore(name, result.name, correction),
      });
    } catch {
      /* Discard invalid public directory values. Full DNS validation occurs on analysis. */
    }
  }
  if (!hits.length)
    return companyMatchesSchema.parse(
      matches
        .sort((left, right) => right.score - left.score)
        .slice(0, 8)
        .map(withoutScore),
    );
  let details: z.infer<typeof entitiesSchema> | null = null;
  try {
    details = entitiesSchema.parse(
      await directoryRequest(
      {
        action: "wbgetentities",
        ids: hits.map((hit) => hit.id).join("|"),
        props: "claims",
      },
      signal,
      fetcher,
      ),
    );
  } catch {
    // Directory matches remain useful if Wikidata is temporarily unavailable.
  }
  if (details) for (const hit of hits) {
    const statements = (details.entities[hit.id]?.claims?.P856 ?? [])
      .filter(
        (statement) =>
          statement.rank !== "deprecated" && !statement.qualifiers?.P582,
      )
      .sort(
        (a, b) =>
          Number(b.rank === "preferred") - Number(a.rank === "preferred"),
      );
    // Prefer current URLs, and never invent a domain from a name or an AI answer.
    const preferred = statements.some(
      (statement) => statement.rank === "preferred",
    );
    for (const statement of statements.filter(
      (s) => !preferred || s.rank === "preferred",
    )) {
      const value = statement.mainsnak.datavalue?.value;
      if (typeof value !== "string") continue;
      try {
        const website = normalizeUrl(value);
        const key = website.hostname.replace(/^www\./, "");
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({
          id: hit.id,
          name: hit.label.slice(0, 300),
          description: (hit.description ?? "").slice(0, 500),
          website: website.href,
          source: "wikidata",
          score: matchScore(name, hit.label),
        });
      } catch {
        /* Discard unsafe directory values. Full DNS validation occurs on analysis. */
      }
    }
  }
  return companyMatchesSchema.parse(
    matches
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)
      .map(withoutScore),
  );
}

const searchBuckets = new Map<string, { count: number; expires: number }>();
export function allowCompanySearch(key: string, now = Date.now()) {
  for (const [id, bucket] of searchBuckets)
    if (bucket.expires <= now) searchBuckets.delete(id);
  const bucket = searchBuckets.get(key) ?? { count: 0, expires: now + 600000 };
  const total = searchBuckets.get("__total") ?? {
    count: 0,
    expires: now + 600000,
  };
  if (bucket.count >= 20 || total.count >= 200 || searchBuckets.size >= 2000)
    return false;
  bucket.count++;
  total.count++;
  searchBuckets.set(key, bucket);
  searchBuckets.set("__total", total);
  return true;
}
