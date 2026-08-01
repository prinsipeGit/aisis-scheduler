import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { CoursesSection } from "./CoursesSection";
import { seedSlots, resolveSlots } from "../../lib/slots";
import { defaultState } from "../../lib/storage";
import type { AliasFile } from "../../lib/offerings";
import type { Catalog, CurriculumBlock, Program, UserState } from "../../lib/types";

const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8")) as Catalog;
const aliases = JSON.parse(readFileSync("data/course-aliases.json", "utf8")) as AliasFile;

const entry = (catNo: string, category: string, i: number, isElective = false) => ({
  catNo, title: catNo, units: 3, prerequisites: [], category, isElective,
  slotId: `First Year|First Semester#${i}`,
});
const block: CurriculumBlock = {
  year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 19,
  entries: [entry("MATH 10", "C", 0), entry("PATHFit 3", "PFT3", 1), entry("FREE ELECTIVE", "FE1", 2, true)],
};
const other: CurriculumBlock = {
  year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 21,
  entries: [{ ...entry("PHILO 11", "CPH1", 0), slotId: "Second Year|First Semester#0" }],
};
const program: Program = {
  id: "P", code: "P", name: "P", version: "2024", versionYear: 2024, versionLabel: "2024",
  blocks: [block, other],
};

const setup = (slots = seedSlots(block, aliases)) => {
  const state: UserState = { ...defaultState("2026-1"), blockKey: block.key, slots };
  const onChange = vi.fn();
  const resolved = resolveSlots(state.slots, catalog, aliases, state.lockedSections);
  render(
    <CoursesSection program={program} block={block} catalog={catalog}
      state={state} resolved={resolved} aliases={aliases} onChange={onChange} />
  );
  return { onChange };
};

afterEach(cleanup);

describe("CoursesSection", () => {
  it("compares selected units against the block's own printed total", () => {
    setup();
    expect(screen.getByText(/this block is 19/i)).toBeTruthy();
  });

  it("offers a narrowing picker listing activity titles for a multi-code slot", () => {
    setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#1");
    const picker = within(row).getByLabelText(/narrow/i);
    expect(within(picker).getByRole("option", { name: /any . let the scheduler choose/i })).toBeTruthy();
    expect(within(picker).getByRole("option", { name: /TAI CHI/i })).toBeTruthy();
  });

  it("does not offer a narrowing picker for a single-code slot", () => {
    setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#0");
    expect(within(row).queryByLabelText(/narrow/i)).toBeNull();
  });

  it("narrowing writes chosen onto that slot only", () => {
    const { onChange } = setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#1");
    fireEvent.change(within(row).getByLabelText(/narrow/i), { target: { value: "PEPC 13.15" } });
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.slots.find((s) => s.category === "PFT3")?.chosen).toBe("PEPC 13.15");
    expect(next.slots.find((s) => s.category === "C")?.chosen).toBeNull();
  });

  it("toggling a slot off keeps its chosen value", () => {
    const slots = seedSlots(block, aliases).map((s) =>
      s.category === "PFT3" ? { ...s, chosen: "PEPC 13.15" } : s);
    const { onChange } = setup(slots);
    const row = screen.getByTestId("slot-ips:First Year|First Semester#1");
    fireEvent.click(within(row).getByRole("checkbox"));
    const next = onChange.mock.calls[0][0] as UserState;
    const pft = next.slots.find((s) => s.category === "PFT3")!;
    expect(pft.included).toBe(false);
    expect(pft.chosen).toBe("PEPC 13.15");
  });

  it("adds a requirement from another block, carrying its category", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/add from my curriculum/i), {
      target: { value: "Second Year|First Semester#0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add requirement/i }));
    const next = onChange.mock.calls[0][0] as UserState;
    const added = next.slots.find((s) => s.requirement === "PHILO 11")!;
    expect(added.category).toBe("CPH1");
    expect(added.sourceBlock).toBe("Second Year|First Semester");
  });

  it("adds a bare course from the catalog", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/add from the catalog/i), { target: { value: "MATH 71.1" } });
    fireEvent.click(screen.getByRole("button", { name: /add course/i }));
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.slots.find((s) => s.requirement === "MATH 71.1")).toMatchObject({
      origin: "added", category: null, sourceBlock: null,
    });
  });

  it("labels a pre-assigned slot as awaiting a section, not as unavailable", () => {
    const withIntact: CurriculumBlock = {
      ...block, entries: [...block.entries, entry("INTACT 11", "C", 3)],
    };
    const state: UserState = {
      ...defaultState("2026-1"), blockKey: block.key, slots: seedSlots(withIntact, aliases),
    };
    render(
      <CoursesSection program={program} block={withIntact} catalog={catalog} state={state}
        resolved={resolveSlots(state.slots, catalog, aliases, [])} aliases={aliases} onChange={vi.fn()} />
    );
    expect(screen.getAllByText(/pre-assigned/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/not offered this term/i)).toBeNull();
  });
});
