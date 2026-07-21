import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreferencesPanel } from "./PreferencesPanel";
import type { Catalog, Section, UserState } from "../lib/types";

const sec = (courseCode: string, sectionCode: string, instructors: string[]): Section => ({
  courseCode, sectionCode, instructors, modality: "FULLY ONSITE",
  title: courseCode, units: 3, meetings: [], room: "", remarks: "", raw: "",
});
const catalog: Catalog = {
  term: "2026-2", exportedAt: "2026-07-21T00:00:00.000Z", warnings: [],
  sections: [
    sec("PHILO 11", "A", ["GARCIA, JUAN"]),
    sec("PHILO 11", "B", ["DE LOS SANTOS, Kurt Anthony", "MIJARES, Jim Ralphealo"]),
    sec("CSCI 30", "A", ["SY, MARIA"]),
  ],
};
const baseState: UserState = {
  version: 2, programId: "P", blockKey: "B", calendarTerm: "2026-2",
  requiredCourses: ["PHILO 11"], electiveFills: {},
  lockedSections: [], fullSections: [], personalRatings: [],
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

  it("lists every instructor of the chosen courses, including co-teachers", () => {
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/GARCIA, JUAN/)).toBeTruthy();
    expect(screen.getByText(/MIJARES, Jim Ralphealo/)).toBeTruthy();
    expect(screen.queryByText(/SY, MARIA/)).toBeNull(); // CSCI 30 is not in requiredCourses
  });

  it("rating a professor stores it scoped to the course, 0-5", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/GARCIA, JUAN.*PHILO 11/), { target: { value: "5" } });
    expect((onChange.mock.calls[0][0] as UserState).personalRatings).toEqual([
      { name: "GARCIA, JUAN", rating: 5, courseCode: "PHILO 11" },
    ]);
  });

  it("accepts a 0-star rating", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/GARCIA, JUAN.*PHILO 11/), { target: { value: "0" } });
    expect((onChange.mock.calls[0][0] as UserState).personalRatings[0].rating).toBe(0);
  });

  it("choosing 'unrated' removes the entry", () => {
    const onChange = vi.fn();
    const rated: UserState = {
      ...baseState,
      personalRatings: [{ name: "GARCIA, JUAN", rating: 4, courseCode: "PHILO 11" }],
    };
    render(<PreferencesPanel catalog={catalog} state={rated} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/GARCIA, JUAN.*PHILO 11/), { target: { value: "" } });
    expect((onChange.mock.calls[0][0] as UserState).personalRatings).toEqual([]);
  });

  it("says so when the catalog has not loaded", () => {
    render(<PreferencesPanel catalog={null} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/loading the catalog/i)).toBeTruthy();
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

  it("lists excluded sections with a Restore button that clears just that one", () => {
    const onChange = vi.fn();
    const excludedState: UserState = {
      ...baseState,
      preferences: { ...baseState.preferences, excludedSections: ["PHILO 11 A"] },
    };
    render(<PreferencesPanel catalog={catalog} state={excludedState} onChange={onChange} />);
    expect(screen.getByText(/PHILO 11 A/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(onChange).toHaveBeenCalledWith({
      ...excludedState,
      preferences: { ...excludedState.preferences, excludedSections: [] },
    });
  });
});
