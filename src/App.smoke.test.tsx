import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("smoke: program → semester → courses → results → lock → re-rank", () => {
  it("runs the whole v2 flow on the real 2026-1 catalog", async () => {
    render(<App />);

    // 1. Program
    fireEvent.change(screen.getByLabelText(/^Program/), {
      target: { value: "BS-AMDSc-M-DSc-2024" },
    });

    // 2. Semester — First Year/First Semester contains MATH 10 and MATH 71.1
    //    (both offered), plus INTACT 11 and PATHFit 1, which genuinely have
    //    zero sections in the real 2026-1 data — exercising the "not offered
    //    this term" path for free.
    fireEvent.click(screen.getByRole("button", { name: "Semester" }));
    fireEvent.change(screen.getByLabelText(/Curriculum block/i), {
      target: { value: "First Year|First Semester" },
    });

    // 3. Courses — seeded from the IPS; catalog loads asynchronously.
    fireEvent.click(screen.getByRole("button", { name: "Courses" }));
    await waitFor(() => expect(screen.getByText(/units selected/)).toBeTruthy());
    expect(screen.getByText(/MATHEMATICS IN THE MODERN WORLD/)).toBeTruthy();
    // INTACT 11 and PATHFit 1 genuinely have no sections in the real 2026-1 data.
    expect(screen.getAllByText(/Not offered in 2026-1/i).length).toBeGreaterThan(0);

    // 4. Keep the search space small: drop everything except MATH 71.1 (3
    //    sections) and MATH 10 (43 sections). Real courses have 40+ sections
    //    each, so leaving them all on would generate tens of thousands of
    //    combinations. INTACT 11 and PATHFit 1 stay checked (still
    //    "required") but are not offered, so they must be excluded from
    //    generation rather than silently blocking every other course.
    for (const code of ["ENGL 11", "FILI 12", "SocSc 11", "THEO 11"]) {
      fireEvent.click(screen.getByLabelText(new RegExp(code.replace(".", "\\."))));
    }

    // 5. Results — schedules generated from the remaining offered courses.
    fireEvent.click(screen.getByRole("button", { name: "Results" }));
    await waitFor(() => expect(screen.getByText(/candidate schedule\(s\), ranked best first/)).toBeTruthy());
    const before = screen.getByText(/candidate schedule\(s\), ranked best first/).textContent!;

    // 6. Lock a MATH 71.1 section (only 3 sections total) — pinning it
    //    collapses the combinatorics well below the unlocked count, proving
    //    the lock → regenerate flow still works end to end.
    const mathItem = screen
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes("MATH 71.1"))!;
    fireEvent.click(within(mathItem).getByRole("button", { name: "Lock" }));

    const after = screen.getByText(/candidate schedule\(s\), ranked best first/).textContent!;
    expect(after).not.toBe(before);

    // 7. Preferences re-rank: switching the criterion reorders without error.
    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    fireEvent.click(screen.getByLabelText(/Later starts/));
    fireEvent.click(screen.getByRole("button", { name: "Results" }));
    await waitFor(() => expect(screen.getByText(/candidate schedule\(s\), ranked best first/)).toBeTruthy());

    // 8. State persisted to localStorage under the v2 schema.
    const stored = JSON.parse(localStorage.getItem("aisis-scheduler-state")!);
    expect(stored.version).toBe(2);
    expect(stored.programId).toBe("BS-AMDSc-M-DSc-2024");
    expect(stored.blockKey).toBe("First Year|First Semester");
    expect(stored.calendarTerm).toBe("2026-1");
    expect(stored.preferences.criteria).toContain("lateStart");
    expect(stored.lockedSections).toHaveLength(1);
    expect(stored.requiredCourses.sort()).toEqual(
      ["INTACT 11", "MATH 10", "MATH 71.1", "PATHFit 1"].sort()
    );
  });
});
