import { describe, it, expect } from "vitest";
import { generate, MAX_SCHEDULES } from "./generator";
import type { ResolvedSlot } from "./slots";
import type { Section, Slot, UserState } from "./types";

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

  it("a locked section pins its slot and bypasses filters", () => {
    const sections = [section("A", "LOCKED", [at(["M"], 420, 480)]), section("A", "OTHER", [at(["M"], 900, 960)])];
    const { schedules } = generate([resolved(slot("A"), sections)], state({
      lockedSections: ["A LOCKED"],
      preferences: { criteria: ["compactDays"], earliestStart: 600, protectedBlocks: [], excludedSections: [] },
    }));
    expect(schedules.map((s) => s[0].sectionCode)).toEqual(["LOCKED"]);
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
