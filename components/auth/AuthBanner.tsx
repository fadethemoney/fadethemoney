import type { ReactNode } from "react";

type AuthBannerProps = {
  kind: "success" | "error" | "info";
  children: ReactNode;
};

/** Inline status/alert banner shown above an auth form. */
export function AuthBanner({ kind, children }: AuthBannerProps) {
  return (
    <div className={`auth-banner ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
