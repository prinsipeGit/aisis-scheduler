import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { acceptableCodes, sectionsFor, isPreAssigned, type AliasFile } from "./offerings";
import type { Catalog, Slot } from "./types";

const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8")) as Catalog;
const file = JSON.parse(readFileSync("data/course-aliases.json", "utf8")) as AliasFile;

const slot = (over: Partial<Slot>): Slot => ({
  id: "s", origin: "ips", label: "L", requirement: null, category: null,
  sourceBlock: null, chosen: null, pairedWith: null, included: true, ...over,
});

describe("acceptableCodes", () => {
  it("exact match resolves to the one code", () => {
    expect(acceptableCodes(slot({ requirement: "MATH 10" }), catalog, file)).toEqual(["MATH 10"]);
  });

  it("does not over-match a longer code with the same prefix", () => {
    // "MATH 100"/"MATH 101" extend "MATH 10" with a digit, not "." or "(", so they must not match.
    const codes = acceptableCodes(slot({ requirement: "MATH 10" }), catalog, file);
    expect(codes.some((c) => c.startsWith("MATH 10") && c !== "MATH 10")).toBe(false);
  });

  it("variant rule finds the PHILO 11 tracks and both NSTP 11 forms", () => {
    expect(acceptableCodes(slot({ requirement: "PHILO 11" }), catalog, file))
      .toEqual(["PHILO 11.03", "PHILO 11.04", "PHILO 11.05", "PHILO 11.06"]);
    expect(acceptableCodes(slot({ requirement: "NSTP 11" }), catalog, file))
      .toEqual(["NSTP 11(CWTS)", "NSTP 11(ROTC)"]);
  });

  it("resolves the PATHFit families through their categories", () => {
    const pft = (category: string, requirement: string) =>
      acceptableCodes(slot({ requirement, category }), catalog, file);
    expect(pft("PFT1", "PATHFit 1")).toEqual(["PEPC 10"]);
    // data/catalogs/catalog-2026-1.json (exported 2026-07-29) has three distinct PEPC 11.*
    // codes — PEPC 11.03, PEPC 11.05, PEPC 11.30 — and no PEPC 12. Re-derived from the
    // catalog per the brief's Step 5 instruction. PFT3 stays 23.
    expect(pft("PFT2", "PATHFit 2")).toHaveLength(3);
    expect(pft("PFT3", "PATHFit 3")).toHaveLength(23);
  });

  it("resolves natural science and foreign language", () => {
    expect(acceptableCodes(slot({ requirement: "NatSc 10.01", category: "NS1A" }), catalog, file)).toHaveLength(4);
    expect(acceptableCodes(slot({ requirement: "FLC 11", category: "FLC1" }), catalog, file)).toHaveLength(7);
  });

  it("prefers the category key over the catNo key", () => {
    // catNo differs between programs (NatSc 10.01 vs NATSCI 1A) but the category does not.
    const a = acceptableCodes(slot({ requirement: "NatSc 10.01", category: "NS1A" }), catalog, file);
    const b = acceptableCodes(slot({ requirement: "NATSCI 1A", category: "NS1A" }), catalog, file);
    expect(a).toEqual(b);
  });

  it("falls back to the catNo key when the category is not an alias key", () => {
    // FLC 12's category is RM1, which is program-local and therefore not a key.
    expect(acceptableCodes(slot({ requirement: "FLC 12", category: "RM1" }), catalog, file)).toHaveLength(5);
  });

  it("a narrowed slot resolves to exactly its chosen code", () => {
    const narrowed = slot({ requirement: "PATHFit 3", category: "PFT3", chosen: "PEPC 13.15" });
    expect(acceptableCodes(narrowed, catalog, file)).toEqual(["PEPC 13.15"]);
  });

  it("an unfilled elective resolves to nothing", () => {
    expect(acceptableCodes(slot({ requirement: null }), catalog, file)).toEqual([]);
  });
});

describe("sectionsFor", () => {
  it("returns every section of every acceptable code", () => {
    const sections = sectionsFor(slot({ requirement: "NSTP 11" }), catalog, file);
    expect(sections.length).toBeGreaterThan(40);
    expect(new Set(sections.map((s) => s.courseCode))).toEqual(new Set(["NSTP 11(CWTS)", "NSTP 11(ROTC)"]));
  });
});

describe("isPreAssigned", () => {
  it("is true for INTACT 11 and false otherwise", () => {
    expect(isPreAssigned(slot({ requirement: "INTACT 11" }), file)).toBe(true);
    expect(isPreAssigned(slot({ requirement: "MATH 10" }), file)).toBe(false);
  });
});
