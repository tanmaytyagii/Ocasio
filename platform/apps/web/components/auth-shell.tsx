export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="auth-section section-shell"><div className="auth-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p><span className="auth-decoration" aria-hidden="true">✳</span></div>{children}</section>;
}
