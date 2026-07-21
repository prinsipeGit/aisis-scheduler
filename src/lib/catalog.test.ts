import { describe, it, expect } from "vitest";
import { getTerms, loadCatalog, CatalogUnavailableError, getCommunityRatings, isStale } from "./catalog";

describe("catalog data layer", () => {
  it("lists the six AISIS terms newest first", () => {
    const terms = getTerms();
    expect(terms.map((t) => t.term)).toEqual(["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"]);
    expect(terms[0].label).toBe("2026-2027 Second Semester");
    expect(terms[2].label).toBe("2026-2027 Intersession");
  });

  it("loads the real scraped 2026-1 catalog", async () => {
    const catalog = await loadCatalog("2026-1");
    expect(catalog.term).toBe("2026-1");
    expect(catalog.sections.length).toBe(3743);
    expect(catalog.sections[0].instructors).toBeInstanceOf(Array);
    // Real courses from the live scrape.
    expect(catalog.sections.some((s) => s.courseCode === "MATH 10")).toBe(true);
    expect(catalog.sections.some((s) => s.courseCode === "THEO 11")).toBe(true);
  });

  it("rejects with CatalogUnavailableError for a term with no data file", async () => {
    // 2026-2 has no published AISIS schedule as of 2026-07-21, so no file ships for it.
    await expect(loadCatalog("2026-2")).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it("rejects for an unknown term code", async () => {
    await expect(loadCatalog("1999-9")).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it("returns community ratings", () => {
    expect(getCommunityRatings()).toBeInstanceOf(Array);
  });

  it("isStale is false within 30 days, true after", () => {
    const catalog = { term: "2026-1", exportedAt: "2026-07-01T00:00:00.000Z", sections: [], warnings: [] };
    expect(isStale(catalog, new Date("2026-07-20T00:00:00.000Z"))).toBe(false);
    expect(isStale(catalog, new Date("2026-08-05T00:00:00.000Z"))).toBe(true);
  });
});
