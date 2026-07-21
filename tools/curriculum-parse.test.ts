import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgramOptions, latestPerCode, programId } from "./curriculum-parse.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SAMPLE = readFileSync(join(__dir, "fixtures/j-vofc-sample.html"), "utf8");

describe("programId", () => {
  it("slugifies the code and appends the version year", () => {
    expect(programId("BS AMDSc-M DSc", 2024)).toBe("BS-AMDSc-M-DSc-2024");
  });
  it("collapses runs of non-alphanumerics into one dash", () => {
    expect(programId("AB  (CD)/EF", 2020)).toBe("AB-CD-EF-2020");
  });
});

describe("parseProgramOptions", () => {
  it("parses (CODE) NAME(Ver Sem N, Ver Year YYYY) labels", () => {
    const options = parseProgramOptions(
      `<select name="curriculumCode">
         <option value="">-- Select --</option>
         <option value="X1">(BS AMDSc-M DSc) BACHELOR OF SCIENCE IN APPLIED MATHEMATICS(Ver Sem 1, Ver Year 2024)</option>
         <option value="X2">(AB IS) INTERDISCIPLINARY STUDIES(Ver Sem 2, Ver Year 2020)</option>
       </select>`
    );
    expect(options).toEqual([
      { value: "X1", code: "BS AMDSc-M DSc", name: "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS", versionYear: 2024 },
      { value: "X2", code: "AB IS", name: "INTERDISCIPLINARY STUDIES", versionYear: 2020 },
    ]);
  });
  it("skips placeholder and unparseable options", () => {
    expect(parseProgramOptions(`<select><option value="">-- Select --</option><option value="Z">JUNK</option></select>`)).toEqual([]);
  });
  it("finds real options in the captured AISIS page", () => {
    const options = parseProgramOptions(SAMPLE);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(o.code).not.toBe("");
      expect(Number.isInteger(o.versionYear)).toBe(true);
    }
  });
});

describe("latestPerCode", () => {
  it("keeps only the highest version year per code, sorted by code", () => {
    const options = [
      { value: "b", code: "BS AMDSc-M DSc", name: "N", versionYear: 2020 },
      { value: "a", code: "BS AMDSc-M DSc", name: "N", versionYear: 2024 },
      { value: "c", code: "AB IS", name: "M", versionYear: 2018 },
    ];
    expect(latestPerCode(options)).toEqual([
      { value: "c", code: "AB IS", name: "M", versionYear: 2018 },
      { value: "a", code: "BS AMDSc-M DSc", name: "N", versionYear: 2024 },
    ]);
  });
});
