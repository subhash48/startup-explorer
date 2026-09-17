import { NextRequest, NextResponse } from "next/server";
import { requestSchema } from "@/lib/schema";
import { normalizeUrl } from "@/lib/url-safety";
import { sampleReport } from "@/lib/sample";
import { extractWebsite, ExtractionError } from "@/lib/extract";
import { analyze } from "@/lib/analyze";
import { acquire } from "@/lib/rate-limit";
import { InferenceError } from "@/lib/inference-error";
export const runtime = "nodejs";
export const maxDuration = 90;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: NextRequest) {
  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== req.nextUrl.origin
  )
    return json({ error: "Please submit from this app." }, 403);
  if (!req.headers.get("content-type")?.includes("application/json"))
    return json({ error: "Expected JSON input." }, 415);
  if (Number(req.headers.get("content-length") ?? 0) > 100000)
    return json({ error: "Input is too large." }, 413);
  let input;
  try {
    const reader = req.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100000) {
        await reader.cancel();
        return json({ error: "Input is too large." }, 413);
      }
      chunks.push(value);
    }
    input = requestSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return json(
      {
        error:
          "Enter a website URL. Pasted text must be between 150 and 24,000 characters.",
      },
      400,
    );
  }
  let website: string;
  try {
    website = normalizeUrl(input.url).href;
  } catch {
    return json(
      {
        error:
          "Enter a public HTTP or HTTPS website URL using its standard port.",
      },
      400,
    );
  }
  if (!process.env.NVIDIA_API_KEY?.trim())
    return json({ report: sampleReport });
  if (process.env.VERCEL && process.env.PUBLIC_DEMO_PROTECTED !== "true")
    return json(
      {
        error:
          "Live analysis is not enabled on this deployment yet. You can still explore the sample report.",
      },
      503,
    );
  // Only trust Vercel's platform-generated IP header; local deployments share a bucket.
  const release = acquire(
    process.env.VERCEL
      ? (req.headers.get("x-vercel-forwarded-for") ?? "unknown")
      : "local",
  );
  if (!release)
    return json(
      {
        error:
          "The demo is busy or its hourly limit has been reached. Please try again later.",
      },
      429,
    );
  try {
    const pasted = Boolean(input.text);
    const extracted = input.text
      ? {
          pages: [{ url: "User-provided public text", text: input.text }],
          careersUrl: null,
          notes: [
            "Based on pasted text. The website was not retrieved or verified.",
          ],
        }
      : await extractWebsite(website);
    return json({ report: await analyze(website, extracted, pasted) });
  } catch (error) {
    if (error instanceof InferenceError) {
      const result = json(
        {
          error: error.message,
          ...(error.retryAfterSeconds
            ? { retryAfterSeconds: error.retryAfterSeconds }
            : {}),
        },
        error.status,
      );
      if (error.retryAfterSeconds)
        result.headers.set("Retry-After", String(error.retryAfterSeconds));
      return result;
    }
    if (error instanceof ExtractionError)
      return json({ error: error.message, allowPaste: true }, 422);
    return json(
      {
        error:
          "We could not complete the analysis. The AI service may be unavailable or its configuration needs attention. Try again or explore the sample report.",
      },
      502,
    );
  } finally {
    release();
  }
}
