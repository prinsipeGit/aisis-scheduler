import { describe, it, expect } from "vitest";
import {
  seedRequiredCourses, buildRequirementRows, resolveCourseCodes, totalUnits, extraCourseRows,
} from "./requirements";
import type { Catalog, CurriculumBlock, Section, UserState } from "./types";

const sec = (courseCode: string, sectionCode: string): Section => ({
  courseCode, sectionCode, title: courseCode, units: 3, instructors: [], modality: "",
  meetings: [], room: "", remarks: "", raw: "",
});

const catalog: Catalog = {
  term: "2026-2", exportedAt: "2026-07-21T00:00:00.000Z", warnings: [],
  sections: [sec("MATH 31.3", "A"), sec("MATH 31.3", "B"), sec("HISTO 12", "A"), sec("MATH 55.1", "A")],
};

const block: CurriculumBlock = {
  year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 9,
  entries: [
    { catNo: "MATH 31.3", title: "MATHEMATICAL ANALYSIS II", units: 3, prerequisites: [], category: "M", isElective: false, slotId: "b#0" },
    { catNo: "HISTO 12", title: "READINGS IN PHILIPPINE HISTORY", units: 3, prerequisites: [], category: "C", isElective: false, slotId: "b#1" },
    { catNo: "PHILO 11", title: "PHILOSOPHY: THE HUMAN CONDITION", units: 3, prerequisites: [], category: "CPH1", isElective: false, slotId: "b#2" },
    { catNo: "MATHEMATICS ELECTIVE", title: "MATHEMATICS ELECTIVE", units: 3, prerequisites: [], category: "RM1", isElective: true, slotId: "b#3" },
  ],
};

function state(over: Partial<UserState> = {}): UserState {
  return {
    version: 2, programId: "BS-AMDSc-2024", blockKey: block.key, calendarTerm: "2026-2",
    requiredCourses: seedRequiredCourses(block), electiveFills: {},
    lockedSections: [], fullSections: [], personalRatings: [],
    preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
    ...over,
  };
}

describe("seedRequiredCourses", () => {
  it("seeds only the real (non-elective) course codes", () => {
    expect(seedRequiredCourses(block)).toEqual(["MATH 31.3", "HISTO 12", "PHILO 11"]);
  });
});

describe("buildRequirementRows", () => {
  it("marks seeded courses selected and counts offered sections", () => {
    const rows = buildRequirementRows(block, state(), catalog);
    const math = rows.find((r) => r.slotId === "b#0")!;
    expect(math).toMatchObject({ courseCode: "MATH 31.3", selected: true, offeredSections: 2 });
  });

  it("flags a required course with no sections this term", () => {
    const philo = buildRequirementRows(block, state(), catalog).find((r) => r.slotId === "b#2")!;
    expect(philo.offeredSections).toBe(0);
    expect(philo.selected).toBe(true); // still selected; UI shows the warning
  });

  it("leaves an unfilled elective with a null course code", () => {
    const elective = buildRequirementRows(block, state(), catalog).find((r) => r.slotId === "b#3")!;
    expect(elective.isElective).toBe(true);
    expect(elective.courseCode).toBeNull();
    expect(elective.filledWith).toBeUndefined();
  });

  it("resolves a filled elective to its concrete course", () => {
    const rows = buildRequirementRows(block, state({ electiveFills: { "b#3": "MATH 55.1" } }), catalog);
    const elective = rows.find((r) => r.slotId === "b#3")!;
    expect(elective.courseCode).toBe("MATH 55.1");
    expect(elective.filledWith).toBe("MATH 55.1");
    expect(elective.offeredSections).toBe(1);
  });

  it("deselects a course dropped from requiredCourses (underload)", () => {
    const rows = buildRequirementRows(block, state({ requiredCourses: ["MATH 31.3"] }), catalog);
    expect(rows.find((r) => r.slotId === "b#1")!.selected).toBe(false);
  });
});

describe("resolveCourseCodes", () => {
  it("returns only selected, resolved, actually-offered courses", () => {
    const rows = buildRequirementRows(block, state({ electiveFills: { "b#3": "MATH 55.1" } }), catalog);
    // PHILO 11 has no sections; the elective resolves to MATH 55.1
    expect(resolveCourseCodes(rows)).toEqual(["MATH 31.3", "HISTO 12", "MATH 55.1"]);
  });
  it("omits an unfilled elective", () => {
    const rows = buildRequirementRows(block, state(), catalog);
    expect(resolveCourseCodes(rows)).toEqual(["MATH 31.3", "HISTO 12"]);
  });
  it("does not return duplicates", () => {
    const rows = buildRequirementRows(block, state({ electiveFills: { "b#3": "MATH 31.3" } }), catalog);
    expect(resolveCourseCodes(rows)).toEqual(["MATH 31.3", "HISTO 12"]);
  });
});

describe("totalUnits", () => {
  it("sums only selected rows", () => {
    const rows = buildRequirementRows(block, state({ requiredCourses: ["MATH 31.3"] }), catalog);
    expect(totalUnits(rows)).toBe(3);
  });
});

describe("extraCourseRows", () => {
  it("surfaces user-added courses that are not part of the block", () => {
    const rows = extraCourseRows(state({ requiredCourses: [...seedRequiredCourses(block), "MATH 55.1"] }), block, catalog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ courseCode: "MATH 55.1", selected: true, offeredSections: 1 });
  });
  it("is empty when nothing extra was added", () => {
    expect(extraCourseRows(state(), block, catalog)).toEqual([]);
  });
});
