import type { Meeting } from "./types";

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
