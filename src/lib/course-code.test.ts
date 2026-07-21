import { describe, expect, it } from "vitest";
import { canonicalCourseCode, sameCourseCode } from "./course-code";

describe("course-code identity", () => {
  it("normalizes case and repeated whitespace", () => {
    expect(canonicalCourseCode("  SocSc   11 ")).toBe("SOCSC 11");
    expect(sameCourseCode("SocSc 11", "SOCSC 11")).toBe(true);
  });

  it("does not collapse meaningful punctuation", () => {
    expect(sameCourseCode("MATH 31.1", "MATH 311")).toBe(false);
  });
});
