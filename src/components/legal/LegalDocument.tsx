import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { Notice } from '../ui';
import { SITE } from '../../lib/site';
import { usePageMeta } from '../../hooks/usePageMeta';
import { LEGAL_PAGES } from './legalPages';

/**
 * Shared layout for the Terms, Privacy and Cancellation & Refund pages.
 *
 * The pages are drafts until counsel signs them off (SITE.legal.reviewed).
 * Until then each page says so at the top, and every clause that needs a
 * decision carries a visible <ReviewNote>. Flipping the flag removes both; it
 * does not remove the facts still marked <Pending>, which have to be supplied.
 */

export type LegalSection = { id: string; title: string; body: ReactNode };

type LegalDocumentProps = {
  title: string;
  /** Meta description for the page. */
  description: string;
  /** One or two plain-language sentences above the sections. */
  intro: ReactNode;
  sections: LegalSection[];
};

/** A clause that needs a lawyer's decision. Hidden once the pages are reviewed. */
export const ReviewNote = ({ children }: { children: ReactNode }) =>
  SITE.legal.reviewed ? null : (
    <span className="mt-3 block rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
      <strong className="font-semibold">Legal review: </strong>
      {children}
    </span>
  );

/** A business fact that is not confirmed yet. Never replaced by a guess. */
export const Pending = ({ value, label }: { value: string | null; label: string }) =>
  value ? (
    <>{value}</>
  ) : (
    <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-900 [box-decoration-break:clone]">[{label} — to be confirmed]</span>
  );

/** The support inbox as a link, or a plain statement that it is not set up. */
export const SupportContact = () =>
  SITE.supportEmail ? (
    <a href={`mailto:${SITE.supportEmail}`} className="font-medium text-brand-700 hover:underline">
      {SITE.supportEmail}
    </a>
  ) : (
    <Pending value={null} label="support email" />
  );

/**
 * The section list. Rendered twice — a sticky sidebar from lg up, and inline
 * after the intro below that — because on a phone a twelve-item list above the
 * title would push the title off the first screen. Only one is ever displayed,
 * so assistive technology meets exactly one.
 */
const Contents = ({ sections, labelId }: { sections: LegalSection[]; labelId: string }) => (
  <nav aria-labelledby={labelId} className="rounded-card border border-line bg-surface p-5">
    <p id={labelId} className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-ink">
      On this page
    </p>
    <ol className="mt-4 space-y-2.5 text-sm">
      {sections.map((section, index) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="flex gap-2 text-muted transition-colors hover:text-brand-700"
          >
            <span className="w-5 shrink-0 text-right tabular-nums text-line-strong">
              {index + 1}.
            </span>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  </nav>
);

const LegalDocument = ({ title, description, intro, sections }: LegalDocumentProps) => {
  usePageMeta(`${title} — Ocasio`, description);
  const { pathname } = useLocation();

  return (
    <div className="bg-canvas">
      <div className="shell py-[clamp(2.5rem,5vw,4.5rem)]">
        <div className="mx-auto grid max-w-[64rem] gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
          {/* ── contents ───────────────────────────────────────────── */}
          <aside className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
            <Contents sections={sections} labelId="legal-contents" />
          </aside>

          {/* ── document ───────────────────────────────────────────── */}
          <article className="min-w-0">
            <p className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-700">
              <Scale className="h-4 w-4" aria-hidden="true" />
              Legal
            </p>
            <h1 className="mt-4 text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">
              {title}
            </h1>
            <p className="mt-3 text-sm text-muted">Last updated {SITE.legal.lastUpdated}</p>

            {!SITE.legal.reviewed && (
              <div className="mt-6">
                <Notice tone="warning" title="Draft pending legal review">
                  This is an initial version prepared before launch. It has not yet been reviewed
                  by a lawyer, and items marked “Legal review” or “to be confirmed” are still open.
                </Notice>
              </div>
            )}

            <div className="mt-6 text-[1.0625rem] leading-relaxed text-ink-soft">{intro}</div>

            <div className="mt-8 lg:hidden">
              <Contents sections={sections} labelId="legal-contents-inline" />
            </div>

            <div
              className={[
                'mt-10 space-y-12 text-[0.9375rem] leading-[1.75] text-ink-soft',
                '[&_p+p]:mt-4 [&_p+ul]:mt-3 [&_ul+p]:mt-4',
                '[&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_li]:pl-1',
                '[&_strong]:font-semibold [&_strong]:text-ink',
              ].join(' ')}
            >
              {sections.map((section, index) => (
                <section key={section.id} id={section.id} className="scroll-mt-28">
                  <h2 className="mb-4 text-xl font-semibold tracking-[-0.01em] text-ink">
                    <span className="mr-2 tabular-nums text-brand-600">{index + 1}.</span>
                    {section.title}
                  </h2>
                  {section.body}
                </section>
              ))}
            </div>

            <nav
              aria-label="Other legal documents"
              className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm"
            >
              {LEGAL_PAGES.filter((page) => page.to !== pathname).map((page) => (
                <Link key={page.to} to={page.to} className="font-medium text-brand-700 hover:underline">
                  {page.label}
                </Link>
              ))}
            </nav>
          </article>
        </div>
      </div>
    </div>
  );
};

export default LegalDocument;
