import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { AlreadyHaveSection } from "./AlreadyHaveSection";
import { resolveSlots, slotFromCatalog } from "../../lib/slots";
import { defaultState } from "../../lib/storage";
import type { AliasFile } from "../../lib/offerings";
import type { Catalog, Slot, UserState } from "../../lib/types";

const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8")) as Catalog;
const aliases = JSON.parse(readFileSync("data/course-aliases.json", "utf8")) as AliasFile;

const intact: Slot = { ...slotFromCatalog("INTACT 11", 0), category: "C" };
const math: Slot = slotFromCatalog("MATH 10", 1);

const setup = (locked: string[] = []) => {
  const state: UserState = { ...defaultState("2026-1"), slots: [intact, math], lockedSections: locked };
  const onChange = vi.fn();
  render(<AlreadyHaveSection resolved={resolveSlots(state.slots, catalog, aliases, locked)}
                             state={state} onChange={onChange} />);
  return { onChange };
};

afterEach(cleanup);

describe("AlreadyHaveSection", () => {
  it("prompts for the pre-assigned course", () => {
    setup();
    expect(screen.getByText(/enter the section you were given/i)).toBeTruthy();
  });

  it("lets any slot be pinned, not only pre-assigned ones", () => {
    setup();
    expect(screen.getByLabelText(/section for MATH 10/i)).toBeTruthy();
  });

  it("offers every candidate section even when the slot resolves to none", () => {
    setup();
    const picker = screen.getByLabelText(/section for INTACT 11/i);
    expect(within(picker).getAllByRole("option").length).toBeGreaterThan(100);
  });

  it("pinning writes the section key to lockedSections", () => {
    const { onChange } = setup();
    const picker = screen.getByLabelText(/section for MATH 10/i);
    const option = within(picker).getAllByRole("option")[1] as HTMLOptionElement;
    fireEvent.change(picker, { target: { value: option.value } });
    expect((onChange.mock.calls[0][0] as UserState).lockedSections).toEqual([option.value]);
  });

  it("unpinning removes only that slot's key", () => {
    const section = catalog.sections.find((s) => s.courseCode === "MATH 10")!;
    const key = `${section.courseCode} ${section.sectionCode}`;
    const { onChange } = setup([key, "OTHER 1 X"]);
    fireEvent.change(screen.getByLabelText(/section for MATH 10/i), { target: { value: "" } });
    expect((onChange.mock.calls[0][0] as UserState).lockedSections).toEqual(["OTHER 1 X"]);
  });
});
