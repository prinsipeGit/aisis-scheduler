import { describe, it, expect } from "vitest";
import { parseDays, parseTimeCell, splitInstructors, parseRow, parseRows } from "./parser";
import { REAL_ROWS, EDGE_ROWS } from "./fixtures/aisis-real";

describe("parseDays", () => {
  it("expands Ateneo day-pair notation", () => {
    expect(parseDays("M-TH")).toEqual(["M", "TH"]);
    expect(parseDays("T-F")).toEqual(["T", "F"]);
    expect(parseDays("MWF")).toEqual(["M", "W", "F"]);
    expect(parseDays("TTH")).toEqual(["T", "TH"]);
    expect(parseDays("SAT")).toEqual(["SAT"]);
  });
  it("rejects unknown tokens", () => {
    expect(parseDays("XYZ")).toBeNull();
    expect(parseDays("")).toBeNull();
  });
});

describe("parseTimeCell", () => {
  it("parses time and strips the modality tag", () => {
    expect(parseTimeCell("M-TH 1100-1230(FULLY ONSITE)")).toEqual({
      meetings: [{ days: ["M", "TH"], start: 660, end: 750 }],
      modality: "FULLY ONSITE",
      status: "scheduled",
      ok: true,
    });
  });
  it("captures a non-onsite modality", () => {
    expect(parseTimeCell("T-F 1300-1430(ONLINE)").modality).toBe("ONLINE");
  });
  it("parses slash-separated lecture+lab meetings", () => {
    expect(parseTimeCell("M 1000-1100/SAT 0900-1200(FULLY ONSITE)").meetings).toEqual([
      { days: ["M"], start: 600, end: 660 },
      { days: ["SAT"], start: 540, end: 720 },
    ]);
  });
  it("treats TBA and empty as no meetings, still ok", () => {
    expect(parseTimeCell("TBA")).toEqual({ meetings: [], modality: "", status: "tba", ok: true });
    expect(parseTimeCell("")).toEqual({ meetings: [], modality: "", status: "tba", ok: true });
  });
  it("flags an unparseable time", () => {
    expect(parseTimeCell("M-TH 25:00-2600(FULLY ONSITE)")).toMatchObject({
      meetings: [], status: "parse-error", ok: false,
    });
  });
});

describe("splitInstructors", () => {
  it("keeps a single LAST, FIRST name intact", () => {
    expect(splitInstructors("ABERIN, MARIA ALVA Q.")).toEqual(["ABERIN, MARIA ALVA Q."]);
  });
  it("splits two profs whose names each contain a comma", () => {
    expect(splitInstructors("DE LOS SANTOS, Kurt Anthony, MIJARES, Jim Ralphealo")).toEqual([
      "DE LOS SANTOS, Kurt Anthony",
      "MIJARES, Jim Ralphealo",
    ]);
  });
  it("treats TBA and empty as no instructors", () => {
    expect(splitInstructors("TBA")).toEqual([]);
    expect(splitInstructors("")).toEqual([]);
  });
});

describe("parseRow", () => {
  it("parses a real row into a Section", () => {
    const { section, warning } = parseRow(REAL_ROWS[0]);
    expect(warning).toBeUndefined();
    expect(section).toMatchObject({
      courseCode: "MATH 1.1",
      sectionCode: "C",
      title: "PREPARATION FOR COLLEGE MATHEMATICS I",
      units: 3,
      instructors: ["ABERIN, MARIA ALVA Q."],
      modality: "FULLY ONSITE",
      room: "SEC-A215",
      meetings: [{ days: ["M", "TH"], start: 660, end: 750 }],
    });
  });
  it("normalizes a '-' remark to empty", () => {
    expect(parseRow(REAL_ROWS[1]).section!.remarks).toBe("");
  });
  it("keeps a real remark", () => {
    expect(parseRow(REAL_ROWS[2]).section!.remarks).toBe("1 SLOT(S) FOR CROSS REG-IXS MAJORS.");
  });
  it("parses multiple instructors", () => {
    expect(parseRow(REAL_ROWS[3]).section!.instructors).toHaveLength(2);
  });
  it("warns that an unparseable time is excluded from schedules, not treated as TBA", () => {
    const { section, warning } = parseRow(EDGE_ROWS[3]); // THEO 11, "25:00-2600"
    expect(section!.timeStatus).toBe("parse-error");
    expect(warning).toMatch(/excluded from generated schedules/i);
    expect(warning).not.toMatch(/treated as TBA/i);
  });
  it("skips a row with too few columns, with a warning", () => {
    const { section, warning } = parseRow(EDGE_ROWS[4]);
    expect(section).toBeNull();
    expect(warning).toMatch(/unrecognized/i);
  });
});

describe("parseRows", () => {
  it("parses all real rows with no warnings", () => {
    const { sections, warnings } = parseRows(REAL_ROWS);
    expect(sections).toHaveLength(5);
    expect(warnings).toEqual([]);
  });
  it("never throws on edge rows; imports bad-time rows without meetings", () => {
    const { sections, warnings } = parseRows(EDGE_ROWS);
    expect(sections).toHaveLength(5); // JUNK ROW skipped
    const theo = sections.find((s) => s.courseCode === "THEO 11")!;
    expect(theo.meetings).toEqual([]);
    expect(warnings).toHaveLength(3); // bad time + tutorial time + junk row
  });

  it("treats '~' as an empty remark, like '-'", () => {
    const { sections } = parseRows(EDGE_ROWS);
    expect(sections.find((s) => s.courseCode === "BIO 290")!.remarks).toBe("");
  });
  it("skips the header row", () => {
    const withHeader = [
      ["Subject Code", "Section", "Course Title", "Units", "Time", "Room", "Instructor", "Lang", "Level", "Remarks"],
      ...REAL_ROWS,
    ];
    expect(parseRows(withHeader).sections).toHaveLength(5);
  });
});
