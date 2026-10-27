"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/misc";
import { useUser } from "@/lib/data/core";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

export interface AppStatus {
  version: string;
  ai: { configured: boolean; mock: boolean; provider: string };
  accountDeletion: boolean;
}

export function useAppStatus() {
  // Only while signed in: after sign-out the cache is cleared and an unauthenticated refetch
  // would just 401 on the way to /sign-in.
  const { userId } = useUser();
  return useQuery({
    queryKey: ["app-status", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AppStatus> => {
      const r = await fetch("/api/account/status", { cache: "no-store" });
      if (!r.ok) throw new Error(`Status ${r.status}`);
      return r.json();
    },
  });
}

export function aiStatusLabel(s: AppStatus | undefined) {
  if (!s) return "—";
  if (s.ai.mock) return "Test mode";
  return s.ai.configured ? "Connected" : "Not set up";
}

const P = ({ children }: { children: ReactNode }) => <p className="t-label leading-relaxed text-fg-2">{children}</p>;

function Item({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 t-label leading-relaxed text-fg-2">
      {ok ? <Check className="mt-0.5 size-4 shrink-0 text-fg-2" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-fg-2" aria-hidden />}
      <span>{children}</span>
    </li>
  );
}

export function PrivacySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Privacy" description="Private by default.">
      <div className="grid grid-cols-1 gap-4 pb-5 pt-1">
        <P>Your logs live in your own Supabase database. Row-level security means every query only ever reads or writes rows that belong to your account.</P>
        <P>Progress and meal photos sit in private storage under your account&apos;s folder and open through links that expire within an hour. They are never public, shared or used to train models.</P>
        <P>API keys and privileged operations such as deleting an account run on the server only. Nothing is sold or sent to analytics services.</P>
        <P>You can export everything or delete it at any time from Settings › Your data.</P>
      </div>
    </Sheet>
  );
}

export function AISheet({ open, onOpenChange, status, statusError }: { open: boolean; onOpenChange: (o: boolean) => void; status?: AppStatus; statusError?: boolean }) {
  const configured = !!status?.ai.configured && !status.ai.mock;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="AI and your data" description="Google Gemini powers the food scanner, the AI estimate in Add, and Coach.">
      <div className="grid grid-cols-1 gap-5 pb-5 pt-1">
        <div className="rounded-card bg-surface  flex items-center justify-between gap-3 p-4">
          <div>
            <p className="t-label font-semibold">Status</p>
            <div className={cn("mt-1 t-label font-bold", configured ? "text-fg" : "text-fg-2")}>
              {statusError ? "Couldn't check" : !status ? <Skeleton className="h-4 w-24" /> : aiStatusLabel(status)}
            </div>
          </div>
          <span className={cn("size-2.5 rounded-full", configured ? "bg-fg" : "bg-ui-line")} aria-hidden />
        </div>
        {status && !status.ai.configured && (
          <P>
            No Gemini API key is set on the server, so AI features say so instead of guessing. Add <code className="rounded bg-control px-1.5 py-0.5 t-cap text-fg">GEMINI_API_KEY</code> to the
            server environment and redeploy to turn them on. Manual logging works without it.
          </P>
        )}
        {status?.ai.mock && <P>Local test mode returns fixed sample answers. It is never active in a production build.</P>}
        <div>
          <p className="t-label font-semibold mb-2">Sent to Gemini, only when you ask</p>
          <ul className="grid grid-cols-1 gap-2">
            <Item ok>Food photos you scan, and food you describe in Add or Coach.</Item>
            <Item ok>For Coach questions: a summary of the data you allow under Settings › Coach data.</Item>
          </ul>
        </div>
        <div>
          <p className="t-label font-semibold mb-2">Never sent</p>
          <ul className="grid grid-cols-1 gap-2">
            <Item ok={false}>Progress photos.</Item>
            <Item ok={false}>Your email, password or account ID.</Item>
            <Item ok={false}>Anything in the background — AI runs only when you tap.</Item>
          </ul>
        </div>
        <P>AI estimates are labelled as estimates and nothing is saved until you confirm it. Google&apos;s Gemini API terms apply to what is sent.</P>
      </div>
    </Sheet>
  );
}
