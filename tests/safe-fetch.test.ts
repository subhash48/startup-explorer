import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../src/lib/url-safety", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/url-safety")>()),
  resolvePublic: vi.fn(),
}));
vi.mock("node:https", () => ({ default: { get: vi.fn() } }));
import https from "node:https";
import { resolvePublic } from "../src/lib/url-safety";
import { safeFetch } from "../src/lib/safe-fetch";
function mockReply(status: number, headers: Record<string, string>, body = "") {
  vi.mocked(https.get).mockImplementationOnce(((
    _url: unknown,
    _options: unknown,
    cb: (res: EventEmitter) => void,
  ) => {
    const req = Object.assign(new EventEmitter(), {
      setTimeout: vi.fn(),
      destroy: vi.fn(),
    });
    queueMicrotask(() => {
      const res = Object.assign(new EventEmitter(), {
        statusCode: status,
        headers,
        resume: vi.fn(),
        destroy: vi.fn(),
      });
      cb(res);
      res.emit("data", Buffer.from(body));
      res.emit("end");
    });
    return req;
  }) as never);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolvePublic).mockResolvedValue({ address: "8.8.8.8", family: 4 });
});
describe("safe transport", () => {
  it("pins the validated DNS address to the actual connection", async () => {
    mockReply(200, { "content-type": "text/html" }, "hello");
    const result = await safeFetch(
      "https://company.com",
      AbortSignal.timeout(1000),
    );
    expect(result.body).toBe("hello");
    const options = vi.mocked(https.get).mock.calls[0][1] as {
      family: number;
      lookup: (
        host: string,
        options: unknown,
        cb: (...args: unknown[]) => void,
      ) => void;
    };
    const callback = vi.fn();
    options.lookup("company.com", {}, callback);
    expect(options.family).toBe(4);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
  });
  it("blocks a redirect to metadata before making a second request", async () => {
    mockReply(302, { location: "http://169.254.169.254/latest/meta-data" });
    await expect(
      safeFetch("https://company.com", AbortSignal.timeout(1000)),
    ).rejects.toThrow();
    expect(https.get).toHaveBeenCalledTimes(1);
  });
  it("revalidates DNS for every redirect", async () => {
    mockReply(302, { location: "/about" });
    vi.mocked(resolvePublic)
      .mockResolvedValueOnce({ address: "8.8.8.8", family: 4 })
      .mockRejectedValueOnce(new Error("Private DNS"));
    await expect(
      safeFetch("https://company.com", AbortSignal.timeout(1000)),
    ).rejects.toThrow("Private DNS");
    expect(https.get).toHaveBeenCalledTimes(1);
  });
  it("checks policy before following a same-origin redirect", async () => {
    mockReply(302, { location: "/blocked" });
    const policy = vi.fn(async (url: URL) => {
      if (url.pathname === "/blocked") throw new Error("Disallowed");
    });
    await expect(
      safeFetch(
        "https://company.com",
        AbortSignal.timeout(1000),
        "https://company.com",
        policy,
      ),
    ).rejects.toThrow("Disallowed");
    expect(https.get).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized pages before collecting the response", async () => {
    mockReply(200, { "content-length": "1000001" });
    await expect(
      safeFetch("https://company.com", AbortSignal.timeout(1000)),
    ).rejects.toThrow("too large");
  });
});
