"use client";

import { ReminderSettings } from "@/components/reminders/ReminderSettings";

/**
 * Settings → Reminders. The platform's ReminderSettings draws its own "Reminders" groups
 * (section id "reminders", which the desktop section nav links to).
 */
export function ReminderSection() {
  return <ReminderSettings />;
}
