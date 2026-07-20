import { describe, it, expect } from "vitest";
import { normalizeName, mergeRatings, ratingFor } from "./profs";
import type { ProfRating } from "./types";

const r = (name: string, rating: ProfRating["rating"]): ProfRating => ({ name, rating });

describe("normalizeName", () => {
  it("swaps LASTNAME, FIRSTNAME to firstname lastname", () => {
    expect(normalizeName("GARCIA, JUAN")).toBe("juan garcia");
  });
  it("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeName("  Dela  Cruz,  Ma.  Ria ")).toBe("ma ria dela cruz");
    expect(normalizeName("Juan Garcia")).toBe("juan garcia");
  });
});

describe("mergeRatings", () => {
  it("personal overrides community for the same prof", () => {
    const merged = mergeRatings([r("GARCIA, JUAN", 2)], [r("Juan Garcia", 5)]);
    expect(merged.get("juan garcia")?.rating).toBe(5);
  });
  it("keeps community entries without personal override", () => {
    const merged = mergeRatings([r("SY, MARIA", 4)], []);
    expect(merged.get("maria sy")?.rating).toBe(4);
  });
});

describe("ratingFor", () => {
  const merged = mergeRatings([r("GARCIA, JUAN", 4), r("SY, MARIA", 5), r("SY, PEDRO", 2)], []);
  it("finds exact normalized matches across name formats", () => {
    expect(ratingFor("Juan Garcia", merged)?.rating).toBe(4);
  });
  it("falls back to last name only when unique", () => {
    expect(ratingFor("GARCIA, J.", merged)?.rating).toBe(4);
  });
  it("returns undefined when last name is ambiguous", () => {
    expect(ratingFor("SY, M.A.", merged)).toBeUndefined();
  });
  it("returns undefined for unknown profs and TBA", () => {
    expect(ratingFor("UNKNOWN, PERSON", merged)).toBeUndefined();
    expect(ratingFor("TBA", merged)).toBeUndefined();
  });
});
