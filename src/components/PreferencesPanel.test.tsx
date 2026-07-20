import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreferencesPanel } from "./PreferencesPanel";
import type { Catalog, Section, UserState } from "../lib/types";

const sec = (courseCode: string, sectionCode: string, instructor: string): Section => ({
  courseCode, sectionCode, instructor, title: courseCode, units: 3, meetings: [], room: "", remarks: "", raw: "",
});
const catalog: Catalog = {
  semester: "2026-1", exportedAt: "2026-07-20T00:00:00.000Z", warnings: [],
  sections: [sec("PHILO 11", "A", "GARCIA, JUAN"), sec("CSCI 30", "A", "SY, MARIA")],
};
const baseState: UserState = {
  version: 1, semester: "2026-1", chosenCourses: ["PHILO 11"], lockedSections: [],
  fullSections: [], personalRatings: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
};

afterEach(cleanup);

describe("PreferencesPanel", () => {
  it("checking a criterion appends it in priority order", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Fewest days on campus/));
    expect(onChange).toHaveBeenCalledWith({
      ...baseState,
      preferences: { ...baseState.preferences, criteria: ["compactDays", "fewestDays"] },
    });
  });

  it("unchecking a criterion removes it", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Compact days/));
    expect(onChange).toHaveBeenCalledWith({
      ...baseState,
      preferences: { ...baseState.preferences, criteria: [] },
    });
  });

  it("lists only instructors of chosen courses for rating", () => {
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/GARCIA, JUAN/)).toBeTruthy();
    expect(screen.queryByText(/SY, MARIA/)).toBeNull();
  });

  it("rating a professor adds a personal rating", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/GARCIA, JUAN/), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({
      ...baseState,
      personalRatings: [{ name: "GARCIA, JUAN", rating: 5 }],
    });
  });

  it("adds a protected block", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add protected block"));
    expect(onChange).toHaveBeenCalledWith({
      ...baseState,
      preferences: {
        ...baseState.preferences,
        protectedBlocks: [{ days: ["M"], start: 720, end: 780 }],
      },
    });
  });
});
