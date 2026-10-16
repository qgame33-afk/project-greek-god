"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Mark } from "@/components/art/Mark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "reset";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "link" ? "That link has expired or was already used. Sign in or request a new one." : null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    const sb = supabaseBrowser();
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Enter a valid email address.");
    if (mode !== "reset" && password.length < 8) return setError("Passwords are at least 8 characters.");
    setBusy(true);
    try {
      const origin = window.location.origin;
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/onboarding");
          router.refresh();
        } else {
          setNotice(`Check ${cleanEmail} for a confirmation link, then come back here.`);
          setMode("signin");
        }
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${origin}/auth/callback?next=/settings?reset=1` });
        if (error) throw error;
        setNotice(`If an account exists for ${cleanEmail}, a reset link is on its way.`);
        setMode("signin");
      }
    } catch (err) {
      setError(humanAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="rise">
      <div className="mb-7 flex items-center gap-2.5">
        <Mark size={30} />
        <div className="leading-none">
          <p className="font-serif text-[14px] font-semibold tracking-[0.12em] text-gold">PROJECT GREEK GOD</p>
          <p className="mt-1.5 text-[10px] font-bold tracking-[0.35em] text-fg-3">THE ASCENT</p>
        </div>
      </div>

      <h1 className="t-title text-[40px]">{mode === "signin" ? "Welcome back" : mode === "signup" ? "Begin the ascent" : "Reset password"}</h1>
      <p className="mt-2 text-[14px] text-fg-2">
        {mode === "signin" ? "Build your greatest physique." : mode === "signup" ? "Create your private account." : "We'll email you a secure link."}
      </p>

      <div className="mt-7 grid gap-4">
        <Field label="Email">
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          )}
        </Field>
        {mode !== "reset" && (
          <Field
            label="Password"
            hint={
              mode === "signin" ? (
                <button type="button" className="relative font-semibold text-gold-300 before:absolute before:-inset-x-2 before:-bottom-[7px] before:-top-[19px] before:content-['']" onClick={() => (setMode("reset"), setError(null))}>
                  Forgot?
                </button>
              ) : (
                "8+ characters"
              )
            }
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                enterKeyHint="go"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            )}
          </Field>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-[12px] border border-danger/30 bg-danger-tint px-3.5 py-3 text-[13px] font-medium text-fg" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-[12px] border border-lapis-line bg-lapis-tint px-3.5 py-3 text-[13px] font-medium text-fg" role="status">
          {notice}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" block className="mt-6" loading={busy}>
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
      </Button>

      <p className="mt-5 text-center text-[14px] text-fg-2">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button type="button" onClick={() => (setMode("signup"), setError(null))} className="relative font-bold text-gold-300 before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] hover:text-gold-200">
              Create an account
            </button>
          </>
        ) : (
          <>
            Have an account?{" "}
            <button type="button" onClick={() => (setMode("signin"), setError(null))} className="relative font-bold text-gold-300 before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] hover:text-gold-200">
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  );
}

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

function humanAuthError(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox for the link.";
  if (/already registered|already exists/i.test(msg)) return "An account with that email already exists. Sign in instead.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
  if (/fetch|network/i.test(msg)) return "Can't reach the server. Check your connection.";
  return msg;
}
