"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { reportSchema, type Report } from "@/lib/schema";
import {
  companyMatchesSchema,
  looksLikeWebsite,
  type CompanyMatch,
} from "@/lib/company-schema";
import { sampleReport } from "@/lib/sample";
import {
  addSaved,
  savedSchema,
  STORAGE_KEY,
  websiteKey,
  type Saved,
} from "@/lib/storage";
import ReportView from "./report";
import { Icon } from "./icons";
import ScrollEffects from "./scroll-effects";
export default function Explorer({ sampleMode }: { sampleMode: boolean }) {
  const [tab, setTab] = useState<"explore" | "saved">("explore");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [paste, setPaste] = useState(false);
  const [loading, setLoading] = useState(false);
  const [finding, setFinding] = useState(false);
  const [matches, setMatches] = useState<CompanyMatch[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [retryDelayMs, setRetryDelayMs] = useState(0);
  const [saved, setSaved] = useState<Saved>([]);
  const [storageError, setStorageError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!retryDelayMs) return;
    const timer = setTimeout(() => setRetryDelayMs(0), retryDelayMs);
    return () => clearTimeout(timer);
  }, [retryDelayMs]);
  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        setSaved(raw ? savedSchema.parse(JSON.parse(raw)) : []);
      } catch {
        setStorageError(
          "Saved reports could not be loaded. Browser storage may be unavailable or contain an older report.",
        );
      }
    }
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);
  function persist(next: Saved) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(next);
      setStorageError("");
    } catch {
      setStorageError(
        "Your browser could not save this report. Free up browser storage or enable local storage and try again.",
      );
    }
  }
  function show(next: Report) {
    setReport(next);
    setTab("explore");
    setError("");
    setTimeout(
      () =>
        resultRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        }),
      60,
    );
  }
  async function submit(event?: React.FormEvent, chosenWebsite?: string) {
    event?.preventDefault();
    if (busy.current || retryDelayMs > 0) return;
    busy.current = true;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      if (!chosenWebsite && !looksLikeWebsite(url)) {
        setFinding(true);
        setMatches([]);
        const res = await fetch(
          `/api/companies?q=${encodeURIComponent(url.trim())}`,
          { signal: AbortSignal.timeout(15000) },
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Company search is unavailable.");
        const candidates = companyMatchesSchema.parse(data.matches);
        if (!candidates.length)
          throw new Error(
            "We couldn’t find a website for that name. Try the full company name, or enter its website if you know it.",
          );
        setMatches(candidates);
        return;
      }
      const website = chosenWebsite ?? url;
      if (chosenWebsite) setUrl(chosenWebsite);
      setMatches([]);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: website, ...(paste ? { text } : {}) }),
        signal: AbortSignal.timeout(85000),
      });
      const data = await res.json();
      if (!res.ok) {
        if (
          (res.status === 429 || res.status === 503) &&
          Number.isFinite(data.retryAfterSeconds) &&
          data.retryAfterSeconds > 0
        ) {
          setRetryDelayMs(Math.min(86400, data.retryAfterSeconds) * 1000);
        }
        if (data.allowPaste) setPaste(true);
        throw new Error(data.error || "We could not analyze this website.");
      }
      show(reportSchema.parse(data.report));
    } catch (err) {
      setError(
        err instanceof Error && err.name !== "TimeoutError"
          ? err.message
          : "Analysis took too long. Please try again.",
      );
    } finally {
      setFinding(false);
      setLoading(false);
      busy.current = false;
    }
  }
  const isSaved = report
    ? saved.some(
        (s) => websiteKey(s.report.website) === websiteKey(report.website),
      )
    : false;
  return (
    <div className="app-shell">
      <ScrollEffects
        revision={`${tab}-${report?.analyzedAt ?? "empty"}-${report?.companyName ?? ""}`}
      />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Startup Explorer home">
          <span className="brand-mark">
            <Icon name="compass" size={25} />
          </span>
          startup<span className="brand-light">explorer</span>
          <span className="beta">BETA</span>
        </Link>
        <nav aria-label="Main navigation">
          <button
            aria-current={tab === "explore" ? "page" : undefined}
            onClick={() => setTab("explore")}
          >
            Explore
          </button>
          <button
            aria-current={tab === "saved" ? "page" : undefined}
            onClick={() => setTab("saved")}
          >
            <Icon name="bookmark" size={17} />
            Saved startups
            {saved.length > 0 && <span className="count">{saved.length}</span>}
          </button>
        </nav>
      </header>
      <main id="main">
        {tab === "explore" ? (
          <>
            <section className="hero">
              <div className="hero-art" aria-hidden="true">
                <span />
                <span />
                <span />
                <Icon name="compass" size={72} />
              </div>
              <div className="hero-kicker" data-reveal>
                <span /> A LITTLE RESEARCH. A BETTER NEXT STEP.
              </div>
              <h1 data-reveal>
                Understand a startup
                <br />
                <span>before you apply.</span>
              </h1>
              <p className="hero-description" data-reveal>
                Turn a company website into a clear overview of its
                <br className="desktop-break" /> product, customers, and team.
              </p>
              <form className="analyze-form" onSubmit={submit} data-reveal>
                <label htmlFor="website">
                  Which startup are you curious about?
                </label>
                <div className="input-row">
                  <span className="input-icon">
                    <Icon name="globe" />
                  </span>
                  <input
                    id="website"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setMatches([]);
                      setError("");
                    }}
                    placeholder="Enter a company name or website"
                    required
                    maxLength={2048}
                    autoComplete="off"
                    inputMode="text"
                    disabled={loading}
                  />
                  <button
                    className="button primary"
                    disabled={loading || retryDelayMs > 0}
                  >
                    {loading ? (
                      <>
                        <span className="spinner" />
                        {finding ? "Finding website…" : "Analyzing…"}
                      </>
                    ) : retryDelayMs > 0 ? (
                      "Please wait to retry"
                    ) : (
                      <>
                        Analyze startup
                        <Icon name="arrow" size={18} />
                      </>
                    )}
                  </button>
                </div>
                <p className="name-help">
                  Try a name like Stripe or Notion. No website needed.
                </p>
                {matches.length > 0 && (
                  <section
                    className="company-matches"
                    aria-labelledby="matches-heading"
                    aria-live="polite"
                  >
                    <h2 id="matches-heading">Choose the company you mean</h2>
                    <p>
                      Website suggestions from Wikidata. Check the name and
                      description before continuing.
                    </p>
                    <ul>
                      {matches.map((match) => (
                        <li key={`${match.id}-${match.website}`}>
                          <button
                            type="button"
                            disabled={loading || retryDelayMs > 0}
                            onClick={() =>
                              void submit(undefined, match.website)
                            }
                            aria-label={`Analyze ${match.name} at ${new URL(match.website).hostname}`}
                          >
                            <span>
                              <strong>{match.name}</strong>
                              <small>{match.description}</small>
                              <span className="match-domain">
                                {new URL(match.website).hostname}
                              </span>
                            </span>
                            <Icon name="arrow" size={18} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p>
                      Not the right company? Try a more specific name or enter
                      its website.
                    </p>
                  </section>
                )}
                <div className="form-help">
                  <span>
                    <Icon name="check" size={14} /> Public information. A
                    clearer picture.
                  </span>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setPaste(!paste)}
                    disabled={loading}
                  >
                    {paste ? "Use website only" : "Paste website text instead"}
                  </button>
                </div>
                {paste && (
                  <div className="paste-area">
                    <label htmlFor="public-text">Public website text</label>
                    <p>
                      For sites that block access or need JavaScript. We’ll
                      label your report as unverified pasted text. Only paste
                      public information.
                    </p>
                    <textarea
                      id="public-text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      minLength={150}
                      maxLength={24000}
                      required
                      rows={7}
                      placeholder="Paste at least 150 characters from the company’s public website…"
                      disabled={loading}
                    />
                    <small>
                      {text.length.toLocaleString()} / 24,000 characters
                    </small>
                  </div>
                )}
              </form>
              <div className="hero-benefits">
                <span>
                  <Icon name="globe" size={14} />
                  Understand the business
                </span>
                <span>
                  <Icon name="people" size={14} />
                  Meet the people
                </span>
                <span>
                  <Icon name="spark" size={14} />
                  Start a conversation
                </span>
              </div>
              <p className="sample-link">
                Just looking around?{" "}
                <button onClick={() => show(sampleReport)} disabled={loading}>
                  Explore a sample report <span>↗</span>
                </button>
              </p>
              {sampleMode && (
                <p className="demo-note">
                  Demo mode · No API key configured. Analysis shows a fictional
                  sample.
                </p>
              )}
            </section>
            {error && (
              <div className="error-box" role="alert">
                <strong>We couldn’t complete that analysis.</strong>
                <p>{error}</p>
              </div>
            )}
            {loading && (
              <section
                className="loading-card"
                role="status"
                aria-live="polite"
              >
                <span className="spinner" />
                <h2>
                  {finding
                    ? "Finding the right company"
                    : "Getting the bigger picture"}
                </h2>
                <p>
                  {finding
                    ? "Looking up listed company websites. This usually takes a few seconds."
                    : "Reading public pages and organizing the details. This can take up to a minute."}
                </p>
                <div className="skeleton" />
                <div className="skeleton short" />
              </section>
            )}
            <div ref={resultRef} className="result-anchor">
              {report && (
                <ReportView
                  report={report}
                  saved={isSaved}
                  onSave={() =>
                    persist(
                      isSaved
                        ? saved.filter(
                            (s) =>
                              websiteKey(s.report.website) !==
                              websiteKey(report.website),
                          )
                        : addSaved(saved, report),
                    )
                  }
                />
              )}
            </div>
            {!report && !loading && (
              <section
                className="empty-section"
                aria-labelledby="discover-heading"
              >
                <div className="section-heading">
                  <span className="rule" />
                  <h2 id="discover-heading">LESS GUESSWORK. MORE CONTEXT.</h2>
                  <span className="rule" />
                </div>
                <div className="feature-grid">
                  <article>
                    <span className="feature-number">01 / UNDERSTAND</span>
                    <h3>Get the big picture</h3>
                    <p>
                      What they build, who they help, and the problem they’re
                      working to solve.
                    </p>
                  </article>
                  <article>
                    <span className="feature-number">02 / PREPARE</span>
                    <h3>Go beyond the job description</h3>
                    <p>
                      Find grounded talking points to bring more thought to your
                      application.
                    </p>
                  </article>
                  <article>
                    <span className="feature-number">03 / KEEP EXPLORING</span>
                    <h3>Build your own shortlist</h3>
                    <p>
                      Save the companies that catch your eye. Come back when
                      you’re ready.
                    </p>
                  </article>
                </div>
                <div className="trust-line">
                  <Icon name="compass" size={18} />
                  <p>Your next opportunity deserves a closer look.</p>
                  <span>No sign-up. No rankings. Just context.</span>
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="saved-section">
            <div className="eyebrow">YOUR NEXT CHAPTER, COLLECTED</div>
            <h1>
              Saved startups<span>.</span>
            </h1>
            <p className="muted">
              Your research, ready when you are. Reports stay in this browser
              only.
            </p>
            {saved.length ? (
              <div className="saved-grid">
                {saved.map((item) => (
                  <article
                    className="card saved-card"
                    key={websiteKey(item.report.website)}
                  >
                    <div className="saved-top">
                      <span className="tag">
                        {item.report.mode === "sample"
                          ? "Fictional sample"
                          : item.report.mode === "pasted"
                            ? "Pasted text"
                            : item.report.industry}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${item.report.companyName}`}
                        onClick={() =>
                          persist(
                            saved.filter(
                              (s) =>
                                websiteKey(s.report.website) !==
                                websiteKey(item.report.website),
                            ),
                          )
                        }
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                    <h2>
                      <button onClick={() => show(item.report)}>
                        {item.report.companyName}
                        <span>↗</span>
                      </button>
                    </h2>
                    <p>{item.report.whatItDoes}</p>
                    <small>
                      Saved {new Date(item.savedAt).toLocaleDateString()}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <div className="saved-empty">
                <span className="icon-tile">
                  <Icon name="bookmark" size={27} />
                </span>
                <h2>A little curiosity goes a long way.</h2>
                <p>
                  Analyze a startup and save its report to start your shortlist.
                </p>
                <button
                  className="button primary"
                  onClick={() => setTab("explore")}
                >
                  Explore a startup
                  <Icon name="arrow" />
                </button>
              </div>
            )}
          </section>
        )}
        {storageError && (
          <p className="error-box" role="alert">
            {storageError}
          </p>
        )}
      </main>
      <footer className="site-footer">
        <span className="footer-brand">
          <Icon name="compass" size={17} />
          Startup Explorer
        </span>
        <p>Made for curious people making their next move.</p>
        <span>Research with intention.</span>
      </footer>
    </div>
  );
}
