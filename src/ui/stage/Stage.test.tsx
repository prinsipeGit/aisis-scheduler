import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Stage } from "./Stage";
import { defaultState } from "../../lib/storage";
import type { Schedules } from "../useSchedules";
import type { CurriculumBlock, Program, Section, Slot } from "../../lib/types";

// scheduleImage.ts renders through the real <canvas> 2D API, which jsdom does not implement.
// The button's click handler is what Stage owns; the rendering itself is scheduleImage's own
// test's responsibility (src/ui/export/scheduleImage.test.ts), so it is mocked here.
vi.mock("../export/scheduleImage", () => ({ downloadScheduleImage: vi.fn() }));
import { downloadScheduleImage } from "../export/scheduleImage";

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

const slot: Slot = {
  id: "added:1", origin: "added", label: "MATH 10", requirement: null, category: null,
  sourceBlock: null, chosen: "MATH 10", pairedWith: null, included: true,
};

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

  it("offers a download of the schedule on screen, for carrying into AISIS", () => {
    render(<Stage schedules={schedules()} index={0} onIndex={() => {}}
                  state={defaultState("2026-1")} block={block} program={program} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /download schedule/i }));
    expect(downloadScheduleImage).toHaveBeenCalledWith(
      [section("MATH 10")],
      { program: "P", block: "First Year / First Semester", term: "2026-1" }
    );
  });

  it("shows the setup checklist before anything is chosen", () => {
    render(<Stage schedules={schedules({ ranked: [] })} index={0} onIndex={() => {}}
                  state={defaultState("2026-1")} block={undefined} program={undefined} onChange={() => {}} />);
    expect(screen.getByText(/Your week appears here/)).toBeTruthy();
    expect(screen.getByText(/Pick your program/)).toBeTruthy();
  });

  it("clamps a stale pager index so the pager agrees with the schedule on screen", () => {
    const threeRanked = [
      { schedule: [section("FIRST 01")], score: 0.5 },
      { schedule: [section("SECOND 02")], score: 0.7 },
      { schedule: [section("THIRD 03")], score: 0.9 },
    ];
    const onIndex = vi.fn();
    render(
      <Stage schedules={schedules({ ranked: threeRanked })} index={10} onIndex={onIndex}
             state={defaultState("2026-1")} block={block} program={program} onChange={() => {}} />
    );
    // The list has only 3 candidates; index 10 is stale (e.g. after a filter edit). The pager
    // must read the clamped position (3 of 3), matching the last candidate shown in the grid.
    const count = document.querySelector(".pager-count");
    expect(count?.textContent).toMatch(/3/);
    expect(count?.textContent).not.toMatch(/11/);
    expect(screen.getAllByText(/THIRD 03/).length).toBeGreaterThan(0);

    // Prev must step back from the clamped position, not the stale raw index.
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(onIndex).toHaveBeenCalledWith(1);
  });

  it("clamps a negative index to the first candidate instead of throwing", () => {
    // Math.min(index, ranked.length - 1) alone never rejects a negative index, so
    // ranked[clampedIndex] becomes ranked[-1] (undefined) and the next property access throws.
    render(
      <Stage schedules={schedules()} index={-3} onIndex={() => {}} state={defaultState("2026-1")}
             block={block} program={program} onChange={() => {}} />
    );
    const count = document.querySelector(".pager-count");
    expect(count?.textContent).toMatch(/01/);
  });

  it("shows a loading state, distinct from 'no schedule fits', while the catalog has not resolved yet", () => {
    render(
      <Stage schedules={schedules({ ranked: [], resolved: [] })} index={0} onIndex={() => {}}
             state={{ ...defaultState("2026-1"), slots: [slot] }} block={block} program={program}
             onChange={() => {}} />
    );
    expect(screen.queryByText(/No schedule fits/)).toBeFalsy();
    expect(screen.getByText(/Loading/)).toBeTruthy();
  });

  it("shows a genuine error state, not the loading text, when the catalog failed to load", () => {
    render(
      <Stage schedules={schedules({ ranked: [], resolved: [] })} index={0} onIndex={() => {}}
             state={{ ...defaultState("2026-1"), slots: [slot] }} block={block} program={program}
             onChange={() => {}} catalogFailed={true} />
    );
    // The banner above already explains what went wrong; the stage must stop claiming data
    // is still on its way, without parroting the banner's own wording.
    expect(screen.queryByText(/Fetching this term's offerings/)).toBeFalsy();
    expect(screen.queryByText(/^Loading your courses/)).toBeFalsy();
    expect(screen.getByText(/didn't load/)).toBeTruthy();
  });
});
