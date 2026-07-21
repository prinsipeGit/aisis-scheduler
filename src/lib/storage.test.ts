import { beforeEach, describe, it, expect } from "vitest";
import { defaultState, loadState, saveState, STORAGE_VERSION } from "./storage";

const KEY = "aisis-scheduler-state";

describe("storage v2", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored (not a reset)", () => {
    const { state, wasReset } = loadState("2026-2");
    expect(wasReset).toBe(false);
    expect(state).toEqual(defaultState("2026-2"));
    expect(state.version).toBe(2);
    expect(state.preferences.criteria).toEqual(["compactDays"]);
    expect(state.electiveFills).toEqual({});
  });

  it("round-trips saved state", () => {
    const state = defaultState("2026-2");
    state.programId = "BS-AMDSc-2024";
    state.blockKey = "Second Year|First Semester";
    state.requiredCourses = ["MATH 31.3"];
    state.electiveFills = { "Third Year|First Semester#4": "MATH 55.1" };
    saveState(state);
    expect(loadState("2026-2")).toEqual({ state, wasReset: false });
  });

  it("keeps state when the caller's default term differs from the stored one", () => {
    const state = { ...defaultState("2026-2"), requiredCourses: ["MATH 10"] };
    saveState(state);
    const loaded = loadState("2025-1");
    expect(loaded.wasReset).toBe(false);
    expect(loaded.state.calendarTerm).toBe("2026-2");
    expect(loaded.state.requiredCourses).toEqual(["MATH 10"]);
  });

  it("resets on corrupted JSON", () => {
    localStorage.setItem(KEY, "{not json");
    const { state, wasReset } = loadState("2026-2");
    expect(wasReset).toBe(true);
    expect(state).toEqual(defaultState("2026-2"));
  });

  it("resets v1 state (version 1) to v2 defaults", () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 1, semester: "2026-1", chosenCourses: ["PHILO 11"], lockedSections: [],
      fullSections: [], personalRatings: [],
      preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
    }));
    const { state, wasReset } = loadState("2026-2");
    expect(wasReset).toBe(true);
    expect(state).toEqual(defaultState("2026-2"));
  });

  it("resets on a future version", () => {
    saveState({ ...defaultState("2026-2"), version: STORAGE_VERSION + 1 });
    expect(loadState("2026-2").wasReset).toBe(true);
  });

  it("resets on structurally invalid state", () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, calendarTerm: "2026-2", requiredCourses: "oops" }));
    expect(loadState("2026-2").wasReset).toBe(true);
  });

  it("resets when electiveFills is not an object of strings", () => {
    saveState({ ...defaultState("2026-2"), electiveFills: { a: 1 } as unknown as Record<string, string> });
    expect(loadState("2026-2").wasReset).toBe(true);
  });

  it("resets when a personal rating is malformed", () => {
    saveState({ ...defaultState("2026-2"), personalRatings: [{} as never] });
    expect(loadState("2026-2").wasReset).toBe(true);
  });

  it("resets when electiveFills is an array impersonating a record", () => {
    localStorage.setItem(KEY, JSON.stringify({
      ...defaultState("2026-2"), electiveFills: ["MATH 55.1"],
    }));
    const { state, wasReset } = loadState("2026-2");
    expect(wasReset).toBe(true);
    expect(state).toEqual(defaultState("2026-2"));
  });

  it("resets when earliestStart is not a number", () => {
    const state = defaultState("2026-2");
    state.preferences = { ...state.preferences, earliestStart: "9am" as unknown as number };
    saveState(state);
    const { state: loaded, wasReset } = loadState("2026-2");
    expect(wasReset).toBe(true);
    expect(loaded).toEqual(defaultState("2026-2"));
  });

  it.each([-1, 6, Number.NaN])("resets an out-of-range professor rating: %s", (rating) => {
    const state = defaultState("2026-2");
    state.personalRatings = [{ name: "PROF, TEST", rating }];
    saveState(state);
    expect(loadState("2026-2").wasReset).toBe(true);
  });

  it("resets an invalid protected block", () => {
    const state = defaultState("2026-2");
    state.preferences.protectedBlocks = [{ days: ["M"], start: 800, end: 700 }];
    saveState(state);
    expect(loadState("2026-2").wasReset).toBe(true);
  });
});
