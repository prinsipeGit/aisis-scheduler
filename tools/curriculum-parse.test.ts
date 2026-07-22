import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  programId, parseVersion, versionLabelOf, parseProgramOptions, latestPerTrack,
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
