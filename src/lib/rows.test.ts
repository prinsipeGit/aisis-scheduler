import { describe, it, expect } from "vitest";
import { rowToCatalog, rowToProgram, rowToSummary, rowToRating } from "./rows";

describe("row mappers", () => {
  it("maps a catalogs row to Catalog", () => {
    expect(rowToCatalog({ term: "2026-1", exported_at: "2026-07-21T00:00:00.000Z", sections: [], warnings: ["w"] }))
      .toEqual({ term: "2026-1", exportedAt: "2026-07-21T00:00:00.000Z", sections: [], warnings: ["w"] });
  });
  it("maps a programs row to Program and ProgramSummary", () => {
    const row = { id: "X-2024", code: "X", name: "N", version_year: 2024, blocks: [] };
    expect(rowToProgram(row)).toEqual({ id: "X-2024", code: "X", name: "N", versionYear: 2024, blocks: [] });
    expect(rowToSummary(row)).toEqual({ id: "X-2024", code: "X", name: "N", versionYear: 2024 });
  });
  it("maps a ratings row, dropping nulls", () => {
    expect(rowToRating({ name: "A", rating: 4.5, course_code: null, note: null, as_of: null }))
      .toEqual({ name: "A", rating: 4.5 });
    expect(rowToRating({ name: "B", rating: 3, course_code: "MATH 10", note: "n", as_of: "2026-01-01" }))
      .toEqual({ name: "B", rating: 3, courseCode: "MATH 10", note: "n", asOf: "2026-01-01" });
  });
});
