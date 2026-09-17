import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
export function publicIp(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    if (parsed.range() !== "unicast") return false;
    // IPv6 global unicast only; all other allocations fail closed.
    if (parsed.kind() === "ipv6")
      return parsed.match(ipaddr.parseCIDR("2000::/3"));
    return !parsed.match(ipaddr.parseCIDR("192.0.0.0/24"));
  } catch {
    return false;
  }
}
export function normalizeUrl(input: string): URL {
  const url = new URL(input.includes("://") ? input : `https://${input}`);
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    (!host.includes(".") && !ipaddr.isValid(host)) ||
    /(^|\.)(localhost|local|internal|lan|home|test|invalid|example)$/.test(
      host,
    ) ||
    (ipaddr.isValid(host) && !publicIp(host))
  )
    throw new Error(
      "Enter a public HTTP or HTTPS website using its standard port.",
    );
  url.hash = "";
  return url;
}
export async function resolvePublic(url: URL) {
  normalizeUrl(url.href);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(host, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("DNS lookup timed out.")),
        3000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some((a) => !publicIp(a.address)))
    throw new Error("This address does not resolve exclusively to public IPs.");
  return addresses[0];
}
