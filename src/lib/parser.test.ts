import { describe, it, expect } from "vitest";
import { parseAisisTable, parseDays, parseMeetings } from "./parser";
import { AISIS_SAMPLE, AISIS_SAMPLE_WITH_BAD_ROWS } from "./fixtures/aisis-sample";

describe("parseDays", () => {
  it("expands Ateneo day-pair notation", () => {
    expect(parseDays("M-TH")).toEqual(["M", "TH"]);
    expect(parseDays("T-F")).toEqual(["T", "F"]);
    expect(parseDays("SAT")).toEqual(["SAT"]);
    expect(parseDays("MWF")).toEqual(["M", "W", "F"]);
    expect(parseDays("TTH")).toEqual(["T", "TH"]);
  });
  it("rejects unknown tokens", () => {
    expect(parseDays("XYZ")).toBeNull();
    expect(parseDays("")).toBeNull();
  });
});

describe("parseMeetings", () => {
  it("parses a single meeting", () => {
    expect(parseMeetings("M-TH 0800-0930")).toEqual({
      meetings: [{ days: ["M", "TH"], start: 480, end: 570 }],
      ok: true,
    });
  });
  it("parses slash-separated multiple meetings (lec+lab)", () => {
    expect(parseMeetings("M 1000-1100/SAT 0900-1200")).toEqual({
      meetings: [
        { days: ["M"], start: 600, end: 660 },
        { days: ["SAT"], start: 540, end: 720 },
      ],
      ok: true,
    });
  });
  it("treats TBA and empty as no meetings, ok", () => {
    expect(parseMeetings("TBA")).toEqual({ meetings: [], ok: true });
    expect(parseMeetings("")).toEqual({ meetings: [], ok: true });
  });
  it("flags unparseable time as not ok", () => {
    expect(parseMeetings("M-TH 25:00-2600").ok).toBe(false);
  });
});

describe("parseAisisTable", () => {
  it("parses the sample, skipping the header", () => {
    const { sections, warnings } = parseAisisTable(AISIS_SAMPLE);
    expect(sections).toHaveLength(7);
    expect(warnings).toHaveLength(0);
    const philo = sections[0];
    expect(philo.courseCode).toBe("PHILO 11");
    expect(philo.sectionCode).toBe("A");
    expect(philo.units).toBe(3);
    expect(philo.instructor).toBe("GARCIA, JUAN");
    expect(philo.meetings).toEqual([{ days: ["M", "TH"], start: 480, end: 570 }]);
  });
  it("parses parenthesized units and TBA sections", () => {
    const { sections } = parseAisisTable(AISIS_SAMPLE);
    const nstp = sections.find((s) => s.courseCode === "NSTP 11")!;
    expect(nstp.units).toBe(3);
    expect(nstp.meetings).toEqual([]);
  });
  it("never throws on bad rows; emits warnings instead", () => {
    const { sections, warnings } = parseAisisTable(AISIS_SAMPLE_WITH_BAD_ROWS);
    expect(warnings.length).toBe(2);
    // bad-time row is still imported, as TBA-like
    const theo = sections.find((s) => s.courseCode === "THEO 11")!;
    expect(theo.meetings).toEqual([]);
  });
  it("falls back to multi-space splitting when there are no tabs", () => {
    const spaced = "HISTO 11  A  RIZAL AND THE EMERGENCE OF THE NATION  3  M-TH 1230-1400  BEL 204  DELA CRUZ, RIA  35  ENG  U  10  ";
    const { sections, warnings } = parseAisisTable(spaced);
    expect(warnings).toHaveLength(0);
    expect(sections[0].courseCode).toBe("HISTO 11");
    expect(sections[0].meetings[0].days).toEqual(["M", "TH"]);
  });
});
