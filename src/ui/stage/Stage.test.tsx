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

  it("keeps the internal search limit out of the focused one-schedule interface", () => {
    render(<Stage schedules={schedules({ search: { limit: 500, truncated: true } })} index={0}
                  onIndex={() => {}} state={defaultState("2026-1")} block={block}
                  program={program} onChange={() => {}} />);
    expect(screen.queryByText(/showing the first 500 schedules/i)).toBeNull();
    expect(screen.getByRole("button", { name: /no more schedules/i })).toBeTruthy();
  });

  it("offers a download of the schedule on screen, for carrying into AISIS", () => {
    render(<Stage schedules={schedules()} index={0} onIndex={() => {}}
                  state={defaultState("2026-1")} block={block} program={program} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /download photo/i }));
    expect(downloadScheduleImage).toHaveBeenCalledWith(
      [section("MATH 10")],
      { program: "P", block: "First Year / First Semester", term: "2026-1" }
    );
  });

  it("opens calendar export from the semester header and asks for the real class dates", () => {
    render(<Stage schedules={schedules()} index={0} onIndex={() => {}}
                  state={defaultState("2026-1")} block={block} program={program} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /export calendar/i }));
    expect(screen.getByRole("dialog", { name: /export calendar/i })).toBeTruthy();
    expect(screen.getByLabelText(/first day of classes/i)).toBeTruthy();
    expect(screen.getByLabelText(/last day of classes/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /download .ics/i }) as HTMLButtonElement).disabled).toBe(true);
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
    // The list has only 3 candidates; index 10 is stale (e.g. after a filter edit). The controls
    // must read the clamped position, matching the last candidate shown in the grid.
    expect(screen.getByText("Schedule option 3")).toBeTruthy();
    expect(screen.getAllByText(/THIRD 03/).length).toBeGreaterThan(0);

    // Back must step from the clamped position, not the stale raw index.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onIndex).toHaveBeenCalledWith(1);
  });

  it("clamps a negative index to the first candidate instead of throwing", () => {
    // Math.min(index, ranked.length - 1) alone never rejects a negative index, so
    // ranked[clampedIndex] becomes ranked[-1] (undefined) and the next property access throws.
    render(
      <Stage schedules={schedules()} index={-3} onIndex={() => {}} state={defaultState("2026-1")}
             block={block} program={program} onChange={() => {}} />
    );
    expect(screen.getByText("Best schedule")).toBeTruthy();
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

  it("says nothing is selected rather than blaming a schedule that never had candidates", () => {
    // Every slot is unchecked, so there is no candidate set at all. "No schedule fits" would
    // send the student off loosening filters that are not the problem, and an empty
    // `missing` list leaves nothing else on screen to explain it.
    const resolved = [
      { slot: { id: "a", label: "MATH 10", included: false }, sections: [], allSections: [],
        status: "ok", pinned: null },
    ] as unknown as Schedules["resolved"];
    render(
      <Stage schedules={schedules({ ranked: [], resolved })} index={0} onIndex={() => {}}
             state={{ ...defaultState("2026-1"), slots: [slot] }} block={block} program={program}
             onChange={() => {}} />
    );
    expect(screen.queryByText(/No schedule fits/)).toBeFalsy();
    expect(screen.getByText(/Nothing to schedule yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /download photo/i })).toBeNull();
  });

  it("still says what is missing when every included course is unschedulable", () => {
    const resolved = [
      { slot: { id: "a", label: "THESIS 200", included: true }, sections: [], allSections: [],
        status: "no-offerings", pinned: null },
    ] as unknown as Schedules["resolved"];
    render(
      <Stage schedules={schedules({ ranked: [], resolved })} index={0} onIndex={() => {}}
             state={{ ...defaultState("2026-1"), slots: [slot] }} block={block} program={program}
             onChange={() => {}} />
    );
    expect(screen.getByText(/Nothing to schedule yet/)).toBeTruthy();
    expect(screen.getByText(/THESIS 200.*not offered/)).toBeTruthy();
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
