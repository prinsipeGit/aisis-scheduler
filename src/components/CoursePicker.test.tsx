import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CoursePicker } from "./CoursePicker";
import type { Catalog, Section } from "../lib/types";

const sec = (courseCode: string, sectionCode: string, title: string): Section => ({
  courseCode, sectionCode, title, units: 3, instructor: "TBA", meetings: [], room: "", remarks: "", raw: "",
});
const catalog: Catalog = {
  semester: "2026-1", exportedAt: "2026-07-20T00:00:00.000Z", warnings: [],
  sections: [sec("PHILO 11", "A", "PHILOSOPHY I"), sec("PHILO 11", "B", "PHILOSOPHY I"), sec("CSCI 30", "A", "DATA STRUCTURES")],
};

afterEach(cleanup);

describe("CoursePicker", () => {
  it("lists unique courses with section counts", () => {
    render(<CoursePicker catalog={catalog} chosen={[]} onChange={() => {}} />);
    expect(screen.getByText(/PHILO 11/).textContent).toBeTruthy();
    expect(screen.getByLabelText(/PHILO 11.*2 sections/)).toBeTruthy();
    expect(screen.getByLabelText(/CSCI 30.*1 section\b/)).toBeTruthy();
  });

  it("toggling a course calls onChange with it added", () => {
    const onChange = vi.fn();
    render(<CoursePicker catalog={catalog} chosen={[]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/CSCI 30/));
    expect(onChange).toHaveBeenCalledWith(["CSCI 30"]);
  });

  it("search filters the list", () => {
    render(<CoursePicker catalog={catalog} chosen={[]} onChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search courses…"), { target: { value: "csci" } });
    expect(screen.queryByLabelText(/PHILO 11/)).toBeNull();
    expect(screen.getByLabelText(/CSCI 30/)).toBeTruthy();
  });
});
