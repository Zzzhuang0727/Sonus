import fs from "node:fs/promises";
import ical from "node-ical";
import { env } from "../config/env";

export interface CalendarEventSummary {
  title: string;
  startsAt?: string;
  endsAt?: string;
}

export async function readTodayCalendar(date = new Date()): Promise<CalendarEventSummary[]> {
  if (!env.ICS_FILE && !env.ICS_URL) {
    return [];
  }

  try {
    const source = env.ICS_FILE ? await fs.readFile(env.ICS_FILE, "utf8") : await fetch(env.ICS_URL!).then((response) => response.text());
    const parsed = ical.sync.parseICS(source);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return Object.values(parsed)
      .filter((entry): entry is ical.VEvent => entry.type === "VEVENT")
      .filter((event) => {
        const start = event.start instanceof Date ? event.start : undefined;
        return start ? start >= dayStart && start <= dayEnd : false;
      })
      .map((event) => ({
        title: String(event.summary ?? "Untitled"),
        startsAt: event.start instanceof Date ? event.start.toISOString() : undefined,
        endsAt: event.end instanceof Date ? event.end.toISOString() : undefined
      }));
  } catch (error) {
    console.warn("Failed to read ICS calendar", error);
    return [];
  }
}
