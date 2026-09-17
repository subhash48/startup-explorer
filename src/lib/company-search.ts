import { z } from "zod";
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

export async function findCompanies(
  query: string,
  fetcher: typeof fetch = fetch,
) {
  const name = companyQuerySchema.parse(query);
  const signal = AbortSignal.timeout(12000);
  const search = searchSchema.parse(
    await directoryRequest(
      {
        action: "wbsearchentities",
        search: name,
        language: "en",
        type: "item",
        limit: "10",
      },
      signal,
      fetcher,
    ),
  );
  const hits = search.search.slice(0, 10);
  if (!hits.length) return [];
  const details = entitiesSchema.parse(
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
  const seen = new Set<string>();
  const matches = [];
  for (const hit of hits) {
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
        });
      } catch {
        /* Discard unsafe directory values. Full DNS validation occurs on analysis. */
      }
    }
  }
  return companyMatchesSchema.parse(matches.slice(0, 5));
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
