import type { Meeting } from "./types";

export function parseTimeRange(text: string): { start: number; end: number } | null {
  const m = text.trim().match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (start >= end || Number(m[2]) > 59 || Number(m[4]) > 59 || end > 24 * 60) return null;
  return { start, end };
}

export function overlaps(a: Meeting, b: Meeting): boolean {
  const sharedDay = a.days.some((d) => b.days.includes(d));
  return sharedDay && a.start < b.end && b.start < a.end;
}

export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${suffix}`;
}
