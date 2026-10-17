"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Field, Input } from "@/components/ui/field";
import { Confirm } from "@/components/ui/sheet";
import { drained } from "@/lib/data/outbox";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EditSheet } from "./EditSheet";
import { useResetOnOpen } from "./useResetOnOpen";
import { clearLocalCaches } from "./session";

/* ---------------------------------------------------------------- password */

export function PasswordSheet({
  open,
  onOpenChange,
  email,
  recovery,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  email: string | null;
  /** Arrived from a reset link: the session is already verified, no current password needed. */
  recovery: boolean;
  onDone?: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  useResetOnOpen(open, () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  });

  const fieldErr = next && next.length < 8 ? "At least 8 characters." : confirm && next !== confirm ? "Passwords don't match." : null;
  const can = (recovery || current.length > 0) && next.length >= 8 && next === confirm && !(!recovery && next === current);

  const save = async () => {
    if (busy.current || !can) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const sb = supabaseBrowser();
    try {
      if (!recovery) {
        if (!email) throw new Error("No email on this account.");
        const { error: e } = await sb.auth.signInWithPassword({ email, password: current });
        if (e) throw new Error(/invalid/i.test(e.message) ? "Your current password is wrong." : e.message);
      }
      const { error: e } = await sb.auth.updateUser({ password: next });
      if (e) throw new Error(/same|different/i.test(e.message) ? "Pick a password you haven't used here before." : e.message);
      toast.success("Password updated");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title={recovery ? "Set a new password" : "Change password"}
      description={recovery ? "Your reset link worked. Choose a new password to finish." : "You'll stay signed in on this device."}
      canSave={can}
      pending={pending}
      error={error}
      saveLabel="Update password"
      onSave={save}
    >
      <div className="grid grid-cols-1 gap-4 pb-2">
        {/* hidden username helps password managers pair the new password with the account */}
        <input type="email" autoComplete="username" value={email ?? ""} readOnly hidden />
        {!recovery && (
          <Field label="Current password">
            {(id) => <Input id={id} type="password" autoComplete="current-password" enterKeyHint="next" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
        )}
        <Field label="New password" hint="8+ characters" error={next && next.length < 8 ? fieldErr : null}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" enterKeyHint="next" value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Field label="Confirm new password" error={confirm && next !== confirm ? "Passwords don't match." : null}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" enterKeyHint="done" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
      </div>
    </EditSheet>
  );
}

/* ---------------------------------------------------------------- sign out */

/**
 * Sign out after letting queued workout edits sync. If some can't sync (offline), ask first —
 * signing out would drop them.
 */
export function useSignOut() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [unsynced, setUnsynced] = useState(false);
  const busy = useRef(false);

  const finish = async () => {
    try {
      await supabaseBrowser().auth.signOut();
    } catch {
      await supabaseBrowser().auth.signOut({ scope: "local" });
    }
    clearLocalCaches({ includeOutbox: true });
    qc.clear();
    // A full page load, not a client navigation + refresh: the router would otherwise
    // re-request this screen's server payload while signed out (RSC 404 noise in production)
    // and nothing from the old session survives in memory.
    window.location.replace("/sign-in");
  };

  const signOut = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const ok = await drained(4000);
      if (!ok) {
        setUnsynced(true);
        return;
      }
      await finish();
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const dialog = (
    <Confirm
      open={unsynced}
      onOpenChange={setUnsynced}
      title="Some changes haven't synced"
      body="A few workout edits are still waiting for a connection. Signing out now discards them. Stay signed in and they'll sync when you're back online."
      confirmLabel="Sign out"
      onConfirm={() => void finish()}
    />
  );

  return { signOut, pending, dialog };
}
