import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderScheduleImage, downloadScheduleImage, fitDayTimeRoom } from "./scheduleImage";
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
    const canvas = stubCanvas();
    expect(renderScheduleImage(schedule, meta, canvas)).toMatch(/^data:image\/png;base64,/);
    expect(canvas.width).toBe(2000);
  });

  it("fits the time axis to the current schedule instead of extending to 9 PM", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).toContain("8:00 AM");
    expect(text).toContain("9:00 AM");
    expect(text).not.toContain("9:00 PM");
  });

  it("omits Saturday when the current schedule has no Saturday class", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    expect(drawn).not.toContain("SAT");
  });

  it("includes Saturday when the current schedule uses it", () => {
    const saturday: Section = {
      ...section("PE 2", "S1"),
      meetings: [{ days: ["SAT"], start: 480, end: 540 }],
    };
    renderScheduleImage([saturday], meta, stubCanvas());
    expect(drawn).toContain("SAT");
  });

  it("draws every section code, which is the field typed into AISIS", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).toContain("A3");
    expect(text).toContain("INT-MA1");
    expect(text).toContain("MATH 10");
    expect(text).toContain("INTACT 11");
  });

  it("adds only a small sched.riv signature outside the timetable", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).toContain("SCHED.RIV");
    expect(text).not.toContain("ENLIST THESE SECTIONS");
    expect(text).not.toContain("First Year / First Semester");
  });

  it("draws each section's meeting time inside the timetable block", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).toContain("8:00 AM-9:00 AM");
  });

  it("includes the professor and room when the timetable block is tall enough", () => {
    const longClass: Section = {
      ...section("MATH 10", "A3"),
      meetings: [{ days: ["M"], start: 480, end: 570 }],
    };
    renderScheduleImage([longClass], meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).toContain("CRUZ, Ana");
    expect(text).toContain("SEC-A203");
  });

  it("keeps the export to the visible timetable and omits a class with no fixed time", () => {
    const withTba: Schedule = [section("MATH 10", "A3"), tbaSection("PE 2", "UE-1")];
    renderScheduleImage(withTba, meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).not.toContain("PE 2");
    expect(text).not.toContain("UE-1");
    expect(text).not.toContain("no fixed time");
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

});

describe("downloadScheduleImage", () => {
  it("creates and clicks a PNG download link synchronously, then removes it", () => {
    const context = stubCanvas().getContext("2d")!;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,AAAA");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadScheduleImage(schedule, meta);

    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("sched-riv-2026-1.png");
    expect(link.href).toMatch(/^data:image\/png;base64,/);
    expect(document.body.contains(link)).toBe(false);

    getContext.mockRestore();
    toDataURL.mockRestore();
    click.mockRestore();
  });
});
