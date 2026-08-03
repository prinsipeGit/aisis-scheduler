import { describe, it, expect } from "vitest";
import { getTerms, loadCatalog, loadCommunityRatings, isStale, CatalogUnavailableError } from "./catalog";
import { stubDb } from "./testing/stubDb";

const catalogRow = {
  term: "2026-1", exported_at: "2026-07-28T00:00:00.000Z",
  sections: [], warnings: [],
};

describe("catalog data layer", () => {
  it("marks terms present in the database as available", async () => {
    const terms = await getTerms(stubDb({ catalogs: [catalogRow] }));
    expect(terms.find((t) => t.term === "2026-1")).toEqual({
      term: "2026-1", label: "2026-2027 First Semester", available: true,
    });
    expect(terms.find((t) => t.term === "2026-2")?.available).toBe(false);
  });

  it("loads a catalog by term", async () => {
    const catalog = await loadCatalog("2026-1", stubDb({ catalogs: [catalogRow] }));
    expect(catalog.term).toBe("2026-1");
    expect(catalog.exportedAt).toBe("2026-07-28T00:00:00.000Z");
  });

  it("throws CatalogUnavailableError naming both commands", async () => {
    const err = await loadCatalog("2025-0", stubDb({ catalogs: [catalogRow] })).catch((e) => e);
    expect(err).toBeInstanceOf(CatalogUnavailableError);
    expect((err as Error).message).toContain("npm run scrape:schedule -- 2025-0");
    expect((err as Error).message).toContain("npm run push:data");
  });

  it("maps rating rows, dropping nulls", async () => {
    const db = stubDb({ community_ratings: [{ name: "A", rating: 4.5, course_code: null, note: null, as_of: null }] });
    expect(await loadCommunityRatings(db)).toEqual([{ name: "A", rating: 4.5 }]);
  });

  it("treats a catalog older than 30 days, or undateable, as stale", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    expect(isStale({ ...catalogRow, exportedAt: "2026-07-28T00:00:00.000Z" } as never, now)).toBe(true);
    expect(isStale({ ...catalogRow, exportedAt: "2026-08-30T00:00:00.000Z" } as never, now)).toBe(false);
    expect(isStale({ ...catalogRow, exportedAt: "nonsense" } as never, now)).toBe(true);
  });
});
