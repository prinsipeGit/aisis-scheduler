import { vi } from "vitest";
vi.mock("../lib/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/catalog")>();
  return { ...actual, getTerms: vi.fn(), loadCatalog: vi.fn(), loadCommunityRatings: vi.fn() };
});
vi.mock("../lib/curriculum", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/curriculum")>();
  return { ...actual, getPrograms: vi.fn(), loadProgram: vi.fn() };
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import * as catalog from "../lib/catalog";
import * as curriculum from "../lib/curriculum";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("App banners", () => {
  it("shows an explanatory banner when the lists fail to load, not a silent empty picker", async () => {
    vi.mocked(catalog.getTerms).mockRejectedValue(new Error("network down"));
    vi.mocked(catalog.loadCommunityRatings).mockResolvedValue([]);
    vi.mocked(curriculum.getPrograms).mockResolvedValue([]);
    render(<App />);
    // jest-dom is not installed in this project — assert on the plain DOM text content
    // instead of toHaveTextContent (see storage.test.ts / other suites for precedent).
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/Could not load programs or terms/);
    });
  });

  it("shows the catalog-unavailable message naming both commands", async () => {
    vi.mocked(catalog.getTerms).mockResolvedValue([{ term: "2026-1", label: "2026-2027 First Semester", available: true }]);
    vi.mocked(catalog.loadCommunityRatings).mockResolvedValue([]);
    vi.mocked(curriculum.getPrograms).mockResolvedValue([]);
    vi.mocked(catalog.loadCatalog).mockRejectedValue(new catalog.CatalogUnavailableError("2026-1"));
    render(<App />);
    await waitFor(() => expect(screen.getByText(/npm run scrape:schedule -- 2026-1/)).toBeTruthy());
  });

  it("degrades ratings independently: pickers still work and no banner blames terms or programs", async () => {
    vi.mocked(catalog.getTerms).mockResolvedValue([{ term: "2026-1", label: "2026-2027 First Semester", available: true }]);
    vi.mocked(curriculum.getPrograms).mockResolvedValue([
      { id: "P1", code: "CS", name: "Computer Science", version: "2024", versionYear: 2024, versionLabel: "2024" },
    ]);
    vi.mocked(catalog.loadCommunityRatings).mockRejectedValue(new Error("ratings down"));
    // The term picker's default-term logic will pick "2026-1" and trigger a catalog fetch;
    // give it something to resolve so that unrelated effect doesn't leak a stale mock result
    // (e.g. the CatalogUnavailableError rejection set up by an earlier test in this file) into
    // this one as a spurious alert banner.
    vi.mocked(catalog.loadCatalog).mockResolvedValue({ term: "2026-1", exportedAt: new Date().toISOString(), sections: [], warnings: [] });
    render(<App />);

    // The program picker (open by default) must still list the program that loaded fine —
    // a ratings-only failure must not take down the pickers.
    await waitFor(() => {
      expect(screen.getByText(/Computer Science/)).toBeTruthy();
    });

    // No banner should blame the term/program pickers for a ratings-only failure.
    expect(screen.queryByText(/Could not load programs or terms/)).toBeFalsy();
    expect(screen.queryByRole("alert")).toBeFalsy();
  });

  it("shows the reset banner when stored state is from an older version", async () => {
    localStorage.setItem("aisis-scheduler-state", JSON.stringify({ version: 2, requiredCourses: [] }));
    vi.mocked(catalog.getTerms).mockResolvedValue([]);
    vi.mocked(catalog.loadCommunityRatings).mockResolvedValue([]);
    vi.mocked(curriculum.getPrograms).mockResolvedValue([]);
    render(<App />);
    expect(screen.getByText(/Saved settings were from an older version/)).toBeTruthy();
    // Flush the pending list-loading promise chain before the test (and afterEach's cleanup)
    // moves on, so no state update lands after unmount and logs an act() warning.
    await waitFor(() => expect(catalog.getTerms).toHaveBeenCalled());
  });
});
