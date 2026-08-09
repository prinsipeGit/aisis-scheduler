import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultState } from "../../lib/storage";
import type { Section, Slot } from "../../lib/types";
import type { ResolvedSlot } from "../../lib/slots";
import { SectionSwitcher, sectionConflicts } from "./SectionSwitcher";

const section = (code: string, sectionCode: string, start: number, end: number): Section => ({
  courseCode: code, sectionCode, title: code, units: 3, instructors: ["CRUZ, ANA"],
  modality: "FULLY ONSITE", meetings: [{ days: ["M"], start, end }],
  timeStatus: "scheduled", room: "R1", remarks: "", raw: "",
});

const current = section("MATH 10", "A", 480, 540);
const free = section("MATH 10", "B", 600, 660);
const blocked = section("MATH 10", "C", 720, 780);
const conflict = section("PHILO 11", "D", 750, 810);
const slot: Slot = {
  id: "added:0", origin: "added", label: "MATH 10", requirement: "MATH 10",
  category: null, sourceBlock: null, chosen: null, pairedWith: null, included: true,
};
const resolved: ResolvedSlot[] = [{
  slot, sections: [current, free, blocked], allSections: [current, free, blocked],
  status: "ok", pinned: null,
}];

afterEach(cleanup);

describe("SectionSwitcher", () => {
  it("reports the exact class that blocks an alternative", () => {
    expect(sectionConflicts(blocked, [current, conflict], current)).toEqual([conflict]);
    render(
      <SectionSwitcher selected={current} schedule={[current, conflict]} resolved={resolved}
        state={defaultState("2026-1")} onChange={() => {}} onClose={() => {}} />
    );
    expect(screen.getByText(/PHILO 11 D/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Blocked" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("locks a conflict-free alternative and clears stale flags on it", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const state = {
      ...defaultState("2026-1"),
      lockedSections: ["MATH 10 A", "OTHER 1 X"],
      fullSections: ["MATH 10 B"],
      preferences: { ...defaultState("2026-1").preferences, excludedSections: ["MATH 10 B"] },
    };
    render(
      <SectionSwitcher selected={current} schedule={[current, conflict]} resolved={resolved}
        state={state} onChange={onChange} onClose={onClose} />
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Choose" })[0]);
    const next = onChange.mock.calls[0][0];
    expect(next.lockedSections).toEqual(["OTHER 1 X", "MATH 10 B"]);
    expect(next.fullSections).not.toContain("MATH 10 B");
    expect(next.preferences.excludedSections).not.toContain("MATH 10 B");
    expect(onClose).toHaveBeenCalled();
  });
});
