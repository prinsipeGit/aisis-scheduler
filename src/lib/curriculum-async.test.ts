import { describe, it, expect } from "vitest";
import { getProgramsAsync, loadProgram, ProgramUnavailableError } from "./curriculum";
import type { Db } from "./supabase";

const row = { id: "X-2024", code: "X", name: "X PROGRAM", version_year: 2024, blocks: [] };
const db: Db = {
  async selectAll<T>() { return [row] as T[]; },
  async selectOne<T>(_t: string, _c: string, _k: string, key: string) { return (key === "X-2024" ? row : null) as T | null; },
};

describe("async curriculum API", () => {
  it("lists program summaries sorted by code", async () => {
    expect(await getProgramsAsync(db)).toEqual([{ id: "X-2024", code: "X", name: "X PROGRAM", versionYear: 2024 }]);
  });
  it("loads a full program", async () => {
    expect(await loadProgram("X-2024", db)).toEqual({ id: "X-2024", code: "X", name: "X PROGRAM", versionYear: 2024, blocks: [] });
  });
  it("throws ProgramUnavailableError for an unknown id, naming both commands", async () => {
    const err = await loadProgram("NOPE", db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProgramUnavailableError);
    expect((err as Error).message).toContain("npm run scrape:curricula && npm run push:data");
  });
});
