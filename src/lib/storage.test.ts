import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState, defaultState } from "./storage";
import type { Slot, UserState } from "./types";

const KEY = "aisis-scheduler-state";

const slot = (over: Partial<Slot> = {}): Slot => ({
  id: "ips:A#0", origin: "ips", label: "MATH 10", requirement: "MATH 10", category: "C",
  sourceBlock: "First Year|First Semester", chosen: null, pairedWith: null, included: true, ...over,
});

const valid = (over: Partial<UserState> = {}): UserState => ({
  ...defaultState("2026-1"), slots: [slot()], ...over,
});

beforeEach(() => localStorage.clear());

describe("loadState", () => {
  it("returns defaults with no reset flag when nothing is stored", () => {
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(false);
    expect(state).toEqual(defaultState("2026-1"));
    expect(state.version).toBe(3);
    expect(state.completedCourses).toEqual([]);
  });

  it("round-trips a valid v3 state", () => {
    saveState(valid());
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(false);
    expect(state.slots).toHaveLength(1);
  });

  it("resets v2 state, which has requiredCourses instead of slots", () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 2, programId: "P", blockKey: "B", calendarTerm: "2026-1",
      requiredCourses: ["MATH 10"], electiveFills: {}, lockedSections: [], fullSections: [],
      personalRatings: [], preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
    }));
    expect(loadState("2026-1").wasReset).toBe(true);
  });

  it("resets unparseable JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadState("2026-1").wasReset).toBe(true);
  });

  it.each([
    ["a slot missing a field", { slots: [{ id: "x" }] }],
    ["a duplicate slot id", { slots: [slot(), slot()] }],
    ["an unknown rank criterion", { preferences: { criteria: ["nope"], protectedBlocks: [], excludedSections: [] } }],
    ["a duplicate rank criterion", { preferences: { criteria: ["compactDays", "compactDays"], protectedBlocks: [], excludedSections: [] } }],
    ["a protected block with start >= end", { preferences: { criteria: [], protectedBlocks: [{ days: ["M"], start: 600, end: 600 }], excludedSections: [] } }],
    ["a protected block with an unknown day", { preferences: { criteria: [], protectedBlocks: [{ days: ["X"], start: 500, end: 600 }], excludedSections: [] } }],
    ["a rating above 5", { personalRatings: [{ name: "A", rating: 6 }] }],
    ["a non-string completedCourses entry", { completedCourses: [1] }],
    ["a personalRating with a non-string note", { personalRatings: [{ name: "A", rating: 3, note: 12345 }] }],
    ["a personalRating with a non-string asOf", { personalRatings: [{ name: "A", rating: 3, asOf: { nested: true } }] }],
  ])("rejects %s", (_label, patch) => {
    localStorage.setItem(KEY, JSON.stringify({ ...valid(), ...patch }));
    expect(loadState("2026-1").wasReset).toBe(true);
  });
});

describe("saveState", () => {
  it("does not throw when storage is unavailable", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("QuotaExceeded"); };
    expect(() => saveState(valid())).not.toThrow();
    Storage.prototype.setItem = original;
  });
});
