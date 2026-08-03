import { describe, it, expect } from "vitest";
import { stubDb } from "./testing/stubDb";

const rows = [{ id: "X", code: "C", name: "N", version: "24BE", version_year: 2024, version_label: "2024 · BE" }];

describe("stubDb", () => {
  it("returns rows for columns that exist", async () => {
    const db = stubDb({ programs: rows });
    expect(await db.selectAll("programs", "id, code, version_label")).toEqual(rows);
  });

  it("throws when a requested column is absent from the row shape", async () => {
    const db = stubDb({ programs: [{ id: "X", code: "C" }] });
    await expect(db.selectAll("programs", "id, version_label")).rejects.toThrow(/version_label/);
  });

  it("applies the same check to selectOne", async () => {
    const db = stubDb({ programs: rows });
    await expect(db.selectOne("programs", "id, nope", "id", "X")).rejects.toThrow(/nope/);
    expect(await db.selectOne("programs", "id, version", "id", "X")).toEqual(rows[0]);
  });

  it("returns null for a missing key and [] for a missing table", async () => {
    const db = stubDb({ programs: rows });
    expect(await db.selectOne("programs", "id", "id", "MISSING")).toBeNull();
    expect(await db.selectAll("nothing", "id")).toEqual([]);
  });
});
