import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { safeFetch } from "./safe-fetch";
import { normalizeUrl } from "./url-safety";
export class ExtractionError extends Error {}
export type Extracted = {
  pages: { url: string; text: string }[];
  careersUrl: string | null;
  notes: string[];
};
export function parsePage(html: string, url: string) {
  const $ = cheerio.load(html);
  const links: {
    url: string;
    label: string;
    score: number;
    careers: boolean;
  }[] = [];
  $("a[href]").each((_, el) => {
    try {
      const target = normalizeUrl(new URL($(el).attr("href")!, url).href);
      if (target.origin !== new URL(url).origin || target.href === url) return;
      const label = `${$(el).text()} ${target.pathname}`;
      const careers = /career|jobs|join[- ]us/i.test(label);
      const score = careers
        ? 3
        : /about|our[- ]story|company/i.test(label)
          ? 2
          : /product|solution|platform/i.test(label)
            ? 1
            : 0;
      if (score && !links.some((l) => l.url === target.href))
        links.push({ url: target.href, label, score, careers });
    } catch {
      /* Ignore malformed and non-public links. */
    }
  });
  $(
    'script,style,nav,footer,header,aside,noscript,svg,iframe,form,[hidden],[aria-hidden="true"],[role="navigation"]',
  ).remove();
  const root = $("main").length ? $("main") : $("body");
  root.find("br,p,div,section,li,h1,h2,h3,h4,article").append("\n");
  const seen = new Set<string>();
  const text = root
    .text()
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => {
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    })
    .join("\n")
    .slice(0, 8000);
  return { text, links: links.sort((a, b) => b.score - a.score) };
}
export async function extractWebsite(
  input: string,
  fetcher = safeFetch,
): Promise<Extracted> {
  const start = normalizeUrl(input);
  const signal = AbortSignal.timeout(25000);
  const notes: string[] = [];
  try {
    const policies = new Map<string, ReturnType<typeof robotsParser>>();
    async function allowed(url: URL) {
      if (!policies.has(url.origin)) {
        const robotsUrl = `${url.origin}/robots.txt`;
        const res = await fetcher(robotsUrl, signal, url.origin);
        if (res.status !== 404 && (res.status < 200 || res.status >= 300))
          throw new Error("Website access policy could not be read.");
        policies.set(
          url.origin,
          robotsParser(robotsUrl, res.status === 404 ? "" : res.body),
        );
      }
      if (
        policies.get(url.origin)!.isAllowed(url.href, "StartupExplorer") ===
        false
      )
        throw new Error("Website access policy disallows this page.");
    }
    await allowed(start);
    // No cross-origin redirects: destination policy must never be bypassed.
    const home = await fetcher(start.href, signal, start.origin, allowed);
    if (
      home.status < 200 ||
      home.status >= 300 ||
      !home.type.includes("text/html")
    )
      throw new Error(
        "The website blocked access or did not return an HTML page.",
      );
    await allowed(new URL(home.url));
    const parsed = parsePage(home.body, home.url);
    const pages =
      parsed.text.length >= 150 ? [{ url: home.url, text: parsed.text }] : [];
    let careersUrl: string | null = null;
    for (const link of parsed.links.slice(0, 3)) {
      try {
        await allowed(new URL(link.url));
        const res = await fetcher(link.url, signal, start.origin, allowed);
        await allowed(new URL(res.url));
        if (
          res.status < 200 ||
          res.status >= 300 ||
          !res.type.includes("text/html")
        )
          throw new Error("Unavailable page");
        const page = parsePage(res.body, res.url);
        if (page.text.length < 150)
          throw new Error("Insufficient readable content");
        if (!pages.some((p) => p.url === res.url))
          pages.push({ url: res.url, text: page.text });
        if (link.careers) careersUrl = res.url;
      } catch {
        notes.push(
          "A linked page was unavailable, restricted, or contained too little readable text.",
        );
      }
    }
    if (!pages.length)
      throw new Error(
        "No useful public text was found. The site may require JavaScript.",
      );
    const seen = new Set<string>();
    for (const page of pages)
      page.text = page.text
        .split("\n")
        .filter((line) => {
          if (seen.has(line)) return false;
          seen.add(line);
          return true;
        })
        .join("\n");
    return { pages, careersUrl, notes: [...new Set(notes)] };
  } catch (error) {
    throw new ExtractionError(
      `${error instanceof Error ? error.message : "The website could not be read."} Paste public website text below to continue.`,
    );
  }
}
