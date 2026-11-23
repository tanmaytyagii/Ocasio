import Link from 'next/link';

export default function NotFound() {
  return <section className="state-page section-shell"><p className="eyebrow">404 / A different direction</p><h1>This page isn’t<br /><em>part of the occasion.</em></h1><p>The link may have changed, or this page may not exist. There’s still an idea to explore.</p><Link className="button" href="/">Return to Ocasio</Link></section>;
}
