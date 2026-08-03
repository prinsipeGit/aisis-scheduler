import { describe, it, expect } from "vitest";
import { generate, MAX_SCHEDULES } from "./generator";
import { rank } from "./ranker";
import type { ResolvedSlot } from "./slots";
import type { Section, Slot, UserState } from "./types";
import { sectionKey } from "./types";

const at = (days: Section["meetings"][number]["days"], start: number, end: number) => ({ days, start, end });

const section = (courseCode: string, sectionCode: string, meetings: Section["meetings"]): Section => ({
  courseCode, sectionCode, title: courseCode, units: 3, instructors: [], modality: "",
  meetings, timeStatus: "scheduled", room: "R", remarks: "", raw: "",
});

const slot = (id: string, over: Partial<Slot> = {}): Slot => ({
  id, origin: "ips", label: id, requirement: id, category: null, sourceBlock: null,
  chosen: null, pairedWith: null, included: true, ...over,
});

const resolved = (s: Slot, sections: Section[]): ResolvedSlot =>
  ({ slot: s, sections, allSections: sections, status: sections.length ? "ok" : "no-offerings", pinned: null });

// What `resolveSlots` hands back for the slot that claimed a locked key: `sections` already
// narrowed to that one section, `allSections` still the whole pool.
const pinnedTo = (s: Slot, pool: Section[], key: string): ResolvedSlot => ({
  slot: s, sections: pool.filter((x) => sectionKey(x) === key), allSections: pool,
  status: "ok", pinned: key,
});

const state = (over: Partial<UserState> = {}): UserState => ({
  version: 3, programId: "P", blockKey: "B", calendarTerm: "2026-1", slots: [],
  lockedSections: [], fullSections: [], completedCourses: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
  personalRatings: [], ...over,
});

describe("generate", () => {
  it("produces every conflict-free combination, one section per slot", () => {
    const a = resolved(slot("A"), [section("A", "1", [at(["M"], 480, 540)]), section("A", "2", [at(["T"], 480, 540)])]);
    const b = resolved(slot("B"), [section("B", "1", [at(["W"], 480, 540)])]);
    const { schedules } = generate([a, b], state());
    expect(schedules).toHaveLength(2);
    for (const s of schedules) expect(s).toHaveLength(2);
  });

  it("never emits a schedule with overlapping meetings", () => {
    const a = resolved(slot("A"), [section("A", "1", [at(["M"], 480, 600)])]);
    const b = resolved(slot("B"), [section("B", "1", [at(["M"], 540, 660)])]);
    const { schedules, diagnostics } = generate([a, b], state());
    expect(schedules).toEqual([]);
    expect(diagnostics?.conflictPairs).toEqual([{ a: "A", b: "B" }]);
  });

  it("skips slots that are not ok or not included, without blocking the rest", () => {
    const a = resolved(slot("A"), [section("A", "1", [at(["M"], 480, 540)])]);
    const missing: ResolvedSlot = { slot: slot("B"), sections: [], allSections: [], status: "no-offerings", pinned: null };
    const off = resolved(slot("C", { included: false }), [section("C", "1", [at(["F"], 480, 540)])]);
    const { schedules } = generate([a, missing, off], state());
    expect(schedules).toHaveLength(1);
    expect(schedules[0].map((s) => s.courseCode)).toEqual(["A"]);
  });

  it("keeps a paired slot in the same subject as its partner (§5.4)", () => {
    const lec = slot("lec", { pairedWith: "lab" });
    const lab = slot("lab", { pairedWith: "lec" });
    const lecR = resolved(lec, [
      section("BIO 10.01", "1", [at(["M"], 480, 540)]),
      section("CHEM 10.01", "1", [at(["T"], 480, 540)]),
    ]);
    const labR = resolved(lab, [
      section("BIO 10.02", "1", [at(["W"], 480, 540)]),
      section("CHEM 10.02", "1", [at(["TH"], 480, 540)]),
    ]);
    const { schedules } = generate([lecR, labR], state());
    expect(schedules).toHaveLength(2); // BIO+BIO and CHEM+CHEM, never a cross pair
    for (const s of schedules) {
      const prefixes = new Set(s.map((x) => x.courseCode.split(" ")[0]));
      expect(prefixes.size).toBe(1);
    }
  });

  it("excludes parse-error sections but allows TBA ones", () => {
    const bad = { ...section("A", "1", []), timeStatus: "parse-error" as const };
    const tba = { ...section("A", "2", []), timeStatus: "tba" as const };
    const { schedules } = generate([resolved(slot("A"), [bad, tba])], state());
    expect(schedules).toHaveLength(1);
    expect(schedules[0][0].sectionCode).toBe("2");
  });

  it("applies full, excluded, time-limit and protected-block filters", () => {
    const sections = [
      section("A", "FULL", [at(["M"], 480, 540)]),
      section("A", "EXCL", [at(["M"], 600, 660)]),
      section("A", "EARLY", [at(["M"], 420, 480)]),
      section("A", "CLASH", [at(["M"], 720, 780)]),
      section("A", "GOOD", [at(["M"], 900, 960)]),
    ];
    const { schedules } = generate([resolved(slot("A"), sections)], state({
      fullSections: ["A FULL"],
      preferences: {
        criteria: ["compactDays"],
        earliestStart: 480,
        protectedBlocks: [at(["M"], 700, 800)],
        excludedSections: ["A EXCL"],
      },
    }));
    expect(schedules.map((s) => s[0].sectionCode)).toEqual(["GOOD"]);
  });

  it("a pinned slot takes its section and bypasses the filters", () => {
    const pool = [section("A", "LOCKED", [at(["M"], 420, 480)]), section("A", "OTHER", [at(["M"], 900, 960)])];
    const { schedules } = generate([pinnedTo(slot("A"), pool, "A LOCKED")], state({
      lockedSections: ["A LOCKED"],
      preferences: { criteria: ["compactDays"], earliestStart: 600, protectedBlocks: [], excludedSections: [] },
    }));
    expect(schedules.map((s) => s[0].sectionCode)).toEqual(["LOCKED"]);
  });

  it("never places a pinned section whose time failed to parse", () => {
    // A pin overrides the student's own preferences, not a malformed source row: placing it
    // would draw a week that conflict math cannot check.
    const bad = { ...section("A", "BAD", []), timeStatus: "parse-error" as const };
    const { schedules, diagnostics } = generate(
      [pinnedTo(slot("A"), [bad], "A BAD")], state({ lockedSections: ["A BAD"] }));
    expect(schedules).toEqual([]);
    expect(diagnostics?.perSlot[0].afterFilters).toBe(0);
  });

  it("reports truncation only when the limit is genuinely exceeded", () => {
    const many = Array.from({ length: 40 }, (_, i) => section("A", `A${i}`, [at(["M"], 480 + i, 500 + i)]));
    const more = Array.from({ length: 40 }, (_, i) => section("B", `B${i}`, [at(["T"], 480 + i, 500 + i)]));
    const { schedules, search } = generate([resolved(slot("A"), many), resolved(slot("B"), more)], state());
    expect(search.limit).toBe(MAX_SCHEDULES);
    expect(search.truncated).toBe(true);
    expect(schedules).toHaveLength(MAX_SCHEDULES);
  });

  it("flags an n-way conflict when every pair fits but the whole set does not", () => {
    const mk = (name: string, day: "M" | "T") =>
      resolved(slot(name), [section(name, "1", [at([day], 480, 540)])]);
    // A and B both only on M; each pair with C is fine, but A+B collide.
    const { schedules, diagnostics } = generate([mk("A", "M"), mk("B", "M"), mk("C", "T")], state());
    expect(schedules).toEqual([]);
    expect(diagnostics?.conflictPairs).toEqual([{ a: "A", b: "B" }]);
    expect(diagnostics?.nWayConflict).toBe(false);
  });
});

describe("generate with nothing to schedule", () => {
  it("returns no schedules when no slot is active, instead of one empty week", () => {
    // The empty product is the empty tuple, so walking zero slots would push [] - a
    // schedule containing nothing, which downstream presents as a valid, downloadable week.
    const off = resolved(slot("A", { included: false }), [section("A", "1", [at(["M"], 480, 540)])]);
    expect(generate([off], state()).schedules).toEqual([]);
    expect(generate([], state()).schedules).toEqual([]);
  });

  it("does not claim an empty set of courses cannot fit together", () => {
    const { diagnostics } = generate([], state());
    expect(diagnostics?.nWayConflict).toBe(false);
  });

  it("ranks to nothing, so no blank week can reach the pager or the download", () => {
    const { schedules } = generate([], state());
    expect(rank(schedules, state().preferences, new Map())).toEqual([]);
  });
});

describe("generate with two slots resolving to one course", () => {
  it("never enlists the student in the same course twice", () => {
    // Two TBA sections of one course never overlap, so the conflict rule alone lets both in.
    const a = { ...section("MATH 10", "A", []), timeStatus: "tba" as const };
    const b = { ...section("MATH 10", "B", []), timeStatus: "tba" as const };
    const { schedules } = generate([resolved(slot("X"), [a, b]), resolved(slot("Y"), [a, b])], state());
    expect(schedules).toEqual([]);
  });

  it("still lets two slots sharing a pool take different courses from it", () => {
    // PFT3 and PFT4 alias to the identical PATHFit pool; taking two different activities
    // is correct, taking the same activity twice is not.
    const pool = [
      section("PEPC 13.03", "A", [at(["M"], 480, 540)]),
      section("PEPC 13.03", "B", [at(["T"], 480, 540)]),
      section("PEPC 14.01", "C", [at(["W"], 480, 540)]),
    ];
    const { schedules } = generate([resolved(slot("PFT3"), pool), resolved(slot("PFT4"), pool)], state());
    expect(schedules).toHaveLength(4); // A|C, B|C, C|A, C|B - never A|B or B|A
    for (const s of schedules) expect(new Set(s.map((x) => x.courseCode)).size).toBe(2);
  });

  it("keeps a pinned section placeable when a free slot shares its entire pool", () => {
    // `resolveSlots` gave the locked key to one slot and left the other unclaimed with the
    // full pool - which still contains the pinned section. Re-deriving the pin here from
    // state.lockedSections collapses that unclaimed slot to the very section its neighbour
    // owns, and the distinct-course rule then rejects it: zero schedules for a selection
    // that has 500 without the pin.
    const pin = section("PEPC 13.15", "PFT-A", [at(["M"], 480, 540)]);
    const sameCourse = section("PEPC 13.15", "PFT-B", [at(["T"], 480, 540)]);
    const otherCourse = section("PEPC 14.01", "PFT-C", [at(["W"], 480, 540)]);
    const pool = [pin, sameCourse, otherCourse];
    const { schedules, diagnostics } = generate(
      [pinnedTo(slot("PFT3"), pool, "PEPC 13.15 PFT-A"), resolved(slot("PFT4"), pool)],
      state({ lockedSections: ["PEPC 13.15 PFT-A"] })
    );
    expect(diagnostics).toBeNull();
    expect(schedules).toHaveLength(1);
    expect(schedules[0].map((s) => s.sectionCode).sort()).toEqual(["PFT-A", "PFT-C"]);
  });
});

describe("generator invariants", () => {
  it("every emitted schedule is pairwise conflict-free with one section per satisfiable slot", () => {
    const mk = (name: string, n: number) =>
      resolved(slot(name), Array.from({ length: n }, (_, i) =>
        section(name, `${i}`, [at(["M", "W"], 480 + i * 90, 540 + i * 90)])));
    const slots = [mk("A", 3), mk("B", 3), mk("C", 3)];
    const { schedules } = generate(slots, state());
    const satisfiable = slots.filter((r) => r.slot.included && r.status === "ok").length;
    expect(schedules.length).toBeGreaterThan(0);
    for (const schedule of schedules) {
      expect(schedule).toHaveLength(satisfiable);
      for (let i = 0; i < schedule.length; i++) {
        for (let j = i + 1; j < schedule.length; j++) {
          const overlapping = schedule[i].meetings.some((m) =>
            schedule[j].meetings.some((n) =>
              m.days.some((d) => n.days.includes(d)) && m.start < n.end && n.start < m.end));
          expect(overlapping).toBe(false);
        }
      }
    }
  });
});
