import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  programId, parseVersion, versionLabelOf, parseProgramOptions, latestPerTrack,
  isElectiveEntry, electiveDeptFor, parseCurriculumPage,
} from "./curriculum-parse.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SAMPLE = readFileSync(join(__dir, "fixtures/j-vofc-sample.html"), "utf8");

describe("programId", () => {
  it("slugifies the code and appends the raw version", () => {
    expect(programId("BS AMDSc-M DSc", "2024")).toBe("BS-AMDSc-M-DSc-2024");
  });
  it("handles codes containing parentheses and keeps tracks distinct", () => {
    expect(programId("AB LIT(ENG)", "24TB")).toBe("AB-LIT-ENG-24TB");
    expect(programId("AB EU", "20IR")).toBe("AB-EU-20IR");
  });
});

describe("parseVersion", () => {
  it("reads a plain 4-digit year", () => {
    expect(parseVersion("2024")).toEqual({ versionYear: 2024, track: "" });
  });
  it("expands a 2-digit year and captures the track", () => {
    expect(parseVersion("24BE")).toEqual({ versionYear: 2024, track: "BE" });
    expect(parseVersion("99TB")).toEqual({ versionYear: 1999, track: "TB" });
  });
  it("returns null for an unrecognizable version", () => {
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("NOPE")).toBeNull();
  });
});

describe("versionLabelOf", () => {
  it("shows the year alone, or the year and track", () => {
    expect(versionLabelOf(2024, "")).toBe("2024");
    expect(versionLabelOf(2024, "BE")).toBe("2024 · BE");
  });
});

describe("parseProgramOptions", () => {
  it("parses code, version and name from the option value and label", () => {
    const { options } = parseProgramOptions(
      `<select name="degCode">
         <option value="">-- Select --</option>
         <option value="BS AMDSc-M DSc_2024_1">(BS AMDSc-M DSc) BACHELOR OF SCIENCE IN APPLIED MATHEMATICS(Ver Sem 1, Ver Year 2024)</option>
       </select>`
    );
    expect(options).toEqual([{
      value: "BS AMDSc-M DSc_2024_1", code: "BS AMDSc-M DSc", version: "2024",
      name: "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS",
      versionYear: 2024, track: "", versionLabel: "2024",
    }]);
  });
  it("parses a code containing parentheses without corrupting code or name", () => {
    const { options } = parseProgramOptions(
      `<option value="AB LIT(ENG)_24TB_1">(AB LIT(ENG)) BACHELOR OF ARTS IN LITERATURE (ENGLISH)(Ver Sem 1, Ver Year 24TB)</option>`
    );
    expect(options[0].code).toBe("AB LIT(ENG)");
    expect(options[0].name).toBe("BACHELOR OF ARTS IN LITERATURE (ENGLISH)");
    expect(options[0].track).toBe("TB");
  });
  it("reports unparseable options instead of dropping them silently", () => {
    const { options, skipped } = parseProgramOptions(`<option value="JUNK">whatever</option>`);
    expect(options).toEqual([]);
    expect(skipped).toEqual(["JUNK"]);
  });
  it("parses every option in the captured AISIS page with none skipped", () => {
    const { options, skipped } = parseProgramOptions(SAMPLE);
    const rawCount = [...SAMPLE.matchAll(/<option\b[^>]*value\s*=\s*"([^"]+)"/gi)].length;
    expect(skipped).toEqual([]);
    expect(options).toHaveLength(rawCount);
    expect(options).toHaveLength(472);
  });
});

describe("latestPerTrack", () => {
  it("keeps the newest version of each (code, track) pair", () => {
    const mk = (code, version) => ({
      code, version, value: `${code}_${version}_1`, name: "N", ...parseVersion(version),
      versionLabel: "x",
    });
    const result = latestPerTrack([mk("AB EU", "18BE"), mk("AB EU", "24BE"), mk("AB EU", "20IR")]);
    expect(result.map((o) => o.version)).toEqual(["24BE", "20IR"]);
  });
  it("keeps parallel tracks that would vanish if grouped by code alone", () => {
    const latest = latestPerTrack(parseProgramOptions(SAMPLE).options);
    const ids = latest.map((o) => programId(o.code, o.version));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("BS-AMDSc-M-DSc-2024");
    expect(ids).toContain("AB-EU-24BE");
    expect(ids).toContain("AB-EU-20IR");
    expect(latest).toHaveLength(233);
  });
});

describe("elective detection", () => {
  it("flags placeholder elective slots by catNo or title", () => {
    expect(isElectiveEntry("MATHEMATICS ELECTIVE", "MATHEMATICS ELECTIVE")).toBe(true);
    expect(isElectiveEntry("FREE ELECTIVE", "")).toBe(true);
    expect(isElectiveEntry("IE 1", "INTERDISCIPLINARY ELECTIVE 1 - ENGLISH")).toBe(true);
    expect(isElectiveEntry("MATH GRAD ELECTIVE", "MATHEMATICS GRAD ELECTIVE")).toBe(true);
    expect(isElectiveEntry("IE 3", "INTERDISCIPLINARY ELECTIVE 3")).toBe(true);
  });
  it("does not flag ordinary courses", () => {
    expect(isElectiveEntry("MATH 31.1", "MATHEMATICAL ANALYSIS IA")).toBe(false);
    expect(isElectiveEntry("THEO 11", "FAITH, SPIRITUALITY, AND THE CHURCH")).toBe(false);
  });
  it("marks IE slots with their department, others with none", () => {
    expect(electiveDeptFor("IE 1")).toBe("**IE**");
    expect(electiveDeptFor("FREE ELECTIVE")).toBeUndefined();
  });
});

describe("parseCurriculumPage", () => {
  // Mirrors the real page's shape, including an unclosed <td> before the year
  // heading — the exact malformation that breaks naive <td>…</td> pairing.
  const HTML = `
    <tr><td width="100%" colspan="3" background="s.jpg"><img src="s.jpg"></tr>
    <tr><td class="text06" colspan="3" align="center">First Year</td></tr>
    <table><tr><td colspan="5" align="center" class="text04">First Semester - 6.0 Units</td></tr>
      <tr><td class="text04">Cat No</td><td class="text04">Course Title</td><td class="text04">Units</td>
          <td class="text04">Prerequisites</td><td class="text04">Category</td></tr>
      <tr><td class="text02" >MATH 10</td><td class="text02" >MATHEMATICS IN THE MODERN WORLD</td>
          <td align="center" class="text02" >3</td><td class="text02" ></td><td class="text02" >C</td></tr>
      <tr><td class="text02" >INTACT 11</td><td class="text02" >INTRO TO ATENEO CULTURE</td>
          <td align="center" class="text02" >0</td><td class="text02" ></td><td class="text02" >C</td></tr>
      <tr><td class="text02" >PATHFit 2</td><td class="text02" >PHYSICAL ACTIVITIES 2</td>
          <td align="center" class="text02" >3</td><td class="text02" >PATHFit 1, MATH 10</td>
          <td class="text02" >PFT2</td></tr></table>
    <tr><td class="text06" colspan="3" align="center">Third Year</td></tr>
    <table><tr><td colspan="5" align="center" class="text04">Fourth Year - 3.0 Units</td></tr>
      <tr><td class="text02" >IE 1</td><td class="text02" >INTERDISCIPLINARY ELECTIVE 1 - ENGLISH</td>
          <td align="center" class="text02" >3</td><td class="text02" >ENGL 11</td>
          <td class="text02" >IE1E</td></tr></table>`;

  it("groups entries into year|term blocks with keys and slotIds", () => {
    const { blocks } = parseCurriculumPage(HTML);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].key).toBe("First Year|First Semester");
    expect(blocks[0].year).toBe("First Year");
    expect(blocks[0].term).toBe("First Semester");
    expect(blocks[0].entries.map((e) => e.slotId)).toEqual([
      "First Year|First Semester#0", "First Year|First Semester#1", "First Year|First Semester#2",
    ]);
  });
  it("reads total units from the combined term heading", () => {
    expect(parseCurriculumPage(HTML).blocks[0].totalUnits).toBe(6);
  });
  it("keeps the quirk block whose term is printed as a year", () => {
    expect(parseCurriculumPage(HTML).blocks[1].key).toBe("Third Year|Fourth Year");
  });
  it("keeps zero-unit courses and splits comma-separated prerequisites", () => {
    const entries = parseCurriculumPage(HTML).blocks[0].entries;
    expect(entries.find((e) => e.catNo === "INTACT 11").units).toBe(0);
    expect(entries.find((e) => e.catNo === "PATHFit 2").prerequisites).toEqual(["PATHFit 1", "MATH 10"]);
    expect(entries.find((e) => e.catNo === "MATH 10").prerequisites).toEqual([]);
  });
  it("skips the Cat No/Course Title column-header row", () => {
    expect(parseCurriculumPage(HTML).blocks[0].entries.some((e) => e.catNo === "Cat No")).toBe(false);
  });
  it("marks the IE slot elective with its department", () => {
    const ie = parseCurriculumPage(HTML).blocks[1].entries[0];
    expect(ie.isElective).toBe(true);
    expect(ie.electiveDept).toBe("**IE**");
    expect(ie.category).toBe("IE1E");
  });
  it("returns no blocks and no throw for a page with no curriculum tables", () => {
    expect(parseCurriculumPage("<html><body><p>nothing</p></body></html>").blocks).toEqual([]);
  });

  // The captured page IS the BS AMDSc 2024 curriculum, so its parse must reproduce
  // the hand-transcribed file exactly. This is the strongest check in the suite.
  it("reproduces the committed BS AMDSc 2024 curriculum exactly", () => {
    const committed = JSON.parse(
      readFileSync(join(__dir, "../data/curricula/BS-AMDSc-M-DSc-2024.json"), "utf8")
    );
    const { blocks } = parseCurriculumPage(SAMPLE);
    expect(blocks).toHaveLength(committed.blocks.length);
    for (const [i, expected] of committed.blocks.entries()) {
      expect(blocks[i].key).toBe(expected.key);
      expect(blocks[i].totalUnits).toBe(expected.totalUnits);
      expect(blocks[i].entries).toEqual(expected.entries);
    }
  });
});
