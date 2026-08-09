import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderScheduleImage, fitDayTimeRoom } from "./scheduleImage";
import type { Schedule, Section } from "../../lib/types";

const section = (code: string, sectionCode: string): Section => ({
  courseCode: code, sectionCode, title: code, units: 3, instructors: ["CRUZ, Ana"], modality: "",
  meetings: [{ days: ["M", "W"], start: 480, end: 540 }], timeStatus: "scheduled",
  room: "SEC-A203", remarks: "", raw: "",
});

const tbaSection = (code: string, sectionCode: string): Section => ({
  courseCode: code, sectionCode, title: code, units: 3, instructors: ["CRUZ, Ana"], modality: "",
  meetings: [], timeStatus: "tba", room: "TBA", remarks: "", raw: "",
});

const schedule: Schedule = [section("MATH 10", "A3"), section("INTACT 11", "INT-MA1")];
const meta = { program: "BS CS", block: "First Year / First Semester", term: "2026-1" };

// Record every string drawn so the content can be asserted without rendering pixels.
let drawn: string[] = [];

// jsdom has no real canvas, so `getContext("2d")` is stubbed. `measureText` here returns a
// constant regardless of input - realistic enough for tests that don't care about text width,
// but see `scaledStubCanvas` below for tests that pin the overflow-bound behavior.
function stubCanvas(): HTMLCanvasElement {
  drawn = [];
  const ctx = {
    fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), measureText: () => ({ width: 40 }),
    fillText: (t: string) => { drawn.push(t); },
    set fillStyle(_v: string) {}, set strokeStyle(_v: string) {},
    set font(_v: string) {}, set textAlign(_v: string) {}, set lineWidth(_v: number) {},
  };
  return {
    width: 0, height: 0,
    getContext: () => ctx,
    toDataURL: () => "data:image/png;base64,AAAA",
  } as unknown as HTMLCanvasElement;
}

// A `measureText` whose width actually scales with the string, so truncation logic has
// something real to bite on. A flat stub (as above) never overflows, so it can't exercise
// finding 1's fix.
function scaledStubCanvas(): HTMLCanvasElement {
  drawn = [];
  const ctx = {
    fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), measureText: (t: string) => ({ width: t.length * 6 }),
    fillText: (t: string) => { drawn.push(t); },
    set fillStyle(_v: string) {}, set strokeStyle(_v: string) {},
    set font(_v: string) {}, set textAlign(_v: string) {}, set lineWidth(_v: number) {},
  };
  return {
    width: 0, height: 0,
    getContext: () => ctx,
    toDataURL: () => "data:image/png;base64,AAAA",
  } as unknown as HTMLCanvasElement;
}

// Mirrors the width formula scaledStubCanvas's measureText uses, so tests can assert a bound
// without duplicating scheduleImage.ts's private layout constants.
const scaledWidth = (t: string) => t.length * 6;
// Mirrors the module's list-column geometry: W=1000, PAD=24, column starts at PAD+360.
const LIST_AVAIL_W = 1000 - 24 - (24 + 360);

beforeEach(() => { drawn = []; });

describe("renderScheduleImage", () => {
  it("returns a PNG data URL", () => {
    expect(renderScheduleImage(schedule, meta, stubCanvas())).toMatch(/^data:image\/png;base64,/);
  });

  it("draws every section code, which is the field typed into AISIS", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).toContain("A3");
    expect(text).toContain("INT-MA1");
    expect(text).toContain("MATH 10");
    expect(text).toContain("INTACT 11");
  });

  it("draws the program, block and term so a saved image identifies itself", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).toContain("Isked");
    expect(text).toContain("BS CS");
    expect(text).toContain("First Year / First Semester");
    expect(text).toContain("2026-1");
  });

  it("carries the unofficial-tool line, which travels with a shared image", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    expect(drawn.join(" ")).toMatch(/verify.*AISIS/i);
  });

  it("draws each section's day/time and room, which is what a student needs besides the code", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    const text = drawn.join(" ");
    // section("MATH 10", "A3") meets M and W, 8:00 AM - 9:00 AM, in room SEC-A203.
    expect(text).toContain("MW 8:00 AM-9:00 AM");
    expect(text).toContain("SEC-A203");
  });

  it("keeps a TBA section in the enlistment list with its no-fixed-time treatment", () => {
    const withTba: Schedule = [section("MATH 10", "A3"), tbaSection("PE 2", "UE-1")];
    renderScheduleImage(withTba, meta, stubCanvas());
    const text = drawn.join(" ");
    // The section itself (course + section code) must still be listed...
    expect(text).toContain("PE 2");
    expect(text).toContain("UE-1");
    // ...and flagged as having no fixed time, since a student who is TBA-enrolled and never
    // told about it is exactly the failure this artifact must not have.
    expect(text).toContain("no fixed time");
  });

  describe("fitDayTimeRoom (finding 1: the day/time + room column must not overflow)", () => {
    it("returns the text unchanged when it already fits", () => {
      const ctx = scaledStubCanvas().getContext("2d")!;
      const result = fitDayTimeRoom(ctx, "MW 8:00 AM-9:00 AM", "SEC-A203", LIST_AVAIL_W);
      expect(result).toBe("MW 8:00 AM-9:00 AM   SEC-A203");
    });

    it("truncates a long room but keeps the full time when only the room needs to give way", () => {
      const ctx = scaledStubCanvas().getContext("2d")!;
      const when = "MWF 8:00 AM-11:00 AM"; // fits comfortably on its own
      const longRoom = "ROOM-" + "X".repeat(80); // does not fit alongside the time
      const result = fitDayTimeRoom(ctx, when, longRoom, LIST_AVAIL_W);
      expect(scaledWidth(result)).toBeLessThanOrEqual(LIST_AVAIL_W);
      expect(result.startsWith(when)).toBe(true);
      expect(result).toContain("…");
      expect(result).not.toContain(longRoom); // the raw, un-truncated room never made it in
    });

    it("truncates the time itself, dropping the room entirely, when even the time alone overflows", () => {
      const ctx = scaledStubCanvas().getContext("2d")!;
      const huge = ["M", "T", "W", "TH", "F", "SAT"]
        .map((d) => `${d} 8:00 AM-9:00 AM`)
        .join(", "); // an MWF-plus-style entry with every day listed
      const result = fitDayTimeRoom(ctx, huge, "SOME ROOM", LIST_AVAIL_W);
      expect(scaledWidth(result)).toBeLessThanOrEqual(LIST_AVAIL_W);
      expect(result).toContain("…");
      expect(result).not.toContain("SOME ROOM"); // room was dropped, not just shortened
    });

    it("never throws and still bounds the text when measureText is unavailable, as under jsdom's real getContext(2d)", () => {
      // A context with no measureText at all - closer to what a from-scratch jsdom canvas
      // would look like, versus the fillText-recording stub the rest of this file uses.
      const bareCtx = {} as CanvasRenderingContext2D;
      const huge = "M ".repeat(200).trim();
      expect(() => fitDayTimeRoom(bareCtx, huge, "ROOM", 100)).not.toThrow();
      const result = fitDayTimeRoom(bareCtx, huge, "ROOM", 100);
      expect(result.length).toBeLessThan(huge.length);
    });
  });

  it("bounds the day/time + room column end-to-end so a multi-meeting section never overflows the canvas", () => {
    const mwfHeavy: Section = {
      ...section("PHYSICS 71", "MWF-1"),
      meetings: ["M", "T", "W", "TH", "F", "SAT"].map((d) => ({
        days: [d as Section["meetings"][number]["days"][number]], start: 480, end: 540,
      })),
      room: "ROOM-" + "Y".repeat(60),
    };
    renderScheduleImage([mwfHeavy], meta, scaledStubCanvas());
    const overflowing = drawn.find((t) => t.includes("…"));
    expect(overflowing).toBeDefined();
    expect(scaledWidth(overflowing!)).toBeLessThanOrEqual(LIST_AVAIL_W);
  });
});
