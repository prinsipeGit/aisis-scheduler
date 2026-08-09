import type { Day, Schedule } from "../../lib/types";

export interface CalendarRange {
  startDate: string;
  endDate: string;
}

const DAY_NUMBER: Record<Day, number> = {
  SUN: 0, M: 1, T: 2, W: 3, TH: 4, F: 5, SAT: 6,
};

const pad = (value: number) => String(value).padStart(2, "0");

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Choose valid first and last class dates.");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function compactDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function compactTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
}

function firstDayOnOrAfter(start: Date, day: Day): Date {
  const result = new Date(start);
  const offset = (DAY_NUMBER[day] - start.getUTCDay() + 7) % 7;
  result.setUTCDate(result.getUTCDate() + offset);
  return result;
}

function occurrenceCount(first: Date, end: Date): number {
  const days = Math.floor((end.getTime() - first.getTime()) / 86_400_000);
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildScheduleIcs(
  schedule: Schedule,
  range: CalendarRange,
  term: string,
  now = new Date()
): string {
  const start = parseDate(range.startDate);
  const end = parseDate(range.endDate);
  if (end < start) throw new Error("The last day of classes must be after the first day.");

  const events: string[] = [];
  for (const section of schedule) {
    for (const meeting of section.meetings) {
      for (const day of meeting.days) {
        const first = firstDayOnOrAfter(start, day);
        const count = occurrenceCount(first, end);
        if (count === 0) continue;
        const date = compactDate(first);
        const identity = `${section.courseCode}-${section.sectionCode}-${day}-${meeting.start}-${range.startDate}`
          .toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        const description = [section.instructors.join(", "), section.modality]
          .filter(Boolean).join(" · ");
        events.push([
          "BEGIN:VEVENT",
          `UID:${identity}@sched.riv`,
          `DTSTAMP:${stamp(now)}`,
          `DTSTART;TZID=Asia/Manila:${date}T${compactTime(meeting.start)}`,
          `DTEND;TZID=Asia/Manila:${date}T${compactTime(meeting.end)}`,
          `RRULE:FREQ=WEEKLY;COUNT=${count}`,
          `SUMMARY:${escapeIcs(`${section.courseCode} ${section.sectionCode}`)}`,
          ...(section.room ? [`LOCATION:${escapeIcs(section.room)}`] : []),
          ...(description ? [`DESCRIPTION:${escapeIcs(description)}`] : []),
          "END:VEVENT",
        ].join("\r\n"));
      }
    }
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//sched.riv//Schedule Export//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-TIMEZONE:Asia/Manila",
    `X-WR-CALNAME:${escapeIcs(`sched.riv ${term}`)}`,
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function downloadScheduleIcs(schedule: Schedule, range: CalendarRange, term: string): void {
  const contents = buildScheduleIcs(schedule, range, term);
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sched-riv-${term || "schedule"}.ics`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
