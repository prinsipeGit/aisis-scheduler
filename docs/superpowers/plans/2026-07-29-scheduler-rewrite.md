# Scheduler Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `src/` as a single-page cockpit whose selection model is one list of slots, resolving curriculum codes to the sections AISIS actually offers.

**Architecture:** A framework-free `lib/` (pure, directly testable) under a React `ui/`. One network seam (`Db`) reads Supabase. A `Slot` is the single source of truth for course selection; each slot resolves to a *set* of acceptable catalog codes via exact/alias/variant rules, and the generator picks one section per slot.

**Tech Stack:** React 18, TypeScript 5.5 (strict), Vite 5, Vitest 2 + Testing Library, `@supabase/supabase-js`. No new runtime dependencies except `@fontsource/archivo-black` and `@fontsource/inter`.

**Spec:** `docs/superpowers/specs/2026-07-28-scheduler-rewrite-design.md`. Section references below (§n) point into it.

## Global Constraints

- **Branch off `curricula-scraper`**, not `main` (§2.2). Nine commits there carry the scrapers, migration `0002`, and the fixture tests.
- **Only `src/` is deleted and rebuilt.** `data/`, `tools/`, `docs/`, `supabase/` are kept. The one new data file is `data/course-aliases.json` (§5.1).
- **Nothing in `lib/` imports from `ui/`.** `lib/` must not import React.
- **Nothing in `tools/` imports from `src/`.** Task 1 establishes this; it is currently violated.
- `MAX_SCHEDULES = 500`, with the find-one-extra truncation check (§6).
- `STORAGE_VERSION = 3`. v2 state fails validation and resets with the existing banner (§9).
- Ranking is **lexicographic**, metrics compared rounded to the whole minute (§7).
- Slot resolution is the deduplicated **union** of exact ∪ alias ∪ variant, except that a narrowed slot (`chosen !== null`) resolves by exact match only (§5, §5.2).
- A zero-offering or unpinned pre-assigned slot is **excluded from generation, never blocking** (§5.3, §5.6).
- No file import of any kind (§11.6). No dark mode.
- Copy register: sentence case, plain verbs, user-side vocabulary.
- Every task ends green: `npx vitest run` and `npx tsc --noEmit` both pass before committing.

## File Structure

```
src/
  lib/
    types.ts         domain types incl. Slot, UserState v3
    time.ts          overlaps · formatTime            (parsing moved to tools/ in Task 1)
    course-code.ts   canonicalCourseCode · sameCourseCode · subjectPrefix
    term.ts          defaultTerm(now, available)      §11.2
    offerings.ts     acceptableCodes · sectionsFor    §5
    slots.ts         seedSlots · addFromCurriculum · addFromCatalog · resolveSlots  §4, §11.5
    generator.ts     generate(slots, state)           §6
    ranker.ts        rank(schedules, prefs, ratings)  §7
    profs.ts         normalizeName · ratingFor · mergeRatings
    storage.ts       loadState · saveState · v3 validation  §9
    db.ts            Db interface + Supabase impl + row mappers  §8
    catalog.ts       getTerms · loadCatalog · loadCommunityRatings
    curriculum.ts    getPrograms · loadProgram · getBlock
  ui/
    App.tsx          three-zone cockpit shell
    useSchedules.ts  generation + ranking memo, shared by stage and candidates
    setup/           ProgramSection · SemesterSection · CoursesSection ·
                     AlreadyHaveSection · PreferencesSection            §11.1
    stage/           WeekGrid · Pager · SectionChips · Diagnostics · EmptyStage
    candidates/      CandidateList
    export/          scheduleImage.ts                 §11.3
  index.css          Block Poster token system
  main.tsx
tools/
  schedule-parse.mjs      moved out of src/lib/parser.ts in Task 1
  schedule-parse.test.ts  moved out of src/lib/parser.test.ts
data/
  course-aliases.json     new (§5.1)
```

---

### Task 1: Decouple `tools/` from `src/`

`tools/scrape-schedule.mjs:21` imports `parseRows` from `src/lib/parser.ts`. Deleting `src/` in Task 2 breaks the schedule scraper. The app never imports that module — it reads pre-parsed sections from Supabase — so it belongs in `tools/` beside `curriculum-parse.mjs` (§2.1).

**Files:**
- Create: `tools/schedule-parse.mjs`
- Create: `tools/schedule-parse.test.ts`
- Modify: `tools/scrape-schedule.mjs:21`
- Modify: `package.json` (`scrape:schedule` no longer needs `tsx`)
- Delete: `src/lib/parser.ts`, `src/lib/parser.test.ts`
- Modify: `src/lib/time.ts` (drop `parseTimeRange`, which only `parser.ts` used)

**Interfaces:**
- Consumes: nothing.
- Produces: `tools/schedule-parse.mjs` exporting `parseDays(token) → string[]|null`, `parseTimeRange(text) → {start,end}|null`, `parseTimeCell(cell) → {meetings,modality,status,ok}`, `splitInstructors(cell) → string[]`, `parseRow(cells) → {section,warning?}`, `parseRows(rows) → {sections,warnings}`.

- [ ] **Step 1: Create `tools/schedule-parse.mjs`**

Port of `src/lib/parser.ts` plus `parseTimeRange`, as plain JS with no imports. Both existing fixes (semicolon separator, TUTORIAL placeholder) are preserved verbatim.

```javascript
// Parsers for the public AISIS class-schedule table (classSkeds.do).
// Dependency-free by design, like tools/curriculum-parse.mjs and tools/extract-rows.mjs.
// This is scraper-only: the app reads already-parsed sections from Supabase.

// Column layout of the 10-column table, verified live 2026-07-21.
const COL = {
  subjectCode: 0, section: 1, title: 2, units: 3, time: 4,
  room: 5, instructor: 6, lang: 7, level: 8, remarks: 9,
};
const MIN_COLUMNS = 10;

// Longest tokens first so "TH" wins over "T" when scanning compact strings.
const DAY_TOKENS = ["SAT", "SUN", "TH", "M", "T", "W", "F"];

export function parseDays(token) {
  const cleaned = token.toUpperCase().trim();
  if (!cleaned) return null;
  const parts = cleaned.includes("-") ? cleaned.split("-") : [cleaned];
  const days = [];
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

export function parseTimeRange(text) {
  const m = text.trim().match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (start >= end || Number(m[2]) > 59 || Number(m[4]) > 59 || end > 24 * 60) return null;
  return { start, end };
}

export function parseTimeCell(cell) {
  // AISIS renders "M-TH 0800-0930" then "(FULLY ONSITE)" on a second line.
  const modalityMatch = cell.match(/\(([^)]*)\)\s*$/);
  const modality = modalityMatch ? modalityMatch[1].trim() : "";
  const text = cell.replace(/\([^)]*\)\s*$/, "").trim();
  if (!text || text.toUpperCase() === "TBA") {
    return { meetings: [], modality, status: "tba", ok: true };
  }
  // AISIS writes "TUTORIAL 0000-0000" for tutorials, thesis and special-topics sections
  // with no fixed meeting time. The 0000-0000 is a placeholder, not a time, so this is a
  // real section without a schedule — TBA, not bad data. Keying on the TUTORIAL keyword
  // (rather than on 0000-0000 alone) keeps a genuinely corrupt "M 0000-0000" an error.
  if (/^TUTORIAL(\s+0000-0000)?$/i.test(text)) {
    return { meetings: [], modality, status: "tba", ok: true };
  }

  const meetings = [];
  // AISIS separates a section's meetings with either "/" or ";" — both seen live
  // (e.g. "M-TH 1230-1400; W 1100-1300"). Splitting on "/" alone made every
  // semicolon form a parse error, which excluded real, fully-scheduled sections.
  for (const chunk of text.split(/[/;]/)) {
    const m = chunk.trim().match(/^(.+?)\s+(\S+)$/);
    if (!m) return { meetings: [], modality, status: "parse-error", ok: false };
    const days = parseDays(m[1]);
    const range = parseTimeRange(m[2]);
    if (!days || !range) return { meetings: [], modality, status: "parse-error", ok: false };
    meetings.push({ days, start: range.start, end: range.end });
  }
  return { meetings, modality, status: "scheduled", ok: true };
}

// Instructors are "LAST, FIRST" and multiple profs are joined by ", " — so the
// commas are ambiguous. Re-pair the fragments: every even fragment starts a name.
export function splitInstructors(cell) {
  const text = cell.trim();
  if (!text || text.toUpperCase() === "TBA") return [];
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const names = [];
  for (let i = 0; i < parts.length; i += 2) {
    names.push(parts[i + 1] === undefined ? parts[i] : `${parts[i]}, ${parts[i + 1]}`);
  }
  return names;
}

export function parseRow(cells) {
  const raw = cells.join(" | ");
  if (cells.length < MIN_COLUMNS) {
    return { section: null, warning: `Skipped row (unrecognized format): ${raw}` };
  }
  const units = Number(cells[COL.units].replace(/[()]/g, ""));
  const { meetings, modality, status: timeStatus, ok } = parseTimeCell(cells[COL.time]);
  // AISIS uses both "-" and "~" as empty-remark placeholders (both seen in real data).
  const rawRemarks = cells[COL.remarks].trim();
  const remarks = rawRemarks === "-" || rawRemarks === "~" ? "" : rawRemarks;
  const section = {
    courseCode: cells[COL.subjectCode].trim(),
    sectionCode: cells[COL.section].trim(),
    title: cells[COL.title].trim(),
    units: Number.isFinite(units) ? units : 0,
    instructors: splitInstructors(cells[COL.instructor]),
    modality,
    meetings,
    timeStatus,
    room: cells[COL.room].trim(),
    remarks,
    raw,
  };
  if (!ok) {
    return {
      section,
      warning: `Unparseable time "${cells[COL.time]}" — imported for display only, excluded from generated schedules: ${raw}`,
    };
  }
  return { section };
}

export function parseRows(rows) {
  const sections = [];
  const warnings = [];
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

- [ ] **Step 2: Move the test file**

```bash
git mv src/lib/parser.test.ts tools/schedule-parse.test.ts
```

Then change its import line and add `parseTimeRange` to it:

```typescript
import { parseDays, parseTimeRange, parseTimeCell, splitInstructors, parseRow, parseRows } from "./schedule-parse.mjs";
```

The fixture import must also be repointed — the file currently imports from `./fixtures/aisis-real`:

```typescript
import { REAL_ROWS, EDGE_ROWS } from "../src/lib/fixtures/aisis-real";
```

- [ ] **Step 3: Move the fixture with it**

```bash
mkdir -p tools/fixtures
git mv src/lib/fixtures/aisis-real.ts tools/fixtures/aisis-real.ts
```

Then set the import in `tools/schedule-parse.test.ts` to `./fixtures/aisis-real`.

- [ ] **Step 4: Repoint the scraper and drop `tsx`**

In `tools/scrape-schedule.mjs`, line 21:

```javascript
import { parseRows } from "./schedule-parse.mjs";
```

In `package.json`:

```json
"scrape:schedule": "node tools/scrape-schedule.mjs",
```

- [ ] **Step 5: Trim `src/lib/time.ts`**

`parseTimeRange` had exactly one consumer (`parser.ts`) and has moved. `overlaps` and `formatTime` have app consumers and stay. Replace the file with:

```typescript
import type { Meeting } from "./types";

export function overlaps(a: Meeting, b: Meeting): boolean {
  const sharedDay = a.days.some((d) => b.days.includes(d));
  return sharedDay && a.start < b.end && b.start < a.end;
}

export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${suffix}`;
}
```

Delete the `parseTimeRange` cases from `src/lib/time.test.ts` (they are covered by `tools/schedule-parse.test.ts` now).

- [ ] **Step 6: Delete the old parser**

```bash
git rm src/lib/parser.ts
```

- [ ] **Step 7: Verify nothing in tools/ still reaches into src/**

Run:
```bash
grep -rn "\.\./src" tools/ ; echo "exit=$?"
```
Expected: no matches, `exit=1`.

- [ ] **Step 8: Run the suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass (same count as before the move), typecheck clean.

- [ ] **Step 9: Prove the scraper still works end to end**

Run: `npm run scrape:schedule -- 2026-1`
Expected: finishes with `Wrote …/catalog-2026-1.json: 3902 sections, 2 warnings.` — the same numbers as the committed file. `git diff --stat data/` should show only `exportedAt` changing.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move the schedule parser into tools/, decoupling it from src/"
```

---

### Task 2: Branch, wipe `src/`, rebuild domain types and pure utilities

**Files:**
- Create: `src/lib/types.ts`, `src/lib/course-code.ts`, `src/lib/term.ts`
- Create: `src/lib/course-code.test.ts`, `src/lib/term.test.ts`
- Keep: `src/lib/time.ts` and `src/lib/time.test.ts` from Task 1
- Delete: everything else under `src/`

**Interfaces:**
- Consumes: Task 1's clean `tools/` boundary.
- Produces: `Slot`, `UserState` (v3), `Section`, `Catalog`, `Program`, `CurriculumBlock`, `Preferences`, `RankCriterion`, `Diagnostics`, `SearchSummary`, `sectionKey(s) → string`; `canonicalCourseCode(code) → string`, `sameCourseCode(a,b) → boolean`, `subjectPrefix(code) → string`; `defaultTerm(now: Date, available: string[]) → string`.

- [ ] **Step 1: Branch and clear `src/`**

```bash
git checkout curricula-scraper
git checkout -b scheduler-rewrite
mkdir -p /tmp/keep && cp src/lib/time.ts src/lib/time.test.ts /tmp/keep/
git rm -r --quiet src
mkdir -p src/lib && cp /tmp/keep/time.ts /tmp/keep/time.test.ts src/lib/
```

- [ ] **Step 2: Write `src/lib/types.ts`**

```typescript
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
  instructors: string[]; // as printed by AISIS
  modality: string;      // "FULLY ONSITE" | "ONLINE" | "" when absent
  meetings: Meeting[];   // empty ⇒ TBA (excluded from conflict math)
  timeStatus?: "scheduled" | "tba" | "parse-error";
  room: string;
  remarks: string;
  raw: string;
}

export interface Catalog {
  term: string;
  exportedAt: string;
  sections: Section[];
  warnings: string[];
}

export interface ProfRating {
  name: string;
  rating: number;        // 0-5
  courseCode?: string;
  note?: string;
  asOf?: string;
}

// ---- Curriculum (official IPS) ----

export interface ProgramSummary {
  id: string;
  code: string;
  name: string;
  version: string;
  versionYear: number;
  versionLabel: string;
}

export interface CurriculumEntry {
  catNo: string;
  title: string;
  units: number;
  prerequisites: string[];
  category: string;      // "M", "C", "PFT2", "NS1A", …
  isElective: boolean;
  electiveDept?: string;
  slotId: string;        // "First Year|First Semester#4"
}

export interface CurriculumBlock {
  year: string;
  term: string;
  key: string;           // `${year}|${term}`
  totalUnits: number;
  entries: CurriculumEntry[];
}

export interface Program extends ProgramSummary {
  blocks: CurriculumBlock[];
}

// ---- Selection model (§4) ----

export interface Slot {
  id: string;                 // "ips:First Year|First Semester#4" | "added:3"
  origin: "ips" | "added";    // ips = a curriculum requirement, from any block
  label: string;              // "PHILO 11" | "MATHEMATICS ELECTIVE"
  requirement: string | null; // curriculum catNo; null when added from catalog
  category: string | null;    // AISIS requirement category; null when from catalog
  sourceBlock: string | null; // block key it came from; null when from catalog
  chosen: string | null;      // course code the student picked; null = unnarrowed
  pairedWith: string | null;  // id of a slot this must share a subject prefix with
  included: boolean;          // counts toward generation
}

// ---- Ranking / preferences ----

export type RankCriterion =
  | "compactDays" | "fewestDays" | "lateStart" | "earlyEnd" | "preferredProfs";

export interface Preferences {
  criteria: RankCriterion[];
  earliestStart?: number;
  latestEnd?: number;
  protectedBlocks: Meeting[];
  excludedSections: string[];
}

export interface UserState {
  version: number;                // 3
  programId: string;
  blockKey: string;               // the primary block (§11.5)
  calendarTerm: string;
  slots: Slot[];
  lockedSections: string[];
  fullSections: string[];
  completedCourses: string[];     // reserved (§9); [] for now
  preferences: Preferences;
  personalRatings: ProfRating[];
}

export type Schedule = Section[];

export interface Diagnostics {
  perSlot: { id: string; label: string; total: number; afterFilters: number }[];
  conflictPairs: { a: string; b: string }[];
  nWayConflict: boolean;
}

export interface SearchSummary {
  limit: number;
  truncated: boolean;
}

export function sectionKey(s: Section): string {
  return `${s.courseCode} ${s.sectionCode}`;
}
```

- [ ] **Step 3: Write the failing test for `course-code.ts`**

`src/lib/course-code.test.ts`:

```typescript
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
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run src/lib/course-code.test.ts`
Expected: FAIL — `Failed to resolve import "./course-code"`.

- [ ] **Step 5: Write `src/lib/course-code.ts`**

```typescript
export function canonicalCourseCode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

export function sameCourseCode(a: string, b: string): boolean {
  return canonicalCourseCode(a) === canonicalCourseCode(b);
}

// The subject a code belongs to: everything before the first space.
// Used to keep a lecture and its lab in the same department (§5.4).
export function subjectPrefix(code: string): string {
  return canonicalCourseCode(code).split(" ")[0];
}
```

- [ ] **Step 6: Run it to confirm it passes**

Run: `npx vitest run src/lib/course-code.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Write the failing test for `term.ts`**

`src/lib/term.test.ts`. Every case uses a fixed clock — never `new Date()` (§12).

```typescript
import { describe, it, expect } from "vitest";
import { defaultTerm } from "./term";

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
```

- [ ] **Step 8: Run it to confirm it fails**

Run: `npx vitest run src/lib/term.test.ts`
Expected: FAIL — `Failed to resolve import "./term"`.

- [ ] **Step 9: Write `src/lib/term.ts`**

```typescript
// Term codes are `${academicYearStart}-${n}`, n ∈ {1: First Sem, 2: Second Sem, 0: Intersession}.
// AY 2026-2027 = "2026-*": Sem 1 Aug–Dec 2026, Sem 2 Jan–May 2027, Intersession Jun–Jul 2027.
//
// Enlistment happens BEFORE a term starts, so the useful default is the term being enlisted
// for, not the one currently running (§11.2).
function computeTerm(now: Date): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 6 && month <= 10) return `${year}-1`;   // Jun–Oct: First Sem of the AY starting now
  if (month >= 11) return `${year}-2`;                 // Nov–Dec: Second Sem of that same AY
  if (month <= 2) return `${year - 1}-2`;              // Jan–Feb: still that AY's Second Sem
  return `${year - 1}-0`;                              // Mar–May: that AY's Intersession
}

// Newest first: later academic year wins, then Second Sem > First Sem > Intersession,
// matching the order a student would consider them.
const RANK: Record<string, number> = { "2": 2, "1": 1, "0": 0 };
function newest(available: string[]): string {
  return [...available].sort((a, b) => {
    const [ay, an] = a.split("-");
    const [by, bn] = b.split("-");
    return Number(by) - Number(ay) || (RANK[bn] ?? -1) - (RANK[an] ?? -1);
  })[0] ?? "";
}

// The computed term is used only if it actually has a catalog. Without this, opening the app
// in November defaults to a term nobody has scraped and the first thing the user sees is an
// error banner.
export function defaultTerm(now: Date, available: string[]): string {
  const computed = computeTerm(now);
  return available.includes(computed) ? computed : newest(available);
}
```

- [ ] **Step 10: Run it to confirm it passes**

Run: `npx vitest run src/lib/term.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: domain types, course-code helpers and the term default"
```

---

### Task 3: Data layer — `db.ts`, `catalog.ts`, `curriculum.ts`

Merges the old `supabase.ts` and `rows.ts`, fixes the unselected `version`/`version_label` columns, and introduces the column-asserting stub that makes that class of bug impossible to reintroduce (§8).

**Files:**
- Create: `src/lib/db.ts`, `src/lib/catalog.ts`, `src/lib/curriculum.ts`
- Create: `src/lib/testing/stubDb.ts`
- Create: `src/lib/catalog.test.ts`, `src/lib/curriculum.test.ts`, `src/lib/db.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `Program`, `ProgramSummary`, `ProfRating`, `CurriculumBlock` from Task 2.
- Produces:
  - `interface Db { selectAll<T>(table, columns): Promise<T[]>; selectOne<T>(table, columns, keyColumn, key): Promise<T|null> }`
  - `defaultDb: Db`
  - `stubDb(tables: Record<string, Record<string, unknown>[]>): Db` — asserts every requested column exists on the rows it returns
  - `getTerms(db?) → Promise<TermOption[]>` where `TermOption = { term: string; label: string; available: boolean }`
  - `loadCatalog(term, db?) → Promise<Catalog>`, throws `CatalogUnavailableError`
  - `loadCommunityRatings(db?) → Promise<ProfRating[]>`
  - `getPrograms(db?) → Promise<ProgramSummary[]>`
  - `loadProgram(id, db?) → Promise<Program>`, throws `ProgramUnavailableError`
  - `getBlock(program, blockKey) → CurriculumBlock | undefined`
  - `isStale(catalog, now?) → boolean`

- [ ] **Step 1: Write the failing test for the column-asserting stub**

This is the structural fix for the `version_label` bug — write it before the code it guards. `src/lib/db.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { stubDb } from "./testing/stubDb";

const rows = [{ id: "X", code: "C", name: "N", version: "24BE", version_year: 2024, version_label: "2024 · BE" }];

describe("stubDb", () => {
  it("returns rows for columns that exist", async () => {
    const db = stubDb({ programs: rows });
    expect(await db.selectAll("programs", "id, code, version_label")).toEqual(rows);
  });

  it("throws when a requested column is absent from the row shape", async () => {
    const db = stubDb({ programs: [{ id: "X", code: "C" }] });
    await expect(db.selectAll("programs", "id, version_label")).rejects.toThrow(/version_label/);
  });

  it("applies the same check to selectOne", async () => {
    const db = stubDb({ programs: rows });
    await expect(db.selectOne("programs", "id, nope", "id", "X")).rejects.toThrow(/nope/);
    expect(await db.selectOne("programs", "id, version", "id", "X")).toEqual(rows[0]);
  });

  it("returns null for a missing key and [] for a missing table", async () => {
    const db = stubDb({ programs: rows });
    expect(await db.selectOne("programs", "id", "id", "MISSING")).toBeNull();
    expect(await db.selectAll("nothing", "id")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/db.test.ts`
Expected: FAIL — `Failed to resolve import "./testing/stubDb"`.

- [ ] **Step 3: Write `src/lib/testing/stubDb.ts`**

```typescript
import type { Db } from "../db";

const parseColumns = (columns: string): string[] =>
  columns.split(",").map((c) => c.trim()).filter(Boolean);

// Every existing test either injected rows directly or stubbed a Db that ignored the
// `columns` argument — which is exactly why `version_label` was read by the row mappers,
// never requested from Supabase, and arrived undefined with a full suite passing.
// This stub fails instead (§8).
function assertColumns(table: string, columns: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const shape = new Set(Object.keys(rows[0]));
  for (const column of parseColumns(columns)) {
    if (column === "*") continue;
    if (!shape.has(column)) {
      throw new Error(
        `stubDb: query on "${table}" requested column "${column}", which the row shape does not have. ` +
        `Available: ${[...shape].join(", ")}`
      );
    }
  }
}

export function stubDb(tables: Record<string, Record<string, unknown>[]>): Db {
  return {
    async selectAll<T>(table: string, columns: string): Promise<T[]> {
      const rows = tables[table] ?? [];
      assertColumns(table, columns, rows);
      return rows as T[];
    },
    async selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null> {
      const rows = tables[table] ?? [];
      assertColumns(table, columns, rows);
      return (rows.find((row) => row[keyColumn] === key) as T) ?? null;
    },
  };
}
```

- [ ] **Step 4: Write `src/lib/db.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";
import project from "../../supabase/project.json";
import type { Catalog, CurriculumBlock, ProfRating, Program, ProgramSummary, Section } from "./types";

// The ONLY network boundary for shared data. Tests inject stubDb instead.
export interface Db {
  selectAll<T>(table: string, columns: string): Promise<T[]>;
  selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null>;
}

export interface CatalogRow { term: string; exported_at: string; sections: Section[]; warnings: string[] }
export interface ProgramRow { id: string; code: string; name: string; version: string; version_year: number; version_label: string; blocks: CurriculumBlock[] }
export interface RatingRow { name: string; rating: number; course_code: string | null; note: string | null; as_of: string | null }

// Column lists live beside the row types they populate, so the two cannot drift apart
// unnoticed — the omission that made versionLabel undefined (§8).
export const CATALOG_COLUMNS = "term, exported_at, sections, warnings";
export const PROGRAM_SUMMARY_COLUMNS = "id, code, name, version, version_year, version_label";
export const PROGRAM_COLUMNS = `${PROGRAM_SUMMARY_COLUMNS}, blocks`;
export const RATING_COLUMNS = "name, rating, course_code, note, as_of";

export const rowToCatalog = (row: CatalogRow): Catalog => ({
  term: row.term, exportedAt: row.exported_at, sections: row.sections, warnings: row.warnings,
});
export const rowToSummary = (row: Omit<ProgramRow, "blocks">): ProgramSummary => ({
  id: row.id, code: row.code, name: row.name, version: row.version,
  versionYear: row.version_year, versionLabel: row.version_label,
});
export const rowToProgram = (row: ProgramRow): Program => ({
  ...rowToSummary(row), blocks: row.blocks,
});
export const rowToRating = (row: RatingRow): ProfRating => ({
  name: row.name,
  rating: row.rating,
  ...(row.course_code !== null ? { courseCode: row.course_code } : {}),
  ...(row.note !== null ? { note: row.note } : {}),
  ...(row.as_of !== null ? { asOf: row.as_of } : {}),
});

const client = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? project.url,
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? project.anonKey,
  { auth: { persistSession: false } }
);

export const defaultDb: Db = {
  async selectAll<T>(table: string, columns: string): Promise<T[]> {
    const { data, error } = await client.from(table).select(columns);
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as T[];
  },
  async selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null> {
    const { data, error } = await client.from(table).select(columns).eq(keyColumn, key).maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data as T) ?? null;
  },
};
```

- [ ] **Step 5: Run the stub tests to confirm they pass**

Run: `npx vitest run src/lib/db.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing tests for catalog and curriculum**

`src/lib/catalog.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getTerms, loadCatalog, loadCommunityRatings, isStale, CatalogUnavailableError } from "./catalog";
import { stubDb } from "./testing/stubDb";

const catalogRow = {
  term: "2026-1", exported_at: "2026-07-28T00:00:00.000Z",
  sections: [], warnings: [],
};

describe("catalog data layer", () => {
  it("marks terms present in the database as available", async () => {
    const terms = await getTerms(stubDb({ catalogs: [catalogRow] }));
    expect(terms.find((t) => t.term === "2026-1")).toEqual({
      term: "2026-1", label: "2026-2027 First Semester", available: true,
    });
    expect(terms.find((t) => t.term === "2026-2")?.available).toBe(false);
  });

  it("loads a catalog by term", async () => {
    const catalog = await loadCatalog("2026-1", stubDb({ catalogs: [catalogRow] }));
    expect(catalog.term).toBe("2026-1");
    expect(catalog.exportedAt).toBe("2026-07-28T00:00:00.000Z");
  });

  it("throws CatalogUnavailableError naming both commands", async () => {
    const err = await loadCatalog("2025-0", stubDb({ catalogs: [catalogRow] })).catch((e) => e);
    expect(err).toBeInstanceOf(CatalogUnavailableError);
    expect((err as Error).message).toContain("npm run scrape:schedule -- 2025-0");
    expect((err as Error).message).toContain("npm run push:data");
  });

  it("maps rating rows, dropping nulls", async () => {
    const db = stubDb({ community_ratings: [{ name: "A", rating: 4.5, course_code: null, note: null, as_of: null }] });
    expect(await loadCommunityRatings(db)).toEqual([{ name: "A", rating: 4.5 }]);
  });

  it("treats a catalog older than 30 days, or undateable, as stale", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    expect(isStale({ ...catalogRow, exportedAt: "2026-07-28T00:00:00.000Z" } as never, now)).toBe(true);
    expect(isStale({ ...catalogRow, exportedAt: "2026-08-30T00:00:00.000Z" } as never, now)).toBe(false);
    expect(isStale({ ...catalogRow, exportedAt: "nonsense" } as never, now)).toBe(true);
  });
});
```

`src/lib/curriculum.test.ts` — note the assertion that would have caught the original bug:

```typescript
import { describe, it, expect } from "vitest";
import { getPrograms, loadProgram, getBlock, ProgramUnavailableError } from "./curriculum";
import { stubDb } from "./testing/stubDb";

const row = {
  id: "X-24BE", code: "X", name: "X PROGRAM",
  version: "24BE", version_year: 2024, version_label: "2024 · BE",
  blocks: [{ year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 3, entries: [] }],
};

describe("curriculum data layer", () => {
  it("lists summaries WITH the version label, sorted by code", async () => {
    const programs = await getPrograms(stubDb({ programs: [row] }));
    expect(programs).toEqual([{
      id: "X-24BE", code: "X", name: "X PROGRAM",
      version: "24BE", versionYear: 2024, versionLabel: "2024 · BE",
    }]);
  });

  it("loads a full program with its blocks", async () => {
    const program = await loadProgram("X-24BE", stubDb({ programs: [row] }));
    expect(program.versionLabel).toBe("2024 · BE");
    expect(program.blocks).toHaveLength(1);
  });

  it("throws ProgramUnavailableError for an unknown id", async () => {
    const err = await loadProgram("NOPE", stubDb({ programs: [row] })).catch((e) => e);
    expect(err).toBeInstanceOf(ProgramUnavailableError);
  });

  it("getBlock finds a block by key", async () => {
    const program = await loadProgram("X-24BE", stubDb({ programs: [row] }));
    expect(getBlock(program, "First Year|First Semester")?.totalUnits).toBe(3);
    expect(getBlock(program, "nope")).toBeUndefined();
  });
});
```

- [ ] **Step 7: Run them to confirm they fail**

Run: `npx vitest run src/lib/catalog.test.ts src/lib/curriculum.test.ts`
Expected: FAIL — both modules unresolved.

- [ ] **Step 8: Write `src/lib/catalog.ts`**

```typescript
import type { Catalog, ProfRating } from "./types";
import {
  defaultDb, rowToCatalog, rowToRating,
  CATALOG_COLUMNS, RATING_COLUMNS,
  type CatalogRow, type Db, type RatingRow,
} from "./db";

// The ONLY place catalog data is read (§8).

const STALE_AFTER_DAYS = 30;

export interface TermOption {
  term: string;
  label: string;
  available: boolean;
}

const TERM_SUFFIX: Record<string, string> = {
  "1": "First Semester", "2": "Second Semester", "0": "Intersession",
};

function termLabel(term: string): string {
  const [year, n] = term.split("-");
  const startYear = Number(year);
  return `${startYear}-${startYear + 1} ${TERM_SUFFIX[n] ?? n}`;
}

export class CatalogUnavailableError extends Error {
  term: string;
  constructor(term: string) {
    super(`No catalog data for term ${term}. Run: npm run scrape:schedule -- ${term} && npm run push:data`);
    this.name = "CatalogUnavailableError";
    this.term = term;
  }
}

export function isStale(catalog: Catalog, now: Date = new Date()): boolean {
  const exported = new Date(catalog.exportedAt).getTime();
  if (Number.isNaN(exported)) return true;
  return now.getTime() - exported > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

const KNOWN_TERMS = ["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"];

export async function getTerms(db: Db = defaultDb): Promise<TermOption[]> {
  const rows = await db.selectAll<Pick<CatalogRow, "term">>("catalogs", "term");
  const inDb = new Set(rows.map((r) => r.term));
  const known = KNOWN_TERMS.map((term) => ({ term, label: termLabel(term), available: inDb.has(term) }));
  const extras = [...inDb].filter((t) => !KNOWN_TERMS.includes(t)).sort().reverse()
    .map((term) => ({ term, label: termLabel(term), available: true }));
  return [...known, ...extras];
}

export async function loadCatalog(term: string, db: Db = defaultDb): Promise<Catalog> {
  const row = await db.selectOne<CatalogRow>("catalogs", CATALOG_COLUMNS, "term", term);
  if (row === null) throw new CatalogUnavailableError(term);
  return rowToCatalog(row);
}

export async function loadCommunityRatings(db: Db = defaultDb): Promise<ProfRating[]> {
  const rows = await db.selectAll<RatingRow>("community_ratings", RATING_COLUMNS);
  return rows.map(rowToRating);
}
```

- [ ] **Step 9: Write `src/lib/curriculum.ts`**

```typescript
import type { CurriculumBlock, Program, ProgramSummary } from "./types";
import {
  defaultDb, rowToProgram, rowToSummary,
  PROGRAM_COLUMNS, PROGRAM_SUMMARY_COLUMNS,
  type Db, type ProgramRow,
} from "./db";

// The ONLY place curriculum data is read (§8).

export function getBlock(program: Program, blockKey: string): CurriculumBlock | undefined {
  return program.blocks.find((b) => b.key === blockKey);
}

export class ProgramUnavailableError extends Error {
  id: string;
  constructor(id: string) {
    super(`No curriculum for program ${id}. Run: npm run scrape:curricula && npm run push:data`);
    this.name = "ProgramUnavailableError";
    this.id = id;
  }
}

export async function getPrograms(db: Db = defaultDb): Promise<ProgramSummary[]> {
  const rows = await db.selectAll<Omit<ProgramRow, "blocks">>("programs", PROGRAM_SUMMARY_COLUMNS);
  return rows.map(rowToSummary).sort((a, b) => a.code.localeCompare(b.code));
}

export async function loadProgram(id: string, db: Db = defaultDb): Promise<Program> {
  const row = await db.selectOne<ProgramRow>("programs", PROGRAM_COLUMNS, "id", id);
  if (row === null) throw new ProgramUnavailableError(id);
  return rowToProgram(row);
}
```

- [ ] **Step 10: Run to confirm they pass**

Run: `npx vitest run src/lib/`
Expected: PASS — db 4, catalog 5, curriculum 4, course-code 4, term 4, time tests.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: data layer with column-asserting test stub and the version_label fix"
```

---

### Task 4: Alias file and `offerings.ts`

**Files:**
- Create: `data/course-aliases.json`
- Create: `src/lib/offerings.ts`, `src/lib/offerings.test.ts`

**Interfaces:**
- Consumes: `Slot`, `Catalog`, `Section` (Task 2); `canonicalCourseCode`, `subjectPrefix` (Task 2).
- Produces:
  - `interface AliasFile { aliases: Record<string, string[]>; pairs: [string, string][]; preAssigned: string[] }`
  - `acceptableCodes(slot: Slot, catalog: Catalog, file: AliasFile) → string[]`
  - `sectionsFor(slot: Slot, catalog: Catalog, file: AliasFile) → Section[]`
  - `isPreAssigned(slot: Slot, file: AliasFile) → boolean`
  - `aliasKeyFor(slot: Slot, file: AliasFile) → string | null`

- [ ] **Step 1: Create `data/course-aliases.json`**

Every entry derived from the 69-program zero-offering report (§5.1), none guessed.

```json
{
  "aliases": {
    "PFT1": ["PEPC 10"],
    "PFT2": ["PEPC 11", "PEPC 12"],
    "PFT3": ["PEPC 13", "PEPC 14", "PEPC 15", "PEPC 16", "PEPC 17", "PEPC 18", "PEPC 19"],
    "PFT4": ["PEPC 13", "PEPC 14", "PEPC 15", "PEPC 16", "PEPC 17", "PEPC 18", "PEPC 19"],

    "PE1": ["PEPC 10"],
    "PE2": ["PEPC 11", "PEPC 12"],
    "PE3": ["PEPC 13", "PEPC 14", "PEPC 15", "PEPC 16", "PEPC 17", "PEPC 18", "PEPC 19"],
    "PE4": ["PEPC 13", "PEPC 14", "PEPC 15", "PEPC 16", "PEPC 17", "PEPC 18", "PEPC 19"],

    "NS1A": ["BIO 10.01", "CHEM 10.01", "ENVI 10.01", "PHYS 10.01"],
    "NS1B": ["BIO 10.02", "CHEM 10.02", "ENVI 10.02", "PHYS 10.02"],

    "FLC1": ["FRE 11", "GER 11", "ITA 11", "JPN 11", "KRN 11", "RUSS 11", "SPA 11"],
    "FLC 12": ["FRE 12", "GER 12", "JPN 12", "KRN 12", "SPA 12"]
  },
  "pairs": [["NS1A", "NS1B"]],
  "preAssigned": ["INTACT 11"]
}
```

- [ ] **Step 2: Write the failing test**

`src/lib/offerings.test.ts`. Counts are the ones verified against the real catalog while writing the spec (§12).

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { acceptableCodes, sectionsFor, isPreAssigned, type AliasFile } from "./offerings";
import type { Catalog, Slot } from "./types";

const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8")) as Catalog;
const file = JSON.parse(readFileSync("data/course-aliases.json", "utf8")) as AliasFile;

const slot = (over: Partial<Slot>): Slot => ({
  id: "s", origin: "ips", label: "L", requirement: null, category: null,
  sourceBlock: null, chosen: null, pairedWith: null, included: true, ...over,
});

describe("acceptableCodes", () => {
  it("exact match resolves to the one code", () => {
    expect(acceptableCodes(slot({ requirement: "MATH 10" }), catalog, file)).toEqual(["MATH 10"]);
  });

  it("does not over-match a longer code with the same prefix", () => {
    // "MATH 100"/"MATH 101" extend "MATH 10" with a digit, not "." or "(", so they must not match.
    const codes = acceptableCodes(slot({ requirement: "MATH 10" }), catalog, file);
    expect(codes.some((c) => c.startsWith("MATH 10") && c !== "MATH 10")).toBe(false);
  });

  it("variant rule finds the PHILO 11 tracks and both NSTP 11 forms", () => {
    expect(acceptableCodes(slot({ requirement: "PHILO 11" }), catalog, file))
      .toEqual(["PHILO 11.03", "PHILO 11.04", "PHILO 11.05", "PHILO 11.06"]);
    expect(acceptableCodes(slot({ requirement: "NSTP 11" }), catalog, file))
      .toEqual(["NSTP 11(CWTS)", "NSTP 11(ROTC)"]);
  });

  it("resolves the PATHFit families through their categories", () => {
    const pft = (category: string, requirement: string) =>
      acceptableCodes(slot({ requirement, category }), catalog, file);
    expect(pft("PFT1", "PATHFit 1")).toEqual(["PEPC 10"]);
    expect(pft("PFT2", "PATHFit 2")).toHaveLength(2);
    expect(pft("PFT3", "PATHFit 3")).toHaveLength(23);
  });

  it("resolves natural science and foreign language", () => {
    expect(acceptableCodes(slot({ requirement: "NatSc 10.01", category: "NS1A" }), catalog, file)).toHaveLength(4);
    expect(acceptableCodes(slot({ requirement: "FLC 11", category: "FLC1" }), catalog, file)).toHaveLength(7);
  });

  it("prefers the category key over the catNo key", () => {
    // catNo differs between programs (NatSc 10.01 vs NATSCI 1A) but the category does not.
    const a = acceptableCodes(slot({ requirement: "NatSc 10.01", category: "NS1A" }), catalog, file);
    const b = acceptableCodes(slot({ requirement: "NATSCI 1A", category: "NS1A" }), catalog, file);
    expect(a).toEqual(b);
  });

  it("falls back to the catNo key when the category is not an alias key", () => {
    // FLC 12's category is RM1, which is program-local and therefore not a key.
    expect(acceptableCodes(slot({ requirement: "FLC 12", category: "RM1" }), catalog, file)).toHaveLength(5);
  });

  it("a narrowed slot resolves to exactly its chosen code", () => {
    const narrowed = slot({ requirement: "PATHFit 3", category: "PFT3", chosen: "PEPC 13.15" });
    expect(acceptableCodes(narrowed, catalog, file)).toEqual(["PEPC 13.15"]);
  });

  it("an unfilled elective resolves to nothing", () => {
    expect(acceptableCodes(slot({ requirement: null }), catalog, file)).toEqual([]);
  });
});

describe("sectionsFor", () => {
  it("returns every section of every acceptable code", () => {
    const sections = sectionsFor(slot({ requirement: "NSTP 11" }), catalog, file);
    expect(sections.length).toBeGreaterThan(40);
    expect(new Set(sections.map((s) => s.courseCode))).toEqual(new Set(["NSTP 11(CWTS)", "NSTP 11(ROTC)"]));
  });
});

describe("isPreAssigned", () => {
  it("is true for INTACT 11 and false otherwise", () => {
    expect(isPreAssigned(slot({ requirement: "INTACT 11" }), file)).toBe(true);
    expect(isPreAssigned(slot({ requirement: "MATH 10" }), file)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/lib/offerings.test.ts`
Expected: FAIL — `Failed to resolve import "./offerings"`.

- [ ] **Step 4: Write `src/lib/offerings.ts`**

```typescript
import type { Catalog, Section, Slot } from "./types";
import { canonicalCourseCode } from "./course-code";

export interface AliasFile {
  aliases: Record<string, string[]>;
  pairs: [string, string][];
  preAssigned: string[];
}

// A catalog code is a variant of `base` when it extends base with a suffix beginning
// "." or "(" — PHILO 11 → PHILO 11.03, NSTP 11 → NSTP 11(CWTS). Deliberately narrow, so
// MATH 10 does not swallow MATH 100 (remainder "0" starts with neither).
function isVariantOf(code: string, base: string): boolean {
  const c = canonicalCourseCode(code);
  const b = canonicalCourseCode(base);
  if (!c.startsWith(b)) return false;
  const rest = c.slice(b.length);
  return rest.startsWith(".") || rest.startsWith("(");
}

function matches(code: string, base: string): boolean {
  return canonicalCourseCode(code) === canonicalCourseCode(base) || isVariantOf(code, base);
}

// Alias keys are AISIS requirement categories where the slot has one, and catNo otherwise.
// Categories are stable where catNos drift between programs — NP1 is "NSTP 11" in 63
// programs and "NSTP 1" in 6 — so the category is tried first (§5.1).
export function aliasKeyFor(slot: Slot, file: AliasFile): string | null {
  if (slot.category && file.aliases[slot.category]) return slot.category;
  const target = slot.requirement;
  if (target && file.aliases[target]) return target;
  return null;
}

export function isPreAssigned(slot: Slot, file: AliasFile): boolean {
  const keys = [slot.category, slot.requirement].filter(Boolean) as string[];
  return keys.some((k) => file.preAssigned.includes(k));
}

export function acceptableCodes(slot: Slot, catalog: Catalog, file: AliasFile): string[] {
  const codes = [...new Set(catalog.sections.map((s) => s.courseCode))];

  // A narrowed slot names a concrete catalog code; it must not re-expand through its
  // category, or picking Tai Chi would give back all 23 PATHFit activities (§5.2).
  if (slot.chosen !== null) {
    const chosen = canonicalCourseCode(slot.chosen);
    return codes.filter((c) => canonicalCourseCode(c) === chosen).sort();
  }

  const target = slot.requirement;
  if (!target) return [];

  // The three rules are a union, not a precedence chain: a code matching more than one
  // must not shadow the others (§5).
  const out = new Set<string>();
  for (const code of codes) if (matches(code, target)) out.add(code);
  const key = aliasKeyFor(slot, file);
  if (key) {
    for (const prefix of file.aliases[key]) {
      for (const code of codes) if (matches(code, prefix)) out.add(code);
    }
  }
  return [...out].sort();
}

export function sectionsFor(slot: Slot, catalog: Catalog, file: AliasFile): Section[] {
  const codes = new Set(acceptableCodes(slot, catalog, file).map(canonicalCourseCode));
  return catalog.sections.filter((s) => codes.has(canonicalCourseCode(s.courseCode)));
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `npx vitest run src/lib/offerings.test.ts`
Expected: PASS, 11 tests. If `PFT3` returns a count other than 23, the catalog has changed — re-derive from `data/`, do not edit the expectation to match.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: alias file and slot-to-sections resolution"
```

---

### Task 5: `slots.ts` — the selection model

Replaces `requirements.ts` and the three-structure sync it existed to manage (§3, §4). Also
implements adding a requirement from another block (§11.5) and slot resolution status, which
the generator and every UI surface read (§5.3, §5.6).

**Files:**
- Create: `src/lib/slots.ts`, `src/lib/slots.test.ts`

**Interfaces:**
- Consumes: `Slot`, `CurriculumBlock`, `CurriculumEntry`, `Catalog`, `Section` (Task 2);
  `acceptableCodes`, `sectionsFor`, `isPreAssigned`, `AliasFile` (Task 4); `sectionKey` (Task 2).
- Produces:
  - `type SlotStatus = "ok" | "unfilled" | "no-offerings" | "awaiting-section"`
  - `interface ResolvedSlot { slot: Slot; sections: Section[]; allSections: Section[]; status: SlotStatus; pinned: string | null }`
    — `sections` are the candidates generation may use; `allSections` is every section of
    every acceptable code, which the pin picker (Task 12) and the ratings list still need
    when `sections` has been narrowed to one or emptied.
  - `seedSlots(block, file) → Slot[]`
  - `slotsFromCurriculum(entry, block, file) → Slot[]` (returns the pair partner too)
  - `slotFromCatalog(code, index) → Slot`
  - `resolveSlots(slots, catalog, file, locked) → ResolvedSlot[]`
  - `totalUnits(slots, block, program) → number`

- [ ] **Step 1: Write the failing test**

`src/lib/slots.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { seedSlots, slotsFromCurriculum, slotFromCatalog, resolveSlots } from "./slots";
import type { AliasFile } from "./offerings";
import type { Catalog, CurriculumBlock } from "./types";

const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8")) as Catalog;
const file = JSON.parse(readFileSync("data/course-aliases.json", "utf8")) as AliasFile;

const entry = (catNo: string, category: string, i: number, isElective = false) => ({
  catNo, title: catNo, units: 3, prerequisites: [], category, isElective,
  slotId: `First Year|First Semester#${i}`,
});

const block: CurriculumBlock = {
  year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 19,
  entries: [
    entry("MATH 10", "C", 0),
    entry("NatSc 10.01", "NS1A", 1),
    entry("NatSc 10.02", "NS1B", 2),
    entry("INTACT 11", "C", 3),
    entry("FREE ELECTIVE", "FE1", 4, true),
  ],
};

describe("seedSlots", () => {
  it("makes one slot per entry, electives excluded until filled", () => {
    const slots = seedSlots(block, file);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.included)).toEqual([true, true, true, true, false]);
    expect(slots[0]).toMatchObject({
      origin: "ips", requirement: "MATH 10", category: "C",
      sourceBlock: "First Year|First Semester", chosen: null,
    });
  });

  it("links the NS1A/NS1B lecture-lab pair in both directions", () => {
    const slots = seedSlots(block, file);
    const lec = slots.find((s) => s.category === "NS1A")!;
    const lab = slots.find((s) => s.category === "NS1B")!;
    expect(lec.pairedWith).toBe(lab.id);
    expect(lab.pairedWith).toBe(lec.id);
  });

  it("gives an elective a null requirement so it resolves to nothing until filled", () => {
    const elective = seedSlots(block, file).find((s) => s.label === "FREE ELECTIVE")!;
    expect(elective.requirement).toBeNull();
  });
});

describe("slotsFromCurriculum", () => {
  it("carries the category, which is what makes alias resolution work (§11.5)", () => {
    const [slot] = slotsFromCurriculum(entry("PATHFit 3", "PFT3", 7), block, file);
    expect(slot).toMatchObject({ origin: "ips", category: "PFT3", sourceBlock: block.key });
  });

  it("brings the pair partner along, so a lecture never arrives without its lab", () => {
    const slots = slotsFromCurriculum(entry("NatSc 10.01", "NS1A", 1), block, file);
    expect(slots.map((s) => s.category).sort()).toEqual(["NS1A", "NS1B"]);
    expect(slots[0].pairedWith).toBe(slots[1].id);
  });
});

describe("slotFromCatalog", () => {
  it("carries no category, so it cannot alias-resolve", () => {
    expect(slotFromCatalog("MATH 10", 0)).toMatchObject({
      origin: "added", requirement: "MATH 10", category: null, sourceBlock: null, included: true,
    });
  });
});

describe("resolveSlots", () => {
  const resolve = (slots: ReturnType<typeof seedSlots>, locked: string[] = []) =>
    resolveSlots(slots, catalog, file, locked);

  it("marks an ordinary offered requirement ok", () => {
    const [math] = resolve(seedSlots(block, file));
    expect(math.status).toBe("ok");
    expect(math.sections.length).toBeGreaterThan(0);
  });

  it("marks an unfilled elective unfilled, with no sections", () => {
    const elective = resolve(seedSlots(block, file)).find((r) => r.slot.label === "FREE ELECTIVE")!;
    expect(elective.status).toBe("unfilled");
    expect(elective.sections).toEqual([]);
  });

  it("marks an unpinned pre-assigned course awaiting-section, not no-offerings (§5.6)", () => {
    const intact = resolve(seedSlots(block, file)).find((r) => r.slot.requirement === "INTACT 11")!;
    expect(intact.status).toBe("awaiting-section");
    expect(intact.sections).toEqual([]);
  });

  it("pinning a pre-assigned section yields exactly that section", () => {
    const one = catalog.sections.find((s) => s.courseCode === "INTACT 11")!;
    const key = `${one.courseCode} ${one.sectionCode}`;
    const intact = resolve(seedSlots(block, file), [key]).find((r) => r.slot.requirement === "INTACT 11")!;
    expect(intact.status).toBe("ok");
    expect(intact.pinned).toBe(key);
    expect(intact.sections).toHaveLength(1);
  });

  it("marks a requirement with no offerings no-offerings", () => {
    const slots = [slotFromCatalog("NOTACOURSE 999", 0)];
    expect(resolve(slots)[0].status).toBe("no-offerings");
  });

  it("keeps every candidate in allSections even when sections is empty", () => {
    // The pin picker needs the alternatives precisely when generation has none.
    const intact = resolve(seedSlots(block, file)).find((r) => r.slot.requirement === "INTACT 11")!;
    expect(intact.sections).toEqual([]);
    expect(intact.allSections.length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/slots.test.ts`
Expected: FAIL — `Failed to resolve import "./slots"`.

- [ ] **Step 3: Write `src/lib/slots.ts`**

```typescript
import type { Catalog, CurriculumBlock, CurriculumEntry, Section, Slot } from "./types";
import { sectionKey } from "./types";
import { isPreAssigned, sectionsFor, type AliasFile } from "./offerings";

export type SlotStatus =
  | "ok"               // has candidate sections
  | "unfilled"         // an elective with no course chosen yet
  | "no-offerings"     // resolves to a course, but nothing is offered this term
  | "awaiting-section"; // pre-assigned; the student must supply their section (§5.6)

export interface ResolvedSlot {
  slot: Slot;
  sections: Section[];     // candidates generation may use
  allSections: Section[];  // every section of every acceptable code, for the pin picker
  status: SlotStatus;
  pinned: string | null;
}

const slotId = (entry: CurriculumEntry) => `ips:${entry.slotId}`;

function toSlot(entry: CurriculumEntry, block: CurriculumBlock): Slot {
  return {
    id: slotId(entry),
    origin: "ips",
    label: entry.catNo,
    // An elective has no concrete code, so it resolves to nothing until filled (§5.2).
    requirement: entry.isElective ? null : entry.catNo,
    category: entry.category || null,
    sourceBlock: block.key,
    chosen: null,
    pairedWith: null,
    included: !entry.isElective,
  };
}

// Link slots whose categories are declared a pair, in both directions (§5.4).
function linkPairs(slots: Slot[], file: AliasFile): Slot[] {
  const byCategory = new Map(slots.filter((s) => s.category).map((s) => [s.category!, s]));
  for (const [a, b] of file.pairs) {
    const first = byCategory.get(a);
    const second = byCategory.get(b);
    if (first && second) {
      first.pairedWith = second.id;
      second.pairedWith = first.id;
    }
  }
  return slots;
}

export function seedSlots(block: CurriculumBlock, file: AliasFile): Slot[] {
  return linkPairs(block.entries.map((entry) => toSlot(entry, block)), file);
}

// Adding a requirement from another block (§11.5). Returns the pair partner too: importing
// half a lecture/lab pair would leave a slot whose partner does not exist, silently dropping
// the constraint.
export function slotsFromCurriculum(
  entry: CurriculumEntry, block: CurriculumBlock, file: AliasFile
): Slot[] {
  const partnerCategory = file.pairs
    .find(([a, b]) => a === entry.category || b === entry.category)
    ?.find((c) => c !== entry.category);
  const partner = partnerCategory
    ? block.entries.find((e) => e.category === partnerCategory)
    : undefined;
  const entries = partner ? [entry, partner] : [entry];
  return linkPairs(entries.map((e) => toSlot(e, block)), file);
}

export function slotFromCatalog(code: string, index: number): Slot {
  return {
    id: `added:${index}`,
    origin: "added",
    label: code,
    requirement: code,
    category: null,
    sourceBlock: null,
    chosen: null,
    pairedWith: null,
    included: true,
  };
}

export function resolveSlots(
  slots: Slot[], catalog: Catalog, file: AliasFile, locked: string[]
): ResolvedSlot[] {
  return slots.map((slot) => {
    // Computed once and returned on every branch: the pin picker must still list the
    // alternatives when `sections` has been narrowed to one or emptied.
    const allSections = sectionsFor(slot, catalog, file);

    // A pin is a locked section belonging to one of this slot's acceptable codes.
    const pinnedSection = allSections.find((s) => locked.includes(sectionKey(s)));
    if (pinnedSection) {
      return {
        slot, allSections, sections: [pinnedSection],
        status: "ok" as const, pinned: sectionKey(pinnedSection),
      };
    }

    if (slot.requirement === null && slot.chosen === null) {
      return { slot, allSections, sections: [], status: "unfilled" as const, pinned: null };
    }

    // Pre-assigned and not pinned: excluded from generation, but say why. Treating its 103
    // sections as free choices multiplies the search space and truncates every ranking (§5.6).
    if (isPreAssigned(slot, file)) {
      return { slot, allSections, sections: [], status: "awaiting-section" as const, pinned: null };
    }

    return {
      slot,
      allSections,
      sections: allSections,
      status: allSections.length > 0 ? ("ok" as const) : ("no-offerings" as const),
      pinned: null,
    };
  });
}

// Units for the slots the student has selected. A slot's units come from its curriculum
// entry where it has one, else from the catalog section it resolves to.
export function totalUnits(resolved: ResolvedSlot[], unitsFor: (code: string) => number): number {
  return resolved.reduce((sum, r) => {
    if (!r.slot.included) return sum;
    const code = r.slot.chosen ?? r.slot.requirement;
    return code ? sum + unitsFor(code) : sum;
  }, 0);
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/slots.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: slot selection model with pairing, pinning and resolution status"
```

---

### Task 6: `generator.ts` — one section per slot

**Files:**
- Create: `src/lib/generator.ts`, `src/lib/generator.test.ts`

**Interfaces:**
- Consumes: `ResolvedSlot` (Task 5); `Section`, `Schedule`, `UserState`, `Diagnostics`, `SearchSummary`, `sectionKey` (Task 2); `overlaps` (Task 1); `subjectPrefix` (Task 2).
- Produces:
  - `interface GenerateResult { schedules: Schedule[]; diagnostics: Diagnostics | null; search: SearchSummary }`
  - `generate(resolved: ResolvedSlot[], state: UserState) → GenerateResult`
  - `MAX_SCHEDULES = 500`

- [ ] **Step 1: Write the failing test**

`src/lib/generator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generate, MAX_SCHEDULES } from "./generator";
import type { ResolvedSlot } from "./slots";
import type { Section, Slot, UserState } from "./types";

const at = (days: Section["meetings"][number]["days"], start: number, end: number) => ({ days, start, end });

const section = (courseCode: string, sectionCode: string, meetings: Section["meetings"]): Section => ({
  courseCode, sectionCode, title: courseCode, units: 3, instructors: [], modality: "",
  meetings, timeStatus: "scheduled", room: "R", remarks: "", raw: "",
});

const slot = (id: string, over: Partial<Slot> = {}): Slot => ({
  id, origin: "ips", label: id, requirement: id, category: null, sourceBlock: null,
  chosen: null, pairedWith: null, included: true, ...over,
});

const resolved = (s: Slot, sections: Section[]): ResolvedSlot =>
  ({ slot: s, sections, status: sections.length ? "ok" : "no-offerings", pinned: null });

const state = (over: Partial<UserState> = {}): UserState => ({
  version: 3, programId: "P", blockKey: "B", calendarTerm: "2026-1", slots: [],
  lockedSections: [], fullSections: [], completedCourses: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
  personalRatings: [], ...over,
});

describe("generate", () => {
  it("produces every conflict-free combination, one section per slot", () => {
    const a = resolved(slot("A"), [section("A", "1", [at(["M"], 480, 540)]), section("A", "2", [at(["T"], 480, 540)])]);
    const b = resolved(slot("B"), [section("B", "1", [at(["W"], 480, 540)])]);
    const { schedules } = generate([a, b], state());
    expect(schedules).toHaveLength(2);
    for (const s of schedules) expect(s).toHaveLength(2);
  });

  it("never emits a schedule with overlapping meetings", () => {
    const a = resolved(slot("A"), [section("A", "1", [at(["M"], 480, 600)])]);
    const b = resolved(slot("B"), [section("B", "1", [at(["M"], 540, 660)])]);
    const { schedules, diagnostics } = generate([a, b], state());
    expect(schedules).toEqual([]);
    expect(diagnostics?.conflictPairs).toEqual([{ a: "A", b: "B" }]);
  });

  it("skips slots that are not ok or not included, without blocking the rest", () => {
    const a = resolved(slot("A"), [section("A", "1", [at(["M"], 480, 540)])]);
    const missing: ResolvedSlot = { slot: slot("B"), sections: [], status: "no-offerings", pinned: null };
    const off = resolved(slot("C", { included: false }), [section("C", "1", [at(["F"], 480, 540)])]);
    const { schedules } = generate([a, missing, off], state());
    expect(schedules).toHaveLength(1);
    expect(schedules[0].map((s) => s.courseCode)).toEqual(["A"]);
  });

  it("keeps a paired slot in the same subject as its partner (§5.4)", () => {
    const lec = slot("lec", { pairedWith: "lab" });
    const lab = slot("lab", { pairedWith: "lec" });
    const lecR = resolved(lec, [
      section("BIO 10.01", "1", [at(["M"], 480, 540)]),
      section("CHEM 10.01", "1", [at(["T"], 480, 540)]),
    ]);
    const labR = resolved(lab, [
      section("BIO 10.02", "1", [at(["W"], 480, 540)]),
      section("CHEM 10.02", "1", [at(["TH"], 480, 540)]),
    ]);
    const { schedules } = generate([lecR, labR], state());
    expect(schedules).toHaveLength(2); // BIO+BIO and CHEM+CHEM, never a cross pair
    for (const s of schedules) {
      const prefixes = new Set(s.map((x) => x.courseCode.split(" ")[0]));
      expect(prefixes.size).toBe(1);
    }
  });

  it("excludes parse-error sections but allows TBA ones", () => {
    const bad = { ...section("A", "1", []), timeStatus: "parse-error" as const };
    const tba = { ...section("A", "2", []), timeStatus: "tba" as const };
    const { schedules } = generate([resolved(slot("A"), [bad, tba])], state());
    expect(schedules).toHaveLength(1);
    expect(schedules[0][0].sectionCode).toBe("2");
  });

  it("applies full, excluded, time-limit and protected-block filters", () => {
    const sections = [
      section("A", "FULL", [at(["M"], 480, 540)]),
      section("A", "EXCL", [at(["M"], 600, 660)]),
      section("A", "EARLY", [at(["M"], 420, 480)]),
      section("A", "CLASH", [at(["M"], 720, 780)]),
      section("A", "GOOD", [at(["M"], 900, 960)]),
    ];
    const { schedules } = generate([resolved(slot("A"), sections)], state({
      fullSections: ["A FULL"],
      preferences: {
        criteria: ["compactDays"],
        earliestStart: 480,
        protectedBlocks: [at(["M"], 700, 800)],
        excludedSections: ["A EXCL"],
      },
    }));
    expect(schedules.map((s) => s[0].sectionCode)).toEqual(["GOOD"]);
  });

  it("a locked section pins its slot and bypasses filters", () => {
    const sections = [section("A", "LOCKED", [at(["M"], 420, 480)]), section("A", "OTHER", [at(["M"], 900, 960)])];
    const { schedules } = generate([resolved(slot("A"), sections)], state({
      lockedSections: ["A LOCKED"],
      preferences: { criteria: ["compactDays"], earliestStart: 600, protectedBlocks: [], excludedSections: [] },
    }));
    expect(schedules.map((s) => s[0].sectionCode)).toEqual(["LOCKED"]);
  });

  it("reports truncation only when the limit is genuinely exceeded", () => {
    const many = Array.from({ length: 40 }, (_, i) => section("A", `A${i}`, [at(["M"], 480 + i, 500 + i)]));
    const more = Array.from({ length: 40 }, (_, i) => section("B", `B${i}`, [at(["T"], 480 + i, 500 + i)]));
    const { schedules, search } = generate([resolved(slot("A"), many), resolved(slot("B"), more)], state());
    expect(search.limit).toBe(MAX_SCHEDULES);
    expect(search.truncated).toBe(true);
    expect(schedules).toHaveLength(MAX_SCHEDULES);
  });

  it("flags an n-way conflict when every pair fits but the whole set does not", () => {
    const mk = (name: string, day: "M" | "T") =>
      resolved(slot(name), [section(name, "1", [at([day], 480, 540)])]);
    // A and B both only on M; each pair with C is fine, but A+B collide.
    const { schedules, diagnostics } = generate([mk("A", "M"), mk("B", "M"), mk("C", "T")], state());
    expect(schedules).toEqual([]);
    expect(diagnostics?.conflictPairs).toEqual([{ a: "A", b: "B" }]);
    expect(diagnostics?.nWayConflict).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/generator.test.ts`
Expected: FAIL — `Failed to resolve import "./generator"`.

- [ ] **Step 3: Write `src/lib/generator.ts`**

```typescript
import type { Diagnostics, Schedule, SearchSummary, Section, UserState } from "./types";
import { sectionKey } from "./types";
import { overlaps } from "./time";
import { subjectPrefix } from "./course-code";
import type { ResolvedSlot } from "./slots";

export const MAX_SCHEDULES = 500; // browser-responsiveness guard; truncation is reported

export interface GenerateResult {
  schedules: Schedule[];
  diagnostics: Diagnostics | null;
  search: SearchSummary;
}

function sectionsConflict(a: Section, b: Section): boolean {
  for (const ma of a.meetings) {
    for (const mb of b.meetings) {
      if (overlaps(ma, mb)) return true;
    }
  }
  return false;
}

function passesFilters(s: Section, state: UserState): boolean {
  // A malformed time is not a legitimate TBA. Including it would create falsely
  // conflict-free schedules until a human fixes the source row.
  if (s.timeStatus === "parse-error") return false;
  const key = sectionKey(s);
  if (state.fullSections.includes(key)) return false;
  if (state.preferences.excludedSections.includes(key)) return false;
  const { earliestStart, latestEnd, protectedBlocks } = state.preferences;
  for (const meeting of s.meetings) {
    if (earliestStart !== undefined && meeting.start < earliestStart) return false;
    if (latestEnd !== undefined && meeting.end > latestEnd) return false;
    for (const block of protectedBlocks) {
      if (overlaps(meeting, block)) return false;
    }
  }
  return true;
}

export function generate(resolved: ResolvedSlot[], state: UserState): GenerateResult {
  // Only slots the student included AND that resolved to candidates take part. An
  // unfilled elective, a course with no offerings, and an unpinned pre-assigned course are
  // all excluded rather than blocking every other course (§5.3, §5.6).
  const active = resolved.filter((r) => r.slot.included && r.status === "ok");

  const perSlot: Diagnostics["perSlot"] = [];
  const candidates = new Map<string, Section[]>();
  for (const r of active) {
    const locked = r.sections.filter(
      (s) => s.timeStatus !== "parse-error" && state.lockedSections.includes(sectionKey(s))
    );
    // A locked section pins the slot and bypasses all filters.
    const filtered = locked.length > 0 ? locked : r.sections.filter((s) => passesFilters(s, state));
    candidates.set(r.slot.id, filtered);
    perSlot.push({
      id: r.slot.id, label: r.slot.label,
      total: r.sections.length, afterFilters: filtered.length,
    });
  }

  // Fewest candidates first: prunes the search tree earliest.
  const order = [...active].sort(
    (a, b) => candidates.get(a.slot.id)!.length - candidates.get(b.slot.id)!.length
  );
  const byId = new Map(active.map((r) => [r.slot.id, r]));

  const schedules: Schedule[] = [];
  const current: Section[] = [];
  const chosenBySlot = new Map<string, Section>();

  // A paired slot must take a section from the same subject as its partner (§5.4).
  // Checked as each section is placed, so invalid lecture/lab pairs are pruned.
  const pairingHolds = (r: ResolvedSlot, s: Section): boolean => {
    const partnerId = r.slot.pairedWith;
    if (!partnerId) return true;
    const partner = chosenBySlot.get(partnerId);
    if (!partner) return true; // partner not placed yet; it will check against us
    return subjectPrefix(partner.courseCode) === subjectPrefix(s.courseCode);
  };

  const walk = (i: number): void => {
    // Find one extra so an exact 500-result search is not mislabeled as truncated.
    if (schedules.length > MAX_SCHEDULES) return;
    if (i === order.length) {
      schedules.push([...current]);
      return;
    }
    const r = order[i];
    for (const s of candidates.get(r.slot.id)!) {
      if (current.some((chosen) => sectionsConflict(chosen, s))) continue;
      if (!pairingHolds(r, s)) continue;
      current.push(s);
      chosenBySlot.set(r.slot.id, s);
      walk(i + 1);
      chosenBySlot.delete(r.slot.id);
      current.pop();
    }
  };
  walk(0);

  const truncated = schedules.length > MAX_SCHEDULES;
  if (schedules.length > 0) {
    return {
      schedules: schedules.slice(0, MAX_SCHEDULES),
      diagnostics: null,
      search: { limit: MAX_SCHEDULES, truncated },
    };
  }

  const conflictPairs: Diagnostics["conflictPairs"] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const as = candidates.get(a.slot.id)!;
      const bs = candidates.get(b.slot.id)!;
      if (as.length === 0 || bs.length === 0) continue;
      const compatible = as.some((x) => bs.some((y) => !sectionsConflict(x, y) && pairOk(a, x, b, y)));
      if (!compatible) conflictPairs.push({ a: a.slot.label, b: b.slot.label });
    }
  }
  const nWayConflict = perSlot.every((p) => p.afterFilters > 0) && conflictPairs.length === 0;
  return {
    schedules,
    diagnostics: { perSlot, conflictPairs, nWayConflict },
    search: { limit: MAX_SCHEDULES, truncated: false },
  };
}

// Pair check for the diagnostics pass, where nothing is placed yet.
function pairOk(a: ResolvedSlot, x: Section, b: ResolvedSlot, y: Section): boolean {
  if (a.slot.pairedWith !== b.slot.id && b.slot.pairedWith !== a.slot.id) return true;
  return subjectPrefix(x.courseCode) === subjectPrefix(y.courseCode);
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/generator.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Add the property test (§12)**

Append to `src/lib/generator.test.ts`:

```typescript
describe("generator invariants", () => {
  it("every emitted schedule is pairwise conflict-free with one section per satisfiable slot", () => {
    const mk = (name: string, n: number) =>
      resolved(slot(name), Array.from({ length: n }, (_, i) =>
        section(name, `${i}`, [at(["M", "W"], 480 + i * 90, 540 + i * 90)])));
    const slots = [mk("A", 3), mk("B", 3), mk("C", 3)];
    const { schedules } = generate(slots, state());
    const satisfiable = slots.filter((r) => r.slot.included && r.status === "ok").length;
    expect(schedules.length).toBeGreaterThan(0);
    for (const schedule of schedules) {
      expect(schedule).toHaveLength(satisfiable);
      for (let i = 0; i < schedule.length; i++) {
        for (let j = i + 1; j < schedule.length; j++) {
          const overlapping = schedule[i].meetings.some((m) =>
            schedule[j].meetings.some((n) =>
              m.days.some((d) => n.days.includes(d)) && m.start < n.end && n.start < m.end));
          expect(overlapping).toBe(false);
        }
      }
    }
  });
});
```

Run: `npx vitest run src/lib/generator.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: slot-based generator with lecture-lab pairing constraint"
```

---

### Task 7: `ranker.ts` — strict priority order

**Files:**
- Create: `src/lib/ranker.ts`, `src/lib/ranker.test.ts`

**Interfaces:**
- Consumes: `Schedule`, `Preferences`, `RankCriterion`, `ProfRating`, `Day`, `sectionKey` (Task 2); `ratingFor` (Task 8 — write `profs.ts` first if executing strictly in order, or stub it).
- Produces: `interface RankedSchedule { schedule: Schedule; score: number }`, `rank(schedules, prefs, ratings) → RankedSchedule[]`.

> **Ordering note:** this task consumes `ratingFor` from Task 8. Do Task 8 Step 1–4 (`profs.ts`) before this task, or run the two together. The plan lists them separately because they are independently reviewable.

- [ ] **Step 1: Write the failing test**

`src/lib/ranker.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rank } from "./ranker";
import type { ProfRating, Schedule, Section } from "./types";

const section = (code: string, days: Section["meetings"][number]["days"], start: number, end: number, instructors: string[] = []): Section => ({
  courseCode: code, sectionCode: "1", title: code, units: 3, instructors, modality: "",
  meetings: [{ days, start, end }], timeStatus: "scheduled", room: "", remarks: "", raw: "",
});

const prefs = (criteria: Parameters<typeof rank>[1]["criteria"]) =>
  ({ criteria, protectedBlocks: [], excludedSections: [] });

const noRatings = new Map<string, ProfRating>();

describe("rank", () => {
  it("orders by the first criterion", () => {
    const compact: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const gappy: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 720, 780)];
    const [best] = rank([gappy, compact], prefs(["compactDays"]), noRatings);
    expect(best.schedule).toBe(compact);
  });

  it("uses later criteria only to break ties in earlier ones (§7)", () => {
    // Both have zero gaps, so compactDays ties and fewestDays decides.
    const oneDay: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const twoDays: Schedule = [section("A", ["M"], 480, 540), section("B", ["T"], 480, 540)];
    const [best] = rank([twoDays, oneDay], prefs(["compactDays", "fewestDays"]), noRatings);
    expect(best.schedule).toBe(oneDay);
  });

  it("does NOT let lower-priority criteria outvote the top one", () => {
    // This is the behaviour change from the old weighted blend. `gappy` is worse on
    // compactDays but better on every later criterion; strict priority must still rank
    // `compact` first.
    const compact: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600), section("C", ["T"], 480, 540)];
    const gappy: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 600, 660)];
    const [best] = rank([gappy, compact], prefs(["compactDays", "fewestDays", "lateStart"]), noRatings);
    expect(best.schedule).toBe(compact);
  });

  it("treats sub-minute metric differences as ties", () => {
    const a: Schedule = [section("A", ["M"], 480, 540)];
    const b: Schedule = [section("B", ["M"], 480, 540)];
    const ranked = rank([a, b], prefs(["compactDays"]), noRatings);
    expect(ranked[0].score).toBe(ranked[1].score);
  });

  it("is deterministic for equal schedules, ordering by schedule id", () => {
    const a: Schedule = [section("ZZZ", ["M"], 480, 540)];
    const b: Schedule = [section("AAA", ["M"], 480, 540)];
    expect(rank([a, b], prefs(["compactDays"]), noRatings)[0].schedule).toBe(b);
    expect(rank([b, a], prefs(["compactDays"]), noRatings)[0].schedule).toBe(b);
  });

  it("defaults to compactDays when no criteria are selected", () => {
    const compact: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const gappy: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 720, 780)];
    expect(rank([gappy, compact], prefs([]), noRatings)[0].schedule).toBe(compact);
  });

  it("ranks preferred professors higher, treating unrated as neutral", () => {
    const ratings = new Map<string, ProfRating>([["ana cruz", { name: "CRUZ, Ana", rating: 5 }]]);
    const liked: Schedule = [section("A", ["M"], 480, 540, ["CRUZ, Ana"])];
    const unknown: Schedule = [section("B", ["M"], 480, 540, ["SANTOS, Bea"])];
    expect(rank([unknown, liked], prefs(["preferredProfs"]), ratings)[0].schedule).toBe(liked);
  });

  it("returns a display score in [0,1] for the top criterion", () => {
    const a: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 540, 600)];
    const b: Schedule = [section("A", ["M"], 480, 540), section("B", ["M"], 720, 780)];
    for (const r of rank([a, b], prefs(["compactDays"]), noRatings)) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/ranker.test.ts`
Expected: FAIL — `Failed to resolve import "./ranker"`.

- [ ] **Step 3: Write `src/lib/ranker.ts`**

```typescript
import type { Day, Preferences, ProfRating, RankCriterion, Schedule } from "./types";
import { sectionKey } from "./types";
import { ratingFor } from "./profs";

export interface RankedSchedule {
  schedule: Schedule;
  score: number; // display only — ordering is lexicographic, not by this number
}

type DayIntervals = Map<Day, { start: number; end: number }[]>;

function intervalsByDay(schedule: Schedule): DayIntervals {
  const byDay: DayIntervals = new Map();
  for (const section of schedule) {
    for (const meeting of section.meetings) {
      for (const day of meeting.days) {
        const list = byDay.get(day) ?? [];
        list.push({ start: meeting.start, end: meeting.end });
        byDay.set(day, list);
      }
    }
  }
  return byDay;
}

// Raw metric per criterion. Sign convention: HIGHER is always BETTER.
function rawMetric(schedule: Schedule, criterion: RankCriterion, ratings: Map<string, ProfRating>): number {
  const byDay = intervalsByDay(schedule);
  switch (criterion) {
    case "compactDays": {
      let gaps = 0;
      for (const list of byDay.values()) {
        list.sort((a, b) => a.start - b.start);
        for (let i = 1; i < list.length; i++) gaps += Math.max(0, list[i].start - list[i - 1].end);
      }
      return -gaps;
    }
    case "fewestDays":
      return -byDay.size;
    case "lateStart": {
      const starts = [...byDay.values()].map((l) => Math.min(...l.map((x) => x.start)));
      return starts.length ? starts.reduce((a, b) => a + b, 0) / starts.length : 0;
    }
    case "earlyEnd": {
      const ends = [...byDay.values()].map((l) => Math.max(...l.map((x) => x.end)));
      return ends.length ? -(ends.reduce((a, b) => a + b, 0) / ends.length) : 0;
    }
    case "preferredProfs": {
      // Average across sections; within a section, average across instructors.
      // Unrated scores neutral (3 on the 0-5 scale). Scaled so a whole-number rounding
      // does not erase differences of less than one star.
      const scores = schedule.map((s) => {
        if (s.instructors.length === 0) return 3;
        const perProf = s.instructors.map((name) => ratingFor(name, ratings, s.courseCode)?.rating ?? 3);
        return perProf.reduce((a, b) => a + b, 0) / perProf.length;
      });
      const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 3;
      return mean * 60;
    }
    default:
      return 0;
  }
}

const scheduleId = (s: Schedule): string => s.map(sectionKey).sort().join("|");

export function rank(
  schedules: Schedule[], prefs: Preferences, ratings: Map<string, ProfRating>
): RankedSchedule[] {
  const criteria: RankCriterion[] = prefs.criteria.length > 0 ? prefs.criteria : ["compactDays"];

  // Metrics are floats (gap minutes, mean start times). Rounding to the whole minute is what
  // makes "tie" meaningful — without it criterion 2 would almost never get to speak (§7).
  const rows = schedules.map((schedule) => ({
    schedule,
    metrics: criteria.map((c) => Math.round(rawMetric(schedule, c, ratings))),
    id: scheduleId(schedule),
  }));

  rows.sort((a, b) => {
    for (let i = 0; i < criteria.length; i++) {
      const diff = b.metrics[i] - a.metrics[i]; // higher is better
      if (diff !== 0) return diff;
    }
    return a.id.localeCompare(b.id); // deterministic final tiebreak
  });

  // Display score: the top criterion normalised across the candidate set. Ordering is
  // lexicographic, so this is shown, never sorted on.
  const tops = rows.map((r) => r.metrics[0]);
  const min = Math.min(...tops);
  const max = Math.max(...tops);
  const spread = max - min;
  return rows.map((r) => ({
    schedule: r.schedule,
    score: spread === 0 ? 1 : (r.metrics[0] - min) / spread,
  }));
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/ranker.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: lexicographic ranking in strict priority order"
```

---

### Task 8: `profs.ts` and `storage.ts` (v3)

**Files:**
- Create: `src/lib/profs.ts`, `src/lib/profs.test.ts`
- Create: `src/lib/storage.ts`, `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `ProfRating`, `UserState`, `Preferences`, `Slot` (Task 2).
- Produces:
  - `normalizeName(name) → string`, `ratingKey(name, courseCode?) → string`,
    `mergeRatings(community, personal) → Map<string, ProfRating>`,
    `ratingFor(instructor, merged, courseCode?) → ProfRating | undefined`
  - `STORAGE_VERSION = 3`, `defaultState(calendarTerm) → UserState`,
    `loadState(calendarTerm) → { state: UserState; wasReset: boolean }`, `saveState(state) → void`

- [ ] **Step 1: Write `src/lib/profs.ts` (unchanged behaviour, carried over)**

```typescript
import type { ProfRating } from "./types";

export function normalizeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z,\s]/g, " ").replace(/\s+/g, " ").trim();
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

export function mergeRatings(community: ProfRating[], personal: ProfRating[]): Map<string, ProfRating> {
  const merged = new Map<string, ProfRating>();
  for (const rating of [...community, ...personal]) {
    merged.set(ratingKey(rating.name, rating.courseCode), rating);
  }
  return merged;
}

export function ratingFor(
  instructor: string, merged: Map<string, ProfRating>, courseCode?: string
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

- [ ] **Step 2: Write `src/lib/profs.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { normalizeName, mergeRatings, ratingFor } from "./profs";
import type { ProfRating } from "./types";

describe("normalizeName", () => {
  it("flips 'LAST, First' into 'first last' and strips punctuation", () => {
    expect(normalizeName("ABERIN, MARIA ALVA Q.")).toBe("maria alva q aberin");
  });
  it("leaves a name with no comma alone", () => {
    expect(normalizeName("Bacabac, Marion Michael")).toBe("marion michael bacabac");
  });
});

describe("ratingFor", () => {
  const merged = mergeRatings(
    [{ name: "CRUZ, Ana", rating: 4 }, { name: "CRUZ, Ana", rating: 5, courseCode: "MATH 10" }],
    []
  );
  it("prefers a course-scoped rating over the overall one", () => {
    expect(ratingFor("CRUZ, Ana", merged, "MATH 10")?.rating).toBe(5);
    expect(ratingFor("CRUZ, Ana", merged)?.rating).toBe(4);
  });
  it("falls back on a unique last name", () => {
    expect(ratingFor("CRUZ, Anabelle", merged)?.rating).toBe(4);
  });
  it("does not guess when a last name is ambiguous", () => {
    const two = mergeRatings([{ name: "CRUZ, Ana", rating: 4 }, { name: "CRUZ, Ben", rating: 2 }], []);
    expect(ratingFor("CRUZ, Carla", two)).toBeUndefined();
  });
  it("lets a personal rating override a community one", () => {
    const m = mergeRatings([{ name: "CRUZ, Ana", rating: 1 }], [{ name: "CRUZ, Ana", rating: 5 }]);
    expect(ratingFor("CRUZ, Ana", m)?.rating).toBe(5);
  });
  it("returns undefined for an empty name", () => {
    expect(ratingFor("", merged)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run profs tests**

Run: `npx vitest run src/lib/profs.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 4: Write the failing storage test**

`src/lib/storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState, defaultState, STORAGE_VERSION } from "./storage";
import type { Slot, UserState } from "./types";

const KEY = "aisis-scheduler-state";

const slot = (over: Partial<Slot> = {}): Slot => ({
  id: "ips:A#0", origin: "ips", label: "MATH 10", requirement: "MATH 10", category: "C",
  sourceBlock: "First Year|First Semester", chosen: null, pairedWith: null, included: true, ...over,
});

const valid = (over: Partial<UserState> = {}): UserState => ({
  ...defaultState("2026-1"), slots: [slot()], ...over,
});

beforeEach(() => localStorage.clear());

describe("loadState", () => {
  it("returns defaults with no reset flag when nothing is stored", () => {
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(false);
    expect(state).toEqual(defaultState("2026-1"));
    expect(state.version).toBe(3);
    expect(state.completedCourses).toEqual([]);
  });

  it("round-trips a valid v3 state", () => {
    saveState(valid());
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(false);
    expect(state.slots).toHaveLength(1);
  });

  it("resets v2 state, which has requiredCourses instead of slots", () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 2, programId: "P", blockKey: "B", calendarTerm: "2026-1",
      requiredCourses: ["MATH 10"], electiveFills: {}, lockedSections: [], fullSections: [],
      personalRatings: [], preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
    }));
    expect(loadState("2026-1").wasReset).toBe(true);
  });

  it("resets unparseable JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadState("2026-1").wasReset).toBe(true);
  });

  it.each([
    ["a slot missing a field", { slots: [{ id: "x" }] }],
    ["a duplicate slot id", { slots: [slot(), slot()] }],
    ["an unknown rank criterion", { preferences: { criteria: ["nope"], protectedBlocks: [], excludedSections: [] } }],
    ["a duplicate rank criterion", { preferences: { criteria: ["compactDays", "compactDays"], protectedBlocks: [], excludedSections: [] } }],
    ["a protected block with start >= end", { preferences: { criteria: [], protectedBlocks: [{ days: ["M"], start: 600, end: 600 }], excludedSections: [] } }],
    ["a protected block with an unknown day", { preferences: { criteria: [], protectedBlocks: [{ days: ["X"], start: 500, end: 600 }], excludedSections: [] } }],
    ["a rating above 5", { personalRatings: [{ name: "A", rating: 6 }] }],
    ["a non-string completedCourses entry", { completedCourses: [1] }],
  ])("rejects %s", (_label, patch) => {
    localStorage.setItem(KEY, JSON.stringify({ ...valid(), ...patch }));
    expect(loadState("2026-1").wasReset).toBe(true);
  });
});

describe("saveState", () => {
  it("does not throw when storage is unavailable", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("QuotaExceeded"); };
    expect(() => saveState(valid())).not.toThrow();
    Storage.prototype.setItem = original;
  });
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL — `Failed to resolve import "./storage"`.

- [ ] **Step 6: Write `src/lib/storage.ts`**

```typescript
import type { Preferences, Slot, UserState } from "./types";

export const STORAGE_VERSION = 3;
const KEY = "aisis-scheduler-state";

const VALID_RANK_CRITERIA = new Set([
  "compactDays", "fewestDays", "lateStart", "earlyEnd", "preferredProfs",
]);
const VALID_DAYS = new Set(["M", "T", "W", "TH", "F", "SAT", "SUN"]);
const isFiniteMinute = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 24 * 60;
const isStringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((e) => typeof e === "string");
const isNullableString = (x: unknown): boolean => x === null || typeof x === "string";

const defaultPreferences = (): Preferences => ({
  criteria: ["compactDays"], protectedBlocks: [], excludedSections: [],
});

export function defaultState(calendarTerm: string): UserState {
  return {
    version: STORAGE_VERSION,
    programId: "",
    blockKey: "",
    calendarTerm,
    slots: [],
    lockedSections: [],
    fullSections: [],
    completedCourses: [],
    preferences: defaultPreferences(),
    personalRatings: [],
  };
}

function isValidSlot(v: unknown): v is Slot {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === "string" && s.id !== "" &&
    (s.origin === "ips" || s.origin === "added") &&
    typeof s.label === "string" &&
    isNullableString(s.requirement) &&
    isNullableString(s.category) &&
    isNullableString(s.sourceBlock) &&
    isNullableString(s.chosen) &&
    isNullableString(s.pairedWith) &&
    typeof s.included === "boolean";
}

function isValidPreferences(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  if (!Array.isArray(p.criteria) ||
      !p.criteria.every((c) => typeof c === "string" && VALID_RANK_CRITERIA.has(c))) return false;
  if (new Set(p.criteria).size !== p.criteria.length) return false;
  if (!Array.isArray(p.protectedBlocks)) return false;
  if (!p.protectedBlocks.every((b) => {
    if (typeof b !== "object" || b === null) return false;
    const m = b as Record<string, unknown>;
    return Array.isArray(m.days) && m.days.length > 0 &&
      m.days.every((day) => typeof day === "string" && VALID_DAYS.has(day)) &&
      isFiniteMinute(m.start) && isFiniteMinute(m.end) && m.start < m.end;
  })) return false;
  if (p.earliestStart !== undefined && !isFiniteMinute(p.earliestStart)) return false;
  if (p.latestEnd !== undefined && !isFiniteMinute(p.latestEnd)) return false;
  if (isFiniteMinute(p.earliestStart) && isFiniteMinute(p.latestEnd) && p.earliestStart > p.latestEnd) return false;
  return isStringArray(p.excludedSections);
}

function isValidState(v: unknown): v is UserState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  if (typeof s.version !== "number") return false;
  if (typeof s.programId !== "string") return false;
  if (typeof s.blockKey !== "string") return false;
  if (typeof s.calendarTerm !== "string") return false;
  if (!Array.isArray(s.slots) || !s.slots.every(isValidSlot)) return false;
  if (new Set((s.slots as Slot[]).map((x) => x.id)).size !== s.slots.length) return false;
  if (!isStringArray(s.lockedSections)) return false;
  if (!isStringArray(s.fullSections)) return false;
  if (!isStringArray(s.completedCourses)) return false;
  if (!Array.isArray(s.personalRatings)) return false;
  if (!s.personalRatings.every((x) => {
    if (typeof x !== "object" || x === null) return false;
    const rt = x as Record<string, unknown>;
    return typeof rt.name === "string" && rt.name.trim() !== "" &&
      typeof rt.rating === "number" && Number.isFinite(rt.rating) && rt.rating >= 0 && rt.rating <= 5 &&
      (rt.courseCode === undefined || typeof rt.courseCode === "string");
  })) return false;
  return isValidPreferences(s.preferences);
}

export function loadState(calendarTerm: string): { state: UserState; wasReset: boolean } {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return { state: defaultState(calendarTerm), wasReset: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    // v2 held requiredCourses + electiveFills. The selection model changed shape, so there
    // is no migration worth keeping — it resets with a notice (§9).
    if (!isValidState(parsed) || parsed.version !== STORAGE_VERSION) {
      return { state: defaultState(calendarTerm), wasReset: true };
    }
    return { state: parsed, wasReset: false };
  } catch {
    return { state: defaultState(calendarTerm), wasReset: true };
  }
}

export function saveState(state: UserState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Scheduling still works when storage is blocked or full; persistence is best-effort.
  }
}
```

- [ ] **Step 7: Run it to confirm it passes**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 8: Run the whole `lib/` suite and typecheck**

Run: `npx vitest run src/lib/ && npx tsc --noEmit`
Expected: all pass, typecheck clean. `lib/` is now complete and framework-free.

- [ ] **Step 9: Verify `lib/` imports no React**

Run:
```bash
grep -rn "from \"react\"\|from 'react'" src/lib/ ; echo "exit=$?"
```
Expected: no matches, `exit=1`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: professor ratings and v3 storage validation"
```

---

### Task 9: Cockpit shell, `useSchedules`, and the token stylesheet

**Files:**
- Create: `src/main.tsx`, `src/ui/App.tsx`, `src/ui/useSchedules.ts`, `src/index.css`
- Create: `src/ui/App.banners.test.tsx`
- Modify: `package.json` (add `@fontsource/archivo-black`, `@fontsource/inter`)

**Interfaces:**
- Consumes: everything in `lib/`.
- Produces:
  - `useSchedules(catalog, slots, state, ratings, aliases) → { resolved, schedules, ranked, diagnostics, search }`
  - `App` — three-zone shell owning `UserState` and passing `onChange` down, exactly as today.

- [ ] **Step 1: Install the fonts**

```bash
npm install @fontsource/archivo-black @fontsource/inter
```

- [ ] **Step 2: Write `src/ui/useSchedules.ts`**

Generation and ranking live here once, shared by the stage and the candidates rail so they
can never disagree about the candidate set.

```typescript
import { useMemo } from "react";
import { generate } from "../lib/generator";
import { rank, type RankedSchedule } from "../lib/ranker";
import { resolveSlots, type ResolvedSlot } from "../lib/slots";
import type { AliasFile } from "../lib/offerings";
import type { Catalog, Diagnostics, ProfRating, SearchSummary, UserState } from "../lib/types";

export interface Schedules {
  resolved: ResolvedSlot[];
  ranked: RankedSchedule[];
  diagnostics: Diagnostics | null;
  search: SearchSummary;
}

export function useSchedules(
  catalog: Catalog | null,
  state: UserState,
  ratings: Map<string, ProfRating>,
  aliases: AliasFile
): Schedules {
  const resolved = useMemo(
    () => (catalog ? resolveSlots(state.slots, catalog, aliases, state.lockedSections) : []),
    [catalog, state.slots, state.lockedSections, aliases]
  );

  const { schedules, diagnostics, search } = useMemo(
    () => generate(resolved, state),
    [resolved, state]
  );

  const ranked = useMemo(
    () => rank(schedules, state.preferences, ratings),
    [schedules, state.preferences, ratings]
  );

  return { resolved, ranked, diagnostics, search };
}
```

- [ ] **Step 3: Write `src/ui/App.tsx`**

```typescript
import { useEffect, useMemo, useState } from "react";
import "@fontsource/archivo-black/400.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import { getTerms, loadCatalog, loadCommunityRatings, isStale, CatalogUnavailableError, type TermOption } from "../lib/catalog";
import { getPrograms, loadProgram, getBlock } from "../lib/curriculum";
import { mergeRatings } from "../lib/profs";
import { loadState, saveState } from "../lib/storage";
import { defaultTerm } from "../lib/term";
import { seedSlots } from "../lib/slots";
import type { AliasFile } from "../lib/offerings";
import type { Catalog, Program, ProfRating, ProgramSummary, UserState } from "../lib/types";
import aliasData from "../../data/course-aliases.json";
import { useSchedules } from "./useSchedules";
import { ProgramSection } from "./setup/ProgramSection";
import { SemesterSection } from "./setup/SemesterSection";
import { CoursesSection } from "./setup/CoursesSection";
import { AlreadyHaveSection } from "./setup/AlreadyHaveSection";
import { PreferencesSection } from "./setup/PreferencesSection";
import { Stage } from "./stage/Stage";
import { CandidateList } from "./candidates/CandidateList";

const aliases = aliasData as AliasFile;

type SetupId = "program" | "semester" | "courses" | "have" | "preferences";
const SETUP: { id: SetupId; label: string }[] = [
  { id: "program", label: "Program" },
  { id: "semester", label: "Semester" },
  { id: "courses", label: "Courses" },
  { id: "have", label: "Classes you already have" },
  { id: "preferences", label: "Preferences" },
];

export default function App() {
  // The term default needs the available list, which loads asynchronously; start from the
  // stored term and correct it once terms arrive (§11.2).
  const [loaded] = useState(() => loadState(""));
  const [state, setState] = useState<UserState>(loaded.state);
  const [open, setOpen] = useState<SetupId>("program");

  const [terms, setTerms] = useState<TermOption[]>([]);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [program, setProgram] = useState<Program | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [communityRatings, setCommunityRatings] = useState<ProfRating[]>([]);

  const [catalogError, setCatalogError] = useState("");
  const [programError, setProgramError] = useState("");
  const [listError, setListError] = useState("");

  useEffect(() => { saveState(state); }, [state]);

  // Lists. Failures surface as a banner rather than an empty picker with no explanation (§8).
  useEffect(() => {
    let cancelled = false;
    Promise.all([getTerms(), getPrograms(), loadCommunityRatings()])
      .then(([t, p, r]) => {
        if (cancelled) return;
        setTerms(t); setPrograms(p); setCommunityRatings(r);
        setState((s) => s.calendarTerm
          ? s
          : { ...s, calendarTerm: defaultTerm(new Date(), t.filter((x) => x.available).map((x) => x.term)) });
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(`Could not load programs or terms: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCatalog(null); setCatalogError("");
    if (!state.calendarTerm) return;
    loadCatalog(state.calendarTerm)
      .then((c) => { if (!cancelled) setCatalog(c); })
      .catch((err: unknown) => {
        if (!cancelled) setCatalogError(err instanceof CatalogUnavailableError ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [state.calendarTerm]);

  useEffect(() => {
    let cancelled = false;
    setProgram(null); setProgramError("");
    if (!state.programId) return;
    loadProgram(state.programId)
      .then((p) => { if (!cancelled) setProgram(p); })
      .catch((err: unknown) => {
        if (!cancelled) setProgramError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [state.programId]);

  const block = useMemo(
    () => (program && state.blockKey ? getBlock(program, state.blockKey) : undefined),
    [program, state.blockKey]
  );
  const ratings = useMemo(
    () => mergeRatings(communityRatings, state.personalRatings),
    [communityRatings, state.personalRatings]
  );

  const schedules = useSchedules(catalog, state, ratings, aliases);

  const chooseBlock = (blockKey: string) => {
    const next = program ? getBlock(program, blockKey) : undefined;
    setState((s) => ({ ...s, blockKey, slots: next ? seedSlots(next, aliases) : [] }));
  };

  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [schedules.ranked]);

  return (
    <div className="cockpit">
      <header className="cockpit-header">
        <span className="wordmark">AISIS Scheduler</span>
        <span className="term-badge">{state.calendarTerm || "no term"}</span>
        <span className="privacy-badge">Saved on this device</span>
      </header>

      <div className="notice-stack">
        {loaded.wasReset && <p className="banner">Saved settings were from an older version, so they were reset.</p>}
        {listError && <p className="banner" role="alert">{listError}</p>}
        {catalogError && <p className="banner" role="alert">{catalogError}</p>}
        {programError && <p className="banner" role="alert">{programError}</p>}
        {catalog && isStale(catalog) && <p className="banner">This catalog is over 30 days old — re-run the scraper.</p>}
      </div>

      <div className="zones">
        <aside className="rail rail-setup" aria-label="Setup">
          {SETUP.map(({ id, label }) => (
            <section key={id} className={open === id ? "accordion open" : "accordion"}>
              <h2>
                <button aria-expanded={open === id} onClick={() => setOpen(open === id ? id : id)}>
                  {label}
                </button>
              </h2>
              {open === id && (
                <div className="accordion-body">
                  {id === "program" && (
                    <ProgramSection
                      programs={programs}
                      selectedId={state.programId}
                      onSelect={(programId) => setState((s) => ({ ...s, programId, blockKey: "", slots: [] }))}
                    />
                  )}
                  {id === "semester" && (
                    <SemesterSection
                      program={program ?? undefined}
                      blockKey={state.blockKey}
                      calendarTerm={state.calendarTerm}
                      terms={terms}
                      onChangeBlock={chooseBlock}
                      onChangeTerm={(calendarTerm) => setState((s) => ({
                        ...s, calendarTerm, lockedSections: [], fullSections: [],
                        preferences: { ...s.preferences, excludedSections: [] },
                      }))}
                    />
                  )}
                  {id === "courses" && (
                    <CoursesSection
                      program={program ?? undefined}
                      block={block}
                      catalog={catalog}
                      state={state}
                      resolved={schedules.resolved}
                      aliases={aliases}
                      onChange={setState}
                    />
                  )}
                  {id === "have" && (
                    <AlreadyHaveSection resolved={schedules.resolved} state={state} onChange={setState} />
                  )}
                  {id === "preferences" && (
                    <PreferencesSection catalog={catalog} state={state} resolved={schedules.resolved} onChange={setState} />
                  )}
                </div>
              )}
            </section>
          ))}
        </aside>

        <main className="stage">
          <Stage
            schedules={schedules}
            index={index}
            onIndex={setIndex}
            state={state}
            block={block}
            program={program ?? undefined}
            onChange={setState}
          />
        </main>

        <aside className="rail rail-candidates" aria-label="Candidates">
          <CandidateList ranked={schedules.ranked} index={index} onPick={setIndex} />
        </aside>
      </div>

      <footer className="cockpit-footer">Unofficial planning tool · Always verify your final schedule in AISIS.</footer>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/main.tsx`**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./ui/App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Write `src/index.css`**

The Block Poster token system from the cockpit spec §3. Course-block hues are assigned
deterministically per course code so a course keeps its colour across candidates.

```css
:root {
  --canvas: #eef1f6;
  --surface: #ffffff;
  --ink: #1b2233;
  --muted: #8c96aa;
  --line: #dde3ec;
  --primary: #2f6df6;
  --warning-bg: #fff8e8;
  --warning-ink: #7a5310;
  --radius: 12px;
  --shadow: 0 10px 30px rgba(27, 34, 51, 0.08);

  --hue-1: #2f6df6; --hue-2: #f6a23b; --hue-3: #2fbf8f;
  --hue-4: #e15b8d; --hue-5: #7a5af8; --hue-6: #22b8cf;

  font-family: Inter, ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--canvas);
  line-height: 1.5;
  font-synthesis: none;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

.wordmark { font-family: "Archivo Black", Inter, sans-serif; font-size: 1.1rem; }
.tabular { font-variant-numeric: tabular-nums; }

.cockpit { max-width: 1500px; margin: 0 auto; padding: 16px; }
.cockpit-header { display: flex; align-items: center; gap: 12px; padding: 8px 0 16px; }
.term-badge, .privacy-badge {
  font-size: 0.8rem; color: var(--muted); border: 1px solid var(--line);
  border-radius: 999px; padding: 2px 10px;
}
.privacy-badge { margin-left: auto; }

.notice-stack { display: grid; gap: 8px; }
.banner {
  background: var(--warning-bg); color: var(--warning-ink);
  border-radius: var(--radius); padding: 10px 14px; margin: 0;
}

.zones { display: grid; grid-template-columns: 300px 1fr 240px; gap: 16px; align-items: start; }
.rail, .stage {
  background: var(--surface); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 14px;
}
.accordion + .accordion { border-top: 1px solid var(--line); }
.accordion h2 { margin: 0; font-size: 0.95rem; }
.accordion h2 button {
  width: 100%; text-align: left; background: none; border: 0; padding: 10px 0;
  font: inherit; font-weight: 600; color: inherit; cursor: pointer;
}
.accordion-body { padding-bottom: 12px; }

.pager { display: flex; align-items: center; justify-content: center; gap: 16px; }
.pager-count { font-family: "Archivo Black", Inter, sans-serif; font-size: 2rem; font-variant-numeric: tabular-nums; }

.grid { display: grid; grid-template-columns: 56px repeat(7, 1fr); gap: 4px; }
.day-col { position: relative; background: var(--canvas); border-radius: 8px; }
.day-label { text-align: center; font-size: 0.75rem; color: var(--muted); height: 28px; line-height: 28px; }
.time-axis { position: relative; }
.time-axis span { position: absolute; right: 6px; font-size: 0.7rem; color: var(--muted); }
.block {
  position: absolute; left: 3px; right: 3px; border-radius: 6px; padding: 4px 6px;
  color: #fff; font-size: 0.7rem; overflow: hidden;
}
.schedule-grid-scroll { overflow-x: auto; }

button:focus-visible, input:focus-visible, select:focus-visible {
  outline: 3px solid rgba(47, 109, 246, 0.28); outline-offset: 2px;
}

@media (max-width: 1100px) {
  .zones { grid-template-columns: 280px 1fr; }
  .rail-candidates { grid-column: 1 / -1; }
}
@media (max-width: 740px) {
  .zones { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

- [ ] **Step 6: Write the banner render test**

`src/ui/App.banners.test.tsx` — covers the states the old suite never rendered (§8 item 3).

```typescript
import { vi } from "vitest";
vi.mock("../lib/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/catalog")>();
  return { ...actual, getTerms: vi.fn(), loadCatalog: vi.fn(), loadCommunityRatings: vi.fn() };
});
vi.mock("../lib/curriculum", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/curriculum")>();
  return { ...actual, getPrograms: vi.fn(), loadProgram: vi.fn() };
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import * as catalog from "../lib/catalog";
import * as curriculum from "../lib/curriculum";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("App banners", () => {
  it("shows an explanatory banner when the lists fail to load, not a silent empty picker", async () => {
    vi.mocked(catalog.getTerms).mockRejectedValue(new Error("network down"));
    vi.mocked(catalog.loadCommunityRatings).mockResolvedValue([]);
    vi.mocked(curriculum.getPrograms).mockResolvedValue([]);
    render(<App />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Could not load programs or terms/));
  });

  it("shows the catalog-unavailable message naming both commands", async () => {
    vi.mocked(catalog.getTerms).mockResolvedValue([{ term: "2026-1", label: "2026-2027 First Semester", available: true }]);
    vi.mocked(catalog.loadCommunityRatings).mockResolvedValue([]);
    vi.mocked(curriculum.getPrograms).mockResolvedValue([]);
    vi.mocked(catalog.loadCatalog).mockRejectedValue(new catalog.CatalogUnavailableError("2026-1"));
    render(<App />);
    await waitFor(() => expect(screen.getByText(/npm run scrape:schedule -- 2026-1/)).toBeTruthy());
  });

  it("shows the reset banner when stored state is from an older version", async () => {
    localStorage.setItem("aisis-scheduler-state", JSON.stringify({ version: 2, requiredCourses: [] }));
    vi.mocked(catalog.getTerms).mockResolvedValue([]);
    vi.mocked(catalog.loadCommunityRatings).mockResolvedValue([]);
    vi.mocked(curriculum.getPrograms).mockResolvedValue([]);
    render(<App />);
    expect(screen.getByText(/Saved settings were from an older version/)).toBeTruthy();
  });
});
```

> Component sub-files do not exist yet, so this test will not run until Task 13 completes.
> Write it now and expect it red; Step 7 records that. It is listed here because it belongs
> with the shell it tests.

- [ ] **Step 7: Typecheck the shell**

Run: `npx tsc --noEmit`
Expected: errors only of the form `Cannot find module './setup/ProgramSection'` and its
siblings — nothing else. Those resolve in Tasks 10–13. If any *other* error appears, fix it
now rather than carrying it forward.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: cockpit shell, schedules hook and the Block Poster token stylesheet"
```

---

### Task 10: Setup rail — Program and Semester

**Files:**
- Create: `src/ui/setup/ProgramSection.tsx`, `src/ui/setup/SemesterSection.tsx`
- Create: `src/ui/setup/ProgramSection.test.tsx`, `src/ui/setup/SemesterSection.test.tsx`

**Interfaces:**
- Consumes: `ProgramSummary`, `Program` (Task 2); `TermOption` (Task 3).
- Produces: `ProgramSection({ programs, selectedId, onSelect })`, `SemesterSection({ program, blockKey, calendarTerm, terms, onChangeBlock, onChangeTerm })`.

- [ ] **Step 1: Write the failing tests**

`src/ui/setup/ProgramSection.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProgramSection } from "./ProgramSection";
import type { ProgramSummary } from "../../lib/types";

const programs: ProgramSummary[] = [
  { id: "AB-EU-24BE", code: "AB EU", name: "EUROPEAN STUDIES", version: "24BE", versionYear: 2024, versionLabel: "2024 · BE" },
  { id: "AB-EU-20IR", code: "AB EU", name: "EUROPEAN STUDIES", version: "20IR", versionYear: 2020, versionLabel: "2020 · IR" },
  { id: "BS-CS-2024", code: "BS CS", name: "BACHELOR OF SCIENCE IN COMPUTER SCIENCE", version: "2024", versionYear: 2024, versionLabel: "2024" },
];

afterEach(cleanup);

describe("ProgramSection", () => {
  it("shows the version label so same-code tracks are distinguishable", () => {
    render(<ProgramSection programs={programs} selectedId="" onSelect={() => {}} />);
    expect(screen.getByRole("option", { name: /2024 · BE/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /2020 · IR/ })).toBeTruthy();
  });

  it("never renders the string 'undefined' — the version_label regression", () => {
    const { container } = render(<ProgramSection programs={programs} selectedId="" onSelect={() => {}} />);
    expect(container.textContent).not.toContain("undefined");
  });

  it("filters by search text across code, name and label", () => {
    render(<ProgramSection programs={programs} selectedId="" onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "computer" } });
    expect(screen.queryByRole("option", { name: /EUROPEAN/ })).toBeNull();
    expect(screen.getByRole("option", { name: /COMPUTER SCIENCE/ })).toBeTruthy();
  });

  it("reports the chosen id", () => {
    const onSelect = vi.fn();
    render(<ProgramSection programs={programs} selectedId="" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText(/program/i), { target: { value: "BS-CS-2024" } });
    expect(onSelect).toHaveBeenCalledWith("BS-CS-2024");
  });
});
```

`src/ui/setup/SemesterSection.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SemesterSection } from "./SemesterSection";
import type { Program } from "../../lib/types";

const program: Program = {
  id: "P", code: "P", name: "P", version: "2024", versionYear: 2024, versionLabel: "2024",
  blocks: [
    { year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 19, entries: [] },
    { year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 21, entries: [] },
  ],
};

const terms = [
  { term: "2026-2", label: "2026-2027 Second Semester", available: false },
  { term: "2026-1", label: "2026-2027 First Semester", available: true },
];

afterEach(cleanup);

describe("SemesterSection", () => {
  it("asks for a program first when none is chosen", () => {
    render(<SemesterSection program={undefined} blockKey="" calendarTerm="2026-1" terms={terms} onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    expect(screen.getByText(/choose a program first/i)).toBeTruthy();
  });

  it("lists blocks with their printed unit totals", () => {
    render(<SemesterSection program={program} blockKey="" calendarTerm="2026-1" terms={terms} onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    expect(screen.getByRole("option", { name: /First Year · First Semester — 19 units/ })).toBeTruthy();
  });

  it("disables terms with no catalog and says why", () => {
    render(<SemesterSection program={program} blockKey="" calendarTerm="2026-1" terms={terms} onChangeBlock={() => {}} onChangeTerm={() => {}} />);
    const unavailable = screen.getByRole("option", { name: /Second Semester — catalog unavailable/ }) as HTMLOptionElement;
    expect(unavailable.disabled).toBe(true);
  });

  it("reports block and term changes", () => {
    const onChangeBlock = vi.fn();
    const onChangeTerm = vi.fn();
    render(<SemesterSection program={program} blockKey="" calendarTerm="2026-1" terms={terms} onChangeBlock={onChangeBlock} onChangeTerm={onChangeTerm} />);
    fireEvent.change(screen.getByLabelText(/curriculum block/i), { target: { value: "Second Year|First Semester" } });
    expect(onChangeBlock).toHaveBeenCalledWith("Second Year|First Semester");
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run src/ui/setup/`
Expected: FAIL — both modules unresolved.

- [ ] **Step 3: Write `src/ui/setup/ProgramSection.tsx`**

```typescript
import { useState } from "react";
import type { ProgramSummary } from "../../lib/types";

interface Props {
  programs: ProgramSummary[];
  selectedId: string;
  onSelect: (programId: string) => void;
}

export function ProgramSection({ programs, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const visible = q
    ? programs.filter((p) => `${p.code} ${p.name} ${p.versionLabel}`.toLowerCase().includes(q))
    : programs;

  return (
    <div className="form-grid">
      <label>
        <span>Search</span>
        <input placeholder="Search programs…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <label>
        <span>Program and curriculum year</span>
        <select value={selectedId} onChange={(e) => onSelect(e.target.value)}>
          <option value="">— select —</option>
          {visible.map((p) => (
            <option key={p.id} value={p.id}>
              ({p.code}) {p.name} — {p.versionLabel}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">{visible.length} of {programs.length} programs</p>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/ui/setup/SemesterSection.tsx`**

```typescript
import type { Program } from "../../lib/types";
import type { TermOption } from "../../lib/catalog";

interface Props {
  program: Program | undefined;
  blockKey: string;
  calendarTerm: string;
  terms: TermOption[];
  onChangeBlock: (blockKey: string) => void;
  onChangeTerm: (term: string) => void;
}

export function SemesterSection({
  program, blockKey, calendarTerm, terms, onChangeBlock, onChangeTerm,
}: Props) {
  if (!program) return <p>Choose a program first.</p>;

  return (
    <div className="form-grid">
      <label>
        <span>Curriculum block</span>
        <select value={blockKey} onChange={(e) => onChangeBlock(e.target.value)}>
          <option value="">— select —</option>
          {program.blocks.map((b) => (
            <option key={b.key} value={b.key}>
              {b.year} · {b.term} — {b.totalUnits} units
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Calendar term</span>
        <select value={calendarTerm} onChange={(e) => onChangeTerm(e.target.value)}>
          {terms.map((t) => (
            <option key={t.term} value={t.term} disabled={!t.available}>
              {t.label}{t.available ? "" : " — catalog unavailable"}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        This is the block your semester starts from. You can pull courses from other blocks in the next step.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run to confirm they pass**

Run: `npx vitest run src/ui/setup/`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: program and semester setup sections"
```

---

### Task 11: Setup rail — Courses

The largest section: requirement rows, narrowing (§5.2), add-from-curriculum (§11.5), add-from-catalog, and the unit-load comparison (§11.4).

**Files:**
- Create: `src/ui/setup/CoursesSection.tsx`, `src/ui/setup/CoursesSection.test.tsx`

**Interfaces:**
- Consumes: `ResolvedSlot`, `slotsFromCurriculum`, `slotFromCatalog` (Task 5); `acceptableCodes`, `AliasFile` (Task 4); `sameCourseCode` (Task 2).
- Produces: `CoursesSection({ program, block, catalog, state, resolved, aliases, onChange })`.

- [ ] **Step 1: Write the failing test**

`src/ui/setup/CoursesSection.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { CoursesSection } from "./CoursesSection";
import { seedSlots, resolveSlots } from "../../lib/slots";
import { defaultState } from "../../lib/storage";
import type { AliasFile } from "../../lib/offerings";
import type { Catalog, CurriculumBlock, Program, UserState } from "../../lib/types";

const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8")) as Catalog;
const aliases = JSON.parse(readFileSync("data/course-aliases.json", "utf8")) as AliasFile;

const entry = (catNo: string, category: string, i: number, isElective = false) => ({
  catNo, title: catNo, units: 3, prerequisites: [], category, isElective,
  slotId: `First Year|First Semester#${i}`,
});
const block: CurriculumBlock = {
  year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 19,
  entries: [entry("MATH 10", "C", 0), entry("PATHFit 3", "PFT3", 1), entry("FREE ELECTIVE", "FE1", 2, true)],
};
const other: CurriculumBlock = {
  year: "Second Year", term: "First Semester", key: "Second Year|First Semester", totalUnits: 21,
  entries: [{ ...entry("PHILO 11", "CPH1", 0), slotId: "Second Year|First Semester#0" }],
};
const program: Program = {
  id: "P", code: "P", name: "P", version: "2024", versionYear: 2024, versionLabel: "2024",
  blocks: [block, other],
};

const setup = (slots = seedSlots(block, aliases)) => {
  const state: UserState = { ...defaultState("2026-1"), blockKey: block.key, slots };
  const onChange = vi.fn();
  const resolved = resolveSlots(state.slots, catalog, aliases, state.lockedSections);
  render(
    <CoursesSection program={program} block={block} catalog={catalog}
      state={state} resolved={resolved} aliases={aliases} onChange={onChange} />
  );
  return { onChange };
};

afterEach(cleanup);

describe("CoursesSection", () => {
  it("compares selected units against the block's own printed total", () => {
    setup();
    expect(screen.getByText(/this block is 19/i)).toBeTruthy();
  });

  it("offers a narrowing picker listing activity titles for a multi-code slot", () => {
    setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#1");
    const picker = within(row).getByLabelText(/narrow/i);
    expect(within(picker).getByRole("option", { name: /any . let the scheduler choose/i })).toBeTruthy();
    expect(within(picker).getByRole("option", { name: /TAI CHI/i })).toBeTruthy();
  });

  it("does not offer a narrowing picker for a single-code slot", () => {
    setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#0");
    expect(within(row).queryByLabelText(/narrow/i)).toBeNull();
  });

  it("narrowing writes chosen onto that slot only", () => {
    const { onChange } = setup();
    const row = screen.getByTestId("slot-ips:First Year|First Semester#1");
    fireEvent.change(within(row).getByLabelText(/narrow/i), { target: { value: "PEPC 13.15" } });
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.slots.find((s) => s.category === "PFT3")?.chosen).toBe("PEPC 13.15");
    expect(next.slots.find((s) => s.category === "C")?.chosen).toBeNull();
  });

  it("toggling a slot off keeps its chosen value", () => {
    const slots = seedSlots(block, aliases).map((s) =>
      s.category === "PFT3" ? { ...s, chosen: "PEPC 13.15" } : s);
    const { onChange } = setup(slots);
    const row = screen.getByTestId("slot-ips:First Year|First Semester#1");
    fireEvent.click(within(row).getByRole("checkbox"));
    const next = onChange.mock.calls[0][0] as UserState;
    const pft = next.slots.find((s) => s.category === "PFT3")!;
    expect(pft.included).toBe(false);
    expect(pft.chosen).toBe("PEPC 13.15");
  });

  it("adds a requirement from another block, carrying its category", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/add from my curriculum/i), {
      target: { value: "Second Year|First Semester#0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add requirement/i }));
    const next = onChange.mock.calls[0][0] as UserState;
    const added = next.slots.find((s) => s.requirement === "PHILO 11")!;
    expect(added.category).toBe("CPH1");
    expect(added.sourceBlock).toBe("Second Year|First Semester");
  });

  it("adds a bare course from the catalog", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/add from the catalog/i), { target: { value: "MATH 71.1" } });
    fireEvent.click(screen.getByRole("button", { name: /add course/i }));
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.slots.find((s) => s.requirement === "MATH 71.1")).toMatchObject({
      origin: "added", category: null, sourceBlock: null,
    });
  });

  it("labels a pre-assigned slot as awaiting a section, not as unavailable", () => {
    const withIntact: CurriculumBlock = {
      ...block, entries: [...block.entries, entry("INTACT 11", "C", 3)],
    };
    const state: UserState = {
      ...defaultState("2026-1"), blockKey: block.key, slots: seedSlots(withIntact, aliases),
    };
    render(
      <CoursesSection program={program} block={withIntact} catalog={catalog} state={state}
        resolved={resolveSlots(state.slots, catalog, aliases, [])} aliases={aliases} onChange={vi.fn()} />
    );
    expect(screen.getAllByText(/pre-assigned/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/not offered this term/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/ui/setup/CoursesSection.test.tsx`
Expected: FAIL, module unresolved.

- [ ] **Step 3: Write `src/ui/setup/CoursesSection.tsx`**

```typescript
import { useMemo, useState } from "react";
import type { Catalog, CurriculumBlock, Program, UserState } from "../../lib/types";
import { acceptableCodes, type AliasFile } from "../../lib/offerings";
import { slotFromCatalog, slotsFromCurriculum, type ResolvedSlot, type SlotStatus } from "../../lib/slots";
import { sameCourseCode } from "../../lib/course-code";

interface Props {
  program: Program | undefined;
  block: CurriculumBlock | undefined;
  catalog: Catalog | null;
  state: UserState;
  resolved: ResolvedSlot[];
  aliases: AliasFile;
  onChange: (s: UserState) => void;
}

const STATUS_TEXT: Record<SlotStatus, string> = {
  ok: "",
  unfilled: "Pick a course for this elective.",
  "no-offerings": "Not offered this term.",
  "awaiting-section": "Pre-assigned. Set your section under Classes you already have.",
};

export function CoursesSection({ program, block, catalog, state, resolved, aliases, onChange }: Props) {
  const [fromCurriculum, setFromCurriculum] = useState("");
  const [fromCatalog, setFromCatalog] = useState("");

  const titleOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of catalog?.sections ?? []) if (!map.has(s.courseCode)) map.set(s.courseCode, s.title);
    return map;
  }, [catalog]);

  const unitsOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of program?.blocks ?? []) for (const e of b.entries) map.set(e.catNo, e.units);
    for (const s of catalog?.sections ?? []) if (!map.has(s.courseCode)) map.set(s.courseCode, s.units);
    return map;
  }, [program, catalog]);

  if (!program || !block) return <p>Choose a program and semester first.</p>;
  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}...</p>;

  const selectedUnits = resolved.reduce((sum, r) => {
    if (!r.slot.included) return sum;
    const code = r.slot.chosen ?? r.slot.requirement;
    return sum + (code ? unitsOf.get(code) ?? 0 : 0);
  }, 0);

  const update = (slots: UserState["slots"]) => onChange({ ...state, slots });

  const setChosen = (id: string, chosen: string) =>
    update(state.slots.map((s) =>
      s.id === id ? { ...s, chosen: chosen || null, included: chosen ? true : s.included } : s));

  const toggle = (id: string) =>
    update(state.slots.map((s) => (s.id === id ? { ...s, included: !s.included } : s)));

  const remove = (id: string) =>
    update(state.slots.filter((s) => s.id !== id && s.pairedWith !== id));

  const addRequirement = () => {
    if (!fromCurriculum) return;
    const source = program.blocks.find((b) => b.entries.some((e) => e.slotId === fromCurriculum));
    const entry = source?.entries.find((e) => e.slotId === fromCurriculum);
    if (!source || !entry) return;
    const added = slotsFromCurriculum(entry, source, aliases)
      .filter((s) => !state.slots.some((existing) => existing.id === s.id));
    update([...state.slots, ...added]);
    setFromCurriculum("");
  };

  const addCourse = () => {
    if (!fromCatalog) return;
    if (state.slots.some((s) => s.requirement && sameCourseCode(s.requirement, fromCatalog))) return;
    update([...state.slots, slotFromCatalog(fromCatalog, state.slots.length)]);
    setFromCatalog("");
  };

  const available = program.blocks.flatMap((b) =>
    b.entries
      .filter((e) => !state.slots.some((s) => s.id === `ips:${e.slotId}`))
      .map((e) => ({ block: b, entry: e })));
  const catalogCodes = [...new Set(catalog.sections.map((s) => s.courseCode))].sort();

  return (
    <div>
      <p className="metric">
        <strong className="tabular">{selectedUnits} units selected</strong>{" "}
        <span className="hint">this block is {block.totalUnits}</span>
      </p>
      {selectedUnits > block.totalUnits && (
        <p className="banner">That is above what this block plans for. An overload usually needs approval.</p>
      )}
      {selectedUnits > 0 && selectedUnits < block.totalUnits && (
        <p className="hint">Below this block's planned load. Check that a lighter semester is what you want.</p>
      )}

      <ul className="course-list">
        {resolved.map((r) => {
          const codes = acceptableCodes({ ...r.slot, chosen: null }, catalog, aliases);
          return (
            <li key={r.slot.id} data-testid={`slot-${r.slot.id}`} className={r.slot.included ? "" : "muted-row"}>
              <label>
                <input type="checkbox" checked={r.slot.included} onChange={() => toggle(r.slot.id)} />{" "}
                <strong>{r.slot.chosen ?? r.slot.label}</strong>
              </label>
              {r.slot.sourceBlock && r.slot.sourceBlock !== block.key && (
                <span className="hint"> from {r.slot.sourceBlock.replace("|", " / ")}</span>
              )}
              {codes.length > 1 && (
                <label>
                  {" "}Narrow{" "}
                  <select aria-label={`Narrow ${r.slot.label}`} value={r.slot.chosen ?? ""}
                          onChange={(e) => setChosen(r.slot.id, e.target.value)}>
                    <option value="">any - let the scheduler choose</option>
                    {codes.map((code) => (
                      <option key={code} value={code}>{titleOf.get(code) ?? code}</option>
                    ))}
                  </select>
                </label>
              )}
              {r.slot.requirement === null && (
                <label>
                  {" "}Fill{" "}
                  <select aria-label={`Fill ${r.slot.label}`} value={r.slot.chosen ?? ""}
                          onChange={(e) => setChosen(r.slot.id, e.target.value)}>
                    <option value="">- pick a course -</option>
                    {catalogCodes.map((code) => (
                      <option key={code} value={code}>{code} - {titleOf.get(code)}</option>
                    ))}
                  </select>
                </label>
              )}
              {STATUS_TEXT[r.status] && <em> {STATUS_TEXT[r.status]}</em>}
              {r.slot.origin === "added" && (
                <button type="button" onClick={() => remove(r.slot.id)}>Remove</button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="add-panel">
        <label>
          Add from my curriculum{" "}
          <select value={fromCurriculum} onChange={(e) => setFromCurriculum(e.target.value)}>
            <option value="">- pick a requirement -</option>
            {available.map(({ block: b, entry }) => (
              <option key={entry.slotId} value={entry.slotId}>
                {entry.catNo} - {b.year} / {b.term}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="button" onClick={addRequirement}>Add requirement</button>
      </div>

      <div className="add-panel">
        <label>
          Add from the catalog{" "}
          <select value={fromCatalog} onChange={(e) => setFromCatalog(e.target.value)}>
            <option value="">- pick a course -</option>
            {catalogCodes.map((code) => (
              <option key={code} value={code}>{code} - {titleOf.get(code)}</option>
            ))}
          </select>
        </label>{" "}
        <button type="button" onClick={addCourse}>Add course</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run src/ui/setup/CoursesSection.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: courses section with narrowing, cross-block requirements and unit load"
```

---

### Task 12: Setup rail — Classes you already have, and Preferences

**Files:**
- Create: `src/ui/setup/AlreadyHaveSection.tsx`, `src/ui/setup/AlreadyHaveSection.test.tsx`
- Create: `src/ui/setup/PreferencesSection.tsx`

**Interfaces:**
- Consumes: `ResolvedSlot` including `allSections` (Task 5); `formatTime` (Task 1); `sectionKey` (Task 2).
- Produces: `AlreadyHaveSection({ resolved, state, onChange })`, `PreferencesSection({ catalog, state, resolved, onChange })`.

- [ ] **Step 1: Write the failing test**

`src/ui/setup/AlreadyHaveSection.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { AlreadyHaveSection } from "./AlreadyHaveSection";
import { resolveSlots, slotFromCatalog } from "../../lib/slots";
import { defaultState } from "../../lib/storage";
import type { AliasFile } from "../../lib/offerings";
import type { Catalog, Slot, UserState } from "../../lib/types";

const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8")) as Catalog;
const aliases = JSON.parse(readFileSync("data/course-aliases.json", "utf8")) as AliasFile;

const intact: Slot = { ...slotFromCatalog("INTACT 11", 0), category: "C" };
const math: Slot = slotFromCatalog("MATH 10", 1);

const setup = (locked: string[] = []) => {
  const state: UserState = { ...defaultState("2026-1"), slots: [intact, math], lockedSections: locked };
  const onChange = vi.fn();
  render(<AlreadyHaveSection resolved={resolveSlots(state.slots, catalog, aliases, locked)}
                             state={state} onChange={onChange} />);
  return { onChange };
};

afterEach(cleanup);

describe("AlreadyHaveSection", () => {
  it("prompts for the pre-assigned course", () => {
    setup();
    expect(screen.getByText(/enter the section you were given/i)).toBeTruthy();
  });

  it("lets any slot be pinned, not only pre-assigned ones", () => {
    setup();
    expect(screen.getByLabelText(/section for MATH 10/i)).toBeTruthy();
  });

  it("offers every candidate section even when the slot resolves to none", () => {
    setup();
    const picker = screen.getByLabelText(/section for INTACT 11/i);
    expect(within(picker).getAllByRole("option").length).toBeGreaterThan(100);
  });

  it("pinning writes the section key to lockedSections", () => {
    const { onChange } = setup();
    const picker = screen.getByLabelText(/section for MATH 10/i);
    const option = within(picker).getAllByRole("option")[1] as HTMLOptionElement;
    fireEvent.change(picker, { target: { value: option.value } });
    expect((onChange.mock.calls[0][0] as UserState).lockedSections).toEqual([option.value]);
  });

  it("unpinning removes only that slot's key", () => {
    const section = catalog.sections.find((s) => s.courseCode === "MATH 10")!;
    const key = `${section.courseCode} ${section.sectionCode}`;
    const { onChange } = setup([key, "OTHER 1 X"]);
    fireEvent.change(screen.getByLabelText(/section for MATH 10/i), { target: { value: "" } });
    expect((onChange.mock.calls[0][0] as UserState).lockedSections).toEqual(["OTHER 1 X"]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/ui/setup/AlreadyHaveSection.test.tsx`
Expected: FAIL, module unresolved.

- [ ] **Step 3: Write `src/ui/setup/AlreadyHaveSection.tsx`**

```typescript
import type { UserState } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import { formatTime } from "../../lib/time";
import type { ResolvedSlot } from "../../lib/slots";

interface Props {
  resolved: ResolvedSlot[];
  state: UserState;
  onChange: (s: UserState) => void;
}

const describeSection = (s: ResolvedSlot["allSections"][number]): string => {
  const when = s.meetings.length === 0
    ? "no fixed time"
    : s.meetings.map((m) => `${m.days.join("")} ${formatTime(m.start)}-${formatTime(m.end)}`).join(", ");
  return `${s.sectionCode} - ${when}`;
};

export function AlreadyHaveSection({ resolved, state, onChange }: Props) {
  const rows = resolved.filter((r) => r.slot.included && r.allSections.length > 0);
  // Pre-assigned first: those are the ones the student must supply (§5.6).
  const ordered = [...rows].sort(
    (a, b) => Number(b.status === "awaiting-section") - Number(a.status === "awaiting-section")
  );

  if (ordered.length === 0) return <p>Pick your courses first.</p>;

  const pin = (r: ResolvedSlot, key: string) => {
    const others = state.lockedSections.filter(
      (k) => !r.allSections.some((s) => sectionKey(s) === k)
    );
    onChange({ ...state, lockedSections: key ? [...others, key] : others });
  };

  return (
    <div>
      <p className="hint">
        If a class was assigned to you, or you already secured a section, set it here and the
        rest of your schedule is planned around it.
      </p>
      <ul className="course-list">
        {ordered.map((r) => (
          <li key={r.slot.id}>
            <label>
              <span>{r.slot.chosen ?? r.slot.label}</span>{" "}
              <select aria-label={`Section for ${r.slot.label}`} value={r.pinned ?? ""}
                      onChange={(e) => pin(r, e.target.value)}>
                <option value="">- not set -</option>
                {r.allSections.map((s) => (
                  <option key={sectionKey(s)} value={sectionKey(s)}>{describeSection(s)}</option>
                ))}
              </select>
            </label>
            {r.status === "awaiting-section" && (
              <em> Pre-assigned - enter the section you were given.</em>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/ui/setup/PreferencesSection.tsx`**

Criteria ordering, time limits, protected blocks, restore lists, and per-course professor
ratings. Behaviour is carried over from the old `PreferencesPanel` unchanged; the two
differences are that the ratings list is built from `resolved[].allSections` rather than
scanning the whole catalog, and the priority hint now states what strict priority means.

```typescript
import type { Catalog, Day, Meeting, RankCriterion, UserState } from "../../lib/types";
import { formatTime } from "../../lib/time";
import type { ResolvedSlot } from "../../lib/slots";

const CRITERIA: { id: RankCriterion; label: string }[] = [
  { id: "compactDays", label: "Compact days (fewest gaps)" },
  { id: "fewestDays", label: "Fewest days on campus" },
  { id: "lateStart", label: "Later starts" },
  { id: "earlyEnd", label: "Earlier ends" },
  { id: "preferredProfs", label: "Preferred professors" },
];
const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT", "SUN"];
const HOURS = Array.from({ length: 15 }, (_, i) => 420 + i * 60); // 7 AM to 9 PM

interface Props {
  catalog: Catalog | null;
  state: UserState;
  resolved: ResolvedSlot[];
  onChange: (s: UserState) => void;
}

export function PreferencesSection({ catalog, state, resolved, onChange }: Props) {
  if (!catalog) return <p>Loading the catalog for {state.calendarTerm}...</p>;

  const prefs = state.preferences;
  const setPrefs = (p: Partial<UserState["preferences"]>) =>
    onChange({ ...state, preferences: { ...prefs, ...p } });

  const toggleCriterion = (id: RankCriterion) =>
    setPrefs({
      criteria: prefs.criteria.includes(id)
        ? prefs.criteria.filter((c) => c !== id)
        : [...prefs.criteria, id],
    });

  const move = (id: RankCriterion, direction: -1 | 1) => {
    const from = prefs.criteria.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= prefs.criteria.length) return;
    const criteria = [...prefs.criteria];
    [criteria[from], criteria[to]] = [criteria[to], criteria[from]];
    setPrefs({ criteria });
  };

  const setBlock = (i: number, block: Meeting) =>
    setPrefs({ protectedBlocks: prefs.protectedBlocks.map((b, j) => (j === i ? block : b)) });

  const timeSelect = (value: number | undefined, set: (v: number | undefined) => void) => (
    <select value={value ?? ""}
            onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}>
      <option value="">any time</option>
      {HOURS.map((h) => <option key={h} value={h}>{formatTime(h)}</option>)}
    </select>
  );

  const pairs: { courseCode: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const r of resolved) {
    if (!r.slot.included) continue;
    for (const s of r.allSections) {
      for (const name of s.instructors) {
        const key = `${s.courseCode}|${name}`;
        if (name && !seen.has(key)) { seen.add(key); pairs.push({ courseCode: s.courseCode, name }); }
      }
    }
  }
  pairs.sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.name.localeCompare(b.name));

  const ratingOf = (courseCode: string, name: string) =>
    state.personalRatings.find((r) => r.name === name && r.courseCode === courseCode)?.rating;

  const setRating = (courseCode: string, name: string, value: string) => {
    const others = state.personalRatings.filter(
      (r) => !(r.name === name && r.courseCode === courseCode));
    onChange({
      ...state,
      personalRatings: value === "" ? others : [...others, { name, rating: Number(value), courseCode }],
    });
  };

  return (
    <div>
      <h3>Ranking priorities</h3>
      <p className="hint">The first one decides. Later ones only break ties.</p>
      <ul>
        {CRITERIA.map(({ id, label }) => {
          const pos = prefs.criteria.indexOf(id);
          return (
            <li key={id}>
              <label>
                <input type="checkbox" checked={pos >= 0} onChange={() => toggleCriterion(id)} /> {label}
                {pos >= 0 ? ` - priority ${pos + 1}` : ""}
              </label>
              {pos >= 0 && (
                <>
                  {" "}<button type="button" disabled={pos === 0}
                               onClick={() => move(id, -1)} aria-label={`Move ${label} up`}>Up</button>
                  {" "}<button type="button" disabled={pos === prefs.criteria.length - 1}
                               onClick={() => move(id, 1)} aria-label={`Move ${label} down`}>Down</button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <h3>Time limits</h3>
      <label>No classes before {timeSelect(prefs.earliestStart, (v) => setPrefs({ earliestStart: v }))}</label>{" "}
      <label>No classes after {timeSelect(prefs.latestEnd, (v) => setPrefs({ latestEnd: v }))}</label>

      <h3>Protected time</h3>
      {prefs.protectedBlocks.map((block, i) => (
        <div key={i}>
          <select aria-label={`Protected block ${i + 1} day`} value={block.days[0]}
                  onChange={(e) => setBlock(i, { ...block, days: [e.target.value as Day] })}>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select aria-label={`Protected block ${i + 1} start`} value={block.start}
                  onChange={(e) => {
                    const start = Number(e.target.value);
                    setBlock(i, { ...block, start, end: Math.max(block.end, start + 60) });
                  }}>
            {HOURS.slice(0, -1).map((h) => <option key={h} value={h}>{formatTime(h)}</option>)}
          </select>
          {" to "}
          <select aria-label={`Protected block ${i + 1} end`} value={block.end}
                  onChange={(e) => setBlock(i, { ...block, end: Number(e.target.value) })}>
            {HOURS.filter((h) => h > block.start).map((h) => <option key={h} value={h}>{formatTime(h)}</option>)}
          </select>{" "}
          <button type="button"
                  onClick={() => setPrefs({ protectedBlocks: prefs.protectedBlocks.filter((_, j) => j !== i) })}>
            Remove
          </button>
        </div>
      ))}
      <button type="button"
              onClick={() => setPrefs({ protectedBlocks: [...prefs.protectedBlocks, { days: ["M"], start: 720, end: 780 }] })}>
        Add protected block
      </button>

      <h3>Excluded sections</h3>
      {prefs.excludedSections.length === 0 ? <p>None excluded.</p> : (
        <ul>
          {prefs.excludedSections.map((key) => (
            <li key={key}>{key}{" "}
              <button type="button"
                      onClick={() => setPrefs({ excludedSections: prefs.excludedSections.filter((k) => k !== key) })}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Sections marked full</h3>
      {state.fullSections.length === 0 ? <p>None marked full.</p> : (
        <ul>
          {state.fullSections.map((key) => (
            <li key={key}>{key}{" "}
              <button type="button"
                      onClick={() => onChange({ ...state, fullSections: state.fullSections.filter((k) => k !== key) })}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>My professor ratings</h3>
      {pairs.length === 0 && <p>Pick courses first to rate their professors.</p>}
      <ul>
        {pairs.map(({ courseCode, name }) => (
          <li key={`${courseCode}|${name}`}>
            <label>
              {name} - {courseCode}{" "}
              <select value={ratingOf(courseCode, name) ?? ""}
                      onChange={(e) => setRating(courseCode, name, e.target.value)}>
                <option value="">unrated</option>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} stars</option>)}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Run the setup suite**

Run: `npx vitest run src/ui/setup/`
Expected: PASS - Program 4, Semester 4, Courses 8, AlreadyHave 5.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: pin assigned sections, and the preferences section"
```

---

### Task 13: Stage — pager, week grid, chips, diagnostics, empty state

**Files:**
- Create: `src/ui/stage/Stage.tsx`, `src/ui/stage/WeekGrid.tsx`, `src/ui/stage/Pager.tsx`,
  `src/ui/stage/SectionChips.tsx`, `src/ui/stage/Diagnostics.tsx`, `src/ui/stage/EmptyStage.tsx`
- Create: `src/ui/stage/Pager.test.tsx`, `src/ui/stage/WeekGrid.test.tsx`, `src/ui/stage/Stage.test.tsx`

**Interfaces:**
- Consumes: `Schedules` (Task 9); `ResolvedSlot` (Task 5); `Schedule`, `Section`, `sectionKey` (Task 2); `formatTime` (Task 1).
- Produces: `Stage({ schedules, index, onIndex, state, block, program, onChange })`, `WeekGrid({ schedule })`, `Pager({ index, count, score, onIndex })`.

- [ ] **Step 1: Write the failing tests**

`src/ui/stage/Pager.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Pager } from "./Pager";

afterEach(cleanup);

describe("Pager", () => {
  it("shows a 1-based position and announces it politely", () => {
    render(<Pager index={1} count={41} score={0.91} onIndex={() => {}} />);
    const live = screen.getByRole("status");
    expect(live.textContent).toMatch(/2 of 41/);
  });

  it("disables previous at the start and next at the end, with no wraparound", () => {
    const { rerender } = render(<Pager index={0} count={3} score={1} onIndex={() => {}} />);
    expect((screen.getByRole("button", { name: /previous/i }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Pager index={2} count={3} score={1} onIndex={() => {}} />);
    expect((screen.getByRole("button", { name: /next/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("steps with the arrow keys", () => {
    const onIndex = vi.fn();
    render(<Pager index={1} count={3} score={1} onIndex={onIndex} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenCalledWith(2);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndex).toHaveBeenCalledWith(0);
  });

  it("ignores arrow keys while a text field has focus", () => {
    const onIndex = vi.fn();
    render(<><input data-testid="field" /><Pager index={1} count={3} score={1} onIndex={onIndex} /></>);
    screen.getByTestId("field").focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndex).not.toHaveBeenCalled();
  });
});
```

`src/ui/stage/WeekGrid.test.tsx`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WeekGrid } from "./WeekGrid";
import type { Schedule, Section } from "../../lib/types";

const section = (code: string, days: Section["meetings"][number]["days"], start: number, end: number): Section => ({
  courseCode: code, sectionCode: "1", title: code, units: 3, instructors: [], modality: "",
  meetings: [{ days, start, end }], timeStatus: "scheduled", room: "R1", remarks: "", raw: "",
});

afterEach(cleanup);

describe("WeekGrid", () => {
  it("renders a block per meeting day", () => {
    const schedule: Schedule = [section("MATH 10", ["M", "W"], 480, 540)];
    render(<WeekGrid schedule={schedule} />);
    expect(screen.getAllByText(/MATH 10/)).toHaveLength(2);
  });

  it("extends past 9 PM when the data does, instead of clipping", () => {
    // ITMGT 20.51 QRF really does run F 1830-2130 in the 2026-1 catalog.
    const late: Schedule = [section("ITMGT 20.51", ["F"], 1110, 1290)];
    const { container } = render(<WeekGrid schedule={late} />);
    const block = container.querySelector(".block") as HTMLElement;
    const column = container.querySelector(".day-col") as HTMLElement;
    const blockBottom = parseFloat(block.style.top) + parseFloat(block.style.height);
    expect(blockBottom).toBeLessThanOrEqual(parseFloat(column.style.height));
  });

  it("lists sections with no fixed meeting time separately", () => {
    const tba: Schedule = [{ ...section("BIO 290", ["M"], 0, 0), meetings: [], timeStatus: "tba" }];
    render(<WeekGrid schedule={tba} />);
    expect(screen.getByText(/no fixed meeting time/i)).toHaveTextContent("BIO 290");
  });

  it("gives a course the same colour in every schedule it appears in", () => {
    const a = render(<WeekGrid schedule={[section("MATH 10", ["M"], 480, 540)]} />);
    const first = (a.container.querySelector(".block") as HTMLElement).style.background;
    cleanup();
    const b = render(<WeekGrid schedule={[section("ZZZZ 1", ["M"], 600, 660), section("MATH 10", ["T"], 480, 540)]} />);
    const blocks = [...b.container.querySelectorAll(".block")] as HTMLElement[];
    const math = blocks.find((el) => el.textContent?.includes("MATH 10"))!;
    expect(math.style.background).toBe(first);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run src/ui/stage/`
Expected: FAIL, modules unresolved.

- [ ] **Step 3: Write `src/ui/stage/Pager.tsx`**

```typescript
import { useEffect } from "react";

interface Props {
  index: number;
  count: number;
  score: number;
  onIndex: (i: number) => void;
}

const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
};

export function Pager({ index, count, score, onIndex }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.key === "ArrowRight" && index < count - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onIndex]);

  return (
    <div className="pager">
      <button type="button" aria-label="Previous schedule"
              disabled={index === 0} onClick={() => onIndex(index - 1)}>
        Prev
      </button>
      <span className="pager-count" aria-hidden="true">
        {String(index + 1).padStart(2, "0")} / {count}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        Schedule {index + 1} of {count}, score {score.toFixed(2)}
      </span>
      <button type="button" aria-label="Next schedule"
              disabled={index >= count - 1} onClick={() => onIndex(index + 1)}>
        Next
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/ui/stage/WeekGrid.tsx`**

```typescript
import type { Day, Schedule } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import { formatTime } from "../../lib/time";

const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT", "SUN"];
const PX_PER_MIN = 0.8;
const HEADER = 28;
const HUES = ["var(--hue-1)", "var(--hue-2)", "var(--hue-3)", "var(--hue-4)", "var(--hue-5)", "var(--hue-6)"];

// Stable per course code, so a course keeps its colour across candidates.
function hueFor(courseCode: string): string {
  let hash = 0;
  for (let i = 0; i < courseCode.length; i++) hash = (hash * 31 + courseCode.charCodeAt(i)) >>> 0;
  return HUES[hash % HUES.length];
}

export function WeekGrid({ schedule }: { schedule: Schedule }) {
  const timed = schedule.flatMap((s) => s.meetings);
  // Bounds come from the data, not constants: ITMGT 20.51 QRF runs to 21:30 and used to
  // overflow a grid that hard-stopped at 21:00 (§11).
  const start = timed.length ? Math.min(420, ...timed.map((m) => m.start)) : 420;
  const end = timed.length ? Math.max(1260, ...timed.map((m) => m.end)) : 1260;
  const height = (end - start) * PX_PER_MIN + HEADER;

  const labels: number[] = [];
  for (let m = Math.ceil(start / 120) * 120; m <= end; m += 120) labels.push(m);

  const tba = schedule.filter((s) => s.meetings.length === 0);

  return (
    <div className="schedule-grid-scroll" role="region" aria-label="Weekly schedule" tabIndex={0}>
      <div className="grid">
        <div className="time-axis" aria-hidden="true" style={{ height }}>
          {labels.map((m) => (
            <span key={m} style={{ top: HEADER + (m - start) * PX_PER_MIN }}>{formatTime(m)}</span>
          ))}
        </div>
        {DAYS.map((day) => (
          <div key={day} className="day-col" style={{ height }}>
            <div className="day-label">{day}</div>
            {schedule.flatMap((s) =>
              s.meetings
                .filter((m) => m.days.includes(day))
                .map((m, i) => (
                  <div key={`${sectionKey(s)}-${day}-${i}`} className="block"
                       style={{
                         top: HEADER + (m.start - start) * PX_PER_MIN,
                         height: (m.end - m.start) * PX_PER_MIN,
                         background: hueFor(s.courseCode),
                       }}>
                    <strong>{sectionKey(s)}</strong>
                    <br />{formatTime(m.start)}-{formatTime(m.end)}
                    <br />{s.room}
                  </div>
                ))
            )}
          </div>
        ))}
      </div>
      {tba.length > 0 && (
        <p>No fixed meeting time: {tba.map(sectionKey).join(", ")}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/ui/stage/SectionChips.tsx`**

```typescript
import type { Schedule, UserState } from "../../lib/types";
import { sectionKey } from "../../lib/types";

interface Props {
  schedule: Schedule;
  state: UserState;
  onChange: (s: UserState) => void;
}

export function SectionChips({ schedule, state, onChange }: Props) {
  const toggle = (field: "lockedSections" | "fullSections", key: string) => {
    const list = state[field];
    onChange({
      ...state,
      [field]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
    });
  };

  const exclude = (key: string) =>
    onChange({
      ...state,
      preferences: {
        ...state.preferences,
        excludedSections: state.preferences.excludedSections.includes(key)
          ? state.preferences.excludedSections
          : [...state.preferences.excludedSections, key],
      },
    });

  return (
    <ul className="chips">
      {schedule.map((s) => {
        const key = sectionKey(s);
        return (
          <li key={key} className="chip">
            {/* The code shown is the one THIS candidate used: a PHILO 11 slot may be
                .03 here and .05 in the next candidate (§11). */}
            <strong>{key}</strong>{" "}
            <span>{s.instructors.length > 0 ? s.instructors.join(", ") : "TBA"}</span>
            {s.modality && <span> {s.modality}</span>}
            {s.meetings.length === 0 && <span> time TBA</span>}{" "}
            <button type="button" onClick={() => toggle("lockedSections", key)}>
              {state.lockedSections.includes(key) ? "Unlock" : "Lock"}
            </button>{" "}
            <button type="button" onClick={() => toggle("fullSections", key)}>Mark full</button>{" "}
            <button type="button" onClick={() => exclude(key)}>Exclude</button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 6: Write `src/ui/stage/Diagnostics.tsx` and `EmptyStage.tsx`**

```typescript
// src/ui/stage/Diagnostics.tsx
import type { Diagnostics as D } from "../../lib/types";

export function Diagnostics({ diagnostics }: { diagnostics: D }) {
  return (
    <section>
      <h3>Sections available per course, after your filters</h3>
      <ul>
        {diagnostics.perSlot.map((s) => (
          <li key={s.id}>
            {s.label}: {s.afterFilters} of {s.total} usable
            {s.afterFilters === 0 ? " - all filtered out (full, excluded, or outside your time limits)" : ""}
          </li>
        ))}
      </ul>
      {diagnostics.conflictPairs.length > 0 && (
        <>
          <h3>Courses that cannot fit together</h3>
          <ul>
            {diagnostics.conflictPairs.map((p) => (
              <li key={`${p.a}|${p.b}`}>{p.a} and {p.b} always conflict</li>
            ))}
          </ul>
        </>
      )}
      {diagnostics.nWayConflict && (
        <p>
          These courses cannot all fit at once, even though each pair can. Try excluding a
          section, relaxing a time limit, or swapping a course.
        </p>
      )}
    </section>
  );
}
```

```typescript
// src/ui/stage/EmptyStage.tsx
interface Props {
  hasProgram: boolean;
  hasBlock: boolean;
  hasCourses: boolean;
}

export function EmptyStage({ hasProgram, hasBlock, hasCourses }: Props) {
  const steps = [
    { done: hasProgram, label: "Pick your program" },
    { done: hasBlock, label: "Pick your semester" },
    { done: hasCourses, label: "Review your courses" },
  ];
  return (
    <div className="empty-stage">
      <h2>Your week appears here</h2>
      <ol>
        {steps.map((s) => (
          <li key={s.label}>{s.done ? "Done" : "To do"} - {s.label}</li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 7: Write `src/ui/stage/Stage.tsx`**

```typescript
import type { CurriculumBlock, Program, UserState } from "../../lib/types";
import type { Schedules } from "../useSchedules";
import { downloadScheduleImage } from "../export/scheduleImage";
import { Pager } from "./Pager";
import { WeekGrid } from "./WeekGrid";
import { SectionChips } from "./SectionChips";
import { Diagnostics } from "./Diagnostics";
import { EmptyStage } from "./EmptyStage";

interface Props {
  schedules: Schedules;
  index: number;
  onIndex: (i: number) => void;
  state: UserState;
  block: CurriculumBlock | undefined;
  program: Program | undefined;
  onChange: (s: UserState) => void;
}

export function Stage({ schedules, index, onIndex, state, block, program, onChange }: Props) {
  const { ranked, diagnostics, search, resolved } = schedules;

  // Excluded from generation but still required: the week on screen is not the whole story,
  // and saying so is the point (§5.3, §5.6).
  const missing = resolved.filter((r) => r.slot.included && r.status !== "ok");

  if (ranked.length === 0) {
    if (!program || !block || state.slots.length === 0) {
      return <EmptyStage hasProgram={!!program} hasBlock={!!block} hasCourses={state.slots.length > 0} />;
    }
    return (
      <section>
        <h2>No schedule fits</h2>
        <p>Loosen a time limit, swap a course, or restore an excluded section.</p>
        {missing.length > 0 && <MissingList missing={missing} />}
        {diagnostics && <Diagnostics diagnostics={diagnostics} />}
      </section>
    );
  }

  const current = ranked[Math.min(index, ranked.length - 1)];

  return (
    <section>
      {search.truncated && (
        <p className="banner" role="status">
          Search hit its {search.limit}-schedule limit. Rankings apply to these candidates;
          pin a section or add a filter to narrow it.
        </p>
      )}
      <Pager index={index} count={ranked.length} score={current.score} onIndex={onIndex} />
      <WeekGrid schedule={current.schedule} />
      {missing.length > 0 && <MissingList missing={missing} />}
      <SectionChips schedule={current.schedule} state={state} onChange={onChange} />
      <button type="button"
              onClick={() => downloadScheduleImage(current.schedule, {
                program: program?.code ?? "",
                block: block?.key.replace("|", " / ") ?? "",
                term: state.calendarTerm,
              })}>
        Download schedule
      </button>
    </section>
  );
}

function MissingList({ missing }: { missing: Schedules["resolved"] }) {
  return (
    <div className="banner" role="status">
      <strong>Not in this schedule:</strong>
      <ul>
        {missing.map((r) => (
          <li key={r.slot.id}>
            {r.slot.label}
            {r.status === "awaiting-section" && " - pre-assigned; set your section"}
            {r.status === "no-offerings" && " - not offered this term"}
            {r.status === "unfilled" && " - no course chosen yet"}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 8: Write `src/ui/stage/Stage.test.tsx`**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Stage } from "./Stage";
import { defaultState } from "../../lib/storage";
import type { Schedules } from "../useSchedules";
import type { CurriculumBlock, Program, Section } from "../../lib/types";

vi.mock("../export/scheduleImage", () => ({ downloadScheduleImage: vi.fn() }));

const section = (code: string): Section => ({
  courseCode: code, sectionCode: "1", title: code, units: 3, instructors: [], modality: "",
  meetings: [{ days: ["M"], start: 480, end: 540 }], timeStatus: "scheduled",
  room: "R", remarks: "", raw: "",
});

const block: CurriculumBlock = {
  year: "First Year", term: "First Semester", key: "First Year|First Semester",
  totalUnits: 19, entries: [],
};
const program: Program = {
  id: "P", code: "P", name: "P", version: "2024", versionYear: 2024, versionLabel: "2024", blocks: [block],
};

const schedules = (over: Partial<Schedules> = {}): Schedules => ({
  resolved: [], ranked: [{ schedule: [section("MATH 10")], score: 0.9 }],
  diagnostics: null, search: { limit: 500, truncated: false }, ...over,
});

afterEach(cleanup);

describe("Stage", () => {
  it("lists required classes the schedule does not include, with the reason", () => {
    const resolved = [
      { slot: { id: "a", label: "INTACT 11", included: true }, sections: [], allSections: [],
        status: "awaiting-section", pinned: null },
      { slot: { id: "b", label: "MATH 51.1", included: true }, sections: [], allSections: [],
        status: "no-offerings", pinned: null },
    ] as unknown as Schedules["resolved"];
    render(<Stage schedules={schedules({ resolved })} index={0} onIndex={() => {}}
                  state={defaultState("2026-1")} block={block} program={program} onChange={() => {}} />);
    expect(screen.getByText(/Not in this schedule/)).toBeTruthy();
    expect(screen.getByText(/INTACT 11.*pre-assigned/)).toBeTruthy();
    expect(screen.getByText(/MATH 51.1.*not offered/)).toBeTruthy();
  });

  it("announces truncation", () => {
    render(<Stage schedules={schedules({ search: { limit: 500, truncated: true } })} index={0}
                  onIndex={() => {}} state={defaultState("2026-1")} block={block}
                  program={program} onChange={() => {}} />);
    expect(screen.getByText(/hit its 500-schedule limit/)).toBeTruthy();
  });

  it("shows the setup checklist before anything is chosen", () => {
    render(<Stage schedules={schedules({ ranked: [] })} index={0} onIndex={() => {}}
                  state={defaultState("2026-1")} block={undefined} program={undefined} onChange={() => {}} />);
    expect(screen.getByText(/Your week appears here/)).toBeTruthy();
    expect(screen.getByText(/Pick your program/)).toBeTruthy();
  });
});
```

- [ ] **Step 9: Run the stage suite**

Run: `npx vitest run src/ui/stage/`
Expected: PASS - Pager 4, WeekGrid 4, Stage 3.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: stage with candidate pager, data-bounded week grid and missing-class list"
```

---

### Task 14: Candidates rail

**Files:**
- Create: `src/ui/candidates/CandidateList.tsx`, `src/ui/candidates/CandidateList.test.tsx`

**Interfaces:**
- Consumes: `RankedSchedule` (Task 7).
- Produces: `CandidateList({ ranked, index, onPick })`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CandidateList } from "./CandidateList";
import type { RankedSchedule } from "../../lib/ranker";
import type { Section } from "../../lib/types";

const section = (code: string, days: Section["meetings"][number]["days"]): Section => ({
  courseCode: code, sectionCode: "1", title: code, units: 3, instructors: [], modality: "",
  meetings: [{ days, start: 480, end: 540 }], timeStatus: "scheduled", room: "", remarks: "", raw: "",
});

const ranked: RankedSchedule[] = [
  { schedule: [section("A", ["M"])], score: 1 },
  { schedule: [section("B", ["M", "W"])], score: 0.5 },
];

afterEach(cleanup);

describe("CandidateList", () => {
  it("renders one button per candidate, ranked", () => {
    render(<CandidateList ranked={ranked} index={0} onPick={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /#1/ })).toBeTruthy();
  });

  it("marks the current candidate", () => {
    render(<CandidateList ranked={ranked} index={1} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: /#2/ })).toHaveAttribute("aria-current", "true");
  });

  it("reports the picked index", () => {
    const onPick = vi.fn();
    render(<CandidateList ranked={ranked} index={0} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /#2/ }));
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("shows how many days each candidate needs on campus", () => {
    render(<CandidateList ranked={ranked} index={0} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: /#1.*1 day/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /#2.*2 days/ })).toBeTruthy();
  });

  it("says so when there is nothing yet", () => {
    render(<CandidateList ranked={[]} index={0} onPick={() => {}} />);
    expect(screen.getByText(/Schedules appear here/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/ui/candidates/`
Expected: FAIL, module unresolved.

- [ ] **Step 3: Write `src/ui/candidates/CandidateList.tsx`**

```typescript
import type { RankedSchedule } from "../../lib/ranker";
import type { Day } from "../../lib/types";

interface Props {
  ranked: RankedSchedule[];
  index: number;
  onPick: (i: number) => void;
}

const daysOnCampus = (r: RankedSchedule): number => {
  const days = new Set<Day>();
  for (const s of r.schedule) for (const m of s.meetings) for (const d of m.days) days.add(d);
  return days.size;
};

export function CandidateList({ ranked, index, onPick }: Props) {
  if (ranked.length === 0) return <p className="hint">Schedules appear here.</p>;

  return (
    <ol className="candidate-list">
      {ranked.map((r, i) => {
        const days = daysOnCampus(r);
        return (
          <li key={r.schedule.map((s) => `${s.courseCode} ${s.sectionCode}`).join("|")}>
            <button type="button" aria-current={i === index ? "true" : undefined}
                    className={i === index ? "current" : ""} onClick={() => onPick(i)}>
              #{i + 1} <span className="tabular">{r.score.toFixed(2)}</span>{" "}
              {days} {days === 1 ? "day" : "days"}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run src/ui/candidates/`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ranked candidates rail"
```

---

### Task 15: Enlistment handoff - downloadable schedule image

**Files:**
- Create: `src/ui/export/scheduleImage.ts`, `src/ui/export/scheduleImage.test.ts`

**Interfaces:**
- Consumes: `Schedule`, `sectionKey` (Task 2); `formatTime` (Task 1).
- Produces:
  - `renderScheduleImage(schedule, meta, canvas) → string` (a PNG data URL)
  - `downloadScheduleImage(schedule, meta) → void`
  - `interface ScheduleMeta { program: string; block: string; term: string }`

- [ ] **Step 1: Write the failing test**

Canvas is stubbed: this asserts the content contract, not pixels (§12).

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderScheduleImage } from "./scheduleImage";
import type { Schedule, Section } from "../../lib/types";

const section = (code: string, sectionCode: string): Section => ({
  courseCode: code, sectionCode, title: code, units: 3, instructors: ["CRUZ, Ana"], modality: "",
  meetings: [{ days: ["M", "W"], start: 480, end: 540 }], timeStatus: "scheduled",
  room: "SEC-A203", remarks: "", raw: "",
});

const schedule: Schedule = [section("MATH 10", "A3"), section("INTACT 11", "INT-MA1")];
const meta = { program: "BS CS", block: "First Year / First Semester", term: "2026-1" };

// Record every string drawn so the content can be asserted without rendering pixels.
let drawn: string[] = [];

function stubCanvas(): HTMLCanvasElement {
  drawn = [];
  const ctx = {
    fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), measureText: () => ({ width: 40 }),
    fillText: (t: string) => { drawn.push(t); },
    set fillStyle(_v: string) {}, set strokeStyle(_v: string) {},
    set font(_v: string) {}, set textAlign(_v: string) {}, set lineWidth(_v: number) {},
  };
  return {
    width: 0, height: 0,
    getContext: () => ctx,
    toDataURL: () => "data:image/png;base64,AAAA",
  } as unknown as HTMLCanvasElement;
}

beforeEach(() => { drawn = []; });

describe("renderScheduleImage", () => {
  it("returns a PNG data URL", () => {
    expect(renderScheduleImage(schedule, meta, stubCanvas())).toMatch(/^data:image\/png;base64,/);
  });

  it("draws every section code, which is the field typed into AISIS", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).toContain("A3");
    expect(text).toContain("INT-MA1");
    expect(text).toContain("MATH 10");
    expect(text).toContain("INTACT 11");
  });

  it("draws the program, block and term so a saved image identifies itself", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    const text = drawn.join(" ");
    expect(text).toContain("BS CS");
    expect(text).toContain("First Year / First Semester");
    expect(text).toContain("2026-1");
  });

  it("carries the unofficial-tool line, which travels with a shared image", () => {
    renderScheduleImage(schedule, meta, stubCanvas());
    expect(drawn.join(" ")).toMatch(/verify.*AISIS/i);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/ui/export/`
Expected: FAIL, module unresolved.

- [ ] **Step 3: Write `src/ui/export/scheduleImage.ts`**

```typescript
import type { Day, Schedule } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import { formatTime } from "../../lib/time";

export interface ScheduleMeta {
  program: string;
  block: string;
  term: string;
}

const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT"];
const W = 1000;
const PAD = 24;
const GRID_TOP = 120;
const GRID_H = 460;
const ROW_H = 26;
const HUES = ["#2f6df6", "#f6a23b", "#2fbf8f", "#e15b8d", "#7a5af8", "#22b8cf"];

function hueFor(courseCode: string): string {
  let hash = 0;
  for (let i = 0; i < courseCode.length; i++) hash = (hash * 31 + courseCode.charCodeAt(i)) >>> 0;
  return HUES[hash % HUES.length];
}

// Rendered with the Canvas 2D API rather than a DOM-to-image library: the grid geometry is
// simple, and this adds no dependency (§11.3).
export function renderScheduleImage(
  schedule: Schedule, meta: ScheduleMeta, canvas: HTMLCanvasElement
): string {
  const rows = [...schedule].sort((a, b) => sectionKey(a).localeCompare(sectionKey(b)));
  const height = GRID_TOP + GRID_H + 40 + rows.length * ROW_H + 60;
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, height);

  // Header - a saved image must identify itself.
  ctx.fillStyle = "#1b2233";
  ctx.font = "600 26px Inter, sans-serif";
  ctx.fillText("AISIS Scheduler", PAD, 44);
  ctx.font = "16px Inter, sans-serif";
  ctx.fillStyle = "#8c96aa";
  ctx.fillText(`${meta.program}  ${meta.block}  ${meta.term}`, PAD, 72);

  const timed = schedule.flatMap((s) => s.meetings);
  const start = timed.length ? Math.min(420, ...timed.map((m) => m.start)) : 420;
  const end = timed.length ? Math.max(1260, ...timed.map((m) => m.end)) : 1260;
  const perMin = GRID_H / Math.max(1, end - start);
  const colW = (W - PAD * 2 - 50) / DAYS.length;

  ctx.font = "13px Inter, sans-serif";
  DAYS.forEach((day, i) => {
    ctx.fillStyle = "#8c96aa";
    ctx.fillText(day, PAD + 50 + i * colW + colW / 2 - 8, GRID_TOP - 8);
  });
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) {
    const y = GRID_TOP + (m - start) * perMin;
    ctx.strokeStyle = "#eef1f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD + 50, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    ctx.fillStyle = "#8c96aa";
    ctx.fillText(formatTime(m), PAD, y + 4);
  }

  for (const s of schedule) {
    for (const meeting of s.meetings) {
      for (const day of meeting.days) {
        const i = DAYS.indexOf(day);
        if (i < 0) continue;
        const x = PAD + 50 + i * colW;
        const y = GRID_TOP + (meeting.start - start) * perMin;
        const h = (meeting.end - meeting.start) * perMin;
        ctx.fillStyle = hueFor(s.courseCode);
        ctx.fillRect(x + 2, y, colW - 4, h);
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 11px Inter, sans-serif";
        ctx.fillText(s.courseCode, x + 6, y + 14);
        ctx.font = "10px Inter, sans-serif";
        ctx.fillText(s.sectionCode, x + 6, y + 26);
      }
    }
  }

  // Section list. The SECTION CODE carries the weight - it is what gets typed into AISIS.
  let y = GRID_TOP + GRID_H + 44;
  ctx.fillStyle = "#1b2233";
  ctx.font = "600 15px Inter, sans-serif";
  ctx.fillText("Enlist these sections", PAD, y);
  y += 24;
  for (const s of rows) {
    ctx.font = "13px Inter, sans-serif";
    ctx.fillStyle = "#1b2233";
    ctx.fillText(s.courseCode, PAD, y);
    ctx.font = "600 15px Inter, sans-serif";
    ctx.fillText(s.sectionCode, PAD + 190, y);
    ctx.font = "12px Inter, sans-serif";
    ctx.fillStyle = "#8c96aa";
    const when = s.meetings.length === 0
      ? "no fixed time"
      : s.meetings.map((m) => `${m.days.join("")} ${formatTime(m.start)}-${formatTime(m.end)}`).join(", ");
    ctx.fillText(`${when}   ${s.room}`, PAD + 360, y);
    y += ROW_H;
  }

  ctx.font = "12px Inter, sans-serif";
  ctx.fillStyle = "#8c96aa";
  ctx.fillText("Unofficial planning tool - always verify your final schedule in AISIS.", PAD, height - 20);

  return canvas.toDataURL("image/png");
}

export async function downloadScheduleImage(schedule: Schedule, meta: ScheduleMeta): Promise<void> {
  // Wait for the self-hosted faces, or the canvas silently falls back to a system font.
  if (typeof document !== "undefined" && "fonts" in document) {
    try { await document.fonts.ready; } catch { /* proceed with whatever is loaded */ }
  }
  const canvas = document.createElement("canvas");
  const url = renderScheduleImage(schedule, meta, canvas);
  const link = document.createElement("a");
  link.href = url;
  link.download = `schedule-${meta.term}.png`;
  link.click();
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run src/ui/export/`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: downloadable schedule image for enlistment"
```

---

### Task 16: Smoke test, validator additions, README

**Files:**
- Create: `src/App.smoke.test.tsx`
- Modify: `tools/validate-data.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: no new exports.

- [ ] **Step 1: Write the cockpit smoke test**

`src/App.smoke.test.tsx`. Uses the real 2026-1 catalog and a real scraped program.

```typescript
import { vi } from "vitest";
vi.mock("./lib/db", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = JSON.parse(readFileSync("data/catalogs/catalog-2026-1.json", "utf8"));
  const program = JSON.parse(readFileSync("data/curricula/BS-AMDSc-M-DSc-2024.json", "utf8"));
  const { stubDb } = await import("./lib/testing/stubDb");
  const actual = await vi.importActual<typeof import("./lib/db")>("./lib/db");
  return {
    ...actual,
    defaultDb: stubDb({
      catalogs: [{
        term: catalog.term, exported_at: catalog.exportedAt,
        sections: catalog.sections, warnings: catalog.warnings,
      }],
      programs: [{
        id: program.id, code: program.code, name: program.name, version: program.version,
        version_year: program.versionYear, version_label: program.versionLabel, blocks: program.blocks,
      }],
      community_ratings: [],
    }),
  };
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./ui/App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("cockpit smoke", () => {
  it("runs program to schedule on the real 2026-1 data", async () => {
    render(<App />);

    // 1. Program. The version label must render - this is the regression that shipped.
    await waitFor(() => expect(screen.getByLabelText(/program and curriculum year/i)).toBeTruthy());
    expect(document.body.textContent).not.toContain("undefined");
    fireEvent.change(screen.getByLabelText(/program and curriculum year/i), {
      target: { value: "BS-AMDSc-M-DSc-2024" },
    });

    // 2. Semester.
    fireEvent.click(screen.getByRole("button", { name: "Semester" }));
    await waitFor(() => expect(screen.getByLabelText(/curriculum block/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/curriculum block/i), {
      target: { value: "First Year|First Semester" },
    });

    // 3. Courses. PATHFit 1 now resolves through PFT1 to PEPC 10, which exact matching missed.
    fireEvent.click(screen.getByRole("button", { name: "Courses" }));
    await waitFor(() => expect(screen.getByText(/units selected/)).toBeTruthy());
    expect(screen.getByText(/this block is/)).toBeTruthy();

    // INTACT 11 is pre-assigned: excluded from generation and labelled as such, not
    // reported as unavailable.
    expect(screen.getAllByText(/pre-assigned/i).length).toBeGreaterThan(0);

    // 4. Keep the search small: drop the bulk courses, leaving MATH 71.1 and MATH 10.
    for (const code of ["ENGL 11", "FILI 12", "SocSc 11", "THEO 11", "PATHFit 1"]) {
      const row = screen.getByText(code).closest("li")!;
      fireEvent.click(within(row).getByRole("checkbox"));
    }

    // 5. A schedule appears on the stage.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Schedule 1 of/));
    const before = screen.getByRole("status").textContent!;

    // 6. Pinning a MATH 71.1 section collapses the candidate set.
    fireEvent.click(screen.getByRole("button", { name: "Classes you already have" }));
    const picker = await screen.findByLabelText(/section for MATH 71.1/i);
    const option = within(picker).getAllByRole("option")[1] as HTMLOptionElement;
    fireEvent.change(picker, { target: { value: option.value } });
    await waitFor(() => expect(screen.getByRole("status").textContent).not.toBe(before));

    // 7. Preferences re-rank without error.
    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    fireEvent.click(screen.getByLabelText(/Later starts/));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Schedule 1 of/));

    // 8. State persisted under v3.
    const stored = JSON.parse(localStorage.getItem("aisis-scheduler-state")!);
    expect(stored.version).toBe(3);
    expect(stored.programId).toBe("BS-AMDSc-M-DSc-2024");
    expect(stored.slots.length).toBeGreaterThan(0);
    expect(stored.lockedSections).toHaveLength(1);
    expect(stored.completedCourses).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and fix what it finds**

Run: `npx vitest run src/App.smoke.test.tsx`
Expected: PASS. This is the first time the whole cockpit runs together; treat any failure as
a real integration defect, not a test to be relaxed.

- [ ] **Step 3: Extend `tools/validate-data.mjs`**

Add three checks (§12). Insert after the existing catalog loop:

```javascript
// Every section must carry timeStatus. A catalog scraped before that field existed makes
// the generator's parse-error guard inert on production data.
for (const file of catalogFiles) {
  const catalog = await readJson(path.join(DATA, "catalogs", file));
  const missing = catalog.sections.filter((s) => !s.timeStatus).length;
  if (missing > 0) fail(`${file}: ${missing} section(s) have no timeStatus - re-run the scraper`);
}

// Every alias target must resolve to at least one section in the newest catalog, or the
// alias is dead weight hiding a real gap.
const aliasFile = await readJson(path.join(DATA, "course-aliases.json"));
const canon = (c) => c.trim().replace(/\s+/g, " ").toUpperCase();
const newestCodes = [...new Set((newest?.sections ?? []).map((s) => s.courseCode))];
const matchesPrefix = (code, base) => {
  const x = canon(code), y = canon(base);
  if (x === y) return true;
  if (!x.startsWith(y)) return false;
  const rest = x.slice(y.length);
  return rest.startsWith(".") || rest.startsWith("(");
};
for (const [key, prefixes] of Object.entries(aliasFile.aliases)) {
  for (const prefix of prefixes) {
    if (!newestCodes.some((c) => matchesPrefix(c, prefix))) {
      console.log(`note: alias ${key} -> ${prefix} matches nothing in ${newest.term}`);
    }
  }
}
```

Then replace the existing "required courses not offered" report with the alias-aware
zero-offering report (§5.3), counting across every program:

```javascript
let unresolved = 0, requirements = 0;
const missingByCode = new Map();
for (const entry of index) {
  const program = await readJson(path.join(DATA, "curricula", `${entry.id}.json`));
  for (const block of program.blocks) {
    for (const e of block.entries) {
      if (e.isElective) continue;
      requirements += 1;
      const key = aliasFile.aliases[e.category] ? e.category : e.catNo;
      const targets = [e.catNo, ...(aliasFile.aliases[key] ?? [])];
      if (targets.some((t) => newestCodes.some((c) => matchesPrefix(c, t)))) continue;
      unresolved += 1;
      const label = `${e.catNo} [${e.category || "-"}]`;
      missingByCode.set(label, (missingByCode.get(label) ?? 0) + 1);
    }
  }
}
const resolvedPct = (100 * (requirements - unresolved) / requirements).toFixed(1);
console.log(`\nRequirement resolution against ${newest.term}: ${resolvedPct}% of ${requirements}`);
console.log("Top unresolved codes:");
for (const [label, n] of [...missingByCode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${String(n).padStart(4)} x ${label}`);
}
```

- [ ] **Step 4: Run the validator**

Run: `npm run validate:data`
Expected: exits 0, reports `Requirement resolution against 2026-1: 69.3% of 4010`. If the
figure has dropped, an alias or rule change has regressed - investigate before committing.

- [ ] **Step 5: Update the README**

Replace the "Scheduling limits" and "Professor ratings" sections to describe the cockpit
flow, and add:

```markdown
## How a semester is built

1. **Program** - your curriculum, including the version and track.
2. **Semester** - the curriculum block you are taking, and the AISIS term. The term
   defaults to the one you would be enlisting for now, falling back to the newest term
   that actually has a catalog.
3. **Courses** - review the requirements, fill electives, narrow a requirement that has
   several valid courses (PHILO tracks, PATHFit activities, your natural science), and pull
   requirements from other blocks if you are off-sequence.
4. **Classes you already have** - set the section for anything pre-assigned (INTACT is
   assigned, not chosen) or already secured. The rest is planned around it.
5. **Preferences** - ranking priorities, time limits, protected time.

Ranking is strict priority: the first criterion decides, later ones only break ties.

Curriculum codes are matched to what AISIS actually offers by exact match, a variant rule
(`PHILO 11` covers `PHILO 11.03` to `.06`), and `data/course-aliases.json` for irregular
renames such as PATHFit to PEPC. A required course that resolves to nothing is reported,
never silently dropped. `npm run validate:data` prints the resolution rate across every
program - that report is how the alias file is maintained.

Note: PATHFit 3 and 4 draw from the same activity pool, and the app does not know which
activities satisfy which level. Verify your choice in AISIS.
```

- [ ] **Step 6: Full verification**

Run: `npx vitest run && npx tsc --noEmit && npm run build && npm run validate:data`
Expected: all tests pass, typecheck clean, production build succeeds, validator exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: cockpit smoke test, resolution-rate validator and README rewrite"
```

---

## After the plan

1. **Publish the data** - `SUPABASE_SERVICE_ROLE_KEY=<key> npm run push:data`. Until this
   runs the deployed app still serves one program and the stale catalog (§13).
2. **Verify in a browser** - `npm run dev`, walk the five steps, download a schedule image.
3. **Merge** - use `superpowers:finishing-a-development-branch`.

Deferred and recorded, not forgotten: prerequisite checking and IPS import via a browser
extension (§11.6), which is why `completedCourses` already exists in storage v3.
