import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Results } from "./Results";
import { mergeRatings } from "../lib/profs";
import type { Catalog, Meeting, Section, UserState } from "../lib/types";

const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });
const sec = (courseCode: string, sectionCode: string, meetings: Meeting[]): Section => ({
  courseCode, sectionCode, meetings, title: courseCode, units: 3, instructor: "GARCIA, JUAN",
  room: "CTC 102", remarks: "", raw: "",
});
const catalog: Catalog = {
  semester: "2026-1", exportedAt: "2026-07-20T00:00:00.000Z", warnings: [],
  sections: [
    sec("PHILO 11", "A", [m(["M", "TH"], 480, 570)]),
    sec("PHILO 11", "B", [m(["T", "F"], 660, 750)]),
    sec("CSCI 30", "A", [m(["M", "TH"], 570, 660)]),
  ],
};
const baseState: UserState = {
  version: 1, semester: "2026-1", chosenCourses: ["PHILO 11", "CSCI 30"], lockedSections: [],
  fullSections: [], personalRatings: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
};
const noRatings = mergeRatings([], []);

afterEach(cleanup);

describe("Results", () => {
  it("renders ranked schedules", () => {
    render(<Results catalog={catalog} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/2 valid schedule/)).toBeTruthy();
  });

  it("Mark full adds the section to fullSections", () => {
    const onChange = vi.fn();
    render(<Results catalog={catalog} state={baseState} ratings={noRatings} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Mark full" })[0]);
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.fullSections).toHaveLength(1);
  });

  it("Lock adds the section to lockedSections", () => {
    const onChange = vi.fn();
    render(<Results catalog={catalog} state={baseState} ratings={noRatings} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Lock" })[0]);
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.lockedSections).toHaveLength(1);
  });

  it("shows diagnostics when no schedule exists", () => {
    const impossible: Catalog = {
      ...catalog,
      sections: [
        sec("PHILO 11", "A", [m(["M"], 480, 570)]),
        sec("CSCI 30", "A", [m(["M"], 480, 570)]),
      ],
    };
    render(<Results catalog={impossible} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/No valid schedule found/)).toBeTruthy();
    expect(screen.getByText(/PHILO 11 and CSCI 30 always conflict/)).toBeTruthy();
  });

  it("prompts to pick courses when none are chosen", () => {
    render(<Results catalog={catalog} state={{ ...baseState, chosenCourses: [] }} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/Pick courses first/)).toBeTruthy();
  });
});
