import { describe, it, expect } from "vitest";
import { parseTimeRange, overlaps, formatTime } from "./time";
import type { Meeting } from "./types";

describe("parseTimeRange", () => {
  it("parses AISIS 0800-0930 style ranges", () => {
    expect(parseTimeRange("0800-0930")).toEqual({ start: 480, end: 570 });
    expect(parseTimeRange("1330-1430")).toEqual({ start: 810, end: 870 });
  });
  it("returns null for garbage or inverted ranges", () => {
    expect(parseTimeRange("TBA")).toBeNull();
    expect(parseTimeRange("0930-0800")).toBeNull();
    expect(parseTimeRange("8:00-9:30")).toBeNull();
  });
});

describe("overlaps", () => {
  const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });
  it("detects overlap on a shared day", () => {
    expect(overlaps(m(["M", "TH"], 480, 570), m(["TH"], 540, 630))).toBe(true);
  });
  it("no overlap on different days even at same time", () => {
    expect(overlaps(m(["M"], 480, 570), m(["T"], 480, 570))).toBe(false);
  });
  it("back-to-back classes do not overlap", () => {
    expect(overlaps(m(["M"], 480, 570), m(["M"], 570, 660))).toBe(false);
  });
});

describe("formatTime", () => {
  it("formats minutes as 12-hour time", () => {
    expect(formatTime(480)).toBe("8:00 AM");
    expect(formatTime(810)).toBe("1:30 PM");
    expect(formatTime(720)).toBe("12:00 PM");
  });
});
