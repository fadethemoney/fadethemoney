import type { ReactNode } from "react";

/** Shared shell for Terms / Privacy / Disclaimer so they read as one set. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="container legal-shell">
      <div className="section-h">Legal</div>
      <h1 className="section-title serif">{title}</h1>
      <p className="legal-updated">Effective {updated}</p>
      <div className="legal-body">{children}</div>
    </main>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{heading}</h2>
      {children}
    </section>
  );
}
