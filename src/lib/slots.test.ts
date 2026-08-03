import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { seedSlots, slotsFromCurriculum, slotFromCatalog, resolveSlots } from "./slots";
import type { AliasFile } from "./offerings";
import type { Catalog, CurriculumBlock } from "./types";

const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8")) as Catalog;
const file = JSON.parse(readFileSync("data/course-aliases.json", "utf8")) as AliasFile;

const entry = (catNo: string, category: string, i: number, isElective = false) => ({
  catNo, title: catNo, units: 3, prerequisites: [], category, isElective,
  slotId: `First Year|First Semester#${i}`,
});

const block: CurriculumBlock = {
  year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 19,
  entries: [
    entry("MATH 10", "C", 0),
    entry("NatSc 10.01", "NS1A", 1),
    entry("NatSc 10.02", "NS1B", 2),
    entry("INTACT 11", "C", 3),
    entry("FREE ELECTIVE", "FE1", 4, true),
  ],
};

describe("seedSlots", () => {
  it("makes one slot per entry, electives excluded until filled", () => {
    const slots = seedSlots(block, file);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.included)).toEqual([true, true, true, true, false]);
    expect(slots[0]).toMatchObject({
      origin: "ips", requirement: "MATH 10", category: "C",
      sourceBlock: "First Year|First Semester", chosen: null,
    });
  });

  it("links the NS1A/NS1B lecture-lab pair in both directions", () => {
    const slots = seedSlots(block, file);
    const lec = slots.find((s) => s.category === "NS1A")!;
    const lab = slots.find((s) => s.category === "NS1B")!;
    expect(lec.pairedWith).toBe(lab.id);
    expect(lab.pairedWith).toBe(lec.id);
  });

  it("gives an elective a null requirement so it resolves to nothing until filled", () => {
    const elective = seedSlots(block, file).find((s) => s.label === "FREE ELECTIVE")!;
    expect(elective.requirement).toBeNull();
  });
});

describe("slotsFromCurriculum", () => {
  it("carries the category, which is what makes alias resolution work (§11.5)", () => {
    const [slot] = slotsFromCurriculum(entry("PATHFit 3", "PFT3", 7), block, file);
    expect(slot).toMatchObject({ origin: "ips", category: "PFT3", sourceBlock: block.key });
  });

  it("brings the pair partner along, so a lecture never arrives without its lab", () => {
    const slots = slotsFromCurriculum(entry("NatSc 10.01", "NS1A", 1), block, file);
    expect(slots.map((s) => s.category).sort()).toEqual(["NS1A", "NS1B"]);
    expect(slots[0].pairedWith).toBe(slots[1].id);
  });
});

describe("slotFromCatalog", () => {
  it("carries no category, so it cannot alias-resolve", () => {
    expect(slotFromCatalog("MATH 10", 0)).toMatchObject({
      origin: "added", requirement: "MATH 10", category: null, sourceBlock: null, included: true,
    });
  });
});

describe("resolveSlots", () => {
  const resolve = (slots: ReturnType<typeof seedSlots>, locked: string[] = []) =>
    resolveSlots(slots, catalog, file, locked);

  it("marks an ordinary offered requirement ok", () => {
    const [math] = resolve(seedSlots(block, file));
    expect(math.status).toBe("ok");
    expect(math.sections.length).toBeGreaterThan(0);
  });

  it("marks an unfilled elective unfilled, with no sections", () => {
    const elective = resolve(seedSlots(block, file)).find((r) => r.slot.label === "FREE ELECTIVE")!;
    expect(elective.status).toBe("unfilled");
    expect(elective.sections).toEqual([]);
  });

  it("marks an unpinned pre-assigned course awaiting-section, not no-offerings (§5.6)", () => {
    const intact = resolve(seedSlots(block, file)).find((r) => r.slot.requirement === "INTACT 11")!;
    expect(intact.status).toBe("awaiting-section");
    expect(intact.sections).toEqual([]);
  });

  it("pinning a pre-assigned section yields exactly that section", () => {
    const one = catalog.sections.find((s) => s.courseCode === "INTACT 11")!;
    const key = `${one.courseCode} ${one.sectionCode}`;
    const intact = resolve(seedSlots(block, file), [key]).find((r) => r.slot.requirement === "INTACT 11")!;
    expect(intact.status).toBe("ok");
    expect(intact.pinned).toBe(key);
    expect(intact.sections).toHaveLength(1);
  });

  it("marks a requirement with no offerings no-offerings", () => {
    const slots = [slotFromCatalog("NOTACOURSE 999", 0)];
    expect(resolve(slots)[0].status).toBe("no-offerings");
  });

  it("awaits a section for the INTAC 1 spelling too, rather than offering 103 free choices", () => {
    const intac: CurriculumBlock = { ...block, entries: [entry("INTAC 1", "C", 0)] };
    const [r] = resolve(seedSlots(intac, file));
    expect(r.status).toBe("awaiting-section");
    expect(r.sections).toEqual([]);
    expect(r.allSections.length).toBeGreaterThan(100); // still pickable in the pin picker
  });

  it("gives a locked section to one slot only when two slots accept the same code", () => {
    // PFT3 and PFT4 alias to the identical PATHFit pool, so the locked key is in both
    // slots' allSections. Pinning both to it makes that one section conflict with itself
    // and reports zero schedules as "PATHFit 3 and PATHFit 4 always conflict".
    const pathfit: CurriculumBlock = {
      ...block, entries: [entry("PATHFit 3", "PFT3", 0), entry("PATHFit 4", "PFT4", 1)],
    };
    const one = catalog.sections.find((s) => s.courseCode.startsWith("PEPC 13"))!;
    const key = `${one.courseCode} ${one.sectionCode}`;
    const [first, second] = resolve(seedSlots(pathfit, file), [key]);
    expect(first.pinned).toBe(key);
    expect(second.pinned).toBeNull();
    expect(second.sections.length).toBeGreaterThan(1);
  });

  it("keeps every candidate in allSections even when sections is empty", () => {
    // The pin picker needs the alternatives precisely when generation has none.
    const intact = resolve(seedSlots(block, file)).find((r) => r.slot.requirement === "INTACT 11")!;
    expect(intact.sections).toEqual([]);
    expect(intact.allSections.length).toBeGreaterThan(100);
  });
});
