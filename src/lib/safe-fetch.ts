import http from "node:http";
import https from "node:https";
import { normalizeUrl, resolvePublic } from "./url-safety";
export type PageResponse = {
  url: string;
  status: number;
  type: string;
  body: string;
};
export async function safeFetch(
  input: string,
  signal: AbortSignal,
  origin?: string,
  beforeFetch?: (url: URL) => Promise<void>,
): Promise<PageResponse> {
  let url = normalizeUrl(input);
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (origin && url.origin !== origin)
      throw new Error("Cross-origin page redirect was skipped.");
    await beforeFetch?.(url);
    const address = await resolvePublic(url);
    signal.throwIfAborted();
    const response = await new Promise<PageResponse & { location?: string }>(
      (resolve, reject) => {
        // Pin the validated DNS answer to the connection; preserve Host and TLS SNI.
        const req = (url.protocol === "https:" ? https : http).get(
          url,
          {
            signal,
            agent: false,
            family: address.family,
            headers: {
              "User-Agent": "StartupExplorer/1.0",
              Accept: "text/html,text/plain",
              "Accept-Encoding": "identity",
            },
            lookup: (_host, _options, callback) =>
              callback(null, address.address, address.family),
          },
          (res) => {
            const status = res.statusCode ?? 500;
            if (status >= 300 && status < 400) {
              res.resume();
              resolve({
                url: url.href,
                status,
                type: "",
                body: "",
                location: res.headers.location,
              });
              return;
            }
            if (Number(res.headers["content-length"] ?? 0) > 1_000_000) {
              res.destroy();
              reject(new Error("Website page is too large."));
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > 1_000_000) {
                res.destroy(new Error("Website page is too large."));
              } else chunks.push(chunk);
            });
            res.on("error", reject);
            res.on("end", () =>
              resolve({
                url: url.href,
                status,
                type: String(res.headers["content-type"] ?? ""),
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
          },
        );
        req.setTimeout(7000, () =>
          req.destroy(new Error("Website request timed out.")),
        );
        req.on("error", reject);
      },
    );
    if (response.status >= 300 && response.status < 400) {
      if (!response.location)
        throw new Error("Website returned an invalid redirect.");
      url = normalizeUrl(new URL(response.location, url).href);
      continue;
    }
    return response;
  }
  throw new Error("Website redirected too many times.");
}
