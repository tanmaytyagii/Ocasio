export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Coverage, ExploreLink } from '../components/coverage';
import { getCoverage } from '../lib/coverage';

export default async function HomePage() {
  const coverage = await getCoverage();
  return (
    <>
      <section className="hero section-shell">
        <div className="hero-copy"><p className="eyebrow"><span className="small-dash" /> A little imagination. The right people.</p><h1>Your occasion.<br />More <em>possibilities.</em></h1><p className="hero-description">You know what the moment means. Discover what it could become—with local people who can help bring it to life.</p><Link className="button" href="/explore">Discover Ocasio</Link><p className="hero-footnote">Introducing our vision. Services are not yet open for booking.</p></div>
        <div className="occasion-art" role="img" aria-label="An abstract arrangement of circles, arches and a table, suggesting people coming together for an occasion.">
          <div className="art-caption"><span>SPACE FOR SOMETHING SPECIAL</span><span>OCASIO</span></div>
          <div className="art-orbit" /><div className="art-arch" /><div className="art-circle" /><div className="art-table" /><div className="art-stem" /><div className="art-small-circle" />
          <div className="art-bottom"><span>Ideas meet<br />local possibility.</span><span aria-hidden="true">✳</span></div>
        </div>
      </section>
      <section className="manifesto section-shell"><p className="eyebrow">The thought behind Ocasio</p><h2>Important moments don’t happen every day.<br /><span>Knowing the right people shouldn’t be a prerequisite.</span></h2><p>You might not have a decorator’s number. You might not know which ideas will work in your space, or what else is possible. That’s the gap we’re building Ocasio to bridge.</p></section>
      <section className="possibilities section-shell"><div className="section-heading"><div><p className="eyebrow">A more considered way to choose</p><h2>From “what if”<br />to the right fit.</h2></div><p>Our vision connects inspiration with local expertise, while leaving room for your own ideas.</p></div><div className="principle-grid"><article><span className="number-label">01 / DISCOVER</span><h3>See what’s possible.</h3><p>Explore ideas for your occasion, including things you might not have thought to ask for.</p></article><article><span className="number-label">02 / CHOOSE</span><h3>Find your people.</h3><p>Understand recommended local vendors, their work and the services that suit your needs.</p></article><article><span className="number-label">03 / MAKE IT YOURS</span><h3>Leave room for you.</h3><p>Choose individual services or customise a combination of vendors around your occasion.</p></article></div></section>
      <section className="city-section section-shell"><div className="section-heading"><div><p className="eyebrow">Rooted in the places we know</p><h2>Starting close to home.</h2></div><ExploreLink /></div><Coverage result={coverage} /></section>
      <section className="story-strip section-shell"><div><p className="eyebrow">Three developers. One shared idea.</p><h2>Built around a simple belief:<br />your occasion deserves thought.</h2></div><Link className="light-link" href="/about">Meet the idea behind Ocasio</Link></section>
    </>
  );
}
