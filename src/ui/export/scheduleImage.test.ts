import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderScheduleImage } from "./scheduleImage";
import type { Schedule, Section } from "../../lib/types";

const section = (code: string, sectionCode: string): Section => ({
  courseCode: code, sectionCode, title: code, units: 3, instructors: ["CRUZ, Ana"], modality: "",
  meetings: [{ days: ["M", "W"], start: 480, end: 540 }], timeStatus: "scheduled",
  room: "SEC-A203", remarks: "", raw: "",
});

const schedule: Schedule = [section("MATH 10", "A3"), section("INTACT 11", "INT-MA1")];
const meta = { program: "BS CS", block: "First Year / First Semester", term: "2026-1" };

// Record every string drawn so the content can be asserted without rendering pixels.
let drawn: string[] = [];

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
    expect(text).toContain("BS CS");
    expect(text).toContain("First Year / First Semester");
    expect(text).toContain("2026-1");
  });

  it("carries the unofficial-tool line, which travels with a shared image", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    expect(drawn.join(" ")).toMatch(/verify.*AISIS/i);
  });
});
