import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CandidateList } from "./CandidateList";
import type { RankedSchedule } from "../../lib/ranker";
import type { Section } from "../../lib/types";

const section = (code: string, days: Section["meetings"][number]["days"]): Section => ({
  courseCode: code, sectionCode: "1", title: code, units: 3, instructors: [], modality: "",
  meetings: [{ days, start: 480, end: 540 }], timeStatus: "scheduled", room: "", remarks: "", raw: "",
});

const ranked: RankedSchedule[] = [
  { schedule: [section("A", ["M"])], score: 1 },
  { schedule: [section("B", ["M", "W"])], score: 0.5 },
];

afterEach(cleanup);

describe("CandidateList", () => {
  it("renders one button per candidate, ranked", () => {
    render(<CandidateList ranked={ranked} index={0} onPick={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /#1/ })).toBeTruthy();
  });

  it("marks the current candidate", () => {
    render(<CandidateList ranked={ranked} index={1} onPick={() => {}} />);
    // toHaveAttribute is a jest-dom matcher; this project has no jest-dom dependency or vitest
    // setupFiles registering it (not in package.json, not in node_modules, no setup file
    // anywhere in the repo). Same assertion, plain DOM API + chai.
    expect(screen.getByRole("button", { name: /#2/ }).getAttribute("aria-current")).toBe("true");
  });

  it("reports the picked index", () => {
    const onPick = vi.fn();
    render(<CandidateList ranked={ranked} index={0} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /#2/ }));
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("shows how many days each candidate needs on campus", () => {
    render(<CandidateList ranked={ranked} index={0} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: /#1.*1 day/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /#2.*2 days/ })).toBeTruthy();
  });

  it("says so when there is nothing yet", () => {
    render(<CandidateList ranked={[]} index={0} onPick={() => {}} />);
    expect(screen.getByText(/Schedules appear here/)).toBeTruthy();
  });

  it("presents the score attached to the rank position, matching the Pager's relative framing, never as a bare percentage", () => {
    // Binding requirement (see task-14-brief.md and Pager.tsx): `score` is a min-max
    // normalization of the top ranking criterion across the CURRENT candidate set
    // (ranker.ts) — never a standalone match quality, never a bare percentage. It must always
    // be presented alongside its rank position, using the same relative framing the Pager
    // uses ("... toward the best of this set, on your top preference"), so the two on-screen
    // components never contradict each other. An exact-string assertion is what finally held
    // this requirement in Pager.tsx after it regressed twice untested — same treatment here.
    render(<CandidateList ranked={ranked} index={0} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: /#1/ }).textContent).toBe(
      "#1 — 100% toward the best of this set, on your top preference — 1 day on campus — showing now"
    );
    expect(screen.getByRole("button", { name: /#2/ }).textContent).toBe(
      "#2 — 50% toward the best of this set, on your top preference — 2 days on campus"
    );
  });

  it("clamps an out-of-range index instead of selecting outside the list", () => {
    // A stale index against a shrunken list (e.g. after a removal) must not select out of
    // range — the Stage applies the same clamp before indexing into `ranked` (stage/Stage.tsx).
    render(<CandidateList ranked={ranked} index={99} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: /#2/ }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: /#1/ }).getAttribute("aria-current")).toBe(null);
  });
});
