"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
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

  const titles: Record<Mode, { title: string; line: string }> = {
    signin: { title: "Project Greek God", line: "Sign in to keep going." },
    signup: { title: "Create account", line: "Private to you. Your plan comes next." },
    reset: { title: "Forgot password", line: "We'll email you a link to set a new one." },
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby="sign-in-title" className="mt-7">
      <h1 id="sign-in-title" className="t-title">
        {titles[mode].title}
      </h1>
      <p className="t-label mt-2">{titles[mode].line}</p>

      <div className="mt-8 grid gap-3">
        <label htmlFor="sign-in-email" className="sr-only">
          Email
        </label>
        <Input
          id="sign-in-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          enterKeyHint="next"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "sign-in-error" : undefined}
          required
        />
        {mode !== "reset" && (
          <>
            <label htmlFor="sign-in-password" className="sr-only">
              Password{mode === "signup" ? ", 8 or more characters" : ""}
            </label>
            <Input
              id="sign-in-password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Password (8 or more characters)" : "Password"}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "sign-in-error" : undefined}
              required
              minLength={8}
            />
          </>
        )}
        {error && (
          <p id="sign-in-error" className="t-label px-1 text-danger" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="t-label px-1 text-fg" role="status">
            {notice}
          </p>
        )}
      </div>

      <Button type="submit" variant="primary" size="lg" block className="mt-6" loading={busy}>
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
      </Button>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6">
        {mode === "signin" ? (
          <>
            <TextButton onClick={() => toMode("signup")} strong>
              Create account
            </TextButton>
            <TextButton onClick={() => toMode("reset")}>Forgot password</TextButton>
          </>
        ) : (
          <TextButton onClick={() => toMode("signin")} strong>
            I have an account
          </TextButton>
        )}
      </div>
    </form>
  );
}

/** A quiet text action with a full 44 px target: "Create account" in --text, "Forgot password" in --text-2. */
function TextButton({ onClick, children, strong }: { onClick: () => void; children: ReactNode; strong?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`press t-row inline-flex h-11 items-center px-2 ${strong ? "text-fg" : "text-fg-2"}`}>
      {children}
    </button>
  );
}

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

function humanAuthError(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first. The link is in your inbox.";
  if (/already registered|already exists/i.test(msg)) return "An account with that email already exists. Sign in instead.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
  if (/fetch|network/i.test(msg)) return "Can't reach the server. Check your connection.";
  return msg;
}
