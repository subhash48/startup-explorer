import { describe, it, expect, vi } from "vitest";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
import { lookup } from "node:dns/promises";
import { normalizeUrl, publicIp, resolvePublic } from "../src/lib/url-safety";
describe("public URL validation", () => {
  it.each([
    "http://localhost",
    "http://localhost.",
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://10.1.2.3",
    "http://192.168.1.1",
    "http://169.254.169.254",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "file:///etc/passwd",
    "ftp://company.com",
    "https://a:b@company.com",
    "https://company.com:8080",
    "http://printer.local",
    "http://internal",
    "http://foo.internal",
  ])("rejects %s", (value) => expect(() => normalizeUrl(value)).toThrow());
  it.each([
    "0.0.0.0",
    "100.64.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "192.0.0.8",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "4000::1",
  ])("rejects reserved IP %s", (value) => expect(publicIp(value)).toBe(false));
  it("normalizes public URLs", () =>
    expect(normalizeUrl("company.com/#hello").href).toBe(
      "https://company.com/",
    ));
  it("accepts public addresses", () => {
    expect(publicIp("8.8.8.8")).toBe(true);
    expect(publicIp("2606:4700:4700::1111")).toBe(true);
  });
  it("rejects a mixed public/private DNS response", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ] as never);
    await expect(resolvePublic(new URL("https://company.com"))).rejects.toThrow(
      "exclusively",
    );
  });
});
