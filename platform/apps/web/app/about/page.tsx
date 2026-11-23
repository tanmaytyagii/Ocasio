import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Our story' };

export default function AboutPage() {
  return <>
    <section className="page-intro section-shell"><p className="eyebrow">The idea behind Ocasio</p><h1>Three friends.<br /><em>A shared possibility.</em></h1><p className="intro-description">We’re three developers with an idea: make it easier for people to discover what their occasion could be, and find the local people who can help.</p></section>
    <section className="about-story section-shell"><div><p className="eyebrow">Our starting point</p><h2>Local roots.<br />A wider perspective.</h2></div><div className="prose"><p>Two of us are from Karnal, and one is from Muzaffarnagar. Our studies and work have also connected us to Delhi NCR. These are the places where we’re starting to build relationships.</p><p>The thought behind Ocasio is straightforward. Most of us don’t organise important occasions every day. We may not know the vendors, the possibilities or which questions to ask.</p><p>We want to make those choices easier: introduce ideas, help people understand local services, and build relationships with vendors whose work can be considered thoughtfully.</p></div></section>
    <section className="about-vision section-shell"><p className="eyebrow">What we’re building towards</p><h2>More confidence in the choices.<br /><span>More room to enjoy the moment.</span></h2><p>Vendors will deliver the services. Ocasio’s role is to connect people with possibilities, help them choose, and provide the assistance agreed for their occasion.</p><Link className="button" href="/explore">Explore the vision</Link></section>
  </>;
}
