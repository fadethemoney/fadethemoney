import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (browser). Uses the public anon
 * key only — never the service-role key.
 *
 * Falls back to harmless placeholders when the env vars are absent so the
 * production *build* (static prerender of the auth pages) never crashes — a
 * missing var must not take the whole deploy down. When the vars ARE present
 * (e.g. configured on Vercel) the real values are used and behaviour is
 * unchanged; the placeholder client is only ever constructed, never queried,
 * during prerender.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
  );
}

/** True once the Supabase env vars are present (i.e. the project is wired). */
export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
