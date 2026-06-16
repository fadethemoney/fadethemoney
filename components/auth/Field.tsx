"use client";

import { useState, type InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

/**
 * Labeled input used across every auth form. Password fields automatically get
 * a Show/Hide toggle (app-like, mobile-friendly). Styling lives in the .field-*
 * classes in globals.css so it can be restyled in one place.
 */
export function Field({ label, error, id, name, type, className, ...rest }: FieldProps) {
  const fieldId = id || name;
  const isPassword = type === "password";
  const [show, setShow] = useState(false);
  const inputType = isPassword ? (show ? "text" : "password") : type;

  return (
    <div className="field">
      <label className="field-label" htmlFor={fieldId}>
        {label}
      </label>
      <div className={`field-input-wrap${isPassword ? " has-toggle" : ""}`}>
        <input
          id={fieldId}
          name={name}
          type={inputType}
          className={`field-input${error ? " has-error" : ""}${className ? ` ${className}` : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            className="field-toggle"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {error ? (
        <span className="field-error" id={`${fieldId}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
