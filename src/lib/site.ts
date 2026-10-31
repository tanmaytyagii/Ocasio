import { readSupportEmail } from './env';

/**
 * Who operates Ocasio and how to reach them — named once.
 *
 * The contact page and all three legal pages read from here. Before this, the
 * support address was a literal on the contact page (`hello@ocasio.example`)
 * that did not receive mail.
 *
 * Every `null` below is a fact the business has not confirmed yet. Pages render
 * a null as a visible "to be confirmed" marker instead of inventing a value: an
 * invented registered address or grievance officer on a legal page is worse
 * than an obvious gap. Fill these in before launch.
 */
export const SITE = {
  name: 'Ocasio',

  /** Set per deployment with VITE_SUPPORT_EMAIL. See .env.example. */
  supportEmail: readSupportEmail(),

  legal: {
    /**
     * False until a lawyer has reviewed the Terms, Privacy and Cancellation &
     * Refund pages. While false, those pages say they are drafts and show the
     * reviewer notes inline.
     */
    reviewed: false,

    /** Shown as "Last updated" on every legal page. Change with the content. */
    lastUpdated: '30 October 2026',

    /** Registered legal name of the operating entity. */
    entityName: null as string | null,

    /** Registered office address. */
    registeredAddress: null as string | null,

    /** Name of the grievance officer, if one is appointed. */
    grievanceOfficer: null as string | null,

    /** City whose courts have jurisdiction under the Terms. */
    jurisdictionCity: null as string | null,
  },
} as const;
