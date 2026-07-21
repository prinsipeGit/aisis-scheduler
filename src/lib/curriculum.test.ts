import { describe, it, expect } from "vitest";
import { getPrograms, getCurriculum, getBlock } from "./curriculum";

describe("curriculum data layer", () => {
  it("lists the seeded program", () => {
    const programs = getPrograms();
    expect(programs).toHaveLength(1);
    expect(programs[0]).toMatchObject({
      id: "BS-AMDSc-M-DSc-2024",
      code: "BS AMDSc-M DSc",
      name: "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS",
      versionYear: 2024,
    });
  });

  it("returns the full curriculum with every printed block", () => {
    const program = getCurriculum("BS-AMDSc-M-DSc-2024")!;
    expect(program.blocks).toHaveLength(14);
    expect(program.blocks.map((b) => b.key)).toContain("Second Year|First Semester");
  });

  it("returns undefined for an unknown program", () => {
    expect(getCurriculum("NOPE")).toBeUndefined();
  });

  it("preserves the quirk blocks printed as 'Fourth Year' under other years", () => {
    const program = getCurriculum("BS-AMDSc-M-DSc-2024")!;
    const quirks = program.blocks.filter((b) => b.term === "Fourth Year");
    expect(quirks.map((b) => b.year).sort()).toEqual(["Fifth Year", "Third Year"]);
  });

  it("getBlock finds a block by key", () => {
    const program = getCurriculum("BS-AMDSc-M-DSc-2024")!;
    const block = getBlock(program, "Second Year|First Semester")!;
    expect(block.totalUnits).toBe(22);
    expect(block.entries.map((e) => e.catNo)).toContain("MATH 31.3");
  });

  it("flags elective slots and marks IE slots with their department", () => {
    const program = getCurriculum("BS-AMDSc-M-DSc-2024")!;
    const block = getBlock(program, "Second Year|Second Semester")!;
    const ie = block.entries.find((e) => e.catNo === "IE 1")!;
    expect(ie.isElective).toBe(true);
    expect(ie.electiveDept).toBe("**IE**");
    expect(block.entries.find((e) => e.catNo === "MATH 40.1")!.isElective).toBe(false);
  });

  it("keeps zero-unit courses and prerequisites", () => {
    const program = getCurriculum("BS-AMDSc-M-DSc-2024")!;
    const block = getBlock(program, "First Year|First Semester")!;
    expect(block.entries.find((e) => e.catNo === "INTACT 11")!.units).toBe(0);
    const second = getBlock(program, "First Year|Second Semester")!;
    expect(second.entries.find((e) => e.catNo === "PATHFit 2")!.prerequisites).toEqual(["PATHFit 1"]);
  });

  it("gives every entry a unique slotId", () => {
    const program = getCurriculum("BS-AMDSc-M-DSc-2024")!;
    const ids = program.blocks.flatMap((b) => b.entries.map((e) => e.slotId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
