import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("../src/lib/extract", () => ({
  extractWebsite: vi.fn(),
  ExtractionError: class extends Error {},
}));
vi.mock("../src/lib/analyze", () => ({ analyze: vi.fn() }));
vi.mock("../src/lib/rate-limit", () => ({ acquire: vi.fn() }));
import { POST } from "../src/app/api/analyze/route";
import { extractWebsite, ExtractionError } from "../src/lib/extract";
import { analyze } from "../src/lib/analyze";
import { acquire } from "../src/lib/rate-limit";
import { sampleReport } from "../src/lib/sample";
import { InferenceError } from "../src/lib/inference-error";
function request(body: unknown, headers = {}) {
  return new NextRequest("https://app.com/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NVIDIA_API_KEY", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("PUBLIC_DEMO_PROTECTED", "false");
  vi.mocked(acquire).mockReturnValue(vi.fn());
});
afterEach(() => vi.unstubAllEnvs());
describe("analysis API boundary", () => {
  it("returns provider rate limits with Retry-After and frees the concurrency slot", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-only");
    const release = vi.fn();
    vi.mocked(acquire).mockReturnValue(release);
    vi.mocked(analyze).mockRejectedValue(
      new InferenceError("Please retry in 30 seconds.", 429, 30),
    );
    const result = await POST(
      request({
        url: "company.com",
        text: "Public company information. ".repeat(10),
      }),
    );
    expect(result.status).toBe(429);
    expect(result.headers.get("Retry-After")).toBe("30");
    expect((await result.json()).retryAfterSeconds).toBe(30);
    expect(release).toHaveBeenCalledOnce();
  });
  it("returns explicit fictional data without a key, without fetching", async () => {
    const result = await POST(request({ url: "company.com" }));
    expect((await result.json()).report.mode).toBe("sample");
    expect(extractWebsite).not.toHaveBeenCalled();
  });
  it("rejects an unsafe input even in demo mode", async () =>
    expect((await POST(request({ url: "http://127.0.0.1" }))).status).toBe(
      400,
    ));
  it("rejects an oversized request", async () =>
    expect(
      (await POST(request({ url: "company.com", text: "a".repeat(100001) })))
        .status,
    ).toBe(413));
  it("rejects cross-origin submissions", async () =>
    expect(
      (
        await POST(
          request({ url: "company.com" }, { Origin: "https://evil.com" }),
        )
      ).status,
    ).toBe(403));
  it("fails closed on Vercel when edge controls have not been acknowledged", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-only");
    vi.stubEnv("VERCEL", "1");
    expect((await POST(request({ url: "company.com" }))).status).toBe(503);
    expect(analyze).not.toHaveBeenCalled();
  });
  it("never fetches a website for pasted text", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-only");
    vi.mocked(analyze).mockResolvedValue({ ...sampleReport, mode: "pasted" });
    const text = "Public company information. ".repeat(10);
    const result = await POST(request({ url: "company.com", text }));
    expect(result.status).toBe(200);
    expect(extractWebsite).not.toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledWith(
      "https://company.com/",
      expect.objectContaining({ careersUrl: null }),
      true,
    );
  });
  it("offers paste fallback after extraction fails and releases the concurrency slot", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-only");
    const release = vi.fn();
    vi.mocked(acquire).mockReturnValue(release);
    vi.mocked(extractWebsite).mockRejectedValue(
      new ExtractionError("Paste public website text."),
    );
    const result = await POST(request({ url: "company.com" }));
    expect(result.status).toBe(422);
    expect((await result.json()).allowPaste).toBe(true);
    expect(release).toHaveBeenCalled();
  });
  it("redacts provider errors", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-only");
    vi.mocked(analyze).mockRejectedValue(new Error("secret provider details"));
    const result = await POST(
      request({ url: "company.com", text: "Public information ".repeat(20) }),
    );
    expect(result.status).toBe(502);
    expect(JSON.stringify(await result.json())).not.toContain("secret");
  });
  it("does not spend on requests over the limit", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "test-only");
    vi.mocked(acquire).mockReturnValue(null);
    expect((await POST(request({ url: "company.com" }))).status).toBe(429);
    expect(analyze).not.toHaveBeenCalled();
  });
});
