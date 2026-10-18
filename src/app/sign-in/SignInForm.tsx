"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
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
  const [notice, setNotice] = useState<string | null>(params.get("deleted") === "1" ? "Account deleted. Everything is gone." : null);

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

  const toMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <form onSubmit={submit} noValidate className="rise" aria-labelledby="sign-in-title">
      <header className="text-center">
        <h1 id="sign-in-title" className="t-film text-[length:1.75rem] leading-[1.05] lg:text-[length:2.25rem]">
          <span className="block">Project</span>
          <span className="block">Greek God</span>
        </h1>
        <p className="t-eyebrow mt-3 lg:hidden">The Ascent</p>
      </header>

      {mode !== "signin" && (
        <div className="mt-7">
          <h2 className="t-title-2 text-ivory">{mode === "signup" ? "Create your account" : "Reset your password"}</h2>
          <p className="t-callout mt-1 text-stone">{mode === "signup" ? "Private to you. Your plan comes next." : "We'll email you a secure link."}</p>
        </div>
      )}

      <div className={mode === "signin" ? "mt-8 grid gap-4" : "mt-5 grid gap-4"}>
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
          <Field label="Password" hint={mode === "signup" ? "8+ characters" : undefined}>
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
        <p className="t-callout mt-4 rounded-field bg-cinnabar-tint px-3.5 py-3 font-medium text-cinnabar shadow-[inset_0_0_0_1px_var(--cinnabar-line)]" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="t-callout mt-4 rounded-field bg-m2 px-3.5 py-3 font-medium text-ivory shadow-(--e1)" role="status">
          {notice}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" block className="mt-6" loading={busy}>
        {mode === "signin" ? "Enter" : mode === "signup" ? "Create account" : "Send reset link"}
      </Button>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1">
        {mode === "signin" ? (
          <>
            <TextButton onClick={() => toMode("signup")}>Create an account</TextButton>
            <span className="t-meta text-ash" aria-hidden>
              ·
            </span>
            <TextButton onClick={() => toMode("reset")}>Forgot password?</TextButton>
          </>
        ) : (
          <TextButton onClick={() => toMode("signin")}>Have an account? Sign in</TextButton>
        )}
      </div>
    </form>
  );
}

/** A quiet text action with a full 44 px target. Ivory, not gold: the one gold control is Enter. */
function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="press t-callout inline-flex h-11 items-center px-2 font-semibold text-stone underline decoration-ui-line underline-offset-4 hover:text-ivory">
      {children}
    </button>
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
