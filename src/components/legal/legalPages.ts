/**
 * The legal documents, in the order the footer and each page list them.
 * `short` is the footer label, where three full titles do not fit one row.
 */
export const LEGAL_PAGES = [
  { to: '/terms', label: 'Terms and Conditions', short: 'Terms' },
  { to: '/privacy', label: 'Privacy Policy', short: 'Privacy' },
  { to: '/cancellation-and-refunds', label: 'Cancellation and Refund Policy', short: 'Cancellation & refunds' },
] as const;
