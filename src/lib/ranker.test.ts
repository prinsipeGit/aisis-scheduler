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

  it("scores candidates apart when the top criterion ties across the whole set", () => {
    // The defect this replaced: score read only metrics[0], so a set that ties on compactDays
    // gave every candidate 1.0 — 500 rows all showing "100%" while fewestDays ranked them
    // genuinely apart. Both schedules below have zero gaps, so compactDays ties; oneDay is
    // better on fewestDays and must now score higher.
    const oneDay: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const twoDays: Schedule = [section("A", ["M"], 480, 540), section("B", ["T"], 480, 540)];
    const ranked = rank([twoDays, oneDay], prefs(["compactDays", "fewestDays"]), noRatings);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("caps the score rather than letting a lower rank outscore a higher one", () => {
    // The counterexample that weight-decay alone does not survive: the winner is better on the
    // deciding criterion by a hair and much worse on the next one, so a plain weighted sum
    // scores it BELOW the candidate it outranks. Whatever the composite says, rank 1 is the best
    // of the set by definition and must read as 100%.
    // Worked through by hand so the fixture genuinely triggers it rather than merely looking
    // like it might. Normalised across this set, compactDays (higher = fewer gap minutes) gives
    // tight 1.0 / gappy 0.9 / awful 0.0, and lateStart gives 0.0 / 1.0 / 0.638. Raw composites
    // are then 1.0, 1.233 and 0.213 — so `gappy`, which the lexicographic sort ranks SECOND,
    // outscores the winner until the cumulative minimum caps it.
    const tight: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const gappy: Schedule = [section("A", ["M"], 700, 760), section("B", ["M"], 790, 850)];
    const awful: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 840, 900)];
    const ranked = rank([awful, gappy, tight], prefs(["compactDays", "lateStart"]), noRatings);
    expect(ranked[0].schedule).toBe(tight);
    expect(ranked[0].score).toBe(1);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].score).toBeLessThanOrEqual(ranked[i - 1].score);
    }
  });

  it("never contradicts the order it is shown next to", () => {
    // The score is displayed beside the rank position, so a score that rose as rank fell would
    // put two numbers on screen disagreeing about the same schedule. The 3^-i weight decay is
    // what prevents it: the tail after position i sums to less than position i's own weight, so
    // lower-priority criteria can never outvote a higher-priority one.
    const build = (day: Section["meetings"][number]["days"], start: number): Schedule => [
      section("A", day, start, start + 60),
      section("B", day, start + 60, start + 120),
    ];
    const schedules = [
      build(["M"], 480), build(["M", "W"], 600), build(["T"], 540),
      build(["M", "W", "F"], 480), build(["TH"], 720), build(["M", "T"], 660),
    ];
    const ranked = rank(schedules, prefs(["compactDays", "fewestDays", "lateStart"]), noRatings);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].score).toBeLessThanOrEqual(ranked[i - 1].score);
    }
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
