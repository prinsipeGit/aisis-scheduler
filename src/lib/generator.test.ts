import { describe, it, expect } from "vitest";
import { generate } from "./generator";
import type { Meeting, Section, UserState } from "./types";
import { sectionKey } from "./types";

function sec(courseCode: string, sectionCode: string, meetings: Meeting[]): Section {
  return {
    courseCode, sectionCode, meetings,
    title: courseCode, units: 3, instructors: [], modality: "", room: "X", remarks: "", raw: "",
  };
}
const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });

function state(overrides: Partial<UserState>): UserState {
  return {
    version: 2, programId: "", blockKey: "", calendarTerm: "2026-1",
    requiredCourses: [], electiveFills: {}, lockedSections: [],
    fullSections: [], personalRatings: [],
    preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
    ...overrides,
  };
}

// A: two sections; B: two sections; A2 conflicts with B1.
const A1 = sec("COURSE A", "1", [m(["M", "TH"], 480, 570)]);
const A2 = sec("COURSE A", "2", [m(["T", "F"], 600, 690)]);
const B1 = sec("COURSE B", "1", [m(["T", "F"], 600, 690)]);
const B2 = sec("COURSE B", "2", [m(["T", "F"], 720, 810)]);
const ALL = [A1, A2, B1, B2];
const CHOSEN = { requiredCourses: ["COURSE A", "COURSE B"] };

describe("generate", () => {
  it("produces only conflict-free combinations", () => {
    const { schedules, diagnostics } = generate(ALL, state(CHOSEN));
    expect(diagnostics).toBeNull();
    const keys = schedules.map((s) => s.map(sectionKey).sort().join("|")).sort();
    expect(keys).toEqual([
      "COURSE A 1|COURSE B 1",
      "COURSE A 1|COURSE B 2",
      "COURSE A 2|COURSE B 2",
    ]);
  });

  it("honors locked sections", () => {
    const { schedules } = generate(ALL, state({ ...CHOSEN, lockedSections: ["COURSE A 2"] }));
    expect(schedules).toHaveLength(1);
    expect(schedules[0].map(sectionKey).sort()).toEqual(["COURSE A 2", "COURSE B 2"]);
  });

  it("removes sections marked full", () => {
    const { schedules } = generate(ALL, state({ ...CHOSEN, fullSections: ["COURSE B 2"] }));
    const keys = schedules.map((s) => s.map(sectionKey).sort().join("|"));
    expect(keys).toEqual(["COURSE A 1|COURSE B 1"]);
  });

  it("locked wins over marked-full", () => {
    const { schedules } = generate(
      ALL,
      state({ ...CHOSEN, lockedSections: ["COURSE B 2"], fullSections: ["COURSE B 2"] })
    );
    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules.every((s) => s.some((x) => sectionKey(x) === "COURSE B 2"))).toBe(true);
  });

  it("applies earliestStart filter", () => {
    const { schedules } = generate(ALL, state({ ...CHOSEN, preferences: {
      criteria: ["compactDays"], protectedBlocks: [], excludedSections: [], earliestStart: 540,
    }}));
    // A1 starts 480 < 540 → removed; only A2 remains for COURSE A
    expect(schedules.every((s) => s.some((x) => sectionKey(x) === "COURSE A 2"))).toBe(true);
  });

  it("removes sections overlapping protected blocks", () => {
    const { schedules } = generate(ALL, state({ ...CHOSEN, preferences: {
      criteria: ["compactDays"], excludedSections: [],
      protectedBlocks: [m(["T"], 700, 760)], // kills B2 (720-810 on T)
    }}));
    expect(schedules.every((s) => s.every((x) => sectionKey(x) !== "COURSE B 2"))).toBe(true);
  });

  it("TBA sections never conflict", () => {
    const tba = sec("COURSE C", "1", []);
    const { schedules, diagnostics } = generate([A1, tba], state({ requiredCourses: ["COURSE A", "COURSE C"] }));
    expect(diagnostics).toBeNull();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toHaveLength(2); // both sections present, TBA included
  });

  it("excludes sections whose meeting time failed to parse", () => {
    const broken = { ...sec("COURSE C", "1", []), timeStatus: "parse-error" as const };
    const { schedules, diagnostics } = generate(
      [A1, broken],
      state({ requiredCourses: ["COURSE A", "COURSE C"] })
    );
    expect(schedules).toHaveLength(0);
    expect(diagnostics?.perCourse).toContainEqual({ courseCode: "COURSE C", total: 1, afterFilters: 0 });
  });

  it("does not let a lock override an unsafe parse-error time", () => {
    const broken = { ...sec("COURSE C", "1", []), timeStatus: "parse-error" as const };
    const result = generate(
      [broken],
      state({ requiredCourses: ["COURSE C"], lockedSections: ["COURSE C 1"] })
    );
    expect(result.schedules).toHaveLength(0);
    expect(result.diagnostics?.perCourse[0].afterFilters).toBe(0);
  });

  it("reports when the schedule safety limit truncates the search", () => {
    const manyA = Array.from({ length: 501 }, (_, i) => sec("COURSE A", String(i), []));
    const result = generate(manyA, state({ requiredCourses: ["COURSE A"] }));
    expect(result.schedules).toHaveLength(500);
    expect(result.search).toEqual({ limit: 500, truncated: true });
  });

  it("zero results yields per-course and pair diagnostics", () => {
    // Both courses only offer the same timeslot → impossible.
    const X1 = sec("COURSE X", "1", [m(["M"], 480, 570)]);
    const Y1 = sec("COURSE Y", "1", [m(["M"], 480, 570)]);
    const { schedules, diagnostics } = generate([X1, Y1], state({ requiredCourses: ["COURSE X", "COURSE Y"] }));
    expect(schedules).toHaveLength(0);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics!.perCourse).toEqual([
      { courseCode: "COURSE X", total: 1, afterFilters: 1 },
      { courseCode: "COURSE Y", total: 1, afterFilters: 1 },
    ]);
    expect(diagnostics!.conflictPairs).toEqual([{ a: "COURSE X", b: "COURSE Y" }]);
    expect(diagnostics!.nWayConflict).toBe(false);
  });

  it("zero results from over-filtering shows afterFilters: 0", () => {
    const { diagnostics } = generate(ALL, state({ ...CHOSEN, fullSections: ["COURSE B 1", "COURSE B 2"] }));
    expect(diagnostics!.perCourse).toContainEqual({ courseCode: "COURSE B", total: 2, afterFilters: 0 });
  });

  it("flags an N-way conflict when every pair fits but no triple does", () => {
    // Only two non-overlapping slots exist (P: 8-9, Q: 9-10 on Monday), and each of
    // 3 courses offers a section in each slot. Any 2 courses can split P/Q without
    // conflict, but with 3 courses and only 2 slots, pigeonhole forces a clash.
    const P = m(["M"], 480, 540);
    const Q = m(["M"], 540, 600);
    const A1 = sec("COURSE A", "1", [P]);
    const A2 = sec("COURSE A", "2", [Q]);
    const B1 = sec("COURSE B", "1", [P]);
    const B2 = sec("COURSE B", "2", [Q]);
    const C1 = sec("COURSE C", "1", [P]);
    const C2 = sec("COURSE C", "2", [Q]);
    const { schedules, diagnostics } = generate(
      [A1, A2, B1, B2, C1, C2],
      state({ requiredCourses: ["COURSE A", "COURSE B", "COURSE C"] })
    );
    expect(schedules).toHaveLength(0);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics!.conflictPairs).toEqual([]);
    expect(diagnostics!.perCourse.every((c) => c.afterFilters > 0)).toBe(true);
    expect(diagnostics!.nWayConflict).toBe(true);
  });
});
