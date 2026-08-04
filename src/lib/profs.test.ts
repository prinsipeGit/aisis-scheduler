import { describe, it, expect } from "vitest";
import { normalizeName, lastNames, mergeRatings, ratingFor } from "./profs";

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

describe("lastNames", () => {
  it("keeps only the surname, title-cased off the catalog's shouting", () => {
    expect(lastNames(["BACABAC, Marion Michael"])).toEqual(["Bacabac"]);
    expect(lastNames(["DE GUZMAN, Ivan Adrian"])).toEqual(["De Guzman"]);
  });
  it("lists every instructor of a team-taught section", () => {
    expect(lastNames(["CRUZ, RONALD ALLAN L.", "ELICANO, ANTONIO RAFAEL N."]))
      .toEqual(["Cruz", "Elicano"]);
  });
  // AISIS separates instructors with the same comma it uses between last and first name, so
  // "GUIDOTE, JR., ARMANDO M." reaches us already split into a name and a loose fragment.
  // Showing the fragment would invent a second professor on the block.
  it("drops a first-name fragment left over from an ambiguous split", () => {
    expect(lastNames(["GUIDOTE, JR.", "ARMANDO M."])).toEqual(["Guidote"]);
    expect(lastNames(["ALVAREZ, SJ", "FR. FRANCIS"])).toEqual(["Alvarez"]);
    expect(lastNames(["ENRIQUEZ, ERWIN P.", "GARCIA, Julius Adrie", "GUIDOTE, JR.", "ARMANDO M., LAPINIG", "DANIELLE B."]))
      .toEqual(["Enriquez", "Garcia", "Guidote", "Armando M."]);
  });
  it("keeps a bare name when that is all the catalog gave", () => {
    expect(lastNames(["Sorgon"])).toEqual(["Sorgon"]);
  });
  it("reads both spellings of an unassigned instructor as TBA", () => {
    expect(lastNames(["TBA, -"])).toEqual(["TBA"]);
    expect(lastNames(["TO BE ARRANGED"])).toEqual(["TBA"]);
  });
  it("returns nothing for an empty or blank roster", () => {
    expect(lastNames([])).toEqual([]);
    expect(lastNames(["   "])).toEqual([]);
  });
  it("does not repeat a surname listed twice", () => {
    expect(lastNames(["CRUZ, Ana", "CRUZ, Ana"])).toEqual(["Cruz"]);
  });
});
