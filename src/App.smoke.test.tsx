import { vi } from "vitest";
vi.mock("./lib/db", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8"));
  const program = JSON.parse(readFileSync("data/curricula/BS-AMDSc-M-DSc-2024.json", "utf8"));
  const { stubDb } = await import("./lib/testing/stubDb");
  const actual = await vi.importActual<typeof import("./lib/db")>("./lib/db");
  return {
    ...actual,
    defaultDb: stubDb({
      catalogs: [{
        term: catalog.term, exported_at: catalog.exportedAt,
        sections: catalog.sections, warnings: catalog.warnings,
      }],
      programs: [{
        id: program.id, code: program.code, name: program.name, version: program.version,
        version_year: program.versionYear, version_label: program.versionLabel, blocks: program.blocks,
      }],
      community_ratings: [],
    }),
  };
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./ui/App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

// Stage renders more than one `role="status"` live region at once by design: Pager's
// sr-only pager count, and (here) MissingList's "Not in this schedule" banner for the
// pre-assigned INTACT 11 requirement (see src/ui/stage/Stage.test.tsx, "lists required
// classes the schedule does not include"). `getByRole("status")` alone is therefore
// ambiguous once a schedule is on screen; pick out the pager's region by its content
// instead of asserting there is exactly one status region on the page.
// jest-dom is not installed in this project (see App.banners.test.tsx and others), so
// `toHaveTextContent` is replaced with a plain `.textContent` match throughout.
const pagerStatus = (): HTMLElement => {
  const region = screen.getAllByRole("status").find((el) => /Schedule \d+ of/.test(el.textContent ?? ""));
  if (!region) throw new Error('no role="status" region with pager text found');
  return region;
};

// This is the only test that drives the whole cockpit at once, on the real 2026-1 catalog:
// eight steps, each re-resolving and re-generating against ~4000 sections. It finishes in
// well under two seconds on its own but shares a machine with 28 other files under
// `vitest run`, and the 5000 ms default made it fail on a loaded one. A flaky gate is worse
// than a slow one, so it gets room to be descheduled rather than assertions it can meet.
const SMOKE_TIMEOUT = 30_000;

describe("cockpit smoke", () => {
  it("runs program to schedule on the real 2026-1 data", async () => {
    render(<App />);
    expect(screen.getByText("sched.riv")).toBeTruthy();

    // 1. Program. The version label must render - this is the regression that shipped.
    await waitFor(() => expect(screen.getByLabelText(/program and curriculum year/i)).toBeTruthy());
    expect(document.body.textContent).not.toContain("undefined");
    fireEvent.change(screen.getByLabelText(/program and curriculum year/i), {
      target: { value: "BS-AMDSc-M-DSc-2024" },
    });

    // 2. Semester.
    fireEvent.click(screen.getByRole("button", { name: "Semester" }));
    await waitFor(() => expect(screen.getByLabelText(/curriculum block/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/curriculum block/i), {
      target: { value: "First Year|First Semester" },
    });

    // 3. Courses. PATHFit 1 now resolves through PFT1 to PEPC 10, which exact matching missed.
    fireEvent.click(screen.getByRole("button", { name: "Courses" }));
    await waitFor(() => expect(screen.getByText(/units selected/)).toBeTruthy());
    expect(screen.getByText(/this block is/)).toBeTruthy();

    // INTACT 11 is pre-assigned: excluded from generation and labelled as such, not
    // reported as unavailable.
    expect(screen.getAllByText(/pre-assigned/i).length).toBeGreaterThan(0);

    // 4. Keep the search small: drop the bulk courses, leaving MATH 71.1 and MATH 10.
    for (const code of ["ENGL 11", "FILI 12", "SocSc 11", "THEO 11", "PATHFit 1"]) {
      const row = screen.getByText(code).closest("li")!;
      fireEvent.click(within(row).getByRole("checkbox"));
    }

    // 5. A schedule appears on the stage.
    await waitFor(() => expect(pagerStatus().textContent).toMatch(/Schedule 1 of/));
    const before = pagerStatus().textContent!;

    // 6. Pinning a MATH 71.1 section collapses the candidate set.
    fireEvent.click(screen.getByRole("button", { name: "Pre-enlisted Classes" }));
    const picker = await screen.findByLabelText(/section for MATH 71.1/i);
    const option = within(picker).getAllByRole("option")[1] as HTMLOptionElement;
    fireEvent.change(picker, { target: { value: option.value } });
    await waitFor(() => expect(pagerStatus().textContent).not.toBe(before));

    // 7. Preferences re-rank without error.
    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    fireEvent.click(screen.getByLabelText(/Later starts/));
    await waitFor(() => expect(pagerStatus().textContent).toMatch(/Schedule 1 of/));

    // 8. State persisted under v3.
    const stored = JSON.parse(localStorage.getItem("aisis-scheduler-state")!);
    expect(stored.version).toBe(3);
    expect(stored.programId).toBe("BS-AMDSc-M-DSc-2024");
    expect(stored.slots.length).toBeGreaterThan(0);
    expect(stored.lockedSections).toHaveLength(1);
    expect(stored.completedCourses).toEqual([]);
  }, SMOKE_TIMEOUT);
});
