import { beforeEach, describe, it, expect } from "vitest";
import { defaultState, loadState, saveState, STORAGE_VERSION } from "./storage";

const KEY = "aisis-scheduler-state";

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored (not a reset)", () => {
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(false);
    expect(state).toEqual(defaultState("2026-1"));
    expect(state.preferences.criteria).toEqual(["compactDays"]);
  });

  it("round-trips saved state", () => {
    const state = defaultState("2026-1");
    state.chosenCourses = ["PHILO 11"];
    saveState(state);
    expect(loadState("2026-1")).toEqual({ state, wasReset: false });
  });

  it("resets on corrupted JSON", () => {
    localStorage.setItem(KEY, "{not json");
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(true);
    expect(state).toEqual(defaultState("2026-1"));
  });

  it("resets on wrong version", () => {
    saveState({ ...defaultState("2026-1"), version: STORAGE_VERSION + 1 });
    expect(loadState("2026-1").wasReset).toBe(true);
  });

  it("resets on semester change", () => {
    saveState({ ...defaultState("2025-2"), chosenCourses: ["OLD 1"] });
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(true);
    expect(state.chosenCourses).toEqual([]);
  });

  it("resets on structurally invalid state", () => {
    localStorage.setItem(KEY, JSON.stringify({ version: STORAGE_VERSION, semester: "2026-1", chosenCourses: "oops" }));
    expect(loadState("2026-1").wasReset).toBe(true);
  });

  it("resets on invalid criteria element", () => {
    const state = defaultState("2026-1");
    (state.preferences.criteria as unknown as string[]) = ["compactDays", "notARealCriterion"];
    localStorage.setItem(KEY, JSON.stringify(state));
    expect(loadState("2026-1").wasReset).toBe(true);
  });

  it("resets on invalid protectedBlocks element", () => {
    const state = defaultState("2026-1");
    (state.preferences.protectedBlocks as unknown[]) = [{}];
    localStorage.setItem(KEY, JSON.stringify(state));
    expect(loadState("2026-1").wasReset).toBe(true);
  });

  it("resets on invalid personalRatings element", () => {
    const state = defaultState("2026-1");
    (state.personalRatings as unknown[]) = [{}];
    localStorage.setItem(KEY, JSON.stringify(state));
    expect(loadState("2026-1").wasReset).toBe(true);
  });
});
