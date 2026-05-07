import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site">
      <div className="container">
        <nav className="nav-inner">
          <Link href="/" className="logo">
            <span className="logo-mark" aria-hidden />
            <span className="logo-name">Fade The Money</span>
          </Link>
          <div className="nav-links">
            <Link href="/">Dashboard</Link>
            <Link href="/results">Results</Link>
            <Link href="/about">About</Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
