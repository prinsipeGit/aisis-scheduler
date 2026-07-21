import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Results } from "./Results";
import { mergeRatings } from "../lib/profs";
import type { Catalog, Meeting, Section, UserState } from "../lib/types";

const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });
const sec = (courseCode: string, sectionCode: string, meetings: Meeting[], instructors: string[] = ["GARCIA, JUAN"], modality = "FULLY ONSITE"): Section => ({
  courseCode, sectionCode, meetings, instructors, modality,
  title: courseCode, units: 3, room: "CTC 102", remarks: "", raw: "",
});
const catalog: Catalog = {
  term: "2026-2", exportedAt: "2026-07-21T00:00:00.000Z", warnings: [],
  sections: [
    sec("PHILO 11", "A", [m(["M", "TH"], 480, 570)]),
    sec("PHILO 11", "B", [m(["T", "F"], 660, 750)]),
    sec("CSCI 30", "A", [m(["M", "TH"], 570, 660)]),
  ],
};
const baseState: UserState = {
  version: 2, programId: "P", blockKey: "B", calendarTerm: "2026-2",
  requiredCourses: ["PHILO 11", "CSCI 30"], electiveFills: {},
  lockedSections: [], fullSections: [], personalRatings: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
};
const noRatings = mergeRatings([], []);

afterEach(cleanup);

describe("Results", () => {
  it("renders ranked schedules", () => {
    render(<Results catalog={catalog} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/2 candidate schedule/)).toBeTruthy();
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
    render(<Results catalog={catalog} state={{ ...baseState, requiredCourses: [] }} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/Pick courses first/)).toBeTruthy();
  });

  it("explains an N-way conflict when every pair fits but no triple does", () => {
    const P = m(["M"], 480, 540);
    const Q = m(["M"], 540, 600);
    const nWay: Catalog = {
      ...catalog,
      sections: [
        sec("PHILO 11", "A", [P]),
        sec("PHILO 11", "B", [Q]),
        sec("CSCI 30", "A", [P]),
        sec("CSCI 30", "B", [Q]),
        sec("MATH 21", "A", [P]),
        sec("MATH 21", "B", [Q]),
      ],
    };
    render(
      <Results
        catalog={nWay}
        state={{ ...baseState, requiredCourses: ["PHILO 11", "CSCI 30", "MATH 21"] }}
        ratings={noRatings}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/No valid schedule found/)).toBeTruthy();
    expect(
      screen.getByText(/These courses can't all fit together at once, even though each pair can/)
    ).toBeTruthy();
  });

  it("shows all instructors of a section", () => {
    const pair: Catalog = { ...catalog, sections: [
      sec("PHILO 11", "A", [m(["M"], 480, 570)], ["DE LOS SANTOS, Kurt Anthony", "MIJARES, Jim Ralphealo"]),
      sec("CSCI 30", "A", [m(["T"], 480, 570)]),
    ]};
    render(<Results catalog={pair} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/DE LOS SANTOS, Kurt Anthony, MIJARES, Jim Ralphealo/)).toBeTruthy();
  });

  it("flags an online section", () => {
    const online: Catalog = { ...catalog, sections: [
      sec("PHILO 11", "A", [m(["M"], 480, 570)], ["SANTOS, ANA"], "ONLINE"),
      sec("CSCI 30", "A", [m(["T"], 480, 570)]),
    ]};
    render(<Results catalog={online} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getAllByText(/ONLINE/).length).toBeGreaterThan(0);
  });

  it("shows the total units of a schedule", () => {
    render(<Results catalog={catalog} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getAllByText(/6 units/).length).toBeGreaterThan(0);
  });

  it("explains when no selected course is offered instead of showing an empty candidate", () => {
    // Both courses resolve to zero sections, so the engine would otherwise be
    // handed an empty course list and emit a single empty "schedule".
    render(
      <Results
        catalog={catalog}
        state={{ ...baseState, requiredCourses: ["ZERO 1", "ZERO 2"] }}
        ratings={noRatings}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/none of your selected courses are offered/i)).toBeTruthy();
    expect(screen.queryByText(/candidate/)).toBeNull();
  });

  it("still yields schedules when a required course has zero sections in the catalog", () => {
    // "ZERO 1" is required but not offered this term (0 sections in `catalog`).
    // It must not reach the generator and block the courses that ARE offered.
    render(
      <Results
        catalog={catalog}
        state={{ ...baseState, requiredCourses: ["PHILO 11", "CSCI 30", "ZERO 1"] }}
        ratings={noRatings}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/candidate schedule\(s\), ranked best first/)).toBeTruthy();
  });
});
