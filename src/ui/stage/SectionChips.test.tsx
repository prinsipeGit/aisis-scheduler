import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SectionChips } from "./SectionChips";
import { defaultState } from "../../lib/storage";
import type { Section } from "../../lib/types";

afterEach(cleanup);

const section: Section = {
  courseCode: "MATH 10", sectionCode: "1", title: "MATH 10", units: 3, instructors: [],
  modality: "", meetings: [], timeStatus: "scheduled", room: "R", remarks: "", raw: "",
};

describe("SectionChips", () => {
  it("reflects whether a section is already marked full, the way Lock reflects being locked", () => {
    const state = defaultState("2026-1");
    render(<SectionChips schedule={[section]} state={state} onChange={() => {}} />);

    const markFull = screen.getByRole("button", { name: /mark full|unmark full/i });
    expect(markFull.textContent).toBe("Mark full");
    expect(markFull.getAttribute("aria-pressed")).toBe("false");
  });

  it("swaps label and aria-pressed once a section is marked full", () => {
    const state = { ...defaultState("2026-1"), fullSections: ["MATH 10 1"] };
    render(<SectionChips schedule={[section]} state={state} onChange={() => {}} />);

    const markFull = screen.getByRole("button", { name: /mark full|unmark full/i });
    expect(markFull.textContent).not.toBe("Mark full");
    expect(markFull.getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles fullSections when clicked", () => {
    let latest = defaultState("2026-1");
    const { rerender } = render(
      <SectionChips schedule={[section]} state={latest} onChange={(s) => { latest = s; }} />
    );
    fireEvent.click(screen.getByRole("button", { name: /mark full/i }));
    expect(latest.fullSections).toEqual(["MATH 10 1"]);
    rerender(<SectionChips schedule={[section]} state={latest} onChange={(s) => { latest = s; }} />);
    fireEvent.click(screen.getByRole("button", { name: /unmark full/i }));
    expect(latest.fullSections).toEqual([]);
  });
});
