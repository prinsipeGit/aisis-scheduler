import { describe, it, expect } from "vitest";
import { parseDays, parseTimeRange, parseTimeCell, splitInstructors, parseRow, parseRows } from "./schedule-parse.mjs";
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

describe("parseTimeRange", () => {
  it("parses AISIS 0800-0930 style ranges", () => {
    expect(parseTimeRange("0800-0930")).toEqual({ start: 480, end: 570 });
    expect(parseTimeRange("1330-1430")).toEqual({ start: 810, end: 870 });
  });
  it("returns null for garbage or inverted ranges", () => {
    expect(parseTimeRange("TBA")).toBeNull();
    expect(parseTimeRange("0930-0800")).toBeNull();
    expect(parseTimeRange("8:00-9:30")).toBeNull();
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
  it("parses semicolon-separated meetings, as AISIS also prints them", () => {
    expect(parseTimeCell("M-TH 1230-1400; W 1100-1300(FULLY ONSITE)").meetings).toEqual([
      { days: ["M", "TH"], start: 750, end: 840 },
      { days: ["W"], start: 660, end: 780 },
    ]);
  });
  it("parses two meetings on the same day", () => {
    expect(parseTimeCell("M 0800-1100; M 1130-1430(FULLY ONSITE)").meetings).toEqual([
      { days: ["M"], start: 480, end: 660 },
      { days: ["M"], start: 690, end: 870 },
    ]);
  });
  it("treats TBA and empty as no meetings, still ok", () => {
    expect(parseTimeCell("TBA")).toEqual({ meetings: [], modality: "", status: "tba", ok: true });
    expect(parseTimeCell("")).toEqual({ meetings: [], modality: "", status: "tba", ok: true });
  });
  it("treats the TUTORIAL 0000-0000 placeholder as TBA, not bad data", () => {
    for (const cell of ["TUTORIAL 0000-0000(FULLY ONSITE)", "TUTORIAL 0000-0000(~)", "TUTORIAL"]) {
      expect(parseTimeCell(cell)).toMatchObject({ meetings: [], status: "tba", ok: true });
    }
  });
  it("still rejects a 0000-0000 that is not the TUTORIAL placeholder", () => {
    expect(parseTimeCell("M 0000-0000(FULLY ONSITE)")).toMatchObject({
      meetings: [], status: "parse-error", ok: false,
    });
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
    expect(warnings).toHaveLength(2); // bad time + junk row
  });
  it("imports a TUTORIAL row as a warning-free TBA section, not a parse error", () => {
    const { sections, warnings } = parseRows(EDGE_ROWS);
    const tutorial = sections.find((s) => s.courseCode === "BIO 290")!;
    expect(tutorial.timeStatus).toBe("tba");
    expect(tutorial.meetings).toEqual([]);
    expect(warnings.some((w) => w.includes("BIO 290"))).toBe(false);
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
