import { describe, it, expect } from "vitest";
import { rank } from "./ranker";
import { mergeRatings } from "./profs";
import type { Meeting, Preferences, Schedule, Section } from "./types";
import { sectionKey } from "./types";

function sec(courseCode: string, sectionCode: string, meetings: Meeting[], instructors: string[] = []): Section {
  return { courseCode, sectionCode, meetings, instructors, modality: "FULLY ONSITE",
    title: courseCode, units: 3, room: "X", remarks: "", raw: "" };
}
const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });
const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  criteria: ["compactDays"], protectedBlocks: [], excludedSections: [], ...over,
});
const noRatings = mergeRatings([], []);
const first = (ranked: { schedule: Schedule }[]) =>
  ranked[0].schedule.map(sectionKey).sort().join("|");

describe("rank", () => {
  it("compactDays prefers the schedule with smaller gaps", () => {
    const tight: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "1", [m(["M"], 570, 660)])];
    const gappy: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "2", [m(["M"], 780, 870)])];
    const ranked = rank([gappy, tight], prefs(), noRatings);
    expect(first(ranked)).toBe("A 1|B 1");
  });

  it("fewestDays prefers fewer campus days", () => {
    const twoDays: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "1", [m(["T"], 480, 570)])];
    const oneDay: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "2", [m(["M"], 600, 690)])];
    const ranked = rank([twoDays, oneDay], prefs({ criteria: ["fewestDays"] }), noRatings);
    expect(first(ranked)).toBe("A 1|B 2");
  });

  it("lateStart prefers later first classes; earlyEnd prefers earlier last classes", () => {
    const early: Schedule = [sec("A", "1", [m(["M"], 480, 570)])];
    const late: Schedule = [sec("A", "2", [m(["M"], 660, 750)])];
    expect(first(rank([early, late], prefs({ criteria: ["lateStart"] }), noRatings))).toBe("A 2");
    expect(first(rank([early, late], prefs({ criteria: ["earlyEnd"] }), noRatings))).toBe("A 1");
  });

  it("preferredProfs prefers higher-rated instructors; unrated scores neutral 3", () => {
    const good: Schedule = [sec("A", "1", [m(["M"], 480, 570)], ["GARCIA, JUAN"])];
    const bad: Schedule = [sec("A", "2", [m(["M"], 480, 570)], ["CRUZ, JOSE"])];
    const unknown: Schedule = [sec("A", "3", [m(["M"], 480, 570)], ["WHO, KNOWS"])];
    const ratings = mergeRatings(
      [{ name: "GARCIA, JUAN", rating: 5 }, { name: "CRUZ, JOSE", rating: 1 }], []);
    const ranked = rank([bad, unknown, good], prefs({ criteria: ["preferredProfs"] }), ratings);
    expect(ranked.map((r) => first([r]))).toEqual(["A 1", "A 3", "A 2"]);
  });

  it("averages ratings across a section's multiple instructors", () => {
    const pair: Schedule = [sec("A", "1", [m(["M"], 480, 570)], ["GARCIA, JUAN", "CRUZ, JOSE"])];
    const solo: Schedule = [sec("A", "2", [m(["M"], 480, 570)], ["GARCIA, JUAN"])];
    const ratings = mergeRatings(
      [{ name: "GARCIA, JUAN", rating: 5 }, { name: "CRUZ, JOSE", rating: 1 }], []);
    const ranked = rank([pair, solo], prefs({ criteria: ["preferredProfs"] }), ratings);
    expect(first([ranked[0]])).toBe("A 2"); // 5 beats the pair's average of 3
  });

  it("first criterion outweighs the second", () => {
    // s1 wins compactDays, s2 wins fewestDays.
    const s1: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "1", [m(["M"], 570, 660), m(["T"], 480, 570)])];
    const s2: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "2", [m(["M"], 780, 870)])];
    const ranked = rank([s2, s1], prefs({ criteria: ["compactDays", "fewestDays"] }), noRatings);
    expect(first(ranked)).toBe("A 1|B 1");
  });

  it("is deterministic on ties", () => {
    const x: Schedule = [sec("A", "1", [m(["M"], 480, 570)])];
    const y: Schedule = [sec("A", "2", [m(["T"], 480, 570)])];
    const r1 = rank([x, y], prefs(), noRatings).map((r) => first([r]));
    const r2 = rank([y, x], prefs(), noRatings).map((r) => first([r]));
    expect(r1).toEqual(r2);
  });

  it("empty criteria defaults to compactDays", () => {
    const tight: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "1", [m(["M"], 570, 660)])];
    const gappy: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "2", [m(["M"], 780, 870)])];
    const ranked = rank([gappy, tight], prefs({ criteria: [] }), noRatings);
    expect(first(ranked)).toBe("A 1|B 1");
  });
});
