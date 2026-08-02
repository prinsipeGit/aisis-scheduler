import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Stage } from "./Stage";
import { defaultState } from "../../lib/storage";
import type { Schedules } from "../useSchedules";
import type { CurriculumBlock, Program, Section } from "../../lib/types";

// downloadScheduleImage / src/ui/export/scheduleImage.ts is Task 15's deliverable and does not
// exist yet. Stage.tsx therefore has no "Download schedule" button in this task (see task-13-report
// for the resequencing rationale, matching Task 9's App.tsx/Task 9b precedent) — nothing here needs
// to mock that module.

const section = (code: string): Section => ({
  courseCode: code, sectionCode: "1", title: code, units: 3, instructors: [], modality: "",
  meetings: [{ days: ["M"], start: 480, end: 540 }], timeStatus: "scheduled",
  room: "R", remarks: "", raw: "",
});

const block: CurriculumBlock = {
  year: "First Year", term: "First Semester", key: "First Year|First Semester",
  totalUnits: 19, entries: [],
};
const program: Program = {
  id: "P", code: "P", name: "P", version: "2024", versionYear: 2024, versionLabel: "2024", blocks: [block],
};

const schedules = (over: Partial<Schedules> = {}): Schedules => ({
  resolved: [], ranked: [{ schedule: [section("MATH 10")], score: 0.9 }],
  diagnostics: null, search: { limit: 500, truncated: false }, ...over,
});

afterEach(cleanup);

describe("Stage", () => {
  it("lists required classes the schedule does not include, with the reason", () => {
    const resolved = [
      { slot: { id: "a", label: "INTACT 11", included: true }, sections: [], allSections: [],
        status: "awaiting-section", pinned: null },
      { slot: { id: "b", label: "MATH 51.1", included: true }, sections: [], allSections: [],
        status: "no-offerings", pinned: null },
    ] as unknown as Schedules["resolved"];
    render(<Stage schedules={schedules({ resolved })} index={0} onIndex={() => {}}
                  state={defaultState("2026-1")} block={block} program={program} onChange={() => {}} />);
    expect(screen.getByText(/Not in this schedule/)).toBeTruthy();
    expect(screen.getByText(/INTACT 11.*pre-assigned/)).toBeTruthy();
    expect(screen.getByText(/MATH 51.1.*not offered/)).toBeTruthy();
  });

  it("announces truncation", () => {
    render(<Stage schedules={schedules({ search: { limit: 500, truncated: true } })} index={0}
                  onIndex={() => {}} state={defaultState("2026-1")} block={block}
                  program={program} onChange={() => {}} />);
    expect(screen.getByText(/hit its 500-schedule limit/)).toBeTruthy();
  });

  it("shows the setup checklist before anything is chosen", () => {
    render(<Stage schedules={schedules({ ranked: [] })} index={0} onIndex={() => {}}
                  state={defaultState("2026-1")} block={undefined} program={undefined} onChange={() => {}} />);
    expect(screen.getByText(/Your week appears here/)).toBeTruthy();
    expect(screen.getByText(/Pick your program/)).toBeTruthy();
  });
});
