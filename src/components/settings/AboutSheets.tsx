"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

/** Static CREDITS.md from /public/art, rendered when present. */
export function useCredits() {
  return useQuery({
    queryKey: ["art-credits"],
    staleTime: Infinity,
    retry: 0,
    queryFn: async () => {
      const r = await fetch("/art/CREDITS.md");
      if (!r.ok) return null;
      const t = await r.text();
      return t.trim().startsWith("#") ? t : null;
    },
  });
}

export function aiStatusLabel(s: AppStatus | undefined) {
  if (!s) return "—";
  if (s.ai.mock) return "Test mode";
  return s.ai.configured ? "Connected" : "Not set up";
}

const P = ({ children }: { children: ReactNode }) => <p className="text-[14px] leading-relaxed text-fg-2">{children}</p>;

function Item({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[14px] leading-relaxed text-fg-2">
      {ok ? <Check className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />}
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
        <P>You can export everything or delete it at any time from Settings · Data.</P>
      </div>
    </Sheet>
  );
}

export function AISheet({ open, onOpenChange, status, statusError }: { open: boolean; onOpenChange: (o: boolean) => void; status?: AppStatus; statusError?: boolean }) {
  const configured = !!status?.ai.configured && !status.ai.mock;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="AI and your data" description="Google Gemini powers the food scanner, Food Coach and AI Coach.">
      <div className="grid grid-cols-1 gap-5 pb-5 pt-1">
        <div className="card-inset flex items-center justify-between gap-3 p-4">
          <div>
            <p className="eyebrow">Status</p>
            <div className={cn("mt-1 text-[15px] font-bold", configured ? "text-fg" : "text-fg-2")}>
              {statusError ? "Couldn't check" : !status ? <Skeleton className="h-4 w-24" /> : aiStatusLabel(status)}
            </div>
          </div>
          <span className={cn("size-2.5 rounded-full", configured ? "bg-success" : "bg-line-strong")} aria-hidden />
        </div>
        {status && !status.ai.configured && (
          <P>
            No Gemini API key is set on the server, so AI features say so instead of guessing. Add <code className="rounded bg-s3 px-1.5 py-0.5 text-[13px] text-fg">GEMINI_API_KEY</code> to the
            server environment and redeploy to turn them on. Manual logging works without it.
          </P>
        )}
        {status?.ai.mock && <P>Local test mode returns fixed sample answers. It is never active in a production build.</P>}
        <div>
          <p className="eyebrow mb-2">Sent to Gemini, only when you ask</p>
          <ul className="grid grid-cols-1 gap-2">
            <Item ok>Food photos you scan, and food you describe in Food Coach.</Item>
            <Item ok>For AI Coach questions: a summary of the data types you allow under Coach data access.</Item>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-2">Never sent</p>
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

export function CreditsSheet({ open, onOpenChange, markdown }: { open: boolean; onOpenChange: (o: boolean) => void; markdown: string }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Art credits" wide>
      <div className="credits pb-6 pt-1 text-[14px] leading-relaxed text-fg-2">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: () => null,
            h2: ({ children }) => <h3 className="eyebrow mb-2 mt-5 first:mt-1">{children}</h3>,
            p: ({ children }) => <p className="mb-3">{children}</p>,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-gold-300 underline decoration-gold-700 underline-offset-2 [overflow-wrap:anywhere]">
                {children}
              </a>
            ),
            strong: ({ children }) => <strong className="font-bold text-fg">{children}</strong>,
            ul: ({ children }) => <ul className="mb-3 grid list-disc gap-1.5 pl-5 marker:text-fg-3">{children}</ul>,
            table: ({ children }) => (
              <div className="mb-3 overflow-hidden rounded-[14px] border border-line">
                <table className="w-full table-fixed text-left text-[13px]">{children}</table>
              </div>
            ),
            thead: () => null,
            tr: ({ children }) => <tr className="border-t border-line-hair first:border-t-0 align-top">{children}</tr>,
            td: ({ children }) => <td className="px-3 py-2 align-top [overflow-wrap:anywhere] first:w-[32%] first:font-semibold first:text-fg-3">{children}</td>,
            code: ({ children }) => <code className="rounded bg-s3 px-1 py-0.5 text-[12.5px] text-fg">{children}</code>,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </Sheet>
  );
}
