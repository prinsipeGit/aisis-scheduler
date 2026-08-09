import { describe, it, expect } from "vitest";
import { defaultTerm, termHeading } from "./term";

const ALL = ["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"];
const at = (y: number, m: number) => new Date(y, m - 1, 15);

describe("defaultTerm", () => {
  it("picks the term being enlisted for, not the one running", () => {
    expect(defaultTerm(at(2026, 7), ALL)).toBe("2026-1");  // Jul  -> First Sem
    expect(defaultTerm(at(2026, 11), ALL)).toBe("2026-2"); // Nov  -> Second Sem
    expect(defaultTerm(at(2026, 4), ALL)).toBe("2025-0");  // Apr  -> Intersession
  });

  it("handles the academic-year rollover at both boundaries", () => {
    // Dec 2026 and Jan 2027 are the same academic year's second semester.
    expect(defaultTerm(at(2026, 12), ALL)).toBe("2026-2");
    expect(defaultTerm(at(2027, 1), [...ALL, "2027-1"])).toBe("2026-2");
    // Feb -> Mar crosses from second semester into intersession planning.
    expect(defaultTerm(at(2026, 2), ALL)).toBe("2025-2");
    expect(defaultTerm(at(2026, 3), ALL)).toBe("2025-0");
  });

  it("falls back to the newest available term when the computed one has no catalog", () => {
    // November computes 2026-2, which nobody has scraped.
    expect(defaultTerm(at(2026, 11), ["2026-1", "2025-2"])).toBe("2026-1");
  });

  it("returns the empty string when nothing is available at all", () => {
    expect(defaultTerm(at(2026, 7), [])).toBe("");
  });
});

describe("termHeading", () => {
  it("turns an AISIS term code into a student-facing semester and academic year", () => {
    expect(termHeading("2026-1")).toEqual({
      semester: "First Semester",
      academicYear: "A.Y. 2026\u20132027",
    });
    expect(termHeading("2026-2").semester).toBe("Second Semester");
    expect(termHeading("2026-0").semester).toBe("Intersession");
  });

  it("keeps an unknown term visible instead of inventing an academic year", () => {
    expect(termHeading("future")).toEqual({ semester: "Current Semester", academicYear: "future" });
  });
});
