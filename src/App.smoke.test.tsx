import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("smoke: program → semester → generate → lock → re-rank", () => {
  it("runs the whole v2 flow on the real 2026-1 catalog", async () => {
    // Third Year|First Semester is fully offered in the bundled 2026-1 catalog
    // (CSCI 111, MATH 101.6, MATH 62.1, MATH 90.1, PHILO 12 all have sections),
    // so it produces valid schedules without any elective slot needing a fill.
    render(<App />);

    // Program tab is the default. Pick the one bundled program.
    fireEvent.change(screen.getByLabelText(/^Program/), {
      target: { value: "BS-AMDSc-2024" },
    });

    // Semester tab: pick the curriculum block (seeds requiredCourses); the
    // calendar term is already the default (2026-1, which has real data).
    fireEvent.click(screen.getByRole("button", { name: "Semester" }));
    fireEvent.change(screen.getByLabelText(/Curriculum block/), {
      target: { value: "Third Year|First Semester" },
    });

    // Results tab: the catalog loads asynchronously (dynamic import), so wait.
    fireEvent.click(screen.getByRole("button", { name: "Results" }));
    await waitFor(() =>
      expect(screen.getByText(/valid schedule\(s\), best first/)).toBeTruthy()
    );
    const before = screen.getByText(/valid schedule\(s\), best first/).textContent!;

    // Lock the first schedule's PHILO 12 section (only 5 non-elective courses
    // in this block; PHILO 12 alone has dozens of sections, so pinning it
    // collapses the combinatorics well below the unlocked count).
    const philoItem = screen
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes("PHILO 12"))!;
    fireEvent.click(within(philoItem).getByRole("button", { name: "Lock" }));

    const after = screen.getByText(/valid schedule\(s\), best first/).textContent!;
    expect(after).not.toBe(before);

    // State persisted to localStorage under the v2 schema.
    const stored = JSON.parse(localStorage.getItem("aisis-scheduler-state")!);
    expect(stored.lockedSections).toHaveLength(1);
    expect(stored.requiredCourses.sort()).toEqual(
      ["CSCI 111", "MATH 101.6", "MATH 62.1", "MATH 90.1", "PHILO 12"].sort()
    );
  });
});
