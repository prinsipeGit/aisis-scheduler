# AISIS Scheduler v2 — IPS-Driven Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the scheduler's front half around program + official curriculum (IPS): pick a program, a curriculum block and a calendar term, get an editable IPS-seeded required-course list, and match it against real scraped AISIS offerings using the existing schedule engine.

**Architecture:** Existing static Vite + React + TS SPA. The v1 engine (`generator.ts`, `time.ts`, weekly grid) is reused as-is; `ranker.ts`/`profs.ts` adapt to multi-instructor and course-scoped ratings; `parser.ts` is rewritten for the real 10-column AISIS format. Two new data-layer modules (`curriculum.ts`, `catalog.ts`) are the deliberate Supabase swap points. A new Node scraper produces per-term catalog JSON from the **public** `classSkeds.do` endpoint.

**Tech Stack:** Vite 5, React 18, TypeScript 5 (strict), Vitest 2 + jsdom + @testing-library/react. Scraper is plain Node 18+ ESM (`node:` builtins + global `fetch`), no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-07-21-ips-driven-scheduler-design.md`

## Global Constraints

- TypeScript `strict: true`. **Build gate is scoped:** Task 1 intentionally breaks the type-check and it stays red until Task 12. For Tasks 2-11 the gate before each commit is `npx vitest run <the task's test files>`; from Task 12 onward `npm run build` must pass again. Do not try to green the build early.
- Files under `src/lib/` MUST NOT import React, DOM APIs (except `src/lib/storage.ts`, which uses only `localStorage`), or anything from `src/components/`.
- All catalog reads go through `src/lib/catalog.ts`; all curriculum reads through `src/lib/curriculum.ts`. No other file imports the JSON data files.
- Times are integer minutes-from-midnight (e.g. `0800` → `480`).
- Section identity is `sectionKey(section)` = `` `${courseCode} ${sectionCode}` `` (e.g. `"MATH 10 A3"`).
- localStorage key `"aisis-scheduler-state"`, `STORAGE_VERSION = 2`. v1 state resets to v2 defaults with a notice.
- Calendar term codes are `YYYY-N` where `N` is `1` = First Semester, `2` = Second Semester, `0` = Intersession. The six AISIS-exposed terms are `2026-2`, `2026-1`, `2026-0`, `2025-2`, `2025-1`, `2025-0`.
- **Verified 2026-07-21:** `2026-2` has NO published schedule yet (AISIS returns "Sorry. There are no results for your search criteria."). Row counts for MATHEMATICS: 2026-1 = 201, 2026-0 = 75, 2025-2 = 215, 2025-1 = 214, 2025-0 = 69. The app's default term is therefore **`2026-1`**, not the newest code.
- **Real-data scale:** with the real catalog, a single course can have 40-50 sections (ENGL 11 has 48, THEO 11 has 49). Six such courses is a combinatorial explosion, so the generator's `MAX_SCHEDULES` cap and the ranker both matter. Task 12a lowers the cap and the UI only ever shows the top-ranked page. Never assume "a handful of sections per course" — the v1 placeholder data was misleading on this point.
- **Full/closed classes are OUT OF SCOPE for v2.** `UserState.fullSections` and the generator's filtering stay (already built and tested in v1) but NO UI writes them. Focus is generating the best schedules from preferences.
- The scraper targets the **public** endpoint `https://aisis.ateneo.edu/j_aisis/classSkeds.do`. It MUST NOT send, prompt for, or store credentials.
- **Verified POST body** (field names confirmed live 2026-07-21 by reading the form): `command=displayResults`, `subjCode=ALL`, `applicablePeriod=<term>`, `deptCode=<code>`. The term field is `applicablePeriod` — NOT `sy`.
- Parsers never throw on bad input — they return warnings.
- Prof ratings are **first-party only** (entered in-app). No scraping of Facebook or any social platform (spec §6.1).
- Test command: `npx vitest run`. Working directory for all commands: repo root `/Users/princeangelorivera/Documents/PROJECTS/aisis-scheduler`.
- Work on branch `feature/v2` (create from `main` before Task 1; never commit to `main`).

## Spec Deviation (deliberate, carried through this plan)

Spec §4 types `CurriculumBlock.term` as the union `"First Semester" | "Second Semester" | "Intersession"`. **The real captured curriculum violates this**: BS AMDSc has blocks printed as `"Fourth Year - 6.0 Units"` nested under *Third Year* and under *Fifth Year*. This plan therefore types `term: string` (the printed label, verbatim), matching spec §2.2's instruction to "handle each printed block independently." Everything else in §4 stands.

---

### Task 1: v2 types

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (every later task depends on these): `Section` gains `instructors: string[]` and `modality: string` (replacing `instructor: string`); `Catalog.semester` renamed to `Catalog.term`; `ProfRating` widened to `0..5` with optional `courseCode`; new `ProgramSummary`, `Program`, `CurriculumBlock`, `CurriculumEntry`; `UserState` replaced with the v2 shape.

- [ ] **Step 1: Rewrite `src/lib/types.ts`**

Replace the whole file with:

```ts
export type Day = "M" | "T" | "W" | "TH" | "F" | "SAT" | "SUN";

export interface Meeting {
  days: Day[];
  start: number; // minutes from midnight
  end: number;
}

export interface Section {
  courseCode: string;    // "MATH 10"
  sectionCode: string;   // "A3"
  title: string;
  units: number;
  instructors: string[]; // as printed by AISIS, e.g. ["ABERIN, MARIA ALVA Q."]
  modality: string;      // "FULLY ONSITE" | "ONLINE" | "" when absent
  meetings: Meeting[];   // empty ⇒ TBA (excluded from conflict math)
  room: string;
  remarks: string;
  raw: string;           // original row cells joined by " | ", for debugging
}

export interface Catalog {
  term: string;          // "2026-2"
  exportedAt: string;    // ISO timestamp
  sections: Section[];
  warnings: string[];
}

export interface ProfRating {
  name: string;          // instructor as printed by AISIS
  rating: 0 | 1 | 2 | 3 | 4 | 5;
  courseCode?: string;   // scope to a class; omit = overall rating for the prof
  note?: string;
  asOf?: string;
}

// ---- Curriculum (official IPS) ----

export interface ProgramSummary {
  id: string;            // "BS-AMDSc-2024"
  code: string;          // "BS AMDSc-M DSc"
  name: string;          // "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS"
  versionYear: number;   // 2024
}

export interface CurriculumEntry {
  catNo: string;         // "MATH 31.1"; placeholder text for elective slots
  title: string;
  units: number;         // may be 0
  prerequisites: string[];
  category: string;      // "M", "C", "IE1E", "RM1", …
  isElective: boolean;   // true for MATHEMATICS ELECTIVE / FREE ELECTIVE / IE 1 …
  electiveDept?: string; // IE slots → "**IE**"
  slotId: string;        // unique within the program, e.g. "First Year|First Semester#4"
}

export interface CurriculumBlock {
  year: string;          // "First Year" … as printed
  term: string;          // printed label; usually a semester, sometimes a quirk (see plan header)
  key: string;           // `${year}|${term}`
  totalUnits: number;
  entries: CurriculumEntry[];
}

export interface Program extends ProgramSummary {
  blocks: CurriculumBlock[];
}

// ---- Ranking / preferences ----

export type RankCriterion =
  | "compactDays"
  | "fewestDays"
  | "lateStart"
  | "earlyEnd"
  | "preferredProfs";

export interface Preferences {
  criteria: RankCriterion[];      // ordered by priority; default ["compactDays"]
  earliestStart?: number;
  latestEnd?: number;
  protectedBlocks: Meeting[];
  excludedSections: string[];     // sectionKeys
}

export interface UserState {
  version: number;                       // 2
  programId: string;                     // "" until chosen
  blockKey: string;                      // "" until chosen
  calendarTerm: string;                  // "2026-2"
  requiredCourses: string[];             // course codes; seeded from block, then edited
  electiveFills: Record<string, string>; // slotId → concrete course code
  lockedSections: string[];
  fullSections: string[];
  preferences: Preferences;
  personalRatings: ProfRating[];
}

export type Schedule = Section[];

export interface Diagnostics {
  perCourse: { courseCode: string; total: number; afterFilters: number }[];
  conflictPairs: { a: string; b: string }[];
  nWayConflict: boolean;
}

export function sectionKey(s: Section): string {
  return `${s.courseCode} ${s.sectionCode}`;
}
```

- [ ] **Step 2: Confirm the expected breakage**

Run: `npx tsc --noEmit`
Expected: FAIL with errors in `parser.ts`, `catalog.ts`, `ranker.ts`, `storage.ts`, and components referencing `instructor`/`semester`/old `UserState`. This is expected — Tasks 2–13 fix each. Do not fix them now.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: v2 types (multi-instructor sections, curriculum, v2 user state)"
```

---

### Task 2: Parser rewrite for the real AISIS format

**Files:**
- Create: `src/lib/fixtures/aisis-real.ts`
- Rewrite: `src/lib/parser.ts`
- Rewrite: `src/lib/parser.test.ts`
- Delete: `src/lib/fixtures/aisis-sample.ts`

**Interfaces:**
- Consumes: `parseTimeRange` from `src/lib/time.ts`; `Day`, `Meeting`, `Section` from `src/lib/types.ts`.
- Produces: `parseRow(cells: string[]): { section: Section | null; warning?: string }`, `parseRows(rows: string[][]): { sections: Section[]; warnings: string[] }`, `parseDays(token: string): Day[] | null`, `parseTimeCell(cell: string): { meetings: Meeting[]; modality: string; ok: boolean }`, `splitInstructors(cell: string): string[]`. Consumed by the scraper (Task 3) and catalog (Task 5).

**Why the rewrite:** v1 parsed pasted text by splitting on tabs/spaces. The scraper reads the DOM cell-by-cell, so the parser's input is now a clean `string[]` per row — no whitespace guessing. Real columns (10): `Subject Code · Section · Course Title · Units · Time · Room · Instructor · Lang · Level · Remarks`.

- [ ] **Step 1: Write the real fixture** — `src/lib/fixtures/aisis-real.ts`

Real rows captured live from AISIS (MATHEMATICS, 2026-2) on 2026-07-21:

```ts
// REAL AISIS DATA captured 2026-07-21 from the public classSkeds.do page
// (MATHEMATICS department, term 2026-2). Cells are per-<td> textContent.
export const REAL_ROWS: string[][] = [
  ["MATH 1.1", "C", "PREPARATION FOR COLLEGE MATHEMATICS I", "3", "M-TH 1100-1230(FULLY ONSITE)", "SEC-A215", "ABERIN, MARIA ALVA Q.", "ENG", "U", "-"],
  ["MATH 10", "A1", "MATHEMATICS IN THE MODERN WORLD", "3", "M-TH 0800-0930(FULLY ONSITE)", "SEC-A215", "GARCIA, MARK LESTER B.", "ENG", "U", "-"],
  ["MATH 10", "A3", "MATHEMATICS IN THE MODERN WORLD", "3", "M-TH 0800-0930(FULLY ONSITE)", "SEC-A117", "TOMENES, Mark", "ENG", "U", "1 SLOT(S) FOR CROSS REG-IXS MAJORS."],
  ["MATH 10", "B2", "MATHEMATICS IN THE MODERN WORLD", "3", "M-TH 0930-1100(FULLY ONSITE)", "CTC 506", "DE LOS SANTOS, Kurt Anthony, MIJARES, Jim Ralphealo", "ENG", "U", "-"],
  ["MATH 10", "C1", "MATHEMATICS IN THE MODERN WORLD", "3", "M-TH 1100-1230(FULLY ONSITE)", "SEC-A302A", "FLORES, Richell Isaiah, TOMENES, Mark", "ENG", "U", "-"],
];

// Synthetic rows covering shapes not present in the captured sample.
export const EDGE_ROWS: string[][] = [
  // TBA time
  ["NSTP 11", "A", "NATIONAL SERVICE TRAINING PROGRAM 11", "3", "TBA", "TBA", "TBA", "FIL", "U", "-"],
  // lecture + lab split across two meetings
  ["PHYS 23.02", "D", "UNIVERSITY PHYSICS I, LABORATORY", "2", "M 1000-1100/SAT 0900-1200(FULLY ONSITE)", "SEC B105", "REYES, PEDRO", "ENG", "U", "-"],
  // online modality
  ["MATH 51.1", "X", "DISCRETE MATHEMATICS I", "3", "T-F 1300-1430(ONLINE)", "ONLINE", "SANTOS, ANA", "ENG", "U", "-"],
  // unparseable time → imported as TBA-like with a warning
  ["THEO 11", "A", "FAITH, SPIRITUALITY, AND THE CHURCH", "3", "M-TH 25:00-2600(FULLY ONSITE)", "CTC 201", "CRUZ, JOSE", "ENG", "U", "-"],
  // REAL case from the 2026-1 scrape: tutorial rows have a non-day token and 0000-0000.
  ["BIO 290", "ZZZ", "GRADUATE TUTORIAL", "3", "TUTORIAL 0000-0000(FULLY ONSITE)", "TBA", "TBA", "ENG", "G", "~"],
  // too few columns → skipped with a warning
  ["JUNK ROW"],
];
```

- [ ] **Step 2: Write the failing tests** — replace `src/lib/parser.test.ts` entirely

```ts
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
    expect(parseTimeCell("TBA")).toEqual({ meetings: [], modality: "", ok: true });
    expect(parseTimeCell("")).toEqual({ meetings: [], modality: "", ok: true });
  });
  it("flags an unparseable time", () => {
    expect(parseTimeCell("M-TH 25:00-2600(FULLY ONSITE)").ok).toBe(false);
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
  it("never throws on edge rows; imports bad-time rows as TBA-like", () => {
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/parser.test.ts`
Expected: FAIL — `parseRow`/`parseRows`/`parseTimeCell`/`splitInstructors` are not exported.

- [ ] **Step 4: Rewrite `src/lib/parser.ts` entirely**

```ts
import type { Day, Meeting, Section } from "./types";
import { parseTimeRange } from "./time";

// Column layout of the public AISIS class-schedule table (10 columns),
// verified live 2026-07-21. See spec §2.1.
const COL = {
  subjectCode: 0,
  section: 1,
  title: 2,
  units: 3,
  time: 4,
  room: 5,
  instructor: 6,
  lang: 7,
  level: 8,
  remarks: 9,
} as const;
const MIN_COLUMNS = 10;

// Longest tokens first so "TH" wins over "T" when scanning compact strings.
const DAY_TOKENS: Day[] = ["SAT", "SUN", "TH", "M", "T", "W", "F"];

export function parseDays(token: string): Day[] | null {
  const cleaned = token.toUpperCase().trim();
  if (!cleaned) return null;
  const parts = cleaned.includes("-") ? cleaned.split("-") : [cleaned];
  const days: Day[] = [];
  for (const part of parts) {
    let rest = part.trim();
    if (!rest) return null;
    while (rest.length > 0) {
      const match = DAY_TOKENS.find((d) => rest.startsWith(d));
      if (!match) return null;
      days.push(match);
      rest = rest.slice(match.length);
    }
  }
  return days.length > 0 ? days : null;
}

export function parseTimeCell(cell: string): { meetings: Meeting[]; modality: string; ok: boolean } {
  // AISIS renders "M-TH 0800-0930" then "(FULLY ONSITE)" on a second line.
  const modalityMatch = cell.match(/\(([^)]*)\)\s*$/);
  const modality = modalityMatch ? modalityMatch[1].trim() : "";
  const text = cell.replace(/\([^)]*\)\s*$/, "").trim();
  if (!text || text.toUpperCase() === "TBA") return { meetings: [], modality: "", ok: true };

  const meetings: Meeting[] = [];
  for (const chunk of text.split("/")) {
    const m = chunk.trim().match(/^(.+?)\s+(\S+)$/);
    if (!m) return { meetings: [], modality, ok: false };
    const days = parseDays(m[1]);
    const range = parseTimeRange(m[2]);
    if (!days || !range) return { meetings: [], modality, ok: false };
    meetings.push({ days, start: range.start, end: range.end });
  }
  return { meetings, modality, ok: true };
}

// Instructors are "LAST, FIRST" and multiple profs are joined by ", " — so the
// commas are ambiguous. Re-pair the fragments: every even fragment starts a name.
export function splitInstructors(cell: string): string[] {
  const text = cell.trim();
  if (!text || text.toUpperCase() === "TBA") return [];
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const names: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    names.push(parts[i + 1] === undefined ? parts[i] : `${parts[i]}, ${parts[i + 1]}`);
  }
  return names;
}

export function parseRow(cells: string[]): { section: Section | null; warning?: string } {
  const raw = cells.join(" | ");
  if (cells.length < MIN_COLUMNS) {
    return { section: null, warning: `Skipped row (unrecognized format): ${raw}` };
  }
  const units = Number(cells[COL.units].replace(/[()]/g, ""));
  const { meetings, modality, ok } = parseTimeCell(cells[COL.time]);
  // AISIS uses both "-" and "~" as empty-remark placeholders (both seen in real data).
  const rawRemarks = cells[COL.remarks].trim();
  const remarks = rawRemarks === "-" || rawRemarks === "~" ? "" : rawRemarks;
  const section: Section = {
    courseCode: cells[COL.subjectCode].trim(),
    sectionCode: cells[COL.section].trim(),
    title: cells[COL.title].trim(),
    units: Number.isFinite(units) ? units : 0,
    instructors: splitInstructors(cells[COL.instructor]),
    modality,
    meetings,
    room: cells[COL.room].trim(),
    remarks,
    raw,
  };
  if (!ok) {
    return {
      section,
      warning: `Unparseable time "${cells[COL.time]}" — imported without schedule (treated as TBA): ${raw}`,
    };
  }
  return { section };
}

export function parseRows(rows: string[][]): { sections: Section[]; warnings: string[] } {
  const sections: Section[] = [];
  const warnings: string[] = [];
  for (const cells of rows) {
    if (cells.length === 0) continue;
    if (/^subject\s*code$/i.test(cells[0].trim())) continue; // header row
    const { section, warning } = parseRow(cells);
    if (warning) warnings.push(warning);
    if (section) sections.push(section);
  }
  return { sections, warnings };
}
```

- [ ] **Step 5: Delete the obsolete v1 fixture**

```bash
git rm src/lib/fixtures/aisis-sample.ts
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/parser.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Commit**

```bash
git add src/lib/parser.ts src/lib/parser.test.ts src/lib/fixtures/aisis-real.ts
git commit -m "feat: rewrite parser for real 10-column AISIS format"
```

---

### Task 3: Schedule scraper tool

**Files:**
- Create: `tools/scrape-schedule.mjs`
- Create: `tools/departments.mjs`
- Test: `tools/extract-rows.test.ts`
- Create: `tools/extract-rows.mjs`
- Modify: `package.json` (add the `scrape:schedule` script)
- Delete: `tools/aisis-export.js`

**Interfaces:**
- Consumes: nothing from `src/` at runtime (it is a standalone Node tool), but its output JSON must satisfy the `Catalog` shape from Task 1, produced via `parseRows` from Task 2.
- Produces: `src/data/catalog-<term>.json` files consumed by Task 5's `catalog.ts`. Exports `extractRows(html: string): string[][]` from `tools/extract-rows.mjs` (pure, unit-tested).

**Why replace `tools/aisis-export.js`:** that v1 snippet targeted a guessed logged-in endpoint. The real endpoint is public and takes a term + department, so a Node script is simpler, testable, and needs no browser or credentials.

- [ ] **Step 1: Write the department list** — `tools/departments.mjs`

Captured live from the Department dropdown on 2026-07-21:

```js
// Department codes from the public AISIS class-schedule page (captured 2026-07-21).
export const DEPARTMENTS = [
  "**IE**", "BIO", "CH", "CHN", "COM", "CEPP", "CPA", "ELM", "DS", "EC", "ECE", "EN", "ES",
  "EU", "FIL", "FAA", "FA", "HSP", "HI", "SOHUM", "DISCS", "SALT", "IS", "JSP", "KSP", "LAS",
  "MAL", "MA", "ML", "NSTP (ADAST)", "NSTP (OSCI)", "PH", "PE", "PS", "POS", "PSY", "QMIT",
  "SB", "SOCSCI", "SA", "TH", "TMP",
];

export const TERMS = ["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"];
```

- [ ] **Step 2: Write the failing test** — `tools/extract-rows.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { extractRows } from "./extract-rows.mjs";

const HTML = `
<html><body>
<table>
  <tr><th>Subject Code</th><th>Section</th><th>Course Title</th><th>Units</th><th>Time</th>
      <th>Room</th><th>Instructor</th><th>Lang</th><th>Level</th><th>Remarks</th></tr>
  <tr><td>MATH 10</td><td>A1</td><td>MATHEMATICS IN THE MODERN WORLD</td><td>3</td>
      <td>M-TH 0800-0930<br>(FULLY ONSITE)</td><td>SEC-A215</td>
      <td>GARCIA, MARK LESTER B.</td><td>ENG</td><td>U</td><td>-</td></tr>
</table>
<table><tr><td>nav</td><td>junk</td></tr></table>
</body></html>`;

describe("extractRows", () => {
  it("returns one array of cell strings per data row", () => {
    const rows = extractRows(HTML);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("MATH 10");
    expect(rows[0][6]).toBe("GARCIA, MARK LESTER B.");
  });
  it("joins a <br> inside the time cell without inserting whitespace", () => {
    expect(extractRows(HTML)[0][4]).toBe("M-TH 0800-0930(FULLY ONSITE)");
  });
  it("ignores tables whose rows have too few columns", () => {
    expect(extractRows(HTML).every((r) => r.length >= 10)).toBe(true);
  });
  it("returns an empty array when there is no schedule table", () => {
    expect(extractRows("<html><body><p>nothing</p></body></html>")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tools/extract-rows.test.ts`
Expected: FAIL — cannot resolve `./extract-rows.mjs`.

- [ ] **Step 4: Write `tools/extract-rows.mjs`**

Regex-based so the tool needs no DOM dependency:

```js
// Extract data rows from the AISIS class-schedule HTML as arrays of cell text.
// Deliberately dependency-free: AISIS markup is plain server-rendered tables.
const MIN_COLUMNS = 10;

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cellText(cellHtml) {
  // <br> joins with no space: "M-TH 0800-0930<br>(FULLY ONSITE)" → "M-TH 0800-0930(FULLY ONSITE)"
  return decodeEntities(cellHtml.replace(/<br\s*\/?>/gi, "").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractRows(html) {
  const rows = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));
    if (cells.length >= MIN_COLUMNS) rows.push(cells);
  }
  return rows;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tools/extract-rows.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write `tools/scrape-schedule.mjs`**

```js
#!/usr/bin/env node
/**
 * Scrape one term's class schedule from the PUBLIC AISIS endpoint.
 *
 *   node tools/scrape-schedule.mjs 2026-2
 *
 * Writes src/data/catalog-<term>.json.
 *
 * This endpoint requires NO login. This script never sends, prompts for, or
 * stores credentials — do not add auth to it.
 *
 * A term with no published schedule (e.g. 2026-2 as of 2026-07-21) returns a
 * page containing "There are no results for your search criteria" and zero
 * data rows. That is normal, not an error — the run simply yields 0 sections.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEPARTMENTS, TERMS } from "./departments.mjs";
import { extractRows } from "./extract-rows.mjs";
import { parseRows } from "../src/lib/parser.ts";

const ENDPOINT = "https://aisis.ateneo.edu/j_aisis/classSkeds.do";
const DELAY_MS = 1500; // politeness between department requests
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const term = process.argv[2];
if (!TERMS.includes(term)) {
  console.error(`Usage: node tools/scrape-schedule.mjs <term>\nKnown terms: ${TERMS.join(", ")}`);
  process.exit(1);
}

// AISIS will NOT serve results without an established session. GET the page first to
// pick up its cookies, then send them on every POST. Verified 2026-07-21: without this,
// every department returns ZERO rows while the browser (which has a cookie) returns 201.
const boot = await fetch(ENDPOINT);
const rawCookie = boot.headers.get("set-cookie") || "";
const COOKIE = rawCookie.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
if (!COOKIE) console.warn("! No session cookie received — results are likely to be empty.");

const allRows = [];
const warnings = [];
for (const dept of DEPARTMENTS) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: COOKIE },
      // Field names verified live 2026-07-21 by reading the classScheduleForm.
      body: new URLSearchParams({
        command: "displayResults",
        subjCode: "ALL",
        applicablePeriod: term,
        deptCode: dept,
      }),
    });
    if (!res.ok) {
      warnings.push(`${dept}: HTTP ${res.status} — skipped`);
      console.warn(`  ! ${dept}: HTTP ${res.status}`);
      continue;
    }
    const rows = extractRows(await res.text());
    allRows.push(...rows);
    console.log(`  ${dept}: ${rows.length} rows`);
  } catch (err) {
    warnings.push(`${dept}: ${err.message} — skipped`);
    console.warn(`  ! ${dept}: ${err.message}`);
  }
  await sleep(DELAY_MS);
}

const { sections, warnings: parseWarnings } = parseRows(allRows);

// De-duplicate by section key: a course can appear under more than one department filter.
const byKey = new Map();
for (const s of sections) byKey.set(`${s.courseCode} ${s.sectionCode}`, s);

const catalog = {
  term,
  exportedAt: new Date().toISOString(),
  sections: [...byKey.values()],
  warnings: [...warnings, ...parseWarnings],
};

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "src", "data", `catalog-${term}.json`
);
await writeFile(out, JSON.stringify(catalog, null, 2));
console.log(`\nWrote ${out}: ${catalog.sections.length} sections, ${catalog.warnings.length} warnings.`);
```

- [ ] **Step 7: Add the npm script and enable TS import from the tool**

In `package.json`, add to `"scripts"`:

```json
    "scrape:schedule": "tsx tools/scrape-schedule.mjs",
```

Also add `"tsx": "^4.19.0"` to `devDependencies` and run `npm install`.

**Why tsx and not `node --experimental-strip-types`:** the tool imports `src/lib/parser.ts` so the app and scraper share one parser, but `parser.ts` uses extensionless imports (`from "./types"`) which Vite resolves and **plain Node ESM does not**. `tsx` handles both the TypeScript and the extensionless resolution. Do not switch this to bare `node`.

- [ ] **Step 8: Verify the tool is syntactically valid and the suite still passes**

Run: `node --check tools/extract-rows.mjs && node --check tools/departments.mjs && npx vitest run tools/extract-rows.test.ts`
Expected: `node --check` silent (exit 0); tests PASS.

Note: actually running `npm run scrape:schedule -- 2026-2` requires network access to AISIS and is a **manual maintainer step**, not part of the test suite.

- [ ] **Step 9: Delete the obsolete v1 snippet**

```bash
git rm tools/aisis-export.js
```

- [ ] **Step 10: Commit**

```bash
git add tools/ package.json
git commit -m "feat: public AISIS schedule scraper replacing the v1 export snippet"
```

---

### Task 4: Curriculum data layer + BS AMDSc 2024 seed

**Files:**
- Create: `src/data/curriculum-BS-AMDSc-2024.json`
- Create: `src/lib/curriculum.ts`
- Test: `src/lib/curriculum.test.ts`

**Interfaces:**
- Consumes: `Program`, `ProgramSummary`, `CurriculumBlock`, `CurriculumEntry` from `src/lib/types.ts`.
- Produces: `getPrograms(): ProgramSummary[]`, `getCurriculum(programId: string): Program | undefined`, `getBlock(program: Program, blockKey: string): CurriculumBlock | undefined`. **This module is the only place curriculum JSON is imported** (the Supabase swap point).

**Data source:** transcribed verbatim from AISIS `J_VOFC.do` for `(BS AMDSc-M DSc) BACHELOR OF SCIENCE IN APPLIED MATHEMATICS (Ver Sem 1, Ver Year 2024)`, captured 2026-07-21. Note the two quirk blocks printed as `"Fourth Year"` under *Third Year* and *Fifth Year* (see plan header).

- [ ] **Step 1: Write the seed JSON** — `src/data/curriculum-BS-AMDSc-2024.json`

`isElective` is true where `catNo` contains "ELECTIVE" or matches `IE <n>`; `electiveDept` is `"**IE**"` for the IE slots. `slotId` is `` `${key}#${index}` ``.

```json
{
  "id": "BS-AMDSc-2024",
  "code": "BS AMDSc-M DSc",
  "name": "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS",
  "versionYear": 2024,
  "blocks": [
    {
      "year": "First Year", "term": "First Semester", "key": "First Year|First Semester", "totalUnits": 20,
      "entries": [
        { "catNo": "ENGL 11", "title": "PURPOSIVE COMMUNICATION", "units": 3, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|First Semester#0" },
        { "catNo": "FILI 12", "title": "PANITIKAN NG PILIPINAS", "units": 3, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|First Semester#1" },
        { "catNo": "INTACT 11", "title": "INTRODUCTION TO ATENEO CULTURE AND TRADITIONS 11", "units": 0, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|First Semester#2" },
        { "catNo": "MATH 10", "title": "MATHEMATICS IN THE MODERN WORLD", "units": 3, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|First Semester#3" },
        { "catNo": "MATH 71.1", "title": "FUNDAMENTALS OF COMPUTING I", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "First Year|First Semester#4" },
        { "catNo": "PATHFit 1", "title": "PHYSICAL ACTIVITIES TOWARDS HEALTH AND FITNESS 1", "units": 2, "prerequisites": [], "category": "PFT1", "isElective": false, "slotId": "First Year|First Semester#5" },
        { "catNo": "SocSc 11", "title": "UNDERSTANDING THE SELF", "units": 3, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|First Semester#6" },
        { "catNo": "THEO 11", "title": "FAITH, SPIRITUALITY, AND THE CHURCH", "units": 3, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|First Semester#7" }
      ]
    },
    {
      "year": "First Year", "term": "Second Semester", "key": "First Year|Second Semester", "totalUnits": 21,
      "entries": [
        { "catNo": "ENLIT 12", "title": "LITERATURE: GLOBAL VOICES AND ENCOUNTERS", "units": 3, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|Second Semester#0" },
        { "catNo": "FILI 11", "title": "MALAYUNING KOMUNIKASYON", "units": 3, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|Second Semester#1" },
        { "catNo": "HISTO 11", "title": "RIZAL AND THE EMERGENCE OF THE PHILIPPINE NATION", "units": 3, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|Second Semester#2" },
        { "catNo": "INTACT 12", "title": "INTRODUCTION TO ATENEO CULTURE AND TRADITIONS 12", "units": 0, "prerequisites": [], "category": "C", "isElective": false, "slotId": "First Year|Second Semester#3" },
        { "catNo": "MATH 31.1", "title": "MATHEMATICAL ANALYSIS IA", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "First Year|Second Semester#4" },
        { "catNo": "MATH 31.2", "title": "MATHEMATICAL ANALYSIS IB", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "First Year|Second Semester#5" },
        { "catNo": "NatSc 10.01", "title": "NATURAL SCIENCE, LECTURE", "units": 3, "prerequisites": [], "category": "NS1A", "isElective": false, "slotId": "First Year|Second Semester#6" },
        { "catNo": "NatSc 10.02", "title": "NATURAL SCIENCE, LABORATORY", "units": 1, "prerequisites": [], "category": "NS1B", "isElective": false, "slotId": "First Year|Second Semester#7" },
        { "catNo": "PATHFit 2", "title": "PHYSICAL ACTIVITIES TOWARDS HEALTH AND FITNESS 2", "units": 2, "prerequisites": ["PATHFit 1"], "category": "PFT2", "isElective": false, "slotId": "First Year|Second Semester#8" }
      ]
    },
    {
      "year": "Second Year", "term": "Intersession", "key": "Second Year|Intersession", "totalUnits": 6,
      "entries": [
        { "catNo": "FLC 11", "title": "FOREIGN LANGUAGE AND CULTURE 11", "units": 3, "prerequisites": [], "category": "FLC1", "isElective": false, "slotId": "Second Year|Intersession#0" },
        { "catNo": "MATH 51.1", "title": "DISCRETE MATHEMATICS I", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Second Year|Intersession#1" }
      ]
    },
    {
      "year": "Second Year", "term": "First Semester", "key": "Second Year|First Semester", "totalUnits": 22,
      "entries": [
        { "catNo": "CSCI 112", "title": "CONTEMPORARY DATABASES", "units": 3, "prerequisites": ["MATH 71.1"], "category": "M", "isElective": false, "slotId": "Second Year|First Semester#0" },
        { "catNo": "HISTO 12", "title": "READINGS IN PHILIPPINE HISTORY", "units": 3, "prerequisites": ["HISTO 11"], "category": "C", "isElective": false, "slotId": "Second Year|First Semester#1" },
        { "catNo": "MATH 31.3", "title": "MATHEMATICAL ANALYSIS II", "units": 3, "prerequisites": ["MATH 31.2"], "category": "M", "isElective": false, "slotId": "Second Year|First Semester#2" },
        { "catNo": "PATHFit 3", "title": "PHYSICAL ACTIVITIES TOWARDS HEALTH AND FITNESS 3", "units": 2, "prerequisites": ["PATHFit 1", "PATHFit 2"], "category": "PFT3", "isElective": false, "slotId": "Second Year|First Semester#3" },
        { "catNo": "PHILO 11", "title": "PHILOSOPHY: THE HUMAN CONDITION", "units": 3, "prerequisites": [], "category": "CPH1", "isElective": false, "slotId": "Second Year|First Semester#4" },
        { "catNo": "PHYS 23.01", "title": "UNIVERSITY PHYSICS I, LECTURE", "units": 3, "prerequisites": ["MATH 31.1", "MATH 31.2"], "category": "M", "isElective": false, "slotId": "Second Year|First Semester#5" },
        { "catNo": "PHYS 23.02", "title": "UNIVERSITY PHYSICS I, LABORATORY", "units": 2, "prerequisites": ["MATH 31.1", "MATH 31.2"], "category": "M", "isElective": false, "slotId": "Second Year|First Semester#6" },
        { "catNo": "SocSc 12", "title": "THE CONTEMPORARY WORLD", "units": 3, "prerequisites": ["SocSc 11"], "category": "C", "isElective": false, "slotId": "Second Year|First Semester#7" }
      ]
    },
    {
      "year": "Second Year", "term": "Second Semester", "key": "Second Year|Second Semester", "totalUnits": 23,
      "entries": [
        { "catNo": "CSCI 115", "title": "COMPUTER SIMULATION AND MODELING", "units": 3, "prerequisites": ["MATH 71.1"], "category": "M", "isElective": false, "slotId": "Second Year|Second Semester#0" },
        { "catNo": "IE 1", "title": "INTERDISCIPLINARY ELECTIVE 1 - ENGLISH", "units": 3, "prerequisites": ["ENGL 11", "ENLIT 12"], "category": "IE1E", "isElective": true, "electiveDept": "**IE**", "slotId": "Second Year|Second Semester#1" },
        { "catNo": "MATH 31.4", "title": "MATHEMATICAL ANALYSIS III", "units": 3, "prerequisites": ["MATH 31.3"], "category": "M", "isElective": false, "slotId": "Second Year|Second Semester#2" },
        { "catNo": "MATH 40.1", "title": "LINEAR ALGEBRA", "units": 3, "prerequisites": ["MATH 31.3"], "category": "M", "isElective": false, "slotId": "Second Year|Second Semester#3" },
        { "catNo": "MATH 61.2", "title": "ELEMENTARY PROBABILITY THEORY", "units": 3, "prerequisites": ["MATH 31.3"], "category": "M", "isElective": false, "slotId": "Second Year|Second Semester#4" },
        { "catNo": "NSTP 11", "title": "NATIONAL SERVICE TRAINING PROGRAM 11", "units": 3, "prerequisites": [], "category": "NP1", "isElective": false, "slotId": "Second Year|Second Semester#5" },
        { "catNo": "PATHFit 4", "title": "PHYSICAL ACTIVITIES TOWARDS HEALTH AND FITNESS 4", "units": 2, "prerequisites": ["PATHFit 1", "PATHFit 2"], "category": "PFT4", "isElective": false, "slotId": "Second Year|Second Semester#6" },
        { "catNo": "THEO 12", "title": "THEOLOGY OF THE CATHOLIC SOCIAL VISION", "units": 3, "prerequisites": ["THEO 11"], "category": "C", "isElective": false, "slotId": "Second Year|Second Semester#7" }
      ]
    },
    {
      "year": "Third Year", "term": "Fourth Year", "key": "Third Year|Fourth Year", "totalUnits": 6,
      "entries": [
        { "catNo": "ECON 110", "title": "PRINCIPLES OF ECONOMICS", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Third Year|Fourth Year#0" },
        { "catNo": "MATH 55.1", "title": "FUNDAMENTAL CONCEPTS OF MATHEMATICS", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Third Year|Fourth Year#1" }
      ]
    },
    {
      "year": "Third Year", "term": "First Semester", "key": "Third Year|First Semester", "totalUnits": 18,
      "entries": [
        { "catNo": "CSCI 111", "title": "INTRODUCTION TO ARTIFICIAL INTELLIGENCE", "units": 3, "prerequisites": ["MATH 71.1"], "category": "M", "isElective": false, "slotId": "Third Year|First Semester#0" },
        { "catNo": "MATH 101.6", "title": "THEORY OF INTEREST", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Third Year|First Semester#1" },
        { "catNo": "MATH 62.1", "title": "INTRODUCTION TO STATISTICAL THEORY", "units": 3, "prerequisites": ["MATH 61.2"], "category": "M", "isElective": false, "slotId": "Third Year|First Semester#2" },
        { "catNo": "MATH 90.1", "title": "ADVANCED CALCULUS I", "units": 3, "prerequisites": ["MATH 31.4"], "category": "M", "isElective": false, "slotId": "Third Year|First Semester#3" },
        { "catNo": "MATHEMATICS ELECTIVE", "title": "MATHEMATICS ELECTIVE", "units": 3, "prerequisites": [], "category": "RM1", "isElective": true, "slotId": "Third Year|First Semester#4" },
        { "catNo": "PHILO 12", "title": "PHILOSOPHY OF RELIGION", "units": 3, "prerequisites": ["PHILO 11"], "category": "C", "isElective": false, "slotId": "Third Year|First Semester#5" }
      ]
    },
    {
      "year": "Third Year", "term": "Second Semester", "key": "Third Year|Second Semester", "totalUnits": 22,
      "entries": [
        { "catNo": "CSCI 113i", "title": "BUSINESS INTELLIGENCE", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Third Year|Second Semester#0" },
        { "catNo": "MATH 192", "title": "UNDERGRADUATE RESEARCH SEMINAR", "units": 1, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Third Year|Second Semester#1" },
        { "catNo": "MATH 62.2", "title": "TIME SERIES AND FORECASTING", "units": 3, "prerequisites": ["MATH 40.1", "MATH 62.1"], "category": "M", "isElective": false, "slotId": "Third Year|Second Semester#2" },
        { "catNo": "MATH 72.1", "title": "ORDINARY DIFFERENTIAL EQUATIONS", "units": 3, "prerequisites": ["MATH 31.4", "MATH 40.1"], "category": "M", "isElective": false, "slotId": "Third Year|Second Semester#3" },
        { "catNo": "NSTP 12", "title": "NATIONAL SERVICE TRAINING PROGRAM 12", "units": 3, "prerequisites": [], "category": "NP2", "isElective": false, "slotId": "Third Year|Second Semester#4" },
        { "catNo": "PHILO 13", "title": "ETHICS", "units": 3, "prerequisites": ["PHILO 11"], "category": "C", "isElective": false, "slotId": "Third Year|Second Semester#5" },
        { "catNo": "SocSc 13", "title": "THE ECONOMY, SOCIETY, AND SUSTAINABLE DEVELOPMENT", "units": 3, "prerequisites": ["SocSc 12"], "category": "C", "isElective": false, "slotId": "Third Year|Second Semester#6" },
        { "catNo": "THEO 13", "title": "A THEOLOGY OF MARRIAGE, FAMILY, AND VOCATION", "units": 3, "prerequisites": ["THEO 12"], "category": "C", "isElective": false, "slotId": "Third Year|Second Semester#7" }
      ]
    },
    {
      "year": "Fourth Year", "term": "Intersession", "key": "Fourth Year|Intersession", "totalUnits": 6,
      "entries": [
        { "catNo": "ArtAp 10", "title": "ART APPRECIATION", "units": 3, "prerequisites": [], "category": "C", "isElective": false, "slotId": "Fourth Year|Intersession#0" },
        { "catNo": "FREE ELECTIVE", "title": "FREE ELECTIVE", "units": 3, "prerequisites": [], "category": "FE1", "isElective": true, "slotId": "Fourth Year|Intersession#1" }
      ]
    },
    {
      "year": "Fourth Year", "term": "First Semester", "key": "Fourth Year|First Semester", "totalUnits": 20,
      "entries": [
        { "catNo": "FREE ELECTIVE", "title": "FREE ELECTIVE", "units": 3, "prerequisites": [], "category": "FE2", "isElective": true, "slotId": "Fourth Year|First Semester#0" },
        { "catNo": "IE 2", "title": "INTERDISCIPLINARY ELECTIVE 2", "units": 3, "prerequisites": [], "category": "IE2", "isElective": true, "electiveDept": "**IE**", "slotId": "Fourth Year|First Semester#1" },
        { "catNo": "MATH 199.11", "title": "UNDERGRADUATE RESEARCH IN APPLIED MATHEMATICS I", "units": 2, "prerequisites": ["MATH 192"], "category": "M", "isElective": false, "slotId": "Fourth Year|First Semester#2" },
        { "catNo": "MATH 71.3", "title": "SCIENTIFIC COMPUTING I", "units": 3, "prerequisites": ["MATH 40.1"], "category": "M", "isElective": false, "slotId": "Fourth Year|First Semester#3" },
        { "catNo": "MATH 91.1", "title": "REAL ANALYSIS I", "units": 3, "prerequisites": ["MATH 90.1"], "category": "M", "isElective": false, "slotId": "Fourth Year|First Semester#4" },
        { "catNo": "STS 10", "title": "SCIENCE, TECHNOLOGY, AND SOCIETY", "units": 3, "prerequisites": ["NatSc 10.01", "NatSc 10.02"], "category": "C", "isElective": false, "slotId": "Fourth Year|First Semester#5" },
        { "catNo": "SocSc 14", "title": "POLITICS, GOVERNANCE, AND CITIZENSHIP", "units": 3, "prerequisites": ["SocSc 13"], "category": "C", "isElective": false, "slotId": "Fourth Year|First Semester#6" }
      ]
    },
    {
      "year": "Fourth Year", "term": "Second Semester", "key": "Fourth Year|Second Semester", "totalUnits": 20,
      "entries": [
        { "catNo": "DLQ 10", "title": "DISCERNING LIFE QUESTIONS: TOWARDS LEADERSHIP AND COMMITMENT", "units": 3, "prerequisites": ["PHILO 13", "SocSc 13", "THEO 13"], "category": "C", "isElective": false, "slotId": "Fourth Year|Second Semester#0" },
        { "catNo": "IE 3", "title": "INTERDISCIPLINARY ELECTIVE 3", "units": 3, "prerequisites": [], "category": "IE3", "isElective": true, "electiveDept": "**IE**", "slotId": "Fourth Year|Second Semester#1" },
        { "catNo": "MATH 102.1", "title": "TOPICS IN OPERATIONS RESEARCH", "units": 3, "prerequisites": ["MATH 40.1", "MATH 61.2"], "category": "M", "isElective": false, "slotId": "Fourth Year|Second Semester#2" },
        { "catNo": "MATH 199.12", "title": "UNDERGRADUATE RESEARCH IN APPLIED MATHEMATICS II", "units": 2, "prerequisites": ["MATH 199.11"], "category": "M", "isElective": false, "slotId": "Fourth Year|Second Semester#3" },
        { "catNo": "MATH 71.4", "title": "SCIENTIFIC COMPUTING II", "units": 3, "prerequisites": ["MATH 71.3"], "category": "M", "isElective": false, "slotId": "Fourth Year|Second Semester#4" },
        { "catNo": "MATHEMATICS ELECTIVE", "title": "MATHEMATICS ELECTIVE", "units": 3, "prerequisites": [], "category": "RM2", "isElective": true, "slotId": "Fourth Year|Second Semester#5" },
        { "catNo": "MSYS 121i", "title": "APPLIED DIGITAL LAW AND ETHICS", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fourth Year|Second Semester#6" }
      ]
    },
    {
      "year": "Fifth Year", "term": "Fourth Year", "key": "Fifth Year|Fourth Year", "totalUnits": 6,
      "entries": [
        { "catNo": "CSCI 217", "title": "DATA VISUALIZATION", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fifth Year|Fourth Year#0" },
        { "catNo": "MATH 271.2", "title": "ADVANCED STATISTICAL METHODS", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fifth Year|Fourth Year#1" }
      ]
    },
    {
      "year": "Fifth Year", "term": "First Semester", "key": "Fifth Year|First Semester", "totalUnits": 15,
      "entries": [
        { "catNo": "CSCI 205", "title": "PROGRAMMING WITH DATABASES", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fifth Year|First Semester#0" },
        { "catNo": "CSCI 214", "title": "PATTERN RECOGNITION", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fifth Year|First Semester#1" },
        { "catNo": "CSCI 298.5", "title": "DATA SCIENCE PROJECT I", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fifth Year|First Semester#2" },
        { "catNo": "MATH 236.3", "title": "TOPICS IN STOCHASTIC CALCULUS", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fifth Year|First Semester#3" },
        { "catNo": "MATH GRAD ELECTIVE", "title": "MATHEMATICS GRAD ELECTIVE", "units": 3, "prerequisites": [], "category": "RM3", "isElective": true, "slotId": "Fifth Year|First Semester#4" }
      ]
    },
    {
      "year": "Fifth Year", "term": "Second Semester", "key": "Fifth Year|Second Semester", "totalUnits": 15,
      "entries": [
        { "catNo": "CSCI 271", "title": "DATA MINING", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fifth Year|Second Semester#0" },
        { "catNo": "CSCI 273", "title": "BIG DATA PROCESSING", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fifth Year|Second Semester#1" },
        { "catNo": "CSCI 298.6", "title": "DATA SCIENCE PROJECT II", "units": 3, "prerequisites": [], "category": "M", "isElective": false, "slotId": "Fifth Year|Second Semester#2" },
        { "catNo": "MATH GRAD ELECTIVE", "title": "MATHEMATICS GRAD ELECTIVE", "units": 3, "prerequisites": [], "category": "RM4", "isElective": true, "slotId": "Fifth Year|Second Semester#3" },
        { "catNo": "MATH GRAD ELECTIVE", "title": "MATHEMATICS GRAD ELECTIVE", "units": 3, "prerequisites": [], "category": "RM5", "isElective": true, "slotId": "Fifth Year|Second Semester#4" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the failing tests** — `src/lib/curriculum.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { getPrograms, getCurriculum, getBlock } from "./curriculum";

describe("curriculum data layer", () => {
  it("lists the seeded program", () => {
    const programs = getPrograms();
    expect(programs).toHaveLength(1);
    expect(programs[0]).toMatchObject({
      id: "BS-AMDSc-2024",
      code: "BS AMDSc-M DSc",
      name: "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS",
      versionYear: 2024,
    });
  });

  it("returns the full curriculum with every printed block", () => {
    const program = getCurriculum("BS-AMDSc-2024")!;
    expect(program.blocks).toHaveLength(14);
    expect(program.blocks.map((b) => b.key)).toContain("Second Year|First Semester");
  });

  it("returns undefined for an unknown program", () => {
    expect(getCurriculum("NOPE")).toBeUndefined();
  });

  it("preserves the quirk blocks printed as 'Fourth Year' under other years", () => {
    const program = getCurriculum("BS-AMDSc-2024")!;
    const quirks = program.blocks.filter((b) => b.term === "Fourth Year");
    expect(quirks.map((b) => b.year).sort()).toEqual(["Fifth Year", "Third Year"]);
  });

  it("getBlock finds a block by key", () => {
    const program = getCurriculum("BS-AMDSc-2024")!;
    const block = getBlock(program, "Second Year|First Semester")!;
    expect(block.totalUnits).toBe(22);
    expect(block.entries.map((e) => e.catNo)).toContain("MATH 31.3");
  });

  it("flags elective slots and marks IE slots with their department", () => {
    const program = getCurriculum("BS-AMDSc-2024")!;
    const block = getBlock(program, "Second Year|Second Semester")!;
    const ie = block.entries.find((e) => e.catNo === "IE 1")!;
    expect(ie.isElective).toBe(true);
    expect(ie.electiveDept).toBe("**IE**");
    expect(block.entries.find((e) => e.catNo === "MATH 40.1")!.isElective).toBe(false);
  });

  it("keeps zero-unit courses and prerequisites", () => {
    const program = getCurriculum("BS-AMDSc-2024")!;
    const block = getBlock(program, "First Year|First Semester")!;
    expect(block.entries.find((e) => e.catNo === "INTACT 11")!.units).toBe(0);
    const second = getBlock(program, "First Year|Second Semester")!;
    expect(second.entries.find((e) => e.catNo === "PATHFit 2")!.prerequisites).toEqual(["PATHFit 1"]);
  });

  it("gives every entry a unique slotId", () => {
    const program = getCurriculum("BS-AMDSc-2024")!;
    const ids = program.blocks.flatMap((b) => b.entries.map((e) => e.slotId));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/curriculum.test.ts`
Expected: FAIL — cannot resolve `./curriculum`.

- [ ] **Step 4: Write `src/lib/curriculum.ts`**

```ts
import type { CurriculumBlock, Program, ProgramSummary } from "./types";
import amdsc2024 from "../data/curriculum-BS-AMDSc-2024.json";

// This module is the ONLY place curriculum JSON is read. Swapping the bundled
// files for Supabase later means changing only this file (spec §3, §7).

const PROGRAMS: Program[] = [amdsc2024 as Program];

export function getPrograms(): ProgramSummary[] {
  return PROGRAMS.map(({ id, code, name, versionYear }) => ({ id, code, name, versionYear }));
}

export function getCurriculum(programId: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === programId);
}

export function getBlock(program: Program, blockKey: string): CurriculumBlock | undefined {
  return program.blocks.find((b) => b.key === blockKey);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/curriculum.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/data/curriculum-BS-AMDSc-2024.json src/lib/curriculum.ts src/lib/curriculum.test.ts
git commit -m "feat: curriculum data layer with real BS AMDSc 2024 seed"
```

---

### Task 5: Catalog data layer (per-term, lazy-loaded)

**Files:**
- Rewrite: `src/lib/catalog.ts`
- Rewrite: `src/lib/catalog.test.ts`
- Already present (do NOT modify): `src/data/catalog-2026-1.json` — 3,743 real scraped sections

**Interfaces:**
- Consumes: `Catalog`, `ProfRating` from `src/lib/types.ts`.
- Produces: `TERMS: TermOption[]`, `getTerms(): TermOption[]`, `loadCatalog(term: string): Promise<Catalog>` (rejects with `CatalogUnavailableError` when that term has not been scraped), `class CatalogUnavailableError extends Error { term: string }`, `getCommunityRatings(): ProfRating[]`, `isStale(catalog, now?): boolean`. **Only place catalog JSON is imported.**

**Note on data:** `src/data/catalog-2026-1.json` (3,743 real sections) is already committed and is the fixture the app and tests run against. Other terms come from `npm run scrape:schedule -- <term>` (Task 3). Terms without a file surface a clear error rather than fake data. **No fabricated sections are permitted in any data file, ever.**

- [ ] **Step 1: The real catalog is ALREADY COMMITTED — do not write one**

`src/data/catalog-2026-1.json` is already in the repo: **3,743 real sections across 1,288
courses**, scraped from the public AISIS endpoint on 2026-07-21 with the exact method Task 3
automates. Do not hand-write, edit, trim, or "top up" this file. It is ground truth.

**No fabricated course data may ever be added to `src/data/`.** If more data is needed, run the
scraper — never invent rows. (An earlier draft of this plan contained invented sections; they
were removed and this rule exists because of it.)

Verify what is there before continuing:

```bash
node -e "const c=require('./src/data/catalog-2026-1.json'); console.log(c.term, c.sections.length, new Set(c.sections.map(s=>s.courseCode)).size)"
```
Expected: `2026-1 3743 1288`

- [ ] **Step 2: Write the failing tests** — replace `src/lib/catalog.test.ts` entirely

```ts
import { describe, it, expect } from "vitest";
import { getTerms, loadCatalog, CatalogUnavailableError, getCommunityRatings, isStale } from "./catalog";

describe("catalog data layer", () => {
  it("lists the six AISIS terms newest first", () => {
    const terms = getTerms();
    expect(terms.map((t) => t.term)).toEqual(["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"]);
    expect(terms[0].label).toBe("2026-2027 Second Semester");
    expect(terms[2].label).toBe("2026-2027 Intersession");
  });

  it("loads the real scraped 2026-1 catalog", async () => {
    const catalog = await loadCatalog("2026-1");
    expect(catalog.term).toBe("2026-1");
    expect(catalog.sections.length).toBe(3743);
    expect(catalog.sections[0].instructors).toBeInstanceOf(Array);
    // Real courses from the live scrape.
    expect(catalog.sections.some((s) => s.courseCode === "MATH 10")).toBe(true);
    expect(catalog.sections.some((s) => s.courseCode === "THEO 11")).toBe(true);
  });

  it("rejects with CatalogUnavailableError for a term with no data file", async () => {
    // 2026-2 has no published AISIS schedule as of 2026-07-21, so no file ships for it.
    await expect(loadCatalog("2026-2")).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it("rejects for an unknown term code", async () => {
    await expect(loadCatalog("1999-9")).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it("returns community ratings", () => {
    expect(getCommunityRatings()).toBeInstanceOf(Array);
  });

  it("isStale is false within 30 days, true after", () => {
    const catalog = { term: "2026-1", exportedAt: "2026-07-01T00:00:00.000Z", sections: [], warnings: [] };
    expect(isStale(catalog, new Date("2026-07-20T00:00:00.000Z"))).toBe(false);
    expect(isStale(catalog, new Date("2026-08-05T00:00:00.000Z"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: FAIL — `getTerms`/`loadCatalog`/`CatalogUnavailableError` are not exported.

- [ ] **Step 4: Rewrite `src/lib/catalog.ts` entirely**

```ts
import type { Catalog, ProfRating } from "./types";
import ratingsJson from "../data/prof-ratings.json";

// This module is the ONLY place catalog JSON is read. Swapping the bundled
// files for Supabase later means changing only this file (spec §3, §7).

const STALE_AFTER_DAYS = 30;

export interface TermOption {
  term: string;   // "2026-2"
  label: string;  // "2026-2027 Second Semester"
}

const TERM_SUFFIX: Record<string, string> = {
  "1": "First Semester",
  "2": "Second Semester",
  "0": "Intersession",
};

function termLabel(term: string): string {
  const [year, n] = term.split("-");
  const startYear = Number(year);
  const suffix = TERM_SUFFIX[n] ?? n;
  return `${startYear}-${startYear + 1} ${suffix}`;
}

export const TERMS: TermOption[] = ["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"].map(
  (term) => ({ term, label: termLabel(term) })
);

export function getTerms(): TermOption[] {
  return TERMS;
}

export class CatalogUnavailableError extends Error {
  term: string;
  constructor(term: string) {
    super(
      `No catalog data for term ${term}. Run: npm run scrape:schedule -- ${term}`
    );
    this.name = "CatalogUnavailableError";
    this.term = term;
  }
}

// Vite resolves this glob at build time; only the requested term's JSON is fetched.
const CATALOG_MODULES = import.meta.glob<{ default: Catalog }>("../data/catalog-*.json");

export async function loadCatalog(term: string): Promise<Catalog> {
  const loader = CATALOG_MODULES[`../data/catalog-${term}.json`];
  if (!loader) throw new CatalogUnavailableError(term);
  const mod = await loader();
  return mod.default;
}

export function getCommunityRatings(): ProfRating[] {
  return ratingsJson as ProfRating[];
}

export function isStale(catalog: Catalog, now: Date = new Date()): boolean {
  const exported = new Date(catalog.exportedAt).getTime();
  if (Number.isNaN(exported)) return true;
  return now.getTime() - exported > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "feat: per-term lazy-loaded catalog data layer"
```

---

### Task 6: Course-scoped prof ratings + multi-instructor ranking

**Files:**
- Modify: `src/lib/profs.ts`
- Modify: `src/lib/profs.test.ts`
- Modify: `src/lib/ranker.ts` (the `preferredProfs` branch of `rawMetric`)
- Modify: `src/lib/ranker.test.ts` (the `preferredProfs` test)

**Interfaces:**
- Consumes: `ProfRating`, `Section` from `src/lib/types.ts`.
- Produces: `ratingKey(name: string, courseCode?: string): string`, `mergeRatings(community: ProfRating[], personal: ProfRating[]): Map<string, ProfRating>` (keys are `ratingKey` outputs), `ratingFor(instructor: string, merged: Map<string, ProfRating>, courseCode?: string): ProfRating | undefined` (precedence: name+course → name → unique-last-name fallback → undefined), `normalizeName` unchanged. Ranker's `preferredProfs` scores over `Section.instructors[]`.

- [ ] **Step 1: Add the failing tests** — append to `src/lib/profs.test.ts` (keep the existing `normalizeName` tests; replace the `mergeRatings`/`ratingFor` describes)

```ts
import { describe, it, expect } from "vitest";
import { normalizeName, mergeRatings, ratingFor, ratingKey } from "./profs";
import type { ProfRating } from "./types";

const r = (name: string, rating: ProfRating["rating"], courseCode?: string): ProfRating =>
  courseCode ? { name, rating, courseCode } : { name, rating };

describe("ratingKey", () => {
  it("scopes by course when given, and is course-agnostic otherwise", () => {
    expect(ratingKey("GARCIA, JUAN", "MATH 10")).toBe("juan garcia@MATH 10");
    expect(ratingKey("GARCIA, JUAN")).toBe("juan garcia");
  });
});

describe("mergeRatings", () => {
  it("personal overrides community at the same scope", () => {
    const merged = mergeRatings([r("GARCIA, JUAN", 2)], [r("Juan Garcia", 5)]);
    expect(ratingFor("GARCIA, JUAN", merged)?.rating).toBe(5);
  });
  it("keeps course-scoped and overall ratings as separate entries", () => {
    const merged = mergeRatings([r("SY, MARIA", 2, "MATH 10"), r("SY, MARIA", 5)], []);
    expect(ratingFor("SY, MARIA", merged, "MATH 10")?.rating).toBe(2);
    expect(ratingFor("SY, MARIA", merged)?.rating).toBe(5);
  });
});

describe("ratingFor", () => {
  const merged = mergeRatings(
    [r("GARCIA, JUAN", 4), r("GARCIA, JUAN", 1, "MATH 10"), r("SY, MARIA", 5), r("SY, PEDRO", 2)],
    []
  );
  it("prefers the course-scoped rating over the overall one", () => {
    expect(ratingFor("GARCIA, JUAN", merged, "MATH 10")?.rating).toBe(1);
  });
  it("falls back to the overall rating when the course has none", () => {
    expect(ratingFor("GARCIA, JUAN", merged, "MATH 99")?.rating).toBe(4);
  });
  it("falls back to a unique last name", () => {
    expect(ratingFor("GARCIA, J.", merged)?.rating).toBe(4);
  });
  it("returns undefined when the last name is ambiguous or unknown", () => {
    expect(ratingFor("SY, M.A.", merged)).toBeUndefined();
    expect(ratingFor("UNKNOWN, PERSON", merged)).toBeUndefined();
    expect(ratingFor("TBA", merged)).toBeUndefined();
  });
  it("accepts a 0-star rating (distinct from unrated)", () => {
    const zero = mergeRatings([r("CRUZ, JOSE", 0)], []);
    expect(ratingFor("CRUZ, JOSE", zero)?.rating).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/profs.test.ts`
Expected: FAIL — `ratingKey` is not exported and course scoping is unimplemented.

- [ ] **Step 3: Rewrite `src/lib/profs.ts`**

```ts
import type { ProfRating } from "./types";

export function normalizeName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const comma = cleaned.indexOf(",");
  if (comma >= 0) {
    const last = cleaned.slice(0, comma).trim();
    const first = cleaned.slice(comma + 1).replace(/,/g, " ").replace(/\s+/g, " ").trim();
    return `${first} ${last}`.trim();
  }
  return cleaned;
}

export function ratingKey(name: string, courseCode?: string): string {
  const base = normalizeName(name);
  return courseCode ? `${base}@${courseCode}` : base;
}

export function mergeRatings(
  community: ProfRating[],
  personal: ProfRating[]
): Map<string, ProfRating> {
  const merged = new Map<string, ProfRating>();
  for (const rating of [...community, ...personal]) {
    merged.set(ratingKey(rating.name, rating.courseCode), rating);
  }
  return merged;
}

export function ratingFor(
  instructor: string,
  merged: Map<string, ProfRating>,
  courseCode?: string
): ProfRating | undefined {
  const base = normalizeName(instructor);
  if (!base) return undefined;
  if (courseCode) {
    const scoped = merged.get(`${base}@${courseCode}`);
    if (scoped) return scoped;
  }
  const overall = merged.get(base);
  if (overall) return overall;

  // Unique-last-name fallback, over course-agnostic entries only.
  const lastName = base.split(" ").pop();
  if (!lastName) return undefined;
  const candidates = [...merged.entries()].filter(
    ([k]) => !k.includes("@") && k.split(" ").includes(lastName)
  );
  return candidates.length === 1 ? candidates[0][1] : undefined;
}
```

- [ ] **Step 4: Update the ranker's `preferredProfs` branch**

In `src/lib/ranker.ts`, replace the `case "preferredProfs":` body with:

```ts
    case "preferredProfs": {
      // Average across sections; within a section, average across its instructors.
      // Unrated scores neutral (3 on the 0-5 scale).
      const scores = schedule.map((s) => {
        if (s.instructors.length === 0) return 3;
        const perProf = s.instructors.map(
          (name) => ratingFor(name, ratings, s.courseCode)?.rating ?? 3
        );
        return perProf.reduce((a, b) => a + b, 0) / perProf.length;
      });
      return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 3;
    }
```

- [ ] **Step 5: Update the ranker test's `preferredProfs` case**

In `src/lib/ranker.test.ts`, the `sec()` helper must build `instructors`/`modality`. Replace the helper and the `preferredProfs` test with:

```ts
function sec(courseCode: string, sectionCode: string, meetings: Meeting[], instructors: string[] = []): Section {
  return { courseCode, sectionCode, meetings, instructors, modality: "FULLY ONSITE",
    title: courseCode, units: 3, room: "X", remarks: "", raw: "" };
}

  it("preferredProfs prefers higher-rated instructors; unrated scores neutral 3", () => {
    const good: Schedule = [sec("A", "1", [m(["M"], 480, 570)], ["GARCIA, JUAN"])];
    const bad: Schedule = [sec("A", "2", [m(["M"], 480, 570)], ["CRUZ, JOSE"])];
    const unknown: Schedule = [sec("A", "3", [m(["M"], 480, 570)], ["WHO, KNOWS"])];
    const ratings = mergeRatings(
      [{ name: "GARCIA, JUAN", rating: 5 }, { name: "CRUZ, JOSE", rating: 1 }], []);
    const ranked = rank([bad, unknown, good], prefs({ criteria: ["preferredProfs"] }), ratings);
    expect(ranked.map((r) => first([r]))).toEqual(["A 1", "A 3", "A 2"]);
  });

  it("averages ratings across a section's multiple instructors", () => {
    const pair: Schedule = [sec("A", "1", [m(["M"], 480, 570)], ["GARCIA, JUAN", "CRUZ, JOSE"])];
    const solo: Schedule = [sec("A", "2", [m(["M"], 480, 570)], ["GARCIA, JUAN"])];
    const ratings = mergeRatings(
      [{ name: "GARCIA, JUAN", rating: 5 }, { name: "CRUZ, JOSE", rating: 1 }], []);
    const ranked = rank([pair, solo], prefs({ criteria: ["preferredProfs"] }), ratings);
    expect(first([ranked[0]])).toBe("A 2"); // 5 beats the pair's average of 3
  });
```

Also update every other `sec(...)` call in the file to the new signature (the extra argument is optional, so existing 3-argument calls still compile).

- [ ] **Step 6: Run both suites to verify they pass**

Run: `npx vitest run src/lib/profs.test.ts src/lib/ranker.test.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 7: Commit**

```bash
git add src/lib/profs.ts src/lib/profs.test.ts src/lib/ranker.ts src/lib/ranker.test.ts
git commit -m "feat: course-scoped prof ratings and multi-instructor ranking"
```

---

### Task 7: v2 storage with v1 migration

**Files:**
- Rewrite: `src/lib/storage.ts`
- Rewrite: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `Preferences`, `UserState`, `ProfRating` from `src/lib/types.ts`.
- Produces: `STORAGE_VERSION = 2`, `defaultState(calendarTerm: string): UserState`, `loadState(calendarTerm: string): { state: UserState; wasReset: boolean }`, `saveState(state: UserState): void`. `wasReset` is true only when existing stored data was discarded (corrupt, or version ≠ 2).

**Behaviour change from v1:** state is no longer reset when the term changes — the term is now a user-chosen field (`calendarTerm`) that lives *inside* the state, so switching terms must not wipe course selections. Reset happens only for corrupt or wrong-version data.

- [ ] **Step 1: Write the failing tests** — replace `src/lib/storage.test.ts` entirely

```ts
import { beforeEach, describe, it, expect } from "vitest";
import { defaultState, loadState, saveState, STORAGE_VERSION } from "./storage";

const KEY = "aisis-scheduler-state";

describe("storage v2", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored (not a reset)", () => {
    const { state, wasReset } = loadState("2026-2");
    expect(wasReset).toBe(false);
    expect(state).toEqual(defaultState("2026-2"));
    expect(state.version).toBe(2);
    expect(state.preferences.criteria).toEqual(["compactDays"]);
    expect(state.electiveFills).toEqual({});
  });

  it("round-trips saved state", () => {
    const state = defaultState("2026-2");
    state.programId = "BS-AMDSc-2024";
    state.blockKey = "Second Year|First Semester";
    state.requiredCourses = ["MATH 31.3"];
    state.electiveFills = { "Third Year|First Semester#4": "MATH 55.1" };
    saveState(state);
    expect(loadState("2026-2")).toEqual({ state, wasReset: false });
  });

  it("keeps state when the caller's default term differs from the stored one", () => {
    const state = { ...defaultState("2026-2"), requiredCourses: ["MATH 10"] };
    saveState(state);
    const loaded = loadState("2025-1");
    expect(loaded.wasReset).toBe(false);
    expect(loaded.state.calendarTerm).toBe("2026-2");
    expect(loaded.state.requiredCourses).toEqual(["MATH 10"]);
  });

  it("resets on corrupted JSON", () => {
    localStorage.setItem(KEY, "{not json");
    const { state, wasReset } = loadState("2026-2");
    expect(wasReset).toBe(true);
    expect(state).toEqual(defaultState("2026-2"));
  });

  it("resets v1 state (version 1) to v2 defaults", () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 1, semester: "2026-1", chosenCourses: ["PHILO 11"], lockedSections: [],
      fullSections: [], personalRatings: [],
      preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
    }));
    const { state, wasReset } = loadState("2026-2");
    expect(wasReset).toBe(true);
    expect(state).toEqual(defaultState("2026-2"));
  });

  it("resets on a future version", () => {
    saveState({ ...defaultState("2026-2"), version: STORAGE_VERSION + 1 });
    expect(loadState("2026-2").wasReset).toBe(true);
  });

  it("resets on structurally invalid state", () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, calendarTerm: "2026-2", requiredCourses: "oops" }));
    expect(loadState("2026-2").wasReset).toBe(true);
  });

  it("resets when electiveFills is not an object of strings", () => {
    saveState({ ...defaultState("2026-2"), electiveFills: { a: 1 } as unknown as Record<string, string> });
    expect(loadState("2026-2").wasReset).toBe(true);
  });

  it("resets when a personal rating is malformed", () => {
    saveState({ ...defaultState("2026-2"), personalRatings: [{} as never] });
    expect(loadState("2026-2").wasReset).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL — `defaultState` still takes a `semester` and produces v1 shape.

- [ ] **Step 3: Rewrite `src/lib/storage.ts` entirely**

```ts
import type { Preferences, UserState } from "./types";

export const STORAGE_VERSION = 2;
const KEY = "aisis-scheduler-state";

const VALID_RANK_CRITERIA = new Set([
  "compactDays",
  "fewestDays",
  "lateStart",
  "earlyEnd",
  "preferredProfs",
]);

const defaultPreferences = (): Preferences => ({
  criteria: ["compactDays"],
  protectedBlocks: [],
  excludedSections: [],
});

export function defaultState(calendarTerm: string): UserState {
  return {
    version: STORAGE_VERSION,
    programId: "",
    blockKey: "",
    calendarTerm,
    requiredCourses: [],
    electiveFills: {},
    lockedSections: [],
    fullSections: [],
    preferences: defaultPreferences(),
    personalRatings: [],
  };
}

const isStringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((e) => typeof e === "string");

function isValidPreferences(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  if (!Array.isArray(p.criteria) || !p.criteria.every((c) => typeof c === "string" && VALID_RANK_CRITERIA.has(c))) {
    return false;
  }
  if (!Array.isArray(p.protectedBlocks)) return false;
  if (!p.protectedBlocks.every((b) => {
    if (typeof b !== "object" || b === null) return false;
    const m = b as Record<string, unknown>;
    return Array.isArray(m.days) && typeof m.start === "number" && typeof m.end === "number";
  })) return false;
  return isStringArray(p.excludedSections);
}

function isValidState(v: unknown): v is UserState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  if (typeof s.version !== "number") return false;
  if (typeof s.programId !== "string") return false;
  if (typeof s.blockKey !== "string") return false;
  if (typeof s.calendarTerm !== "string") return false;
  if (!isStringArray(s.requiredCourses)) return false;
  if (!isStringArray(s.lockedSections)) return false;
  if (!isStringArray(s.fullSections)) return false;
  if (typeof s.electiveFills !== "object" || s.electiveFills === null) return false;
  if (!Object.values(s.electiveFills as Record<string, unknown>).every((x) => typeof x === "string")) {
    return false;
  }
  if (!Array.isArray(s.personalRatings)) return false;
  if (!s.personalRatings.every((x) => {
    if (typeof x !== "object" || x === null) return false;
    const rt = x as Record<string, unknown>;
    return typeof rt.name === "string" && typeof rt.rating === "number";
  })) return false;
  return isValidPreferences(s.preferences);
}

export function loadState(calendarTerm: string): { state: UserState; wasReset: boolean } {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return { state: defaultState(calendarTerm), wasReset: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    // v1 state (version 1, `semester`/`chosenCourses`) has no migration path worth
    // keeping — the whole selection model changed — so it resets with a notice.
    if (!isValidState(parsed) || parsed.version !== STORAGE_VERSION) {
      return { state: defaultState(calendarTerm), wasReset: true };
    }
    return { state: parsed, wasReset: false };
  } catch {
    return { state: defaultState(calendarTerm), wasReset: true };
  }
}

export function saveState(state: UserState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat: v2 user state storage with v1 reset"
```

---

### Task 8: Requirement resolution (electives + availability)

**Files:**
- Create: `src/lib/requirements.ts`
- Test: `src/lib/requirements.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `CurriculumBlock`, `Section`, `UserState` from `src/lib/types.ts`.
- Produces (used by the Courses screen in Task 10 and the App in Task 12):
  - `interface RequirementRow { slotId: string; catNo: string; title: string; units: number; isElective: boolean; electiveDept?: string; filledWith?: string; courseCode: string | null; selected: boolean; offeredSections: number; }`
  - `seedRequiredCourses(block: CurriculumBlock): string[]` — the non-elective `catNo`s, in order.
  - `buildRequirementRows(block: CurriculumBlock, state: UserState, catalog: Catalog): RequirementRow[]`
  - `resolveCourseCodes(rows: RequirementRow[]): string[]` — selected rows with a real course code and ≥1 offered section; this is what feeds `generate()`.
  - `totalUnits(rows: RequirementRow[]): number` — sum over selected rows.
  - `extraCourseRows(state: UserState, block: CurriculumBlock, catalog: Catalog): RequirementRow[]` — user-added courses not in the block.

- [ ] **Step 1: Write the failing tests** — `src/lib/requirements.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  seedRequiredCourses, buildRequirementRows, resolveCourseCodes, totalUnits, extraCourseRows,
} from "./requirements";
import type { Catalog, CurriculumBlock, Section, UserState } from "./types";

const sec = (courseCode: string, sectionCode: string): Section => ({
  courseCode, sectionCode, title: courseCode, units: 3, instructors: [], modality: "",
  meetings: [], room: "", remarks: "", raw: "",
});

const catalog: Catalog = {
  term: "2026-2", exportedAt: "2026-07-21T00:00:00.000Z", warnings: [],
  sections: [sec("MATH 31.3", "A"), sec("MATH 31.3", "B"), sec("HISTO 12", "A"), sec("MATH 55.1", "A")],
};

const block: CurriculumBlock = {
  year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 9,
  entries: [
    { catNo: "MATH 31.3", title: "MATHEMATICAL ANALYSIS II", units: 3, prerequisites: [], category: "M", isElective: false, slotId: "b#0" },
    { catNo: "HISTO 12", title: "READINGS IN PHILIPPINE HISTORY", units: 3, prerequisites: [], category: "C", isElective: false, slotId: "b#1" },
    { catNo: "PHILO 11", title: "PHILOSOPHY: THE HUMAN CONDITION", units: 3, prerequisites: [], category: "CPH1", isElective: false, slotId: "b#2" },
    { catNo: "MATHEMATICS ELECTIVE", title: "MATHEMATICS ELECTIVE", units: 3, prerequisites: [], category: "RM1", isElective: true, slotId: "b#3" },
  ],
};

function state(over: Partial<UserState> = {}): UserState {
  return {
    version: 2, programId: "BS-AMDSc-2024", blockKey: block.key, calendarTerm: "2026-2",
    requiredCourses: seedRequiredCourses(block), electiveFills: {},
    lockedSections: [], fullSections: [], personalRatings: [],
    preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
    ...over,
  };
}

describe("seedRequiredCourses", () => {
  it("seeds only the real (non-elective) course codes", () => {
    expect(seedRequiredCourses(block)).toEqual(["MATH 31.3", "HISTO 12", "PHILO 11"]);
  });
});

describe("buildRequirementRows", () => {
  it("marks seeded courses selected and counts offered sections", () => {
    const rows = buildRequirementRows(block, state(), catalog);
    const math = rows.find((r) => r.slotId === "b#0")!;
    expect(math).toMatchObject({ courseCode: "MATH 31.3", selected: true, offeredSections: 2 });
  });

  it("flags a required course with no sections this term", () => {
    const philo = buildRequirementRows(block, state(), catalog).find((r) => r.slotId === "b#2")!;
    expect(philo.offeredSections).toBe(0);
    expect(philo.selected).toBe(true); // still selected; UI shows the warning
  });

  it("leaves an unfilled elective with a null course code", () => {
    const elective = buildRequirementRows(block, state(), catalog).find((r) => r.slotId === "b#3")!;
    expect(elective.isElective).toBe(true);
    expect(elective.courseCode).toBeNull();
    expect(elective.filledWith).toBeUndefined();
  });

  it("resolves a filled elective to its concrete course", () => {
    const rows = buildRequirementRows(block, state({ electiveFills: { "b#3": "MATH 55.1" } }), catalog);
    const elective = rows.find((r) => r.slotId === "b#3")!;
    expect(elective.courseCode).toBe("MATH 55.1");
    expect(elective.filledWith).toBe("MATH 55.1");
    expect(elective.offeredSections).toBe(1);
  });

  it("deselects a course dropped from requiredCourses (underload)", () => {
    const rows = buildRequirementRows(block, state({ requiredCourses: ["MATH 31.3"] }), catalog);
    expect(rows.find((r) => r.slotId === "b#1")!.selected).toBe(false);
  });
});

describe("resolveCourseCodes", () => {
  it("returns only selected, resolved, actually-offered courses", () => {
    const rows = buildRequirementRows(block, state({ electiveFills: { "b#3": "MATH 55.1" } }), catalog);
    // PHILO 11 has no sections; the elective resolves to MATH 55.1
    expect(resolveCourseCodes(rows)).toEqual(["MATH 31.3", "HISTO 12", "MATH 55.1"]);
  });
  it("omits an unfilled elective", () => {
    const rows = buildRequirementRows(block, state(), catalog);
    expect(resolveCourseCodes(rows)).toEqual(["MATH 31.3", "HISTO 12"]);
  });
  it("does not return duplicates", () => {
    const rows = buildRequirementRows(block, state({ electiveFills: { "b#3": "MATH 31.3" } }), catalog);
    expect(resolveCourseCodes(rows)).toEqual(["MATH 31.3", "HISTO 12"]);
  });
});

describe("totalUnits", () => {
  it("sums only selected rows", () => {
    const rows = buildRequirementRows(block, state({ requiredCourses: ["MATH 31.3"] }), catalog);
    expect(totalUnits(rows)).toBe(3);
  });
});

describe("extraCourseRows", () => {
  it("surfaces user-added courses that are not part of the block", () => {
    const rows = extraCourseRows(state({ requiredCourses: [...seedRequiredCourses(block), "MATH 55.1"] }), block, catalog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ courseCode: "MATH 55.1", selected: true, offeredSections: 1 });
  });
  it("is empty when nothing extra was added", () => {
    expect(extraCourseRows(state(), block, catalog)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/requirements.test.ts`
Expected: FAIL — cannot resolve `./requirements`.

- [ ] **Step 3: Write `src/lib/requirements.ts`**

```ts
import type { Catalog, CurriculumBlock, UserState } from "./types";

export interface RequirementRow {
  slotId: string;
  catNo: string;              // as printed in the curriculum
  title: string;
  units: number;
  isElective: boolean;
  electiveDept?: string;
  filledWith?: string;        // concrete course chosen for an elective slot
  courseCode: string | null;  // resolved code, or null for an unfilled elective
  selected: boolean;
  offeredSections: number;    // sections in the chosen term's catalog
}

function countSections(catalog: Catalog, courseCode: string | null): number {
  if (!courseCode) return 0;
  return catalog.sections.filter((s) => s.courseCode === courseCode).length;
}

export function seedRequiredCourses(block: CurriculumBlock): string[] {
  return block.entries.filter((e) => !e.isElective).map((e) => e.catNo);
}

export function buildRequirementRows(
  block: CurriculumBlock,
  state: UserState,
  catalog: Catalog
): RequirementRow[] {
  return block.entries.map((entry) => {
    const filledWith = entry.isElective ? state.electiveFills[entry.slotId] : undefined;
    const courseCode = entry.isElective ? (filledWith ?? null) : entry.catNo;
    const selected = courseCode !== null && state.requiredCourses.includes(courseCode);
    return {
      slotId: entry.slotId,
      catNo: entry.catNo,
      title: entry.title,
      units: entry.units,
      isElective: entry.isElective,
      electiveDept: entry.electiveDept,
      filledWith,
      courseCode,
      selected,
      offeredSections: countSections(catalog, courseCode),
    };
  });
}

export function extraCourseRows(
  state: UserState,
  block: CurriculumBlock,
  catalog: Catalog
): RequirementRow[] {
  const fromBlock = new Set<string>();
  for (const entry of block.entries) {
    if (!entry.isElective) fromBlock.add(entry.catNo);
    const fill = state.electiveFills[entry.slotId];
    if (fill) fromBlock.add(fill);
  }
  return state.requiredCourses
    .filter((code) => !fromBlock.has(code))
    .map((code) => {
      const section = catalog.sections.find((s) => s.courseCode === code);
      return {
        slotId: `extra#${code}`,
        catNo: code,
        title: section?.title ?? code,
        units: section?.units ?? 0,
        isElective: false,
        courseCode: code,
        selected: true,
        offeredSections: countSections(catalog, code),
      };
    });
}

export function resolveCourseCodes(rows: RequirementRow[]): string[] {
  const codes: string[] = [];
  for (const row of rows) {
    if (!row.selected || row.courseCode === null || row.offeredSections === 0) continue;
    if (!codes.includes(row.courseCode)) codes.push(row.courseCode);
  }
  return codes;
}

export function totalUnits(rows: RequirementRow[]): number {
  return rows.reduce((sum, row) => (row.selected ? sum + row.units : sum), 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/requirements.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/requirements.ts src/lib/requirements.test.ts
git commit -m "feat: requirement resolution for electives, availability, and unit totals"
```

---

### Task 9: Program & Semester pickers

**Files:**
- Create: `src/components/ProgramPicker.tsx`
- Create: `src/components/SemesterPicker.tsx`
- Test: `src/components/ProgramPicker.test.tsx`
- Test: `src/components/SemesterPicker.test.tsx`
- Delete: `src/components/CoursePicker.tsx`, `src/components/CoursePicker.test.tsx`

**Interfaces:**
- Consumes: `getPrograms` from `src/lib/curriculum.ts`; `getTerms`/`TermOption` from `src/lib/catalog.ts`; `Program`, `ProgramSummary` from `src/lib/types.ts`.
- Produces:
  - `ProgramPicker` props `{ programs: ProgramSummary[]; selectedId: string; onSelect: (programId: string) => void }`
  - `SemesterPicker` props `{ program: Program | undefined; blockKey: string; calendarTerm: string; terms: TermOption[]; onChangeBlock: (blockKey: string) => void; onChangeTerm: (term: string) => void }`

`CoursePicker` is deleted — it is replaced by `CourseRequirements` (Task 10).

- [ ] **Step 1: Write the failing tests** — `src/components/ProgramPicker.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProgramPicker } from "./ProgramPicker";
import type { ProgramSummary } from "../lib/types";

const programs: ProgramSummary[] = [
  { id: "BS-AMDSc-2024", code: "BS AMDSc-M DSc", name: "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS", versionYear: 2024 },
  { id: "BS-CS-2024", code: "BS CS", name: "BACHELOR OF SCIENCE IN COMPUTER SCIENCE", versionYear: 2024 },
];

afterEach(cleanup);

describe("ProgramPicker", () => {
  it("lists programs with code and version year", () => {
    render(<ProgramPicker programs={programs} selectedId="" onSelect={() => {}} />);
    expect(screen.getByText(/BS AMDSc-M DSc.*2024/)).toBeTruthy();
  });

  it("selecting a program calls onSelect with its id", () => {
    const onSelect = vi.fn();
    render(<ProgramPicker programs={programs} selectedId="" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText(/program/i), { target: { value: "BS-CS-2024" } });
    expect(onSelect).toHaveBeenCalledWith("BS-CS-2024");
  });

  it("filters the list by search text", () => {
    render(<ProgramPicker programs={programs} selectedId="" onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/search programs/i), { target: { value: "computer" } });
    expect(screen.queryByText(/APPLIED MATHEMATICS/)).toBeNull();
    expect(screen.getByText(/COMPUTER SCIENCE/)).toBeTruthy();
  });
});
```

`src/components/SemesterPicker.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SemesterPicker } from "./SemesterPicker";
import type { Program } from "../lib/types";

const program: Program = {
  id: "P", code: "P", name: "PROG", versionYear: 2024,
  blocks: [
    { year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 20, entries: [] },
    { year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 22, entries: [] },
  ],
};
const terms = [
  { term: "2026-2", label: "2026-2027 Second Semester" },
  { term: "2026-1", label: "2026-2027 First Semester" },
];

afterEach(cleanup);

describe("SemesterPicker", () => {
  it("lists curriculum blocks by year and term with unit totals", () => {
    render(<SemesterPicker program={program} blockKey="" calendarTerm="2026-2" terms={terms}
      onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    expect(screen.getByText(/Second Year · First Semester.*22/)).toBeTruthy();
  });

  it("choosing a block calls onChangeBlock with its key", () => {
    const onChangeBlock = vi.fn();
    render(<SemesterPicker program={program} blockKey="" calendarTerm="2026-2" terms={terms}
      onChangeBlock={onChangeBlock} onChangeTerm={() => {}} />);
    fireEvent.change(screen.getByLabelText(/curriculum block/i), { target: { value: "Second Year|First Semester" } });
    expect(onChangeBlock).toHaveBeenCalledWith("Second Year|First Semester");
  });

  it("choosing a calendar term calls onChangeTerm", () => {
    const onChangeTerm = vi.fn();
    render(<SemesterPicker program={program} blockKey="" calendarTerm="2026-2" terms={terms}
      onChangeBlock={() => {}} onChangeTerm={onChangeTerm} />);
    fireEvent.change(screen.getByLabelText(/calendar term/i), { target: { value: "2026-1" } });
    expect(onChangeTerm).toHaveBeenCalledWith("2026-1");
  });

  it("prompts to pick a program first when none is selected", () => {
    render(<SemesterPicker program={undefined} blockKey="" calendarTerm="2026-2" terms={terms}
      onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    expect(screen.getByText(/choose a program first/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ProgramPicker.test.tsx src/components/SemesterPicker.test.tsx`
Expected: FAIL — cannot resolve `./ProgramPicker` / `./SemesterPicker`.

- [ ] **Step 3: Write `src/components/ProgramPicker.tsx`**

```tsx
import { useState } from "react";
import type { ProgramSummary } from "../lib/types";

interface Props {
  programs: ProgramSummary[];
  selectedId: string;
  onSelect: (programId: string) => void;
}

export function ProgramPicker({ programs, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const visible = programs.filter((p) =>
    `${p.code} ${p.name} ${p.versionYear}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section>
      <h2>Choose your program</h2>
      <input
        placeholder="Search programs…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p>
        <label>
          Program{" "}
          <select value={selectedId} onChange={(e) => onSelect(e.target.value)}>
            <option value="">— select —</option>
            {visible.map((p) => (
              <option key={p.id} value={p.id}>
                ({p.code}) {p.name} — {p.versionYear}
              </option>
            ))}
          </select>
        </label>
      </p>
      <ul>
        {visible.map((p) => (
          <li key={p.id}>
            <strong>{p.code}</strong> — {p.name} ({p.versionYear})
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Write `src/components/SemesterPicker.tsx`**

```tsx
import type { Program } from "../lib/types";
import type { TermOption } from "../lib/catalog";

interface Props {
  program: Program | undefined;
  blockKey: string;
  calendarTerm: string;
  terms: TermOption[];
  onChangeBlock: (blockKey: string) => void;
  onChangeTerm: (term: string) => void;
}

export function SemesterPicker({
  program, blockKey, calendarTerm, terms, onChangeBlock, onChangeTerm,
}: Props) {
  if (!program) return <p>Choose a program first.</p>;

  return (
    <section>
      <h2>Which semester?</h2>
      <p>
        <label>
          Curriculum block (what you need){" "}
          <select value={blockKey} onChange={(e) => onChangeBlock(e.target.value)}>
            <option value="">— select —</option>
            {program.blocks.map((b) => (
              <option key={b.key} value={b.key}>
                {b.year} · {b.term} — {b.totalUnits} units
              </option>
            ))}
          </select>
        </label>
      </p>
      <p>
        <label>
          Calendar term (where to look){" "}
          <select value={calendarTerm} onChange={(e) => onChangeTerm(e.target.value)}>
            {terms.map((t) => (
              <option key={t.term} value={t.term}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </p>
    </section>
  );
}
```

- [ ] **Step 5: Delete the replaced v1 component**

```bash
git rm src/components/CoursePicker.tsx src/components/CoursePicker.test.tsx
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/ProgramPicker.test.tsx src/components/SemesterPicker.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/ProgramPicker.tsx src/components/SemesterPicker.tsx src/components/ProgramPicker.test.tsx src/components/SemesterPicker.test.tsx
git commit -m "feat: program and semester pickers"
```

---

### Task 10: Course requirements screen

**Files:**
- Create: `src/components/CourseRequirements.tsx`
- Test: `src/components/CourseRequirements.test.tsx`

**Interfaces:**
- Consumes: `buildRequirementRows`, `extraCourseRows`, `totalUnits`, `RequirementRow` from `src/lib/requirements.ts`; `Catalog`, `CurriculumBlock`, `UserState` from `src/lib/types.ts`.
- Produces: `CourseRequirements` props `{ block: CurriculumBlock | undefined; catalog: Catalog | null; state: UserState; onChange: (s: UserState) => void }`.

Behaviour: toggling a row adds/removes its `courseCode` in `state.requiredCourses`; filling an elective sets `state.electiveFills[slotId]` **and** adds the code to `requiredCourses`; clearing a fill removes both. "Add course" searches the catalog and appends to `requiredCourses`. Rows with `offeredSections === 0` show a "not offered" warning; unfilled electives show a "pick a course" prompt.

- [ ] **Step 1: Write the failing test** — `src/components/CourseRequirements.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CourseRequirements } from "./CourseRequirements";
import { seedRequiredCourses } from "../lib/requirements";
import type { Catalog, CurriculumBlock, Section, UserState } from "../lib/types";

const sec = (courseCode: string, sectionCode: string, title = courseCode): Section => ({
  courseCode, sectionCode, title, units: 3, instructors: [], modality: "",
  meetings: [], room: "", remarks: "", raw: "",
});

const catalog: Catalog = {
  term: "2026-2", exportedAt: "2026-07-21T00:00:00.000Z", warnings: [],
  sections: [sec("MATH 31.3", "A"), sec("HISTO 12", "A"), sec("MATH 55.1", "A"), sec("CSCI 112", "A")],
};

const block: CurriculumBlock = {
  year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 12,
  entries: [
    { catNo: "MATH 31.3", title: "MATHEMATICAL ANALYSIS II", units: 3, prerequisites: [], category: "M", isElective: false, slotId: "b#0" },
    { catNo: "HISTO 12", title: "READINGS IN PHILIPPINE HISTORY", units: 3, prerequisites: [], category: "C", isElective: false, slotId: "b#1" },
    { catNo: "PHILO 11", title: "PHILOSOPHY: THE HUMAN CONDITION", units: 3, prerequisites: [], category: "CPH1", isElective: false, slotId: "b#2" },
    { catNo: "MATHEMATICS ELECTIVE", title: "MATHEMATICS ELECTIVE", units: 3, prerequisites: [], category: "RM1", isElective: true, slotId: "b#3" },
  ],
};

const baseState: UserState = {
  version: 2, programId: "P", blockKey: block.key, calendarTerm: "2026-2",
  requiredCourses: seedRequiredCourses(block), electiveFills: {},
  lockedSections: [], fullSections: [], personalRatings: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
};

afterEach(cleanup);

describe("CourseRequirements", () => {
  it("prompts when no block is chosen", () => {
    render(<CourseRequirements block={undefined} catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/choose a program and semester first/i)).toBeTruthy();
  });

  it("lists the block's courses with a running unit total", () => {
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/MATHEMATICAL ANALYSIS II/)).toBeTruthy();
    expect(screen.getByText(/9 units selected/)).toBeTruthy(); // 3 seeded courses x 3 units
  });

  it("warns about a required course with no sections this term", () => {
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/not offered in 2026-2/i)).toBeTruthy();
  });

  it("prompts to fill an unfilled elective", () => {
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/pick a course for this elective/i)).toBeTruthy();
  });

  it("unchecking a course removes it from requiredCourses", () => {
    const onChange = vi.fn();
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/MATH 31\.3/));
    expect((onChange.mock.calls[0][0] as UserState).requiredCourses).not.toContain("MATH 31.3");
  });

  it("filling an elective records the fill and selects the course", () => {
    const onChange = vi.fn();
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/fill MATHEMATICS ELECTIVE/i), { target: { value: "MATH 55.1" } });
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.electiveFills["b#3"]).toBe("MATH 55.1");
    expect(next.requiredCourses).toContain("MATH 55.1");
  });

  it("adding an extra course appends it to requiredCourses", () => {
    const onChange = vi.fn();
    render(<CourseRequirements block={block} catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/add another course/i), { target: { value: "CSCI 112" } });
    expect((onChange.mock.calls[0][0] as UserState).requiredCourses).toContain("CSCI 112");
  });

  it("shows a loading note when the catalog is not loaded yet", () => {
    render(<CourseRequirements block={block} catalog={null} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/loading the catalog/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CourseRequirements.test.tsx`
Expected: FAIL — cannot resolve `./CourseRequirements`.

- [ ] **Step 3: Write `src/components/CourseRequirements.tsx`**

```tsx
import { useMemo } from "react";
import type { Catalog, CurriculumBlock, UserState } from "../lib/types";
import {
  buildRequirementRows, extraCourseRows, totalUnits, type RequirementRow,
} from "../lib/requirements";

interface Props {
  block: CurriculumBlock | undefined;
  catalog: Catalog | null;
  state: UserState;
  onChange: (s: UserState) => void;
}

export function CourseRequirements({ block, catalog, state, onChange }: Props) {
  const courseOptions = useMemo(() => {
    if (!catalog) return [];
    const byCode = new Map<string, string>();
    for (const s of catalog.sections) if (!byCode.has(s.courseCode)) byCode.set(s.courseCode, s.title);
    return [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  if (!block) return <p>Choose a program and semester first.</p>;
  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}…</p>;

  const rows = [
    ...buildRequirementRows(block, state, catalog),
    ...extraCourseRows(state, block, catalog),
  ];
  const units = totalUnits(rows);

  const withCourses = (codes: string[]) => onChange({ ...state, requiredCourses: codes });

  const toggle = (row: RequirementRow) => {
    if (!row.courseCode) return;
    withCourses(
      row.selected
        ? state.requiredCourses.filter((c) => c !== row.courseCode)
        : [...state.requiredCourses, row.courseCode]
    );
  };

  const fillElective = (row: RequirementRow, code: string) => {
    const fills = { ...state.electiveFills };
    const previous = fills[row.slotId];
    let courses = state.requiredCourses.filter((c) => c !== previous);
    if (code) {
      fills[row.slotId] = code;
      if (!courses.includes(code)) courses = [...courses, code];
    } else {
      delete fills[row.slotId];
    }
    onChange({ ...state, electiveFills: fills, requiredCourses: courses });
  };

  const addCourse = (code: string) => {
    if (!code || state.requiredCourses.includes(code)) return;
    withCourses([...state.requiredCourses, code]);
  };

  return (
    <section>
      <h2>
        {block.year} · {block.term} — courses for {state.calendarTerm}
      </h2>
      <p>
        <strong>{units} units selected</strong> (curriculum block totals {block.totalUnits})
      </p>

      <ul>
        {rows.map((row) => (
          <li key={row.slotId}>
            <label>
              <input
                type="checkbox"
                checked={row.selected}
                disabled={row.courseCode === null}
                onChange={() => toggle(row)}
              />{" "}
              <strong>{row.filledWith ?? row.catNo}</strong> — {row.title} ({row.units} units)
            </label>

            {row.isElective && (
              <>
                {" "}
                <label>
                  Fill {row.catNo}{" "}
                  <select
                    value={row.filledWith ?? ""}
                    onChange={(e) => fillElective(row, e.target.value)}
                  >
                    <option value="">— pick a course —</option>
                    {courseOptions.map(([code, title]) => (
                      <option key={code} value={code}>
                        {code} — {title}
                      </option>
                    ))}
                  </select>
                </label>
                {!row.filledWith && <em> Pick a course for this elective.</em>}
              </>
            )}

            {row.courseCode !== null && row.offeredSections === 0 && (
              <em> Not offered in {state.calendarTerm}.</em>
            )}
          </li>
        ))}
      </ul>

      <p>
        <label>
          Add another course{" "}
          <select value="" onChange={(e) => addCourse(e.target.value)}>
            <option value="">— search the catalog —</option>
            {courseOptions.map(([code, title]) => (
              <option key={code} value={code}>
                {code} — {title}
              </option>
            ))}
          </select>
        </label>
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/CourseRequirements.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CourseRequirements.tsx src/components/CourseRequirements.test.tsx
git commit -m "feat: IPS-seeded editable course requirements screen"
```

---

### Task 11: Preferences panel — star ratings & multi-instructor

**Files:**
- Modify: `src/components/PreferencesPanel.tsx`
- Modify: `src/components/PreferencesPanel.test.tsx`

**Interfaces:**
- Consumes: `Catalog`, `ProfRating`, `UserState` from `src/lib/types.ts`; `formatTime` from `src/lib/time.ts`.
- Produces: `PreferencesPanel` props change to `{ catalog: Catalog | null; state: UserState; onChange: (s: UserState) => void }` (was `catalog: Catalog`). Criteria/time-limit/protected-block/excluded-section behaviour is unchanged from v1.

Changes: the instructor list now comes from `Section.instructors[]` for courses in `state.requiredCourses`; each instructor is rated **0–5** and ratings are stored **per prof + course** (`ProfRating.courseCode`), so a prof appears once per course they teach in your list.

- [ ] **Step 1: Update the failing tests** — in `src/components/PreferencesPanel.test.tsx`, replace the catalog/state fixtures and the two prof-rating tests

```tsx
const sec = (courseCode: string, sectionCode: string, instructors: string[]): Section => ({
  courseCode, sectionCode, instructors, modality: "FULLY ONSITE",
  title: courseCode, units: 3, meetings: [], room: "", remarks: "", raw: "",
});
const catalog: Catalog = {
  term: "2026-2", exportedAt: "2026-07-21T00:00:00.000Z", warnings: [],
  sections: [
    sec("PHILO 11", "A", ["GARCIA, JUAN"]),
    sec("PHILO 11", "B", ["DE LOS SANTOS, Kurt Anthony", "MIJARES, Jim Ralphealo"]),
    sec("CSCI 30", "A", ["SY, MARIA"]),
  ],
};
const baseState: UserState = {
  version: 2, programId: "P", blockKey: "B", calendarTerm: "2026-2",
  requiredCourses: ["PHILO 11"], electiveFills: {},
  lockedSections: [], fullSections: [], personalRatings: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
};

  it("lists every instructor of the chosen courses, including co-teachers", () => {
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/GARCIA, JUAN/)).toBeTruthy();
    expect(screen.getByText(/MIJARES, Jim Ralphealo/)).toBeTruthy();
    expect(screen.queryByText(/SY, MARIA/)).toBeNull(); // CSCI 30 is not in requiredCourses
  });

  it("rating a professor stores it scoped to the course, 0-5", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/GARCIA, JUAN.*PHILO 11/), { target: { value: "5" } });
    expect((onChange.mock.calls[0][0] as UserState).personalRatings).toEqual([
      { name: "GARCIA, JUAN", rating: 5, courseCode: "PHILO 11" },
    ]);
  });

  it("accepts a 0-star rating", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/GARCIA, JUAN.*PHILO 11/), { target: { value: "0" } });
    expect((onChange.mock.calls[0][0] as UserState).personalRatings[0].rating).toBe(0);
  });

  it("choosing 'unrated' removes the entry", () => {
    const onChange = vi.fn();
    const rated: UserState = {
      ...baseState,
      personalRatings: [{ name: "GARCIA, JUAN", rating: 4, courseCode: "PHILO 11" }],
    };
    render(<PreferencesPanel catalog={catalog} state={rated} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/GARCIA, JUAN.*PHILO 11/), { target: { value: "" } });
    expect((onChange.mock.calls[0][0] as UserState).personalRatings).toEqual([]);
  });

  it("says so when the catalog has not loaded", () => {
    render(<PreferencesPanel catalog={null} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/loading the catalog/i)).toBeTruthy();
  });
```

Keep the existing criteria / protected-block / excluded-section tests unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PreferencesPanel.test.tsx`
Expected: FAIL — the panel still reads `s.instructor` and stores unscoped ratings.

- [ ] **Step 3: Update `src/components/PreferencesPanel.tsx`**

**Read the current file in full before editing.** These are surgical edits against existing v1 code; every anchor below appears exactly once in the file. Keep the criteria, time-limit, protected-block and excluded-section sections exactly as they are.

Change the `Props` type to accept `catalog: Catalog | null`, add an early return, and replace the instructor list + `setRating` with course-scoped versions:

```tsx
interface Props {
  catalog: Catalog | null;
  state: UserState;
  onChange: (s: UserState) => void;
}
```

Immediately inside the component, before computing anything from the catalog:

```tsx
  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}…</p>;
```

Replace the `instructors` computation with a (course, prof) pair list:

```tsx
  // One row per (course, professor) pair among the user's chosen courses.
  const teachingPairs: { courseCode: string; name: string }[] = [];
  for (const s of catalog.sections) {
    if (!state.requiredCourses.includes(s.courseCode)) continue;
    for (const name of s.instructors) {
      if (!name) continue;
      if (!teachingPairs.some((p) => p.courseCode === s.courseCode && p.name === name)) {
        teachingPairs.push({ courseCode: s.courseCode, name });
      }
    }
  }
  teachingPairs.sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.name.localeCompare(b.name));

  const ratingOf = (courseCode: string, name: string) =>
    state.personalRatings.find((r) => r.name === name && r.courseCode === courseCode)?.rating;

  const setRating = (courseCode: string, name: string, value: string) => {
    const others = state.personalRatings.filter(
      (r) => !(r.name === name && r.courseCode === courseCode)
    );
    if (value === "") {
      onChange({ ...state, personalRatings: others });
      return;
    }
    const rating = Number(value) as ProfRating["rating"];
    onChange({
      ...state,
      personalRatings: [...others, { name, rating, courseCode }],
    });
  };
```

Replace the "My professor ratings" list markup with:

```tsx
      <h2>My professor ratings</h2>
      {teachingPairs.length === 0 && <p>Pick courses first to rate their professors.</p>}
      <ul>
        {teachingPairs.map(({ courseCode, name }) => (
          <li key={`${courseCode}|${name}`}>
            <label>
              {name} — {courseCode}{" "}
              <select
                value={ratingOf(courseCode, name) ?? ""}
                onChange={(e) => setRating(courseCode, name, e.target.value)}
              >
                <option value="">unrated</option>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
```

Add `ProfRating` to the type import from `../lib/types`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/PreferencesPanel.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/components/PreferencesPanel.tsx src/components/PreferencesPanel.test.tsx
git commit -m "feat: 0-5 star prof ratings scoped per course"
```

---

### Task 12: Results & app shell rewiring

**Files:**
- Modify: `src/components/Results.tsx`
- Modify: `src/components/Results.test.tsx`
- Modify: `src/components/ScheduleGrid.tsx`
- Rewrite: `src/App.tsx`
- Delete: `src/components/ImportPage.tsx`, `src/components/ImportPage.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4–11.
- Produces: the wired v2 app. `Results` props gain nothing but its section list now renders `instructors.join(", ")` and the section's modality; the grid shows modality for online sections.

**Scope change:** the v1 "Mark full" button is REMOVED (closed-class handling is out of scope for v2 — see Global Constraints). Delete the `Mark full` / `Unmark full` button and its `toggle("fullSections", …)` call from `Results.tsx`, and delete the two `Mark full` tests from `Results.test.tsx`. Keep `Lock`/`Unlock` and `Exclude`. `UserState.fullSections` and the generator filter stay in place, unused, so the feature can be restored later without rework.

`ImportPage` is deleted: spec §5 lists the tabs as Program · Semester · Courses · Results · Preferences, and the scraper (Task 3) replaces paste-import. Keeping it would leave a dead paste path against a parser that no longer accepts pasted text.

- [ ] **Step 1: Update `Results.test.tsx` fixtures and add the display tests**

Replace the `sec` helper and catalog/state fixtures at the top of `src/components/Results.test.tsx`:

```tsx
const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });
const sec = (courseCode: string, sectionCode: string, meetings: Meeting[], instructors: string[] = ["GARCIA, JUAN"], modality = "FULLY ONSITE"): Section => ({
  courseCode, sectionCode, meetings, instructors, modality,
  title: courseCode, units: 3, room: "CTC 102", remarks: "", raw: "",
});
const catalog: Catalog = {
  term: "2026-2", exportedAt: "2026-07-21T00:00:00.000Z", warnings: [],
  sections: [
    sec("PHILO 11", "A", [m(["M", "TH"], 480, 570)]),
    sec("PHILO 11", "B", [m(["T", "F"], 660, 750)]),
    sec("CSCI 30", "A", [m(["M", "TH"], 570, 660)]),
  ],
};
const baseState: UserState = {
  version: 2, programId: "P", blockKey: "B", calendarTerm: "2026-2",
  requiredCourses: ["PHILO 11", "CSCI 30"], electiveFills: {},
  lockedSections: [], fullSections: [], personalRatings: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
};
```

Update the component's own prop usage in the tests: `Results` reads courses from `state.requiredCourses`. Add:

```tsx
  it("shows all instructors of a section", () => {
    const pair: Catalog = { ...catalog, sections: [
      sec("PHILO 11", "A", [m(["M"], 480, 570)], ["DE LOS SANTOS, Kurt Anthony", "MIJARES, Jim Ralphealo"]),
      sec("CSCI 30", "A", [m(["T"], 480, 570)]),
    ]};
    render(<Results catalog={pair} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/DE LOS SANTOS, Kurt Anthony, MIJARES, Jim Ralphealo/)).toBeTruthy();
  });

  it("flags an online section", () => {
    const online: Catalog = { ...catalog, sections: [
      sec("PHILO 11", "A", [m(["M"], 480, 570)], ["SANTOS, ANA"], "ONLINE"),
      sec("CSCI 30", "A", [m(["T"], 480, 570)]),
    ]};
    render(<Results catalog={online} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getAllByText(/ONLINE/).length).toBeGreaterThan(0);
  });

  it("shows the total units of a schedule", () => {
    render(<Results catalog={catalog} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getAllByText(/6 units/).length).toBeGreaterThan(0);
  });
```

Change every `state.chosenCourses` reference in the file to `state.requiredCourses`, and the "prompts to pick courses" test to use `{ ...baseState, requiredCourses: [] }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Results.test.tsx`
Expected: FAIL — `Results` still reads `state.chosenCourses` and `s.instructor`.

- [ ] **Step 3a: Rename `chosenCourses` → `requiredCourses` in the ENGINE (do this first)**

This is a separate, easy-to-miss change in `src/lib/generator.ts` — the engine's logic is otherwise untouched. Update all three references:

```ts
  for (const course of state.requiredCourses) {
```

and the diagnostics loop:

```ts
  for (let i = 0; i < state.requiredCourses.length; i++) {
    for (let j = i + 1; j < state.requiredCourses.length; j++) {
      const aCourse = state.requiredCourses[i];
      const bCourse = state.requiredCourses[j];
```

and the ordering line:

```ts
  const order = [...state.requiredCourses].sort(
```

Also update `src/lib/generator.test.ts`: rename `chosenCourses` to `requiredCourses` in the `state()` helper and the `CHOSEN` constant, and give `sec()` the v2 `Section` fields (`instructors: []`, `modality: ""`).

Run: `npx vitest run src/lib/generator.test.ts`
Expected: PASS — the engine's behaviour is unchanged; only the field name moved.

- [ ] **Step 3a-bis: Lower the generator's schedule cap for real-data scale**

In `src/lib/generator.ts` change the cap and its comment:

```ts
const MAX_SCHEDULES = 500; // real courses have 40+ sections; the UI only shows the top page
```

Run: `npx vitest run src/lib/generator.test.ts`
Expected: PASS (no existing test depends on the old 5000 value).

- [ ] **Step 3b: Update `src/components/Results.tsx`**

**Read the current file before editing** — the following are surgical edits against existing code, and the anchors must match exactly.

1. Replace the early return guard:

```tsx
  if (state.requiredCourses.length === 0) return <p>Pick courses first.</p>;
```

3. In the per-section list item, show all instructors, modality, and add a units line under the heading:

```tsx
          <h3>
            #{i + 1} · score {r.score.toFixed(2)} ·{" "}
            {r.schedule.reduce((sum, s) => sum + s.units, 0)} units
          </h3>
```

```tsx
                <li key={key}>
                  {key} — {s.instructors.length > 0 ? s.instructors.join(", ") : "TBA"}
                  {s.modality ? ` · ${s.modality}` : ""}{" "}
                  {/* No "Mark full" in v2 — closed-class handling is out of scope. */}
                  <button onClick={() => toggle("lockedSections", key)}>
```

- [ ] **Step 4: Show modality in the grid block** — `src/components/ScheduleGrid.tsx`

Inside the `.block` div, after the room line:

```tsx
                    {s.room}
                    {s.modality && s.modality !== "FULLY ONSITE" ? (
                      <>
                        <br />
                        {s.modality}
                      </>
                    ) : null}
```

- [ ] **Step 5: Rewrite `src/App.tsx` entirely**

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  getTerms, loadCatalog, getCommunityRatings, isStale, CatalogUnavailableError,
} from "./lib/catalog";
import { getPrograms, getCurriculum, getBlock } from "./lib/curriculum";
import { mergeRatings } from "./lib/profs";
import { loadState, saveState } from "./lib/storage";
import { seedRequiredCourses } from "./lib/requirements";
import type { Catalog, UserState } from "./lib/types";
import { ProgramPicker } from "./components/ProgramPicker";
import { SemesterPicker } from "./components/SemesterPicker";
import { CourseRequirements } from "./components/CourseRequirements";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { Results } from "./components/Results";

type Tab = "program" | "semester" | "courses" | "results" | "preferences";
const TABS: { id: Tab; label: string }[] = [
  { id: "program", label: "Program" },
  { id: "semester", label: "Semester" },
  { id: "courses", label: "Courses" },
  { id: "results", label: "Results" },
  { id: "preferences", label: "Preferences" },
];

// 2026-2 exists in the AISIS dropdown but has no published schedule yet, so the
// app defaults to the newest term that actually has data (verified 2026-07-21).
const DEFAULT_TERM = "2026-1";

export default function App() {
  const [loaded] = useState(() => loadState(DEFAULT_TERM));
  const [state, setState] = useState<UserState>(loaded.state);
  const [tab, setTab] = useState<Tab>("program");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string>("");

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    setCatalog(null);
    setCatalogError("");
    loadCatalog(state.calendarTerm)
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCatalogError(
          err instanceof CatalogUnavailableError ? err.message : String(err)
        );
      });
    return () => {
      cancelled = true;
    };
  }, [state.calendarTerm]);

  const programs = useMemo(() => getPrograms(), []);
  const program = useMemo(
    () => (state.programId ? getCurriculum(state.programId) : undefined),
    [state.programId]
  );
  const block = useMemo(
    () => (program && state.blockKey ? getBlock(program, state.blockKey) : undefined),
    [program, state.blockKey]
  );
  const ratings = useMemo(
    () => mergeRatings(getCommunityRatings(), state.personalRatings),
    [state.personalRatings]
  );

  // Choosing a block seeds its required courses (electives stay unfilled).
  const chooseBlock = (blockKey: string) => {
    const next = program ? getBlock(program, blockKey) : undefined;
    setState((s) => ({
      ...s,
      blockKey,
      requiredCourses: next ? seedRequiredCourses(next) : [],
      electiveFills: {},
    }));
  };

  return (
    <main>
      <h1>AISIS Scheduler</h1>
      <nav>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {loaded.wasReset && (
        <p className="banner">Saved settings were from an older version, so they were reset.</p>
      )}
      {catalogError && <p className="banner">{catalogError}</p>}
      {catalog && isStale(catalog) && (
        <p className="banner">This catalog data is over 30 days old — re-run the scraper.</p>
      )}

      {tab === "program" && (
        <ProgramPicker
          programs={programs}
          selectedId={state.programId}
          onSelect={(programId) =>
            setState((s) => ({ ...s, programId, blockKey: "", requiredCourses: [], electiveFills: {} }))
          }
        />
      )}
      {tab === "semester" && (
        <SemesterPicker
          program={program}
          blockKey={state.blockKey}
          calendarTerm={state.calendarTerm}
          terms={getTerms()}
          onChangeBlock={chooseBlock}
          // Section keys are term-scoped, so drop them when the term changes.
          onChangeTerm={(calendarTerm) =>
            setState((s) => ({
              ...s,
              calendarTerm,
              lockedSections: [],
              fullSections: [],
              preferences: { ...s.preferences, excludedSections: [] },
            }))
          }
        />
      )}
      {tab === "courses" && (
        <CourseRequirements block={block} catalog={catalog} state={state} onChange={setState} />
      )}
      {tab === "results" &&
        (catalog ? (
          <Results catalog={catalog} state={state} ratings={ratings} onChange={setState} />
        ) : (
          <p>Loading the catalog for {state.calendarTerm}…</p>
        ))}
      {tab === "preferences" && (
        <PreferencesPanel catalog={catalog} state={state} onChange={setState} />
      )}
    </main>
  );
}
```

- [ ] **Step 6: Delete the replaced import page**

```bash
git rm src/components/ImportPage.tsx src/components/ImportPage.test.tsx
```

- [ ] **Step 7: Run the full suite and the build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; build clean. Fix any remaining v1 references the compiler flags (they will be `chosenCourses`, `instructor`, or `semester`).

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/Results.tsx src/components/Results.test.tsx src/components/ScheduleGrid.tsx src/lib/generator.ts src/lib/generator.test.ts
git commit -m "feat: wire v2 flow (program, semester, requirements, results)"
```

---

### Task 13: End-to-end smoke test and README

**Files:**
- Rewrite: `src/App.smoke.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: the whole wired app on the seeded BS AMDSc curriculum and the seeded `2026-2` catalog.
- Produces: the spec §6 integration test and the updated maintainer runbook.

- [ ] **Step 1: Rewrite the smoke test** — `src/App.smoke.test.tsx`

Runs against the **real committed 2026-1 catalog** (3,743 sections). The chosen block is
**First Year · First Semester**; in the real data `INTACT 11` and `PATHFit 1` have zero
sections, which exercises the "not offered this term" path for free. Because real courses have
40+ sections each, the test deselects most courses first so the search space stays small and the
assertions stay meaningful — and it never asserts an exact schedule count.

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("smoke: program → semester → courses → results", () => {
  it("runs the whole v2 flow on the real sample data", async () => {
    render(<App />);

    // 1. Program
    fireEvent.change(screen.getByLabelText(/program/i), { target: { value: "BS-AMDSc-2024" } });

    // 2. Semester — First Year/First Semester contains MATH 10, which the sample offers.
    fireEvent.click(screen.getByRole("button", { name: "Semester" }));
    fireEvent.change(screen.getByLabelText(/curriculum block/i), {
      target: { value: "First Year|First Semester" },
    });

    // 3. Courses — seeded from the IPS; catalog loads asynchronously.
    fireEvent.click(screen.getByRole("button", { name: "Courses" }));
    await waitFor(() => expect(screen.getByText(/units selected/)).toBeTruthy());
    expect(screen.getByText(/MATHEMATICS IN THE MODERN WORLD/)).toBeTruthy();
    // INTACT 11 and PATHFit 1 genuinely have no sections in the real 2026-1 data.
    expect(screen.getAllByText(/Not offered in 2026-1/i).length).toBeGreaterThan(0);

    // 4. Keep the search space small: drop everything except MATH 71.1 (3 sections)
    //    and MATH 10. Real courses have 40+ sections each, so leaving them all on
    //    would generate tens of thousands of combinations.
    for (const code of ["ENGL 11", "FILI 12", "SocSc 11", "THEO 11"]) {
      fireEvent.click(screen.getByLabelText(new RegExp(code.replace(".", "\\."))));
    }

    // 5. Results — schedules generated from the remaining offered courses.
    fireEvent.click(screen.getByRole("button", { name: "Results" }));
    await waitFor(() => expect(screen.getByText(/valid schedule\(s\), best first/)).toBeTruthy());

    // 6. Preferences re-rank: switching the criterion reorders without error.
    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    fireEvent.click(screen.getByLabelText(/Later starts/));
    fireEvent.click(screen.getByRole("button", { name: "Results" }));
    await waitFor(() => expect(screen.getByText(/valid schedule\(s\), best first/)).toBeTruthy());

    // 7. State persisted.
    const stored = JSON.parse(localStorage.getItem("aisis-scheduler-state")!);
    expect(stored.version).toBe(2);
    expect(stored.programId).toBe("BS-AMDSc-2024");
    expect(stored.blockKey).toBe("First Year|First Semester");
    expect(stored.calendarTerm).toBe("2026-1");
    expect(stored.preferences.criteria).toContain("lateStart");
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/App.smoke.test.tsx`
Expected: PASS. If it fails, the failure is a real integration bug — fix the app, not the test.

- [ ] **Step 3: Rewrite `README.md`**

````markdown
# AISIS Scheduler

Generates and ranks all conflict-free class schedules for Ateneo enlistment,
driven by your program's official curriculum (IPS).

Pick your program, the curriculum block you're taking (e.g. "2nd Year · First
Semester") and the calendar term to enlist in. The app pre-fills the required
courses from the official curriculum, you adjust them (fill electives, add a
minor, overload or underload), and it generates every conflict-free schedule
ranked by your preferences. On enlistment day, mark sections full and it
re-ranks instantly. No accounts; everything personal stays in your browser.

**Design spec:** `docs/superpowers/specs/2026-07-21-ips-driven-scheduler-design.md`

## Development

```bash
npm install
npm run dev        # local dev server
npx vitest run     # all tests
npm run build      # type-check + production build (dist/)
```

## Refreshing the class schedule (once per semester)

The AISIS Schedule of Classes is a **public** page — no login required.

```bash
npm run scrape:schedule -- 2026-1
```

This loops every department for that term and writes
`src/data/catalog-<term>.json`. Commit the file and push; the site redeploys
with fresh offerings. Valid terms: `2026-2`, `2026-1`, `2026-0`, `2025-2`,
`2025-1`, `2025-0`. A term with no data file shows an in-app message telling
you to run this command.

Note: a term only has data once AISIS publishes it. As of 2026-07-21, `2026-2`
returns no results at all — that's AISIS, not a bug. The app defaults to
`2026-1`. Re-run the scraper for the enlistment term once it goes live.

The scraper never sends, prompts for, or stores credentials — don't add auth.

## Adding a program's curriculum

Curricula come from AISIS → **Official Curriculum** (`J_VOFC.do`), which is
behind the student login but identical for every student. `BS AMDSc` (2024) is
seeded in `src/data/curriculum-BS-AMDSc-2024.json`. To add another program,
transcribe its blocks into the same shape and register it in
`src/lib/curriculum.ts`.

## Professor ratings

Ratings are **first-party**: you rate professors 0–5 stars in the app, per class
or overall, and they feed the "preferred professors" ranking criterion. They
live in your browser. There is deliberately no scraping of Facebook or any other
platform — see spec §6.1.

## Deploying

Static site — any host works. For Vercel: import the repo, framework preset
**Vite**, build `npm run build`, output `dist/`. Every push to main redeploys.

## Scaling to Supabase

`src/lib/curriculum.ts` and `src/lib/catalog.ts` are the only modules that read
bundled data. Backing them with Supabase means rewriting those two files and
nothing else — see spec §7.
````

- [ ] **Step 4: Full verification**

Run: `npx vitest run && npm run build`
Expected: ALL tests pass; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/App.smoke.test.tsx README.md
git commit -m "test: v2 end-to-end smoke test; docs: README for the IPS-driven flow"
```

---

## Plan Self-Review Notes

Checked against `docs/superpowers/specs/2026-07-21-ips-driven-scheduler-design.md`:

- **§2.1 offered classes** → Task 3 (scraper, real dept/term codes), Task 2 (10-column parser, modality, multi-instructor). ✔
- **§2.2 official curriculum** → Task 4 (real BS AMDSc 2024 seed incl. quirk blocks, elective placeholders, prereqs, 0-unit courses). ✔
- **§3 architecture** → Task 1 (types), Task 4/5 (the two Supabase swap points), Task 3 (tools), Task 6 (ranker/profs adaptation), Task 12 (`generator.ts` field rename only — logic untouched). ✔
- **§4 data model** → Task 1 verbatim, except the documented `term: string` deviation (plan header). Prof ratings 0–5 + `courseCode` → Tasks 1, 6, 11. ✔
- **§5 flow/screens** → Task 9 (Program, Semester), Task 10 (Courses), Task 11 (Preferences), Task 12 (Results + shell, ImportPage removed per the §5 tab list). ✔
- **§6 matching** → Task 8 (`resolveCourseCodes` feeds the untouched generator). ✔
- **§6.1 ratings boundary** → Global Constraints + Task 13 README. No scraping task exists. ✔
- **§6 error handling** → not-offered flags (Tasks 8, 10), unfilled electives (Tasks 8, 10), curriculum quirks (Task 4), parser warnings (Task 2), stale/unavailable catalog (Tasks 5, 12), v1→v2 reset (Task 7). ✔
- **§6 testing** → real fixtures (Tasks 2, 4, 5), curriculum loader (Task 4), rating precedence + multi-instructor (Task 6), v1→v2 migration (Task 7), integration flow (Task 13). ✔
- **§7 scaling** → documented in Task 13's README; the swap points exist by construction. ✔

**Type consistency:** `sectionKey`, `Section.instructors`/`modality`, `Catalog.term`, `UserState.requiredCourses`/`electiveFills`, `RequirementRow`, `TermOption`, `CatalogUnavailableError`, `ratingKey`/`ratingFor(instructor, merged, courseCode?)`, `seedRequiredCourses`/`buildRequirementRows`/`resolveCourseCodes`/`totalUnits`/`extraCourseRows` are named identically everywhere they appear.

**Live verification performed 2026-07-21 (before implementation):**
- POST field names read directly from `classScheduleForm`: `command=displayResults`,
  `subjCode=ALL`, `applicablePeriod=<term>`, `deptCode=<code>`. My earlier guess `sy` was
  wrong; `applicablePeriod` is correct.
- Term data availability probed for MATHEMATICS: `2026-2` = **0 rows (not published)**,
  `2026-1` = 201, `2026-0` = 75, `2025-2` = 215, `2025-1` = 214, `2025-0` = 69.
  Hence the app defaults to `2026-1` and the sample catalog is tagged `2026-1`.
- The 10 sample sections in Task 5 are **real captured rows**. An earlier draft of this plan
  padded that file with ~6 invented sections; those were removed. No fabricated data ships.

**Fixes applied after the pre-implementation review:**
1. Verified scraper POST fields (was guessed). 2. Scoped the build gate so Tasks 2-11 aren't
blocked by the intentional Task 1 breakage. 3. `tsx` for the scraper (plain Node cannot resolve
`parser.ts`'s extensionless imports). 4. "Read the file first" guidance on the surgical edits in
Tasks 11/12. 5. The `generator.ts` field rename promoted to its own visible step (3a).
6. Term-scoped selections cleared when the calendar term changes. 7. Real sample data replacing
fabrications, tagged with the correct term. 8. Mark-full UI dropped (v2 scope).

**Known accepted limitations (not bugs):**
- The sample catalog covers MATHEMATICS only, so most curriculum courses show "not offered"
  until the maintainer runs the scraper. This is honest behaviour and is exercised by the smoke test.
- Tasks 11 and 12 use surgical edits rather than whole-file rewrites; each anchor is unique and
  the steps say to read the file first.

**Deletions are deliberate and justified inline:** `aisis-sample.ts` + `aisis-export.js` (guessed formats, replaced by real ones), `CoursePicker` (replaced by `CourseRequirements`), `ImportPage` (replaced by the scraper; absent from spec §5's tab list), `catalog-2026-1.json` (v1 placeholder data).
