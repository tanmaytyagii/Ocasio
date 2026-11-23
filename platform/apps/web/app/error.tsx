'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="state-page section-shell"><p className="eyebrow">Something interrupted this page</p><h1>Let’s give that<br /><em>another try.</em></h1><p>We couldn’t finish loading this page. You can try again or return to the introduction.</p><div className="state-actions"><button className="button" onClick={reset}>Try again</button><a className="text-link" href="/">Return home</a></div></section>;
}
