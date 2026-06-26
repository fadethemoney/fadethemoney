import type { ReactNode } from "react";

type AuthLayoutProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Link row rendered under the card content, e.g. "Already have an account? Log in" */
  footer?: ReactNode;
};

/**
 * Shared shell for every auth screen. Centers a single card between the global
 * SiteHeader/SiteFooter and is mobile-first / app-like. Reused by register,
 * login, forgot/reset password and verify-email so they stay visually identical.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Fade The Money" />
        </div>
        <div className="auth-head">
          <h1 className="auth-title">{title}</h1>
          {subtitle ? <p className="auth-sub">{subtitle}</p> : null}
        </div>
        {children}
        {footer ? <div className="auth-foot">{footer}</div> : null}
      </div>
    </main>
  );
}
