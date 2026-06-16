import type { ButtonHTMLAttributes } from "react";

type AuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

/**
 * Full-width primary button for auth forms. While `loading` it disables itself
 * and shows a waiting label. Styling = .auth-btn in globals.css.
 */
export function AuthButton({ loading, children, disabled, className, ...rest }: AuthButtonProps) {
  return (
    <button
      className={`auth-btn${className ? ` ${className}` : ""}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
