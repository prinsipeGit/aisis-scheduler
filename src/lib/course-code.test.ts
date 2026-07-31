import { describe, it, expect } from "vitest";
import { canonicalCourseCode, sameCourseCode, subjectPrefix } from "./course-code";

describe("canonicalCourseCode", () => {
  it("collapses whitespace and uppercases", () => {
    expect(canonicalCourseCode("  math   10 ")).toBe("MATH 10");
  });
});

describe("sameCourseCode", () => {
  it("compares canonically", () => {
    expect(sameCourseCode("math 10", "MATH  10")).toBe(true);
    expect(sameCourseCode("MATH 10", "MATH 100")).toBe(false);
  });
});

describe("subjectPrefix", () => {
  it("takes the code up to the first space, for lecture/lab pairing (§5.4)", () => {
    expect(subjectPrefix("BIO 10.01")).toBe("BIO");
    expect(subjectPrefix("CHEM 10.02")).toBe("CHEM");
    expect(subjectPrefix("NSTP 11(CWTS)")).toBe("NSTP");
  });
  it("returns the whole code when there is no space", () => {
    expect(subjectPrefix("PEPC")).toBe("PEPC");
  });
});
