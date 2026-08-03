import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PreferencesSection } from "./PreferencesSection";
import { defaultState } from "../../lib/storage";
import type { ResolvedSlot } from "../../lib/slots";
import type { Catalog, Preferences, Section, UserState } from "../../lib/types";

// PreferencesSection is the sole writer of `personalRatings`, `protectedBlocks` and the
// criteria ordering, so every assertion here reads the onChange payload rather than the DOM
// the component happens to render for it.

const catalog: Catalog = { term: "2026-1", exportedAt: "2026-07-28", sections: [], warnings: [] };

const section = (courseCode: string, instructors: string[]): Section => ({
  courseCode, sectionCode: "A", title: courseCode, units: 3, instructors, modality: "",
  meetings: [{ days: ["M"], start: 480, end: 540 }], timeStatus: "scheduled",
  room: "R", remarks: "", raw: "",
});

const resolvedSlot = (sections: Section[], included = true): ResolvedSlot => ({
  slot: {
    id: "added:0", origin: "added", label: "MATH 10", requirement: "MATH 10", category: null,
    sourceBlock: null, chosen: null, pairedWith: null, included,
  },
  sections, allSections: sections, status: "ok", pinned: null,
});

const prefs = (over: Partial<Preferences> = {}): Preferences =>
  ({ ...defaultState("2026-1").preferences, ...over });

// Which tab the controls under test live behind. Set per describe block rather than passed at
// every call site, so the 17 assertions below stay about payloads instead of navigation.
let TAB = "Ranking";

const setup = (over: Partial<UserState> = {}, resolved: ResolvedSlot[] = []) => {
  const state: UserState = { ...defaultState("2026-1"), ...over };
  const onChange = vi.fn();
  render(<PreferencesSection catalog={catalog} state={state} resolved={resolved} onChange={onChange} />);
  fireEvent.click(screen.getByRole("tab", { name: TAB }));
  const written = () => onChange.mock.calls[onChange.mock.calls.length - 1][0] as UserState;
  return { onChange, written };
};

const optionValues = (select: HTMLElement) =>
  within(select).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);

afterEach(cleanup);

describe("PreferencesSection time limits", () => {
  beforeEach(() => { TAB = "Time"; });
  it("offers every hour on both bounds while neither is set", () => {
    setup({ preferences: prefs() });
    // 15 hours (7 AM - 9 PM) plus "any time".
    expect(optionValues(screen.getByLabelText(/no classes before/i))).toHaveLength(16);
    expect(optionValues(screen.getByLabelText(/no classes after/i))).toHaveLength(16);
  });

  it("keeps the earliest start strictly before the latest end", () => {
    // Without this, an inverted range excludes every meeting in generation and the student
    // sees zero schedules with nothing on screen explaining why.
    setup({ preferences: prefs({ latestEnd: 720 }) });
    const values = optionValues(screen.getByLabelText(/no classes before/i)).filter((v) => v !== "");
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => Number(v) < 720)).toBe(true);
  });

  it("keeps the latest end strictly after the earliest start", () => {
    setup({ preferences: prefs({ earliestStart: 1020 }) });
    const values = optionValues(screen.getByLabelText(/no classes after/i)).filter((v) => v !== "");
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => Number(v) > 1020)).toBe(true);
  });

  it("clears either bound back to unset through 'any time'", () => {
    // The only way out of a bound: each select filters the other's options, so without a
    // clear path a narrow pair could never be widened again.
    const both = prefs({ earliestStart: 540, latestEnd: 1080 });
    const first = setup({ preferences: both });
    fireEvent.change(screen.getByLabelText(/no classes before/i), { target: { value: "" } });
    expect(first.written().preferences.earliestStart).toBeUndefined();
    expect(first.written().preferences.latestEnd).toBe(1080);

    cleanup();
    const second = setup({ preferences: both });
    fireEvent.change(screen.getByLabelText(/no classes after/i), { target: { value: "" } });
    expect(second.written().preferences.latestEnd).toBeUndefined();
    expect(second.written().preferences.earliestStart).toBe(540);
  });

  it("writes a chosen bound as minutes from midnight", () => {
    const { written } = setup({ preferences: prefs() });
    fireEvent.change(screen.getByLabelText(/no classes before/i), { target: { value: "540" } });
    expect(written().preferences.earliestStart).toBe(540);
  });
});

describe("PreferencesSection ranking criteria", () => {
  beforeEach(() => { TAB = "Ranking"; });
  it("reorders a criterion without changing the rest", () => {
    const { written } = setup({
      preferences: prefs({ criteria: ["compactDays", "fewestDays", "lateStart"] }),
    });
    fireEvent.click(screen.getByLabelText(/move fewest days on campus up/i));
    expect(written().preferences.criteria).toEqual(["fewestDays", "compactDays", "lateStart"]);
  });

  it("moves a criterion down as well as up", () => {
    const { written } = setup({ preferences: prefs({ criteria: ["compactDays", "fewestDays"] }) });
    fireEvent.click(screen.getByLabelText(/move compact days .* down/i));
    expect(written().preferences.criteria).toEqual(["fewestDays", "compactDays"]);
  });

  it("cannot move the ends of the list off either edge", () => {
    setup({ preferences: prefs({ criteria: ["compactDays", "fewestDays"] }) });
    expect((screen.getByLabelText(/move compact days .* up/i) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/move fewest days on campus down/i) as HTMLButtonElement).disabled).toBe(true);
  });

  it("appends a newly checked criterion and drops an unchecked one", () => {
    const { written } = setup({ preferences: prefs({ criteria: ["compactDays"] }) });
    fireEvent.click(screen.getByRole("checkbox", { name: /earlier ends/i }));
    expect(written().preferences.criteria).toEqual(["compactDays", "earlyEnd"]);

    cleanup();
    const off = setup({ preferences: prefs({ criteria: ["compactDays", "earlyEnd"] }) });
    fireEvent.click(screen.getByRole("checkbox", { name: /compact days/i }));
    expect(off.written().preferences.criteria).toEqual(["earlyEnd"]);
  });
});

describe("PreferencesSection protected time", () => {
  beforeEach(() => { TAB = "Time"; });
  it("adds a protected block with a usable default", () => {
    const { written } = setup({ preferences: prefs() });
    fireEvent.click(screen.getByRole("button", { name: /add protected block/i }));
    expect(written().preferences.protectedBlocks).toEqual([{ days: ["M"], start: 720, end: 780 }]);
  });

  it("removes the block that was asked for, not the last one", () => {
    const blocks: Preferences["protectedBlocks"] = [
      { days: ["M"], start: 720, end: 780 },
      { days: ["W"], start: 900, end: 960 },
    ];
    const { written } = setup({ preferences: prefs({ protectedBlocks: blocks }) });
    fireEvent.click(screen.getAllByRole("button", { name: /^remove$/i })[0]);
    expect(written().preferences.protectedBlocks).toEqual([blocks[1]]);
  });

  it("pushes the end out when a start is moved past it", () => {
    const { written } = setup({
      preferences: prefs({ protectedBlocks: [{ days: ["M"], start: 720, end: 780 }] }),
    });
    fireEvent.change(screen.getByLabelText(/protected block 1 start/i), { target: { value: "1020" } });
    expect(written().preferences.protectedBlocks).toEqual([{ days: ["M"], start: 1020, end: 1080 }]);
  });

  it("edits a block's day in place", () => {
    const { written } = setup({
      preferences: prefs({ protectedBlocks: [{ days: ["M"], start: 720, end: 780 }] }),
    });
    fireEvent.change(screen.getByLabelText(/protected block 1 day/i), { target: { value: "TH" } });
    expect(written().preferences.protectedBlocks).toEqual([{ days: ["TH"], start: 720, end: 780 }]);
  });
});

describe("PreferencesSection professor ratings", () => {
  beforeEach(() => { TAB = "Professors"; });
  const withProf = [resolvedSlot([section("MATH 10", ["DELA CRUZ, JUAN"])])];

  it("writes a rating keyed by both professor and course", () => {
    const { written } = setup({}, withProf);
    fireEvent.change(screen.getByLabelText(/dela cruz, juan/i), { target: { value: "5" } });
    expect(written().personalRatings).toEqual([
      { name: "DELA CRUZ, JUAN", rating: 5, courseCode: "MATH 10" },
    ]);
  });

  it("reads an existing rating back into the picker", () => {
    const rating = { name: "DELA CRUZ, JUAN", rating: 4, courseCode: "MATH 10" };
    setup({ personalRatings: [rating] }, withProf);
    expect((screen.getByLabelText(/dela cruz, juan/i) as HTMLSelectElement).value).toBe("4");
  });

  it("clears a rating back to unrated without disturbing the others", () => {
    const mine = { name: "DELA CRUZ, JUAN", rating: 4, courseCode: "MATH 10" };
    const other = { name: "SANTOS, MARIA", rating: 2, courseCode: "PHYS 10" };
    const { written } = setup({ personalRatings: [mine, other] }, withProf);
    fireEvent.change(screen.getByLabelText(/dela cruz, juan/i), { target: { value: "" } });
    expect(written().personalRatings).toEqual([other]);
  });

  it("lists nobody from a slot the student excluded", () => {
    setup({}, [resolvedSlot([section("MATH 10", ["DELA CRUZ, JUAN"])], false)]);
    expect(screen.getByText(/pick courses first to rate their professors/i)).toBeTruthy();
  });
});
