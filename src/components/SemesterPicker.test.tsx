import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SemesterPicker } from "./SemesterPicker";
import type { Program } from "../lib/types";

const program: Program = {
  id: "P", code: "P", name: "PROG", version: "2024", versionYear: 2024, versionLabel: "2024",
  blocks: [
    { year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 20, entries: [] },
    { year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 22, entries: [] },
  ],
};
const terms = [
  { term: "2026-2", label: "2026-2027 Second Semester" },
  { term: "2026-1", label: "2026-2027 First Semester" },
];

afterEach(cleanup);

describe("SemesterPicker", () => {
  it("lists curriculum blocks by year and term with unit totals", () => {
    render(<SemesterPicker program={program} blockKey="" calendarTerm="2026-2" terms={terms}
      onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    expect(screen.getByText(/Second Year · First Semester.*22/)).toBeTruthy();
  });

  it("choosing a block calls onChangeBlock with its key", () => {
    const onChangeBlock = vi.fn();
    render(<SemesterPicker program={program} blockKey="" calendarTerm="2026-2" terms={terms}
      onChangeBlock={onChangeBlock} onChangeTerm={() => {}} />);
    fireEvent.change(screen.getByLabelText(/curriculum block/i), { target: { value: "Second Year|First Semester" } });
    expect(onChangeBlock).toHaveBeenCalledWith("Second Year|First Semester");
  });

  it("choosing a calendar term calls onChangeTerm", () => {
    const onChangeTerm = vi.fn();
    render(<SemesterPicker program={program} blockKey="" calendarTerm="2026-2" terms={terms}
      onChangeBlock={() => {}} onChangeTerm={onChangeTerm} />);
    fireEvent.change(screen.getByLabelText(/calendar term/i), { target: { value: "2026-1" } });
    expect(onChangeTerm).toHaveBeenCalledWith("2026-1");
  });

  it("prompts to pick a program first when none is selected", () => {
    render(<SemesterPicker program={undefined} blockKey="" calendarTerm="2026-2" terms={terms}
      onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    expect(screen.getByText(/choose a program first/i)).toBeTruthy();
  });
});
