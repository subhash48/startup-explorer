import type { Report } from "@/lib/schema";
import { Icon } from "./icons";

export default function Outreach({ report }: { report: Report }) {
  return (
    <section
      className="outreach-section"
      id="company-people"
      aria-labelledby="people-heading"
      data-reveal
    >
      <div className="section-topline">
        <span className="eyebrow">02 / THE PEOPLE BEHIND THE PRODUCT</span>
        <span className="section-count">
          {report.contacts.length
            ? `${report.contacts.length} people listed`
            : "Public information only"}
        </span>
      </div>
      <div className="outreach-heading">
        <div>
          <h2 id="people-heading">
            A more human <em>first step.</em>
          </h2>
          <p>
            Who to reach out to, what they do, and where to start the
            conversation.
          </p>
        </div>
        <span className="people-symbol">
          <Icon name="people" size={32} />
        </span>
      </div>
      {report.mode === "sample" && (
        <p className="contact-disclosure">
          These people and roles are fictional examples, just like this sample
          company.
        </p>
      )}
      {report.mode === "pasted" && (
        <p className="contact-disclosure">
          Names come from your pasted text. Their roles and employment have not
          been verified.
        </p>
      )}
      {report.contacts.length ? (
        <div className="contacts-grid">
          {report.contacts.map((person, index) => (
            <article
              className="contact-card"
              key={`${person.name}-${person.role}`}
            >
              <div className="person-top">
                <span className={`person-avatar avatar-${index % 3}`}>
                  {person.name
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="person-context">
                  {report.mode === "sample"
                    ? "FICTIONAL EXAMPLE"
                    : report.mode === "pasted"
                      ? "FROM YOUR TEXT"
                      : "LISTED ON THE WEBSITE"}
                </span>
              </div>
              <h3>{person.name}</h3>
              <p className="person-role">{person.role}</p>
              <div className="person-details">
                <h4>WHAT THEY DO</h4>
                <p>{person.whatTheyDo || "Not available"}</p>
              </div>
              <div className="outreach-idea">
                <span>
                  <Icon name="spark" size={14} /> CONVERSATION STARTER{" "}
                  <small>Inferred</small>
                </span>
                <p>
                  {person.outreachReason ||
                    "Ask about their team and the work they do."}
                </p>
              </div>
              <details className="person-evidence">
                <summary>
                  Why this person is listed <span>+</span>
                </summary>
                <blockquote>“{person.evidence}”</blockquote>
                {person.employmentEvidence !== person.evidence && (
                  <blockquote>“{person.employmentEvidence}”</blockquote>
                )}
                {person.responsibilityEvidence &&
                  person.responsibilityEvidence !== person.evidence && (
                    <blockquote>“{person.responsibilityEvidence}”</blockquote>
                  )}
              </details>
              {person.sourceUrl ? (
                <a
                  className="person-source"
                  href={person.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View their mention on the website{" "}
                  <Icon name="arrow" size={16} />
                </a>
              ) : (
                <span className="person-source muted">
                  {report.mode === "sample"
                    ? "Illustrative profile · no live contact"
                    : "Source: your pasted text"}
                </span>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="contacts-empty">
          <span className="icon-tile">
            <Icon name="people" size={26} />
          </span>
          <div>
            <h3>No named contacts were found on the pages we read.</h3>
            <p>
              Try the company’s team page, or paste a public team bio to include
              it in a new analysis. Names and contact details are never guessed.
            </p>
            {report.careersUrl && (
              <a
                className="text-link"
                href={report.careersUrl}
                target="_blank"
                rel="noreferrer"
              >
                Start with the careers page ↗
              </a>
            )}
          </div>
        </div>
      )}
      <p className="outreach-footnote">
        <Icon name="check" size={14} /> Roles reflect the supplied content. A
        listed role does not confirm hiring responsibility or availability. Use
        the company’s public contact channels.
      </p>
    </section>
  );
}
