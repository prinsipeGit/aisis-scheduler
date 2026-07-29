import { vi } from "vitest";
vi.mock("./lib/supabase", async () => {
  const catalog = (await import("../data/catalogs/catalog-2026-1.json")).default;
  const program = (await import("../data/curricula/BS-AMDSc-M-DSc-2024.json")).default;
  const ratings = (await import("../data/prof-ratings.json")).default;
  const tables: Record<string, Record<string, unknown>[]> = {
    catalogs: [{ term: catalog.term, exported_at: catalog.exportedAt, sections: catalog.sections, warnings: catalog.warnings }],
    programs: [{ id: program.id, code: program.code, name: program.name, version_year: program.versionYear, blocks: program.blocks }],
    community_ratings: ratings.map((r: Record<string, unknown>) => ({
      name: r.name, rating: r.rating, course_code: r.courseCode ?? null, note: r.note ?? null, as_of: r.asOf ?? null,
    })),
  };
  return { defaultDb: {
    async selectAll(table: string) { return tables[table] ?? []; },
    async selectOne(table: string, _c: string, keyColumn: string, key: string) {
      return (tables[table] ?? []).find((row) => row[keyColumn] === key) ?? null;
    },
  } };
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("smoke: program → semester → courses → results → lock → re-rank", () => {
  it("runs the whole v2 flow on the real 2026-1 catalog", async () => {
    render(<App />);

    // 1. Program — the list loads asynchronously from Supabase, so wait for
    //    it to populate before selecting (otherwise the option doesn't exist
    //    yet and the change event is a no-op).
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText(/^Program/), {
      target: { value: "BS-AMDSc-M-DSc-2024" },
    });

    // 2. Semester — First Year/First Semester contains MATH 10 and MATH 71.1
    //    (both offered), plus PATHFit 1, which has zero sections under exact
    //    matching in the real 2026-1 data — exercising the "not offered this
    //    term" path for free. (PATHFit is offered as PEPC 10; resolving that
    //    is the rewrite's job, so here it correctly reads as unavailable.)
    fireEvent.click(screen.getByRole("button", { name: "Semester" }));
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText(/Curriculum block/i), {
      target: { value: "First Year|First Semester" },
    });

    // 3. Courses — seeded from the IPS; catalog loads asynchronously.
    fireEvent.click(screen.getByRole("button", { name: "Courses" }));
    await waitFor(() => expect(screen.getByText(/units selected/)).toBeTruthy());
    expect(screen.getByText(/MATHEMATICS IN THE MODERN WORLD/)).toBeTruthy();
    // PATHFit 1 has no exact-match sections in the real 2026-1 data.
    expect(screen.getAllByText(/Not offered in 2026-1/i).length).toBeGreaterThan(0);

    // 4. Keep the search space small: drop everything except MATH 71.1 (3
    //    sections) and MATH 10 (43 sections). Real courses have 40+ sections
    //    each, so leaving them all on would generate tens of thousands of
    //    combinations. INTACT 11 is dropped for the same reason — it has 103
    //    sections since the INTAC department was added to the scraper.
    //    PATHFit 1 stays checked (still "required") but is not offered, so it
    //    must be excluded from generation rather than silently blocking every
    //    other course.
    for (const code of ["ENGL 11", "FILI 12", "SocSc 11", "THEO 11", "INTACT 11"]) {
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
      ["MATH 10", "MATH 71.1", "PATHFit 1"].sort()
    );
  });

  it("treats a saved pre-migration programId as no program chosen, with an explanatory banner", async () => {
    localStorage.setItem("aisis-scheduler-state", JSON.stringify({
      version: 2, programId: "BS-AMDSc-2024", blockKey: "", calendarTerm: "2026-1",
      requiredCourses: [], electiveFills: {}, lockedSections: [], fullSections: [],
      personalRatings: [], preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No curriculum for program BS-AMDSc-2024/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Semester" }));
    expect(screen.getByText(/Choose a program first/)).toBeTruthy();
  });
});
