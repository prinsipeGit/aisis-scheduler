import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProgramPicker } from "./ProgramPicker";
import type { ProgramSummary } from "../lib/types";

const programs: ProgramSummary[] = [
  { id: "BS-AMDSc-2024", code: "BS AMDSc-M DSc", name: "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS", versionYear: 2024 },
  { id: "BS-CS-2024", code: "BS CS", name: "BACHELOR OF SCIENCE IN COMPUTER SCIENCE", versionYear: 2024 },
];

afterEach(cleanup);

describe("ProgramPicker", () => {
  it("lists programs with code and version year", () => {
    render(<ProgramPicker programs={programs} selectedId="" onSelect={() => {}} />);
    expect(screen.getByText(/BS AMDSc-M DSc.*2024/)).toBeTruthy();
  });

  it("selecting a program calls onSelect with its id", () => {
    const onSelect = vi.fn();
    render(<ProgramPicker programs={programs} selectedId="" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText(/program/i), { target: { value: "BS-CS-2024" } });
    expect(onSelect).toHaveBeenCalledWith("BS-CS-2024");
  });

  it("filters the list by search text", () => {
    render(<ProgramPicker programs={programs} selectedId="" onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/search programs/i), { target: { value: "computer" } });
    expect(screen.queryAllByText(/APPLIED MATHEMATICS/)).toHaveLength(0);
    // matches twice: once in the <select>'s <option>, once in the preview <ul>'s <li>
    expect(screen.getAllByText(/COMPUTER SCIENCE/)).toHaveLength(2);
  });
});
