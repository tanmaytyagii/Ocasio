import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountNav } from '../components/account-nav';
import './styles.css';

export const metadata: Metadata = {
  title: { default: 'Ocasio — More possibilities for your occasion', template: '%s · Ocasio' },
  description: 'Discover the idea behind Ocasio: local possibilities, thoughtful vendor choices and support for the occasions that matter.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <Link className="wordmark" href="/" aria-label="Ocasio home">ocasio<span aria-hidden="true">.</span></Link>
          <nav aria-label="Main navigation"><Link href="/explore">Explore</Link><Link href="/about">Our story</Link></nav>
          <AccountNav />
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div><Link className="wordmark footer-wordmark" href="/">ocasio<span aria-hidden="true">.</span></Link><p>For the moments you make your own.</p></div>
          <div className="footer-meta"><p>Brand direction in development.<br />This introduction does not accept bookings.</p><nav aria-label="Footer navigation"><Link href="/explore">Explore</Link><Link href="/about">Our story</Link></nav></div>
        </footer>
      </body>
    </html>
  );
}
