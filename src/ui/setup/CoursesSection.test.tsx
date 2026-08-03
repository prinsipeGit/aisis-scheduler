import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { CoursesSection } from "./CoursesSection";
import { seedSlots, resolveSlots, slotFromCatalog, type ResolvedSlot } from "../../lib/slots";
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

// A minimal two-entry block (no elective) for the id-collision regression: it seeds exactly
// two ips slots, so a buggy `added:${state.slots.length}` derivation and a correct
// free-index scan diverge visibly once one added slot is removed and another is added.
const twoEntryBlock: CurriculumBlock = {
  year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 6,
  entries: [entry("MATH 10", "C", 0), entry("PATHFit 3", "PFT3", 1)],
};

// Feeds onChange back into state so a real add/add/remove/add sequence can be driven through
// the DOM, the way it would in the running app - a mocked one-shot onChange cannot expose the
// id-collision bug because it never re-renders with the previous add already applied.
function StatefulHarness({ initialSlots }: { initialSlots: UserState["slots"] }) {
  const [state, setState] = useState<UserState>({
    ...defaultState("2026-1"), blockKey: twoEntryBlock.key, slots: initialSlots,
  });
  const resolved = resolveSlots(state.slots, catalog, aliases, state.lockedSections);
  return (
    <CoursesSection program={program} block={twoEntryBlock} catalog={catalog}
      state={state} resolved={resolved} aliases={aliases} onChange={setState} />
  );
}

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

  it("computes the selected total from the included slots' own units, not a placeholder", () => {
    // MATH 10 (3 units) and PATHFit 3 (3 units) are included by default; the FREE
    // ELECTIVE entry starts unfilled and excluded, so it must not contribute.
    setup();
    expect(screen.getByText(/^6 units selected$/i)).toBeTruthy();
  });

  it("flags an overload when selected units exceed the block's own plan", () => {
    const overBlock: CurriculumBlock = { ...block, totalUnits: 5 };
    const state: UserState = {
      ...defaultState("2026-1"), blockKey: overBlock.key, slots: seedSlots(block, aliases),
    };
    render(
      <CoursesSection program={program} block={overBlock} catalog={catalog} state={state}
        resolved={resolveSlots(state.slots, catalog, aliases, [])} aliases={aliases} onChange={vi.fn()} />
    );
    expect(screen.getByText(/above what this block plans for/i)).toBeTruthy();
  });

  it("hints when under the block's planned load", () => {
    // Default seeded selection (6 units) is below this block's printed total (19).
    setup();
    expect(screen.getByText(/below this block's planned load/i)).toBeTruthy();
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

  it("does not add a slot when the typed catalog code resolves to no sections at all", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/add from the catalog/i), { target: { value: "ZZZZ 999" } });
    fireEvent.click(screen.getByRole("button", { name: /add course/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts a requirement-style code that only resolves through catalog variant suffixes", () => {
    // "NSTP 11" never appears verbatim in the catalog - only "NSTP 11(CWTS)" and
    // "NSTP 11(ROTC)" do - but it genuinely resolves via acceptableCodes' variant-suffix
    // rule, so the guard must accept it rather than testing literal catalog membership.
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/add from the catalog/i), { target: { value: "NSTP 11" } });
    fireEvent.click(screen.getByRole("button", { name: /add course/i }));
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.slots.find((s) => s.requirement === "NSTP 11")).toMatchObject({
      origin: "added", category: null, sourceBlock: null,
    });
  });

  it("wires the add-course control to a free-text input backed by the catalog datalist", () => {
    setup();
    const input = screen.getByLabelText(/add from the catalog/i) as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("list")).toBe("catalog-codes");
    const datalist = document.getElementById("catalog-codes");
    expect(datalist).not.toBeNull();
    expect(datalist!.tagName).toBe("DATALIST");
    // MATH 71.1 is a real code in the fixture catalog; its <option> must be present so the
    // browser's native autocomplete actually offers it.
    expect(datalist!.querySelector('option[value="MATH 71.1"]')).not.toBeNull();
  });

  it("gives every added slot a distinct id across add, add, remove, add (regression)", () => {
    render(<StatefulHarness initialSlots={seedSlots(twoEntryBlock, aliases)} />);
    const catalogInput = () => screen.getByLabelText(/add from the catalog/i);
    const addButton = () => screen.getByRole("button", { name: /add course/i });

    fireEvent.change(catalogInput(), { target: { value: "MATH 71.1" } });
    fireEvent.click(addButton());

    fireEvent.change(catalogInput(), { target: { value: "NSTP 11" } });
    fireEvent.click(addButton());

    // Remove the FIRST added slot (MATH 71.1). This frees its id while a later id (NSTP 11's)
    // stays taken - the arrangement that exposes a length-based derivation, since the freed
    // index is not the most recently handed-out one.
    const mathRow = screen.getByText("MATH 71.1").closest("li")!;
    fireEvent.click(within(mathRow).getByRole("button", { name: /remove/i }));

    fireEvent.change(catalogInput(), { target: { value: "PHILO 11" } });
    fireEvent.click(addButton());

    const items = screen.getAllByRole("listitem");
    const ids = items.map((li) => li.getAttribute("data-testid"));
    expect(ids).toHaveLength(4); // 2 seeded ips slots + NSTP 11 + PHILO 11
    expect(new Set(ids).size).toBe(4);
  });

  it("prices an added course by its resolved units even when the typed code only differs in case from the catalog", () => {
    // Baseline for twoEntryBlock is 6 units (MATH 10 + PATHFit 3, 3 units each, both
    // included by default). "math 71.1" is not a literal key in any units map - the
    // catalog spells it "MATH 71.1" - but it genuinely resolves to 3 real sections (each
    // 3 units, verified against data/catalogs/catalog-2026-1.json), so the total must
    // grow to 9, not stay at 6.
    render(<StatefulHarness initialSlots={seedSlots(twoEntryBlock, aliases)} />);
    fireEvent.change(screen.getByLabelText(/add from the catalog/i), { target: { value: "math 71.1" } });
    fireEvent.click(screen.getByRole("button", { name: /add course/i }));
    expect(screen.getByText(/^9 units selected$/i)).toBeTruthy();
  });

  it("prices an added course through what it resolves to when it is a variant base with no literal catalog match", () => {
    // "MATH 71" never appears as a catNo or a catalog courseCode - only "MATH 71.1" and
    // "MATH 71.3" do (both 3 units, verified against the catalog fixture) - yet it resolves
    // via acceptableCodes' variant-suffix rule. It must price at 3 units, not 0.
    render(<StatefulHarness initialSlots={seedSlots(twoEntryBlock, aliases)} />);
    fireEvent.change(screen.getByLabelText(/add from the catalog/i), { target: { value: "MATH 71" } });
    fireEvent.click(screen.getByRole("button", { name: /add course/i }));
    expect(screen.getByText(/^9 units selected$/i)).toBeTruthy();
  });

  it("removes an added course slot", () => {
    const slots = [...seedSlots(block, aliases), slotFromCatalog("MATH 71.1", 0)];
    const { onChange } = setup(slots);
    const row = screen.getByTestId("slot-added:0");
    fireEvent.click(within(row).getByRole("button", { name: /remove/i }));
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.slots.find((s) => s.id === "added:0")).toBeUndefined();
  });

  it("does not write a partial value while typing into an elective's Fill input", () => {
    const { onChange } = setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#2");
    fireEvent.change(within(row).getByLabelText(/fill/i), { target: { value: "MATH 71" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fills an elective once the typed value matches a real catalog code", () => {
    const { onChange } = setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#2");
    fireEvent.change(within(row).getByLabelText(/fill/i), { target: { value: "MATH 71.1" } });
    const next = onChange.mock.calls[0][0] as UserState;
    const elective = next.slots.find((s) => s.category === "FE1")!;
    expect(elective.chosen).toBe("MATH 71.1");
    expect(elective.included).toBe(true);
  });

  it("clears a filled elective's chosen course back to null when the Fill input is emptied", () => {
    const slots = seedSlots(block, aliases).map((s) =>
      s.category === "FE1" ? { ...s, chosen: "MATH 71.1", included: true } : s);
    const { onChange } = setup(slots);
    const row = screen.getByTestId("slot-ips:First Year|First Semester#2");
    fireEvent.change(within(row).getByLabelText(/fill/i), { target: { value: "" } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as UserState;
    const elective = next.slots.find((s) => s.category === "FE1")!;
    expect(elective.chosen).toBeNull();
  });

  it("refuses to fill an elective with a course another slot already claims", () => {
    // Two slots on one course would enlist the student twice, double-count the units, and
    // (since generation now rejects a duplicate) cost a course from every schedule.
    const { onChange } = setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#2");
    fireEvent.change(within(row).getByLabelText(/fill/i), { target: { value: "MATH 10" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(within(row).getByText(/already on your list/i)).toBeTruthy();
  });

  it("refuses to narrow a slot onto a course another slot already claims", () => {
    const slots = [...seedSlots(block, aliases), slotFromCatalog("PEPC 13.15", 0)];
    const { onChange } = setup(slots);
    const row = screen.getByTestId("slot-ips:First Year|First Semester#1");
    fireEvent.change(within(row).getByLabelText(/narrow/i), { target: { value: "PEPC 13.15" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(within(row).getByText(/already on your list/i)).toBeTruthy();
  });

  it("refuses to add a catalog course a filled elective already claims", () => {
    // The old dedupe compared `requirement` only, and a filled elective's requirement is
    // null, so the same course passed straight through.
    const slots = seedSlots(block, aliases).map((s) =>
      s.category === "FE1" ? { ...s, chosen: "MATH 71.1", included: true } : s);
    const { onChange } = setup(slots);
    fireEvent.change(screen.getByLabelText(/add from the catalog/i), { target: { value: "MATH 71.1" } });
    fireEvent.click(screen.getByRole("button", { name: /add course/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/already on your list/i)).toBeTruthy();
  });

  it("lets a cross-block requirement be removed again", () => {
    // Adding the wrong one is otherwise a one-way door: unchecking leaves it on the list
    // forever, and re-picking the block wipes every other customization.
    const slots = [...seedSlots(block, aliases), ...seedSlots(other, aliases)];
    const { onChange } = setup(slots);
    const row = screen.getByTestId("slot-ips:Second Year|First Semester#0");
    fireEvent.click(within(row).getByRole("button", { name: /remove/i }));
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.slots.some((s) => s.requirement === "PHILO 11")).toBe(false);
  });

  it("offers no Remove for a slot seeded by the block on screen", () => {
    setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#0");
    expect(within(row).queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("prices a pinned slot by the section that is pinned, not by its first candidate", () => {
    // "BIO 11" resolves to a 3-unit BIO 11.01 lecture and a 1-unit BIO 11.02 lab. Pinning
    // the lab narrows `sections` to it, so the row must price at 1 unit, not 3.
    const lab = catalog.sections.find((s) => s.courseCode === "BIO 11.02")!;
    const key = `${lab.courseCode} ${lab.sectionCode}`;
    const slots = [...seedSlots(twoEntryBlock, aliases), slotFromCatalog("BIO 11", 0)];
    const state: UserState = {
      ...defaultState("2026-1"), blockKey: twoEntryBlock.key, slots, lockedSections: [key],
    };
    render(
      <CoursesSection program={program} block={twoEntryBlock} catalog={catalog} state={state}
        resolved={resolveSlots(slots, catalog, aliases, [key])} aliases={aliases} onChange={vi.fn()} />
    );
    expect(screen.getByText(/^7 units selected$/i)).toBeTruthy();
  });

  it("reports a slot with no offerings this term instead of hiding it", () => {
    const slots = seedSlots(block, aliases);
    const state: UserState = { ...defaultState("2026-1"), blockKey: block.key, slots };
    const resolved = resolveSlots(state.slots, catalog, aliases, state.lockedSections);
    const noOfferings: ResolvedSlot = {
      slot: {
        id: "added:0", origin: "added", label: "ZZZZ 999", requirement: "ZZZZ 999",
        category: null, sourceBlock: null, chosen: null, pairedWith: null, included: true,
      },
      sections: [], allSections: [], status: "no-offerings", pinned: null,
    };
    render(
      <CoursesSection program={program} block={block} catalog={catalog} state={state}
        resolved={[...resolved, noOfferings]} aliases={aliases} onChange={vi.fn()} />
    );
    expect(screen.getByText(/not offered this term/i)).toBeTruthy();
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
