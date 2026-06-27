"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-6">
        {/* Brand */}
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Quinn
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Supervision for human-AI legal teams
          </p>
        </div>

        {submitted ? (
          <div className="rounded-lg border bg-card p-6 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-foreground/5">
              <svg className="size-6 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h2 className="text-base font-medium text-foreground">
              Check your email
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a magic link to <strong>{email}</strong>
            </p>
            <button
              onClick={() => { setSubmitted(false); setEmail(""); }}
              className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@lawfirm.com"
                  required
                  autoFocus
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send magic link"}
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              No password needed. We&apos;ll email you a secure link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
