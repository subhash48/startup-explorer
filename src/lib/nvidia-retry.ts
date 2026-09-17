import OpenAI from "openai";
import { setTimeout } from "node:timers/promises";
import { retryAfterSeconds } from "./inference-error";

// Share one deadline across both attempts. Never retry rate limits, timeouts,
// connection failures, invalid output, or authentication errors automatically.
export async function withNvidiaRetry<T>(
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(40000);
  try {
    return await request(signal);
  } catch (error) {
    if (
      !(error instanceof OpenAI.APIError) ||
      ![500, 502, 503, 504].includes(error.status ?? 0) ||
      signal.aborted
    )
      throw error;
    const header = error.headers?.get("retry-after");
    const delay = header ? retryAfterSeconds(header) : 1;
    // Longer provider cooldowns are shown to the user instead of holding a request open.
    if (delay > 2) throw error;
    await setTimeout(delay * 1000, undefined, { signal });
    return request(signal);
  }
}
