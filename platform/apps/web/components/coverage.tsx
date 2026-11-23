import Link from 'next/link';
import type { CoverageResult } from '../lib/coverage';

export function Coverage({ result }: { result: CoverageResult }) {
  if (!result.ok) {
    return (
      <div className="service-notice" role="status">
        <div><p className="eyebrow">City updates unavailable</p><p>{result.message}</p></div>
        <a className="text-link" href="/explore">Try again</a>
      </div>
    );
  }
  if (result.items.length === 0) {
    return <div className="service-notice"><p>We’re still preparing our first city updates. No services are open for booking.</p></div>;
  }
  return (
    <div className="city-grid">
      {result.items.map((market, index) => (
        <article className="city-card" key={market.slug}>
          <div className="city-topline"><span className="city-index">0{index + 1}</span><span className="status-dot" aria-hidden="true" /></div>
          <h3>{market.name}</h3>
          <p>Vendor network in preparation</p>
          <div className="city-rule" />
          <p className="city-note">We’re researching local possibilities and building relationships. Bookings are not open.</p>
        </article>
      ))}
    </div>
  );
}

export function ExploreLink() {
  return <Link className="text-link" href="/explore">See where we’re starting</Link>;
}
