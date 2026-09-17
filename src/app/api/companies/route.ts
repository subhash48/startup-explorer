import { NextRequest, NextResponse } from "next/server";
import { companyQuerySchema } from "@/lib/company-schema";
import { allowCompanySearch, findCompanies } from "@/lib/company-search";

export const runtime = "nodejs";
export const maxDuration = 20;
export async function GET(req: NextRequest) {
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  const query = companyQuerySchema.safeParse(req.nextUrl.searchParams.get("q"));
  if (!query.success)
    return json(
      { error: "Enter a company name between 2 and 100 characters." },
      400,
    );
  const key = process.env.VERCEL
    ? (req.headers.get("x-vercel-forwarded-for") ?? "unknown")
    : "local";
  if (!allowCompanySearch(key))
    return json(
      {
        error:
          "Company search is busy. Please try again later or enter a website directly.",
      },
      429,
    );
  try {
    return json({ matches: await findCompanies(query.data) });
  } catch {
    return json(
      {
        error:
          "Company search is temporarily unavailable. Try again shortly or enter a website directly.",
      },
      503,
    );
  }
}
