import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CourseRequirements } from "./CourseRequirements";
import { seedRequiredCourses } from "../lib/requirements";
import type { Catalog, CurriculumBlock, Section, UserState } from "../lib/types";

const sec = (courseCode: string, sectionCode: string, title = courseCode): Section => ({
  courseCode, sectionCode, title, units: 3, instructors: [], modality: "",
  meetings: [], room: "", remarks: "", raw: "",
});

const catalog: Catalog = {
  term: "2026-2", exportedAt: "2026-07-21T00:00:00.000Z", warnings: [],
  sections: [sec("MATH 31.3", "A"), sec("HISTO 12", "A"), sec("MATH 55.1", "A"), sec("CSCI 112", "A")],
};

const block: CurriculumBlock = {
  year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 12,
  entries: [
    { catNo: "MATH 31.3", title: "MATHEMATICAL ANALYSIS II", units: 3, prerequisites: [], category: "M", isElective: false, slotId: "b#0" },
    { catNo: "HISTO 12", title: "READINGS IN PHILIPPINE HISTORY", units: 3, prerequisites: [], category: "C", isElective: false, slotId: "b#1" },
    { catNo: "PHILO 11", title: "PHILOSOPHY: THE HUMAN CONDITION", units: 3, prerequisites: [], category: "CPH1", isElective: false, slotId: "b#2" },
    { catNo: "MATHEMATICS ELECTIVE", title: "MATHEMATICS ELECTIVE", units: 3, prerequisites: [], category: "RM1", isElective: true, slotId: "b#3" },
  ],
};

const baseState: UserState = {
  version: 2, programId: "P", blockKey: block.key, calendarTerm: "2026-2",
  requiredCourses: seedRequiredCourses(block), electiveFills: {},
  lockedSections: [], fullSections: [], personalRatings: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
};

afterEach(cleanup);

describe("CourseRequirements", () => {
  it("prompts when no block is chosen", () => {
    render(<CourseRequirements block={undefined} catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/choose a program and semester first/i)).toBeTruthy();
  });

  it("lists the block's courses with a running unit total", () => {
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/MATHEMATICAL ANALYSIS II/)).toBeTruthy();
    expect(screen.getByText(/9 units selected/)).toBeTruthy(); // 3 seeded courses x 3 units
  });

  it("warns about a required course with no sections this term", () => {
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/not offered in 2026-2/i)).toBeTruthy();
  });

  it("prompts to fill an unfilled elective", () => {
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/pick a course for this elective/i)).toBeTruthy();
  });

  it("unchecking a course removes it from requiredCourses", () => {
    const onChange = vi.fn();
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/MATH 31\.3/));
    expect((onChange.mock.calls[0][0] as UserState).requiredCourses).not.toContain("MATH 31.3");
  });

  it("filling an elective records the fill and selects the course", () => {
    const onChange = vi.fn();
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/fill MATHEMATICS ELECTIVE/i), { target: { value: "MATH 55.1" } });
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.electiveFills["b#3"]).toBe("MATH 55.1");
    expect(next.requiredCourses).toContain("MATH 55.1");
  });

  it("adding an extra course appends it to requiredCourses", () => {
    const onChange = vi.fn();
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/add another course/i), { target: { value: "CSCI 112" } });
    expect((onChange.mock.calls[0][0] as UserState).requiredCourses).toContain("CSCI 112");
  });

  it("shows a loading note when the catalog is not loaded yet", () => {
    render(<CourseRequirements block={block} catalog={null} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/loading the catalog/i)).toBeTruthy();
  });
});
