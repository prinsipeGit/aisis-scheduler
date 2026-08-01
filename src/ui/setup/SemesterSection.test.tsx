import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SemesterSection } from "./SemesterSection";
import type { Program } from "../../lib/types";

const program: Program = {
  id: "P", code: "P", name: "P", version: "2024", versionYear: 2024, versionLabel: "2024",
  blocks: [
    { year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 19, entries: [] },
    { year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 21, entries: [] },
  ],
};

const terms = [
  { term: "2026-2", label: "2026-2027 Second Semester", available: false },
  { term: "2026-1", label: "2026-2027 First Semester", available: true },
];

afterEach(cleanup);

describe("SemesterSection", () => {
  it("asks for a program first when none is chosen", () => {
    render(<SemesterSection program={undefined} blockKey="" calendarTerm="2026-1" terms={terms} onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    expect(screen.getByText(/choose a program first/i)).toBeTruthy();
  });

  it("lists blocks with their printed unit totals", () => {
    render(<SemesterSection program={program} blockKey="" calendarTerm="2026-1" terms={terms} onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    expect(screen.getByRole("option", { name: /First Year · First Semester — 19 units/ })).toBeTruthy();
  });

  it("disables terms with no catalog and says why", () => {
    render(<SemesterSection program={program} blockKey="" calendarTerm="2026-1" terms={terms} onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    const unavailable = screen.getByRole("option", { name: /Second Semester — catalog unavailable/ }) as HTMLOptionElement;
    expect(unavailable.disabled).toBe(true);
  });

  it("reports block and term changes", () => {
    const onChangeBlock = vi.fn();
    const onChangeTerm = vi.fn();
    render(<SemesterSection program={program} blockKey="" calendarTerm="2026-1" terms={terms} onChangeBlock={onChangeBlock} onChangeTerm={onChangeTerm} />);
    fireEvent.change(screen.getByLabelText(/curriculum block/i), { target: { value: "Second Year|First Semester" } });
    expect(onChangeBlock).toHaveBeenCalledWith("Second Year|First Semester");

    fireEvent.change(screen.getByLabelText(/calendar term/i), { target: { value: "2026-1" } });
    expect(onChangeTerm).toHaveBeenCalledWith("2026-1");
  });
});
