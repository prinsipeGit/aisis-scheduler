import { describe, it, expect } from "vitest";
import { getPrograms, loadProgram, getBlock, ProgramUnavailableError } from "./curriculum";
import { stubDb } from "./testing/stubDb";

const row = {
  id: "X-24BE", code: "X", name: "X PROGRAM",
  version: "24BE", version_year: 2024, version_label: "2024 · BE",
  blocks: [{ year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 3, entries: [] }],
};

describe("curriculum data layer", () => {
  it("lists summaries WITH the version label, sorted by code", async () => {
    const programs = await getPrograms(stubDb({ programs: [row] }));
    expect(programs).toEqual([{
      id: "X-24BE", code: "X", name: "X PROGRAM",
      version: "24BE", versionYear: 2024, versionLabel: "2024 · BE",
    }]);
  });

  it("loads a full program with its blocks", async () => {
    const program = await loadProgram("X-24BE", stubDb({ programs: [row] }));
    expect(program.versionLabel).toBe("2024 · BE");
    expect(program.blocks).toHaveLength(1);
  });

  it("throws ProgramUnavailableError for an unknown id", async () => {
    const err = await loadProgram("NOPE", stubDb({ programs: [row] })).catch((e) => e);
    expect(err).toBeInstanceOf(ProgramUnavailableError);
  });

  it("getBlock finds a block by key", async () => {
    const program = await loadProgram("X-24BE", stubDb({ programs: [row] }));
    expect(getBlock(program, "First Year|First Semester")?.totalUnits).toBe(3);
    expect(getBlock(program, "nope")).toBeUndefined();
  });
});
