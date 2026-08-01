import { describe, it, expect } from "vitest";
import { rank } from "./ranker";
import type { ProfRating, Schedule, Section } from "./types";

const section = (code: string, days: Section["meetings"][number]["days"], start: number, end: number, instructors: string[] = []): Section => ({
  courseCode: code, sectionCode: "1", title: code, units: 3, instructors, modality: "",
  meetings: [{ days, start, end }], timeStatus: "scheduled", room: "", remarks: "", raw: "",
});

const prefs = (criteria: Parameters<typeof rank>[1]["criteria"]) =>
  ({ criteria, protectedBlocks: [], excludedSections: [] });

const noRatings = new Map<string, ProfRating>();

describe("rank", () => {
  it("orders by the first criterion", () => {
    const compact: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const gappy: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 720, 780)];
    const [best] = rank([gappy, compact], prefs(["compactDays"]), noRatings);
    expect(best.schedule).toBe(compact);
  });

  it("uses later criteria only to break ties in earlier ones (§7)", () => {
    // Both have zero gaps, so compactDays ties and fewestDays decides.
    const oneDay: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const twoDays: Schedule = [section("A", ["M"], 480, 540), section("B", ["T"], 480, 540)];
    const [best] = rank([twoDays, oneDay], prefs(["compactDays", "fewestDays"]), noRatings);
    expect(best.schedule).toBe(oneDay);
  });

  it("does NOT let lower-priority criteria outvote the top one", () => {
    // This is the behaviour change from the old weighted blend. `gappy` is worse on
    // compactDays but better on every later criterion; strict priority must still rank
    // `compact` first.
    const compact: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600), section("C", ["T"], 480, 540)];
    const gappy: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 600, 660)];
    const [best] = rank([gappy, compact], prefs(["compactDays", "fewestDays", "lateStart"]), noRatings);
    expect(best.schedule).toBe(compact);
  });

  it("treats sub-minute metric differences as ties", () => {
    const a: Schedule = [section("A", ["M"], 480, 540)];
    const b: Schedule = [section("B", ["M"], 480, 540)];
    const ranked = rank([a, b], prefs(["compactDays"]), noRatings);
    expect(ranked[0].score).toBe(ranked[1].score);
  });

  it("is deterministic for equal schedules, ordering by schedule id", () => {
    const a: Schedule = [section("ZZZ", ["M"], 480, 540)];
    const b: Schedule = [section("AAA", ["M"], 480, 540)];
    expect(rank([a, b], prefs(["compactDays"]), noRatings)[0].schedule).toBe(b);
    expect(rank([b, a], prefs(["compactDays"]), noRatings)[0].schedule).toBe(b);
  });

  it("defaults to compactDays when no criteria are selected", () => {
    const compact: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const gappy: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 720, 780)];
    expect(rank([gappy, compact], prefs([]), noRatings)[0].schedule).toBe(compact);
  });

  it("ranks preferred professors higher, treating unrated as neutral", () => {
    const ratings = new Map<string, ProfRating>([["ana cruz", { name: "CRUZ, Ana", rating: 5 }]]);
    const liked: Schedule = [section("A", ["M"], 480, 540, ["CRUZ, Ana"])];
    const unknown: Schedule = [section("B", ["M"], 480, 540, ["SANTOS, Bea"])];
    expect(rank([unknown, liked], prefs(["preferredProfs"]), ratings)[0].schedule).toBe(liked);
  });

  it("returns a display score in [0,1] for the top criterion", () => {
    const a: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const b: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 720, 780)];
    for (const r of rank([a, b], prefs(["compactDays"]), noRatings)) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});
