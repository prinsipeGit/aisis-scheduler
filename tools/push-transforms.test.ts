import { describe, it, expect } from "vitest";
import { programToRow, catalogToRow, ratingsToRows, orphanKeys } from "./push-transforms.mjs";

describe("push transforms", () => {
  it("maps a program file to a programs row", () => {
    const program = { id: "X-2024", code: "X", name: "X PROG", versionYear: 2024, blocks: [{ key: "a" }] };
    expect(programToRow(program)).toEqual({
      id: "X-2024", code: "X", name: "X PROG", version_year: 2024, blocks: [{ key: "a" }],
    });
  });
  it("maps a catalog file to a catalogs row", () => {
    const catalog = { term: "2026-1", exportedAt: "2026-07-21T00:00:00.000Z", sections: [], warnings: ["w"] };
    expect(catalogToRow(catalog)).toEqual({
      term: "2026-1", exported_at: "2026-07-21T00:00:00.000Z", sections: [], warnings: ["w"],
    });
  });
  it("maps ratings, preserving optional fields and nulling absent ones", () => {
    expect(ratingsToRows([{ name: "A", rating: 4.5 }, { name: "B", rating: 3, courseCode: "MATH 10", note: "n", asOf: "2026-01-01" }])).toEqual([
      { name: "A", rating: 4.5, course_code: null, note: null, as_of: null },
      { name: "B", rating: 3, course_code: "MATH 10", note: "n", as_of: "2026-01-01" },
    ]);
  });
  it("orphanKeys finds existing keys absent from the pushed set", () => {
    expect(orphanKeys(["A", "B", "C"], ["A", "C"])).toEqual(["B"]);
  });
  it("orphanKeys returns an empty array when nothing was removed", () => {
    expect(orphanKeys(["A", "B"], ["A", "B"])).toEqual([]);
  });
  it("orphanKeys returns all existing keys when nothing was pushed", () => {
    expect(orphanKeys(["A", "B"], [])).toEqual(["A", "B"]);
  });
  it("orphanKeys returns an empty array when nothing existed", () => {
    expect(orphanKeys([], ["A"])).toEqual([]);
  });
});
