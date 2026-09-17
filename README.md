# Startup Explorer

A small, complete Next.js application that helps job seekers understand a startup before applying. No accounts, database, or company rankings.

## Run locally

Install Node.js 22.14+ (Node 22 LTS recommended), then run from this directory:

```sh
npm install
cp .env.example .env.local
npm run dev
```

PowerShell: use `Copy-Item .env.example .env.local` instead of `cp` if preferred. If script execution is disabled, use `npm.cmd` in place of `npm`.

Open http://localhost:3000. Without an API key, both the sample button and URL submission show the explicitly fictional Sprout report. The submitted company is never portrayed as analyzed. You can save, reopen, and remove the sample.

To enable live analysis, put your NVIDIA Build key and exact model ID in `.env.local`, then restart:

```dotenv
NVIDIA_API_KEY=your-nvidia-build-key
NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b
```

Never prefix the key with `NEXT_PUBLIC_`. The key is used exclusively on the server. Existing `OPENAI_API_KEY` and `OPENAI_MODEL` variables are ignored; no requests go to OpenAI-hosted inference. The app uses the OpenAI JavaScript SDK only as an HTTP client for NVIDIA's compatible API at `https://integrate.api.nvidia.com/v1/chat/completions`.

The configured model is the exact ID `nvidia/nemotron-3-super-120b-a12b` from [NVIDIA Build](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b). Its [API reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer) documents the NVIDIA-hosted Chat Completions endpoint. The app does not silently switch models or providers. To use another model, copy its exact ID from Build into `NVIDIA_MODEL` and check its model-specific hosted API documentation. A missing model produces a configuration error when a key is present. A missing key keeps the fictional sample mode available. Next.js loads `.env.local` on the server; restart the server after editing it. `.gitignore` explicitly excludes `.env.local` and other environment files, except the credential-free `.env.example`.

For this model, the checked reference documents text chat, an optional first system message, non-streaming responses, `max_tokens` from 1 to 32,768, and `reasoning_effort` values `none`, `low`, and `high`. The app requests 2,500 tokens and disables internal reasoning with `reasoning_effort: "none"` for this exact model so the budget is available for the JSON report. This model-specific option is not sent to other models. The reference does not document `response_format` or JSON-schema constraints, so the app does not assume either is supported. See NVIDIA's [API Catalog quickstart](https://docs.api.nvidia.com/nim/docs/api-quickstart) for key creation.

This machine did not have Node on PATH during implementation. A checksum-verified portable Node was installed at `%LOCALAPPDATA%\startup-explorer-runtime\node-v22.23.2-win-x64`. In PowerShell you can use it for the current session:

```powershell
$env:Path = "$env:LOCALAPPDATA\startup-explorer-runtime\node-v22.23.2-win-x64;$env:Path"
npm.cmd run dev
```

## What works

- Enter a startup name, choose from public company-directory matches, close spelling corrections, or public web discovery, and analyze it without typing a URL. Direct website input still works.
- Analyze a public homepage and up to three discovered same-origin About, Product, or Careers pages.
- Read a clear overview, products, customers, industry, problem, explicitly supported team details, and application talking points.
- Inspect the pages actually retrieved. Careers is only linked if its discovered page was successfully retrieved.
- Paste 150–24,000 characters of public website text when automatic extraction fails. These reports have no retrieved sources and are prominently labeled unverified.
- Save up to 50 reports in browser localStorage; duplicate domains (including www/protocol/path variants) replace the prior report. View saved dates, reopen reports, or remove them. Nothing syncs between browsers.
- Use the complete fictional demo without credentials.
- See publicly named people to reach out to, with roles, explicitly supported responsibilities, source excerpts, and clearly labeled inferred conversation starters. Team and leadership pages receive priority within the existing three-page follow-up budget. The backend requires verbatim evidence for a person's name and role, plus an excerpt naming both the person and the analyzed company to support employment. Unsupported contacts and responsibilities are omitted; no emails, phone numbers, or profile links are invented. A listed role does not guarantee hiring responsibility or availability. Pasted contacts remain unverified, and sample people are clearly fictional.
- Navigate reports with sticky section links, soft scroll reveals, a reading-progress indicator, and responsive contact cards. All content remains available without animations, and reduced-motion preferences disable animated reveals and smooth scrolling. Saved reports from before outreach was added still open with an empty contact list.

## Architecture

```text
src/app/page.tsx                 Server entry, exposes only sample-mode boolean
src/components/                 Responsive client UI and report cards
src/app/api/analyze/route.ts     Bounded input, server orchestration, safe errors
src/lib/url-safety.ts            URL parsing, IP classification, DNS validation
src/lib/safe-fetch.ts            Pinned connections, redirects, byte/time limits
src/lib/extract.ts               Robots policy, Cheerio extraction, page discovery
src/lib/company-search.ts        Bounded startup discovery, web matches, and spelling corrections
src/app/api/companies/route.ts    Company search endpoint with separate rate limits
src/lib/analyze.ts               NVIDIA chat, JSON validation, evidence checks
src/lib/contacts.ts              Evidence checks for people and employment
src/components/outreach.tsx      Public contacts and inferred outreach suggestions
src/components/scroll-effects.tsx Accessible progressive scroll animation
src/lib/inference-error.ts       Safe provider errors and Retry-After parsing
src/lib/schema.ts                Shared Zod request/report validation
src/lib/storage.ts               Validated browser storage and deduplication
src/lib/sample.ts                Explicitly fictional demonstration report
```

The SDK uses `chat.completions.create` against NVIDIA with a system prompt containing the JSON schema generated from the shared Zod schema. It does not use the OpenAI Responses API, `zodTextFormat`, `response_format`, or `store`. The reply must finish normally, contain valid JSON, and pass strict Zod validation before grounding and final report validation. A single JSON code fence is accepted; truncated, refused, empty, malformed, or schema-invalid output is rejected rather than repaired or shown as a report. Prompting for JSON is not a provider-side structured-output guarantee.

The model receives text as untrusted data, no tools, and no permission to follow embedded instructions. Company facts and inferred application suggestions are visually separated. Exact evidence quotes are required for employee range, headquarters, and talking points; unsupported quotes are discarded. Missing data displays “Not available.” Source links and timestamps are generated by the backend, never the model.

## Security, access, and limits

- Company-name search combines the public [Wikidata API](https://www.wikidata.org/wiki/Wikidata:Data_access), a public company-autocomplete directory, a spelling-suggestion service, and bounded public web discovery. This improves coverage for newer startups and misspelled names without inventing a domain. Search descriptions only help the user choose; they are never report facts or website sources. The user confirms a match, and the selected website passes through the existing URL/DNS checks before extraction. Invalid, expired, deprecated, and unsafe website values are excluded where flagged.
- Company search makes at most nine requests across fixed discovery hosts, rejects redirects, caps each response at 1 MB, and has a 12-second deadline. Its separate best-effort in-memory limiter allows 20 searches per client and 200 per instance per ten minutes. Configure deployment edge limits for GET `/api/companies` as well as POST `/api/analyze`; the same cross-instance limitations apply.
- WHATWG URL parsing plus `ipaddr.js` classification, not a URL regex. Only HTTP/HTTPS with standard ports; no credentials, internal names, or non-public IPs.
- All DNS answers must be public. The selected answer is pinned to the socket using Node's lookup hook with the original hostname retained for Host and TLS verification. DNS is revalidated on every redirect. A fixed address family avoids alternate automatic lookups.
- All cross-origin redirects are deliberately rejected, including bare-domain to www or HTTP to HTTPS redirects. Enter the final canonical HTTPS address, or paste public text. Same-origin redirects have their robots policy checked **before** each destination is fetched.
- Reads robots.txt and respects disallow rules. Robots 404 means no policy; other access failures fail closed. No login, paywall, CAPTCHA, blocked-page, or JavaScript-rendering bypass.
- Maximum four redirects, 1 MB per response, 8,000 characters per page, 32,000 characters per model input, three-second DNS deadline, seven-second socket inactivity timeout, 25-second extraction deadline, and a shared 40-second AI deadline. At most 2,500 output tokens per attempt. A transient NVIDIA HTTP 500/502/503/504 is retried once after a short delay (one second by default), within the same deadline. Provider cooldowns over two seconds are returned to the browser instead. There are no automatic retries for timeouts, connection failures, rate limits, invalid output, or authentication errors.
- JSON request bodies are streamed with a 100 KB cap, including chunked requests. URLs are limited to 2,048 characters; pasted text to 24,000. Cross-origin browser submissions are rejected.
- Best-effort in-process limiter: five analyses per IP per hour on Vercel, 30 per instance per hour, two concurrent analyses per instance. Local/self-hosted instances share a conservative user bucket. The limiter is **not durable** and does not coordinate across Vercel instances or survive restarts. The Origin check is not bot authentication.
- NVIDIA HTTP 429 responses become friendly 429 errors with a sanitized `Retry-After` header and delay in seconds. Numeric and HTTP-date delays are supported, with a 60-second fallback and a one-day maximum. Persistent NVIDIA server errors return a 503 with a cooldown (30 seconds by default). The browser temporarily disables resubmission for either cooldown and retains the website input. Timeouts and connection failures have distinct messages. Provider error bodies, headers containing credentials, and keys are never shown.
- No application logging of page text, secrets, or prompts. Website text is sent to NVIDIA for processing; only paste public information. No OpenAI-specific storage flag is sent and no provider retention guarantee is implied; review NVIDIA's applicable terms. Reports stay in the browser unless explicitly submitted again.

## Deploy on Vercel

1. Push this folder to your Git repository and import it into Vercel. Use the detected Next.js preset and Node.js 22. Build command: `npm run build`; output directory: default.
2. Deploy without an API key first to verify the sample experience.
3. Before enabling paid live analysis, configure Vercel Firewall rate limits for POST `/api/analyze` (for example five requests per IP per hour), plus bot protection/challenge where available. Configure a deployment-wide limit or trusted gateway if a hard shared cap is required. See [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting). Availability depends on your plan. Do not expose unrestricted live mode if your deployment cannot enforce these controls.
4. Check your NVIDIA account's hosted-model access, quota, and any available usage controls. Monitor usage and enforce an application/gateway cap appropriate to your account. Do not assume the example model has free hosted access.
5. Add `NVIDIA_API_KEY`, `NVIDIA_MODEL`, and **only after those controls are in place** `PUBLIC_DEMO_PROTECTED=true` to Vercel environment variables. Redeploy. The route fails closed for live calls on Vercel until the flag is set; the sample button stays available.
6. Verify a live website and pasted-text analysis on the deployment, and verify that the firewall rejects excess calls. The route requests a 90-second maximum duration; ensure your plan supports it.

Production locally: `npm run build`, then `npm start`. For other public hosting providers, enforce equivalent edge limits before exposing live mode; `PUBLIC_DEMO_PROTECTED` is a Vercel deployment gate, not a substitute for actual infrastructure protection.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Browser workflow checks (run against a server on port 3000 with **no API key**):

```sh
npx playwright install chromium
npm run dev
# In another terminal:
npx playwright test
```

Tests cover private/reserved IPs, unusual URL encodings, mixed DNS answers, malformed reports, source provenance, evidence grounding, noise removal, robots restrictions, failed extraction, page count limits, saved-report deduplication, and desktop/mobile save/reopen/remove flows. Browser screenshots are written to ignored `test-results/`.

NVIDIA integration tests mock HTTP at the SDK boundary to verify the exact endpoint, model and authorization header; absence of unsupported structured-output parameters; strict JSON validation; no fallback to OpenAI keys; sanitized rate-limit handling without retries; and bounded recovery from temporary server failures. Live NVIDIA integration has also successfully generated both a pasted-text report and a Stripe report using four retrieved pages. Hosted service availability can fluctuate; a transient NVIDIA 503 was observed while diagnosing the retry behavior.

Migration verification passed: lint, TypeScript, 84 automated tests, production build, and eight desktop/mobile browser checks including the rate-limit cooldown. The external-network test remains opt-in and was skipped during this migration.

Company-name search verification covers official website selection, unsafe-directory filtering, newer company-directory matches, public web discovery, close spelling corrections, empty results, and upstream failures. Website extraction and report generation remain the existing server-side pipeline after selecting a match.

Outreach and visual-refresh verification: 112 automated tests passed, including rejecting customer-testimonial authors and preserving older saved reports. Desktop/mobile checks cover contact cards, evidence disclosure, section navigation, reduced motion, and name search. A separate live NVIDIA contact test passed using explicit employment text; run it only when desired with `RUN_LIVE_CONTACT_TEST=true` and `node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/live-contacts.test.ts`. This test uses the configured account and is skipped in the default suite. A real Stripe report correctly omitted an unrelated customer's contact rather than presenting them as a Stripe employee.

A separate opt-in network test previously successfully extracted `https://www.iana.org/about` through the actual DNS-pinned transport. This network test is skipped in the default offline test suite; run it with `RUN_NETWORK_TEST=true` to check external connectivity again.

The local production preview was started on http://localhost:3010 because port 3000 was already occupied. For another port, run `npm run dev -- --port 3010`. Browser tests accept `PLAYWRIGHT_BASE_URL` to target a non-default port.

## Honest limitations

Cheerio cannot execute JavaScript. Thin, blocked, redirected, oversized, or slow websites may need pasted text. Only the homepage's first three relevant same-origin links are considered; external applicant-tracking systems are not crawled. Website statements are company claims, not independent verification. AI summaries can still be wrong despite schema and evidence checks; read the sources before relying on a claim. Pasted content is not authenticated. This app does not infer headcount, funding, hiring status, or success.

Live NVIDIA analysis requires a configured account key and access to the selected model at NVIDIA's hosted endpoint. Vercel deployment and firewall enforcement require access to your hosting account and remain deployment-time checks.
