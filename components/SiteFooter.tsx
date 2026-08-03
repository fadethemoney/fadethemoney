import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site">
      <div className="container footer-inner">
        <div className="disclaimer">
          <div className="footer-brand">Fade The Money &middot; For entertainment only.</div>
          Not gambling advice. If you or someone you know has a gambling problem,
          call <strong>1-800-GAMBLER</strong>.
        </div>
        <div className="footer-links">
          <Link href="/">Dashboard</Link>
          <Link href="/results">Results</Link>
          <Link href="/about">About</Link>
          <Link href="/pricing">Membership</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/disclaimer">Disclaimer</Link>
        </div>
      </div>
    </footer>
  );
}
