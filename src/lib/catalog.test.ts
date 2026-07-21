import { describe, it, expect } from "vitest";
import { getTerms, loadCatalog, loadCommunityRatings, CatalogUnavailableError, isStale } from "./catalog";
import type { Db } from "./supabase";

const stubDb = (tables: Record<string, unknown[]>): Db => ({
  async selectAll<T>(table: string) { return (tables[table] ?? []) as T[]; },
  async selectOne<T>(table: string, _c: string, keyColumn: string, key: string) {
    return ((tables[table] ?? []).find((r) => (r as Record<string, unknown>)[keyColumn] === key) as T) ?? null;
  },
});

describe("catalog data layer", () => {
  const db = stubDb({
    catalogs: [{ term: "2026-1", exported_at: "2026-07-21T00:00:00.000Z", sections: [], warnings: [] }],
    community_ratings: [{ name: "GARCIA, JUAN", rating: 4, course_code: null, note: null, as_of: null }],
  });

  it("lists known AISIS terms newest first, available only when in the DB", async () => {
    const terms = await getTerms(db);
    expect(terms.map((t) => t.term)).toEqual(["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"]);
    expect(terms.find((t) => t.term === "2026-1")?.available).toBe(true);
    expect(terms.find((t) => t.term === "2026-2")?.available).toBe(false);
    expect(terms[0].label).toBe("2026-2027 Second Semester");
  });

  it("includes a DB term missing from the known list, appended and available", async () => {
    const extra = stubDb({ catalogs: [{ term: "2027-1", exported_at: "x", sections: [], warnings: [] }] });
    const terms = await getTerms(extra);
    expect(terms.at(-1)).toMatchObject({ term: "2027-1", available: true });
  });

  it("loads a catalog row as a Catalog", async () => {
    const catalog = await loadCatalog("2026-1", db);
    expect(catalog).toEqual({ term: "2026-1", exportedAt: "2026-07-21T00:00:00.000Z", sections: [], warnings: [] });
  });

  it("throws CatalogUnavailableError for an absent term, naming both commands", async () => {
    const err = await loadCatalog("2026-2", db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CatalogUnavailableError);
    expect((err as Error).message).toContain("npm run scrape:schedule -- 2026-2 && npm run push:data");
  });

  it("loads community ratings as ProfRating[]", async () => {
    expect(await loadCommunityRatings(db)).toEqual([{ name: "GARCIA, JUAN", rating: 4 }]);
  });

  it("isStale is false within 30 days, true after", () => {
    const catalog = { term: "2026-1", exportedAt: "2026-07-01T00:00:00.000Z", sections: [], warnings: [] };
    expect(isStale(catalog, new Date("2026-07-20T00:00:00.000Z"))).toBe(false);
    expect(isStale(catalog, new Date("2026-08-05T00:00:00.000Z"))).toBe(true);
  });
});
