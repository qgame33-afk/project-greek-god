// Reminder dispatch loop. Storage and the push transport are injected so the logic
// (window → facts → dedupe → send → prune dead subscriptions) is unit-testable.

import { dueByTime, evaluateReminders, localParts, normalizeSettings, anyOn, type Notice, type ReminderFacts } from "./schedule";

export interface CandidateUser {
  userId: string;
  timezone: string;
  reminders: unknown;
}

export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SendResult = { ok: true } | { ok: false; gone: boolean; status: number | null; error: string };

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  kind: string;
}

export interface DispatchDeps {
  /** users with at least one reminder on and at least one push subscription */
  candidates(): Promise<CandidateUser[]>;
  facts(userId: string, localDate: string): Promise<ReminderFacts>;
  /** reminder kinds already delivered to this user on this local date */
  sentOn(userId: string, localDate: string): Promise<string[]>;
  /** records the delivery; false when another run already claimed it (dedupe) */
  claim(userId: string, notice: Notice): Promise<boolean>;
  /** undoes a claim when nothing could be delivered */
  release(userId: string, notice: Notice): Promise<void>;
  subscriptions(userId: string): Promise<PushTarget[]>;
  send(target: PushTarget, payload: PushPayload): Promise<SendResult>;
  removeSubscription(id: string): Promise<void>;
}

export interface DispatchSummary {
  at: string;
  dryRun: boolean;
  users: number;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  removedSubscriptions: number;
  results: { userId: string; localDate: string; kinds: string[]; delivered: number; skipped?: string }[];
}

export async function runDispatch(deps: DispatchDeps, opts: { now: Date; dryRun?: boolean; windowMin?: number }): Promise<DispatchSummary> {
  const summary: DispatchSummary = { at: opts.now.toISOString(), dryRun: !!opts.dryRun, users: 0, due: 0, sent: 0, skipped: 0, failed: 0, removedSubscriptions: 0, results: [] };
  const users = await deps.candidates();
  for (const u of users) {
    const settings = normalizeSettings(u.reminders);
    if (!anyOn(settings)) continue;
    summary.users++;
    const parts = localParts(opts.now, u.timezone);
    // cheap time check first: most runs load nothing else
    if (!dueByTime(settings, parts, opts.windowMin).length) continue;
    const [facts, sent] = await Promise.all([deps.facts(u.userId, parts.date), deps.sentOn(u.userId, parts.date)]);
    const notices = evaluateReminders({ settings, timeZone: u.timezone, now: opts.now, facts, sentToday: sent, windowMin: opts.windowMin });
    const row = { userId: u.userId, localDate: parts.date, kinds: notices.map((n) => n.kind), delivered: 0 as number, skipped: undefined as string | undefined };
    summary.results.push(row);
    if (!notices.length) {
      row.skipped = "already done or daily limit reached";
      continue;
    }
    summary.due += notices.length;
    if (opts.dryRun) continue;
    let targets = await deps.subscriptions(u.userId);
    if (!targets.length) {
      row.skipped = "no devices";
      continue;
    }
    for (const n of notices) {
      if (!targets.length) break;
      if (!(await deps.claim(u.userId, n))) {
        summary.skipped++;
        continue;
      }
      let delivered = 0;
      for (const t of [...targets]) {
        const res = await deps.send(t, { title: n.title, body: n.body, url: n.url, tag: n.tag, kind: n.kind });
        if (res.ok) delivered++;
        else if (res.gone) {
          // the browser dropped this subscription (unsubscribed, app removed): forget it
          await deps.removeSubscription(t.id);
          targets = targets.filter((x) => x.id !== t.id);
          summary.removedSubscriptions++;
        } else summary.failed++;
      }
      if (delivered) {
        summary.sent++;
        row.delivered++;
      } else {
        // nothing reached a device: free the slot so it doesn't count toward the daily cap
        await deps.release(u.userId, n);
      }
    }
  }
  return summary;
}
