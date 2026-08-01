import { describe, it, expect } from "vitest";
import { normalizeName, mergeRatings, ratingFor } from "./profs";

describe("normalizeName", () => {
  it("flips 'LAST, First' into 'first last' and strips punctuation", () => {
    expect(normalizeName("ABERIN, MARIA ALVA Q.")).toBe("maria alva q aberin");
  });
  it("leaves a name with no comma alone", () => {
    expect(normalizeName("Bacabac, Marion Michael")).toBe("marion michael bacabac");
  });
});

describe("ratingFor", () => {
  const merged = mergeRatings(
    [{ name: "CRUZ, Ana", rating: 4 }, { name: "CRUZ, Ana", rating: 5, courseCode: "MATH 10" }],
    []
  );
  it("prefers a course-scoped rating over the overall one", () => {
    expect(ratingFor("CRUZ, Ana", merged, "MATH 10")?.rating).toBe(5);
    expect(ratingFor("CRUZ, Ana", merged)?.rating).toBe(4);
  });
  it("falls back on a unique last name", () => {
    expect(ratingFor("CRUZ, Anabelle", merged)?.rating).toBe(4);
  });
  it("does not guess when a last name is ambiguous", () => {
    const two = mergeRatings([{ name: "CRUZ, Ana", rating: 4 }, { name: "CRUZ, Ben", rating: 2 }], []);
    expect(ratingFor("CRUZ, Carla", two)).toBeUndefined();
  });
  it("lets a personal rating override a community one", () => {
    const m = mergeRatings([{ name: "CRUZ, Ana", rating: 1 }], [{ name: "CRUZ, Ana", rating: 5 }]);
    expect(ratingFor("CRUZ, Ana", m)?.rating).toBe(5);
  });
  it("returns undefined for an empty name", () => {
    expect(ratingFor("", merged)).toBeUndefined();
  });
});
