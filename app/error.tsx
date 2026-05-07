"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container" style={{ padding: "4rem 0" }}>
      <h2 className="serif">Something went wrong</h2>
      <p className="lede">{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
