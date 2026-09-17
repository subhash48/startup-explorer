import type { Report } from "@/lib/schema";
import { Icon } from "./icons";
import Outreach from "./outreach";
export default function ReportView({
  report,
  saved,
  onSave,
}: {
  report: Report;
  saved: boolean;
  onSave: () => void;
}) {
  const missing = "Not available";
  return (
    <section className="report-section" aria-labelledby="report-heading">
      <div className={`notice ${report.mode === "live" ? "live" : ""}`}>
        <Icon name={report.mode === "live" ? "check" : "spark"} />
        <div>
          <strong>
            {report.mode === "sample"
              ? "Sample report · Fictional company"
              : report.mode === "pasted"
                ? "Pasted-text analysis · Website not verified"
                : "Website-based analysis"}
          </strong>
          <p>
            {report.mode === "sample"
              ? "A preview of what you’ll discover. This is illustrative content, not a live analysis."
              : report.mode === "pasted"
                ? "This report uses only the text you provided. No website was retrieved."
                : "Based on the public pages listed below. Company claims are not independently verified."}
          </p>
        </div>
      </div>
      <div className="report-header" data-reveal>
        <div className="company">
          <span className="company-avatar">
            {report.companyName.slice(0, 1)}
          </span>
          <div>
            <h2 id="report-heading">{report.companyName}</h2>
            <span className="muted">{new URL(report.website).hostname}</span>
          </div>
        </div>
        <button
          className={`button secondary ${saved ? "saved-button" : ""}`}
          onClick={onSave}
        >
          <Icon name={saved ? "check" : "bookmark"} />
          {saved ? "Saved · Remove" : "Save startup"}
        </button>
      </div>
      <nav className="report-nav" aria-label="Report sections">
        <a href="#company-overview">
          01 <span>Overview</span>
        </a>
        <a href="#company-people">
          02 <span>People</span>
        </a>
        <a href="#company-application">
          03 <span>Your application</span>
        </a>
        <a href="#company-sources">
          04 <span>Sources</span>
        </a>
      </nav>
      <div className="report-grid" id="company-overview">
        <article className="card overview">
          <div className="eyebrow">
            <Icon name="globe" size={16} /> THE BIG PICTURE
          </div>
          <h3>What does {report.companyName} do?</h3>
          <p className="summary">{report.whatItDoes || missing}</p>
          <div className="tag">{report.industry || missing}</div>
          <div className="divider" />
          <h4>THE PROBLEM IT SOLVES</h4>
          <p>{report.problemSolved || missing}</p>
        </article>
        <article className="card">
          <div className="eyebrow">PRODUCT & PEOPLE</div>
          <h3>What they build. Who it’s for.</h3>
          <h4>MAIN PRODUCTS & SERVICES</h4>
          {report.products.length ? (
            <ul className="product-list">
              {report.products.map((p, i) => (
                <li key={i}>
                  <span className="small-check">
                    <Icon name="check" size={13} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <p>{missing}</p>
          )}
          <div className="divider" />
          <h4>TARGET CUSTOMERS</h4>
          <p>{report.targetCustomers || missing}</p>
        </article>
        <article className="card team">
          <div>
            <div className="eyebrow">A LITTLE MORE CONTEXT</div>
            <h3>The team at a glance</h3>
          </div>
          <div>
            <h4>EMPLOYEES</h4>
            <p>{report.employeeRange?.value || missing}</p>
            {report.employeeRange && (
              <small>“{report.employeeRange.quote}”</small>
            )}
          </div>
          <div>
            <h4>HEADQUARTERS</h4>
            <p>{report.headquarters?.value || missing}</p>
            {report.headquarters && (
              <small>“{report.headquarters.quote}”</small>
            )}
          </div>
          <div>
            <h4>CAREERS</h4>
            {report.careersUrl ? (
              <a
                className="text-link"
                href={report.careersUrl}
                target="_blank"
                rel="noreferrer"
              >
                Explore careers ↗
              </a>
            ) : (
              <p>{missing}</p>
            )}
          </div>
        </article>
      </div>
      <Outreach report={report} />
      <div className="report-grid" id="company-application">
        <article className="card talking">
          <div className="talking-title">
            <span className="icon-tile">
              <Icon name="spark" />
            </span>
            <div>
              <div className="eyebrow">
                MAKE YOUR APPLICATION MORE THOUGHTFUL
              </div>
              <h3>A starting point for your conversation</h3>
            </div>
            <span className="inferred">Inferred insights</span>
          </div>
          <p className="muted">
            Suggestions based on the content, rather than stated company facts.
            Make them your own.
          </p>
          <div className="talking-grid">
            {report.talkingPoints.length ? (
              report.talkingPoints.map((point, i) => (
                <div className="talking-point" key={i}>
                  <span className="point-number">0{i + 1}</span>
                  <p>{point.insight}</p>
                  <small>
                    <strong>Grounding:</strong> “{point.evidence}”
                  </small>
                </div>
              ))
            ) : (
              <p>{missing}</p>
            )}
          </div>
        </article>
      </div>
      <div className="sources" id="company-sources" data-reveal>
        <div>
          <h4>{report.mode === "live" ? "RETRIEVED SOURCES" : "SOURCES"}</h4>
          {report.sources.length ? (
            <ul>
              {report.sources.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {url} ↗
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {report.mode === "pasted"
                ? "User-provided text. No verified website sources."
                : "No retrieved sources. This company is fictional."}
            </p>
          )}
        </div>
        <p>
          {report.mode === "sample" ? "Sample prepared" : "Analyzed"}{" "}
          {new Date(report.analyzedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
      {report.notes.length > 0 && (
        <div className="report-notes">
          {report.notes.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
        </div>
      )}
    </section>
  );
}
