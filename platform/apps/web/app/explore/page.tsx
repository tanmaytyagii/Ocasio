export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { Coverage } from '../../components/coverage';
import { getCoverage } from '../../lib/coverage';

export const metadata: Metadata = { title: 'Explore the idea' };

export default async function ExplorePage() {
  const coverage = await getCoverage();
  return <>
    <section className="page-intro section-shell"><p className="eyebrow">Explore Ocasio</p><h1>Start with a moment.<br /><em>Imagine the possibilities.</em></h1><p className="intro-description">An occasion can begin with a clear vision, a small idea, or simply a reason to bring people together. We’re building a place to help you find your way from there.</p></section>
    <section className="explore-model section-shell"><div className="section-heading"><h2>Different needs.<br />Room for each.</h2><p>The experience we’re working towards.</p></div><div className="principle-grid"><article><span className="number-label">AN INDIVIDUAL SERVICE</span><h3>You know what you need.</h3><p>Find local expertise for one part of your occasion, with a clear understanding of the work and what’s included.</p></article><article><span className="number-label">A PERSONALISED COMBINATION</span><h3>Bring the pieces together.</h3><p>Explore and customise services from multiple vendors to suit your own occasion, rather than fitting it into a fixed idea.</p></article><article><span className="number-label">A LITTLE MORE GUIDANCE</span><h3>Find a helpful perspective.</h3><p>Optional personalised assistance is part of our vision. Any on-site help will depend on the service and local availability.</p></article></div></section>
    <section className="city-section section-shell"><div className="section-heading"><div><p className="eyebrow">Our first connections</p><h2>Places we’re getting to know.</h2></div><p>These are research markets, not bookable service areas. We’ll publish availability when it’s ready.</p></div><Coverage result={coverage} /></section>
    <section className="quiet-note section-shell"><span className="note-symbol" aria-hidden="true">✳</span><div><h2>Good choices take groundwork.</h2><p>We’re developing our vendor relationships and the experience behind Ocasio. There are no live vendor listings, service quotes or bookings in this introduction.</p><Link className="text-link" href="/about">Read our story</Link></div></section>
  </>;
}
