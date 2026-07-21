import { describe, it, expect } from "vitest";
import { normalizeName, mergeRatings, ratingFor, ratingKey } from "./profs";
import type { ProfRating } from "./types";

const r = (name: string, rating: ProfRating["rating"], courseCode?: string): ProfRating =>
  courseCode ? { name, rating, courseCode } : { name, rating };

describe("normalizeName", () => {
  it("swaps LASTNAME, FIRSTNAME to firstname lastname", () => {
    expect(normalizeName("GARCIA, JUAN")).toBe("juan garcia");
  });
  it("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeName("  Dela  Cruz,  Ma.  Ria ")).toBe("ma ria dela cruz");
    expect(normalizeName("Juan Garcia")).toBe("juan garcia");
  });
});

describe("ratingKey", () => {
  it("scopes by course when given, and is course-agnostic otherwise", () => {
    expect(ratingKey("GARCIA, JUAN", "MATH 10")).toBe("juan garcia@MATH 10");
    expect(ratingKey("GARCIA, JUAN")).toBe("juan garcia");
  });
});

describe("mergeRatings", () => {
  it("personal overrides community at the same scope", () => {
    const merged = mergeRatings([r("GARCIA, JUAN", 2)], [r("Juan Garcia", 5)]);
    expect(ratingFor("GARCIA, JUAN", merged)?.rating).toBe(5);
  });
  it("keeps course-scoped and overall ratings as separate entries", () => {
    const merged = mergeRatings([r("SY, MARIA", 2, "MATH 10"), r("SY, MARIA", 5)], []);
    expect(ratingFor("SY, MARIA", merged, "MATH 10")?.rating).toBe(2);
    expect(ratingFor("SY, MARIA", merged)?.rating).toBe(5);
  });
});

describe("ratingFor", () => {
  const merged = mergeRatings(
    [r("GARCIA, JUAN", 4), r("GARCIA, JUAN", 1, "MATH 10"), r("SY, MARIA", 5), r("SY, PEDRO", 2)],
    []
  );
  it("prefers the course-scoped rating over the overall one", () => {
    expect(ratingFor("GARCIA, JUAN", merged, "MATH 10")?.rating).toBe(1);
  });
  it("falls back to the overall rating when the course has none", () => {
    expect(ratingFor("GARCIA, JUAN", merged, "MATH 99")?.rating).toBe(4);
  });
  it("falls back to a unique last name", () => {
    expect(ratingFor("GARCIA, J.", merged)?.rating).toBe(4);
  });
  it("returns undefined when the last name is ambiguous or unknown", () => {
    expect(ratingFor("SY, M.A.", merged)).toBeUndefined();
    expect(ratingFor("UNKNOWN, PERSON", merged)).toBeUndefined();
    expect(ratingFor("TBA", merged)).toBeUndefined();
  });
  it("accepts a 0-star rating (distinct from unrated)", () => {
    const zero = mergeRatings([r("CRUZ, JOSE", 0)], []);
    expect(ratingFor("CRUZ, JOSE", zero)?.rating).toBe(0);
  });
});
