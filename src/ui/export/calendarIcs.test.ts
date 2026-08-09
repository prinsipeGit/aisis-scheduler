import { describe, expect, it } from "vitest";
import type { Schedule, Section } from "../../lib/types";
import { buildScheduleIcs } from "./calendarIcs";

const section: Section = {
  courseCode: "MATH 62.1", sectionCode: "A", title: "Calculus", units: 3,
  instructors: ["BATALLER, RAMIL T."], modality: "FULLY ONSITE",
  meetings: [{ days: ["M", "TH"], start: 480, end: 570 }],
  timeStatus: "scheduled", room: "SEC-A304A", remarks: "", raw: "",
};

const schedule: Schedule = [section];
const range = { startDate: "2026-08-05", endDate: "2026-08-31" };
const now = new Date("2026-08-09T10:00:00Z");

describe("buildScheduleIcs", () => {
  it("creates one weekly event per meeting day in Manila time", () => {
    const ics = buildScheduleIcs(schedule, range, "2026-1", now);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;TZID=Asia/Manila:20260810T080000");
    expect(ics).toContain("DTSTART;TZID=Asia/Manila:20260806T080000");
    expect(ics).toContain("DTEND;TZID=Asia/Manila:20260810T093000");
    expect(ics).toContain("SUMMARY:MATH 62.1 A");
    expect(ics).toContain("LOCATION:SEC-A304A");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;COUNT=4");
  });

  it("escapes calendar punctuation in imported text", () => {
    const special: Schedule = [{ ...section, room: "SEC, A; 304" }];
    expect(buildScheduleIcs(special, range, "2026-1", now))
      .toContain("LOCATION:SEC\\, A\\; 304");
  });

  it("rejects a date range that runs backwards", () => {
    expect(() => buildScheduleIcs(schedule, {
      startDate: "2026-09-01", endDate: "2026-08-01",
    }, "2026-1", now)).toThrow(/last day/i);
  });

  it("omits TBA classes because they have no calendar time", () => {
    const tba: Schedule = [{ ...section, meetings: [], timeStatus: "tba" }];
    expect(buildScheduleIcs(tba, range, "2026-1", now)).not.toContain("BEGIN:VEVENT");
  });
});
