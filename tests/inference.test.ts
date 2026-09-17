import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyze, parseAnalysisResponse } from "../src/lib/analyze";
import { retryAfterSeconds } from "../src/lib/inference-error";
import { analysisSchema } from "../src/lib/schema";
import { sampleReport } from "../src/lib/sample";

const payload = analysisSchema.parse(sampleReport);
const extracted = {
  pages: [
    { url: "https://company.com/", text: "Company builds research software." },
  ],
  careersUrl: null,
  notes: [],
};
const fetchMock = vi.fn();
function reply(content = JSON.stringify(payload), finish = "stop") {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { role: "assistant", content }, finish_reason: finish },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
beforeEach(() => {
  vi.stubEnv("NVIDIA_API_KEY", "test-nvidia-key");
  vi.stubEnv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b");
  vi.stubEnv("OPENAI_API_KEY", "must-not-be-used");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("NVIDIA Chat Completions", () => {
  it("recovers from one transient NVIDIA 503 without changing the model", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(reply());
    const result = await analyze("https://company.com/", extracted, false);
    expect(result.mode).toBe("live");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe(
      "nvidia/nemotron-3-super-120b-a12b",
    );
  });
  it("stops after one retry and returns a safe service error", async () => {
    fetchMock.mockResolvedValue(
      new Response("private upstream details", { status: 503 }),
    );
    await expect(
      analyze("https://company.com/", extracted, false),
    ).rejects.toMatchObject({
      status: 503,
      retryAfterSeconds: 30,
      message: expect.stringContaining("temporarily unavailable"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("honors long upstream cooldowns without retrying immediately", async () => {
    fetchMock.mockResolvedValue(
      new Response("unavailable", {
        status: 503,
        headers: { "Retry-After": "120" },
      }),
    );
    await expect(
      analyze("https://company.com/", extracted, false),
    ).rejects.toMatchObject({ status: 503, retryAfterSeconds: 120 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("calls only the NVIDIA endpoint with the exact configured model and plain Chat Completions", async () => {
    fetchMock.mockResolvedValue(reply());
    const result = await analyze("https://company.com/", extracted, false);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://integrate.api.nvidia.com/v1/chat/completions",
    );
    expect(new Headers(options.headers).get("authorization")).toBe(
      "Bearer test-nvidia-key",
    );
    const body = JSON.parse(options.body);
    expect(body.model).toBe("nvidia/nemotron-3-super-120b-a12b");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain('"companyName"');
    expect(body.messages[1].content).toContain("untrustedWebsiteContent");
    expect(body).not.toHaveProperty("response_format");
    expect(body).not.toHaveProperty("store");
    expect(body.max_tokens).toBe(2500);
    expect(body.reasoning_effort).toBe("none");
    expect(result.sources).toEqual(["https://company.com/"]);
    expect(result.mode).toBe("live");
  });
  it("preserves an explicitly selected alternative model ID", async () => {
    vi.stubEnv("NVIDIA_MODEL", "publisher/exact-selected-id");
    fetchMock.mockResolvedValue(reply());
    await analyze("https://company.com/", extracted, true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(
      "publisher/exact-selected-id",
    );
  });
  it("never falls back to OpenAI credentials", async () => {
    vi.stubEnv("NVIDIA_API_KEY", "");
    await expect(
      analyze("https://company.com/", extracted, false),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires a model ID instead of silently substituting one", async () => {
    vi.stubEnv("NVIDIA_MODEL", "");
    await expect(
      analyze("https://company.com/", extracted, false),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps pasted reports unverified", async () => {
    fetchMock.mockResolvedValue(reply());
    const result = await analyze("https://company.com/", extracted, true);
    expect(result.sources).toEqual([]);
    expect(result.mode).toBe("pasted");
  });
  it("propagates a sanitized rate-limit delay without automatically retrying", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "secret provider details" } }),
        { status: 429, headers: { "retry-after": "90" } },
      ),
    );
    await expect(
      analyze("https://company.com/", extracted, false),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 90 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404, 422])(
    "handles provider configuration/access error %s without leaking its body",
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "secret provider details" } }),
          { status },
        ),
      );
      await expect(
        analyze("https://company.com/", extracted, false),
      ).rejects.toMatchObject({
        status: 503,
        message: expect.not.stringContaining("secret"),
      });
    },
  );
  it("does not silently present invalid output as a live report", async () => {
    fetchMock.mockResolvedValue(reply('{"companyName":"Incomplete"}'));
    await expect(
      analyze("https://company.com/", extracted, false),
    ).rejects.toThrow("invalid report");
  });
});

describe("JSON output validation", () => {
  it("accepts plain and single fenced valid JSON", () => {
    expect(parseAnalysisResponse(JSON.stringify(payload), "stop")).toEqual(
      payload,
    );
    expect(
      parseAnalysisResponse(
        "```json\n" + JSON.stringify(payload) + "\n```",
        "stop",
      ),
    ).toEqual(payload);
  });
  it.each(["length", "content_filter", "tool_calls", null])(
    "rejects incomplete/refused output (%s)",
    (reason) =>
      expect(() =>
        parseAnalysisResponse(JSON.stringify(payload), reason),
      ).toThrow(),
  );
  it.each([
    null,
    "",
    "Not JSON",
    '{"companyName":7}',
    "[{}]",
    JSON.stringify({ ...payload, sources: ["https://invented.com"] }),
  ])("rejects empty, malformed, or schema-invalid output", (content) =>
    expect(() => parseAnalysisResponse(content, "stop")).toThrow(),
  );
  it("handles numeric, date, and missing Retry-After values", () => {
    expect(retryAfterSeconds("12")).toBe(12);
    expect(retryAfterSeconds("invalid")).toBe(60);
    expect(retryAfterSeconds(null)).toBe(60);
    expect(
      retryAfterSeconds(
        "Wed, 16 Sep 2026 12:01:00 GMT",
        Date.parse("2026-09-16T12:00:00Z"),
      ),
    ).toBe(60);
  });
});
