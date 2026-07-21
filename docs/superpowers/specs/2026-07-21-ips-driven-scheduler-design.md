# AISIS Scheduler v2 — IPS-Driven Redesign

**Date:** 2026-07-21
**Status:** Approved design, pre-implementation
**Author:** Prince (with Claude)
**Supersedes flow of:** `2026-07-19-aisis-scheduler-design.md` (v1). Reuses v1's schedule engine.

## 1. Overview

Redesign the scheduler around a student's **program** and **curriculum (IPS)**. Instead of
manually ticking courses from a raw catalog, the student selects their program, a curriculum
block (year + semester), and a calendar term; the app pre-fills the required courses from the
program's official curriculum, lets the student edit them (electives, minors, overload,
underload), then matches those courses against the term's offered sections and generates and
ranks conflict-free schedules using the existing engine.

Verified against live AISIS on 2026-07-21 (see `scratchpad/aisis-samples/NOTES.md`): both data
sources are real and structured, and the offered-classes source is fully public.

### Goals
- Program → curriculum block + calendar term → IPS-seeded, editable required courses → matched,
  ranked, conflict-free schedules.
- Reuse the v1 engine (generator, ranker, prof matching, weekly grid, versioned localStorage).
- Stay a free static SPA, structured so **Supabase** can back the data layers later with no
  change to flow or engine.
- Real AISIS data (captured live) as the source of truth for parsers and test fixtures.

### Non-goals (v2)
- Supabase / any backend (planned next, explicitly deferred).
- Scraping/curriculum capture for programs other than the seeded BS AMDSc.
- Automated login-session scraping of the curriculum (captured once, by hand, for v2).
- Personalized IPS (per-student standing). v2 uses the **standard** official curriculum, edited
  by the user. See [[user-adjusts-standard-ips]] intent.

## 2. Data Sources (verified live)

### 2.1 Offered classes — PUBLIC, no login
- Endpoint: `https://aisis.ateneo.edu/j_aisis/classSkeds.do` (reached via "View Schedule of
  Classes" on the login page — no authentication).
- Controls: **School Year and Term** (`YYYY-{2|1|0}`, 2=2nd sem, 1=1st sem, 0=intersession;
  ~last 6 terms) and **Department** (~44 codes: `MA`, `DISCS`, `PH`, `PS`, `BIO`, `**IE**` …),
  plus a "Display Class Schedule" submit.
- One request per (term, dept) returns the full table client-side (DataTables paging is display
  only). ~201 rows for MATHEMATICS alone.
- **Columns (10):** Subject Code · Section · Course Title · Units · Time · Room · Instructor ·
  Lang · Level · Remarks. No enrollment/free-slots column → "mark full" stays manual.
- Time: `M-TH 0800-0930` + `(FULLY ONSITE)` modality on a second line (a `<br>`).
- Instructor: `LAST, FIRST MIDDLE`; multiple possible, comma-joined
  (`DE LOS SANTOS, Kurt Anthony, MIJARES, Jim Ralphealo`).
- Subject codes have a space and dotted numbers (`MATH 1.1`, `MATH 10`).

### 2.2 Official Curriculum (standard IPS) — login, same for all students
- Endpoint: `https://aisis.ateneo.edu/j_aisis/J_VOFC.do` ("OFFICIAL CURRICULUM").
- One dropdown, ~250 programs, labeled `(CODE) NAME(Ver Sem 1, Ver Year YYYY)`; programs have
  multiple version-years. User's program: `(BS AMDSc-M DSc) BACHELOR OF SCIENCE IN APPLIED
  MATHEMATICS`, versions 2020 and 2024.
- Layout: **Year** (First…Fifth) → **Term** (First Semester / Second Semester / Intersession) →
  table with total units in the header.
- **Columns (5):** Cat No · Course Title · Units · Prerequisites · Category.
  - Cat No = course code, joins to offered Subject Code.
  - Prerequisites: comma-separated codes or blank. Category: `C`, `M`, `PFT1`, `NS1A`, `IE1E`,
    `FLC1`, `RM1`, `FE1`, `NP1`…. Units may be 0.
  - **Elective placeholders** (no real code): `MATHEMATICS ELECTIVE`, `FREE ELECTIVE`,
    `MATH GRAD ELECTIVE`, and `IE 1/2/3` (interdisciplinary — map to `**IE**` dept).
  - Quirk: some year headers are inconsistent/mislabeled (a "Fourth Year - 6.0 Units" block
    appears under "Third Year" and under "Fifth Year"). Handle each printed block independently.

## 3. Architecture

Static Vite + React + TypeScript SPA, building on the v1 repo.

**Reused unchanged:** `generator.ts`, `time.ts`, the weekly-grid Results screen, versioned
localStorage (bumped to v2 with migration).

**Reused with a small adaptation:** `ranker.ts` and `profs.ts` — the `preferredProfs` criterion
now scores over `Section.instructors[]` (best/average of the matched ratings) instead of a single
`instructor` string. `profs.ratingFor` is unchanged; only the caller iterates the array.

**Rewritten:** `parser.ts` → the real 10-column format (strip modality, multi-instructor,
dotted codes), consuming clean per-cell scraper output.

**New data layers (Supabase swap points):**
- `curriculum.ts` — `getPrograms(): ProgramSummary[]`, `getCurriculum(programId): Program`.
  Bundled JSON now; Supabase later, same interface.
- `catalog.ts` — `getTerms(): string[]`, `getCatalog(term): Catalog`. Bundled per-term JSON now;
  Supabase later.

**New tools (Node, not shipped):**
- `tools/scrape-schedule.mjs` — public `classSkeds.do`, loops departments for a term, writes
  `src/data/catalog-<term>.json`. No login. This is exactly what a Vercel cron would later emit.
- Curriculum seed: `src/data/curriculum-BS-AMDSc-2024.json`, transcribed from the live page and
  verified against it during build. A login snippet for other programs is future work.

**Data flow:** program → curriculum block's required courses → user edits / fills electives →
term catalog's sections → existing generator matches + ranks → grid.

## 4. Data Model

### Curriculum (bundled per program+version)
```ts
interface ProgramSummary { id: string; code: string; name: string; versionYear: number; }
interface Program extends ProgramSummary { blocks: CurriculumBlock[]; }
interface CurriculumBlock {
  year: string;                        // "First Year" … as printed
  term: "First Semester" | "Second Semester" | "Intersession";
  key: string;                         // stable id, e.g. "First Year|First Semester"
  totalUnits: number;
  entries: CurriculumEntry[];
}
interface CurriculumEntry {
  catNo: string;                       // "MATH 31.1"; "" for pure elective placeholders
  title: string;
  units: number;                       // may be 0
  prerequisites: string[];
  category: string;                    // "M", "C", "IE1E", "FE1", …
  isElective: boolean;                 // MATHEMATICS ELECTIVE / FREE ELECTIVE / IE 1 …
  electiveDept?: string;               // IE slots → "**IE**"
  slotId: string;                      // stable id for elective fills (unique within block)
}
```

### Catalog (bundled per calendar term; extends v1 types)
```ts
interface Section {            // v1 fields plus:
  // …courseCode, sectionCode, title, units, meetings, room, remarks, raw
  instructors: string[];       // was `instructor: string`; multi-prof
  modality: string;            // "FULLY ONSITE" | "ONLINE" | "HYBRID" | "" (TBA)
}
interface Catalog { term: string; exportedAt: string; sections: Section[]; warnings: string[]; }
```

### User state (localStorage, versioned v2)
```ts
interface UserState {
  version: 2;
  programId: string;
  blockKey: string;                          // chosen CurriculumBlock.key
  calendarTerm: string;                      // "2026-2"
  requiredCourses: string[];                 // course codes, seeded from block then edited
  electiveFills: Record<string, string>;     // slotId → concrete course code
  lockedSections: string[];
  fullSections: string[];
  preferences: Preferences;                  // unchanged from v1
  personalRatings: ProfRating[];
}
```
`requiredCourses` is seeded from the block but fully user-editable (overload/underload/minors).
Electives resolve to concrete codes via `electiveFills`. Downstream, the generator sees only a
list of course codes — identical to v1.

## 5. User Flow & Screens

Tabbed shell (**Program · Semester · Courses · Results · Preferences**); first run walks them in
order. All state persists in localStorage.

1. **Program** — searchable dropdown from `getPrograms()`. v2 seeds BS AMDSc (2024; 2020
   optional). Remembers selection.
2. **Semester** — two controls: *Curriculum block* (Year + Semester from the program's IPS) and
   *Calendar term* (`2026-2`… — where to pull sections).
3. **Courses** — editable checklist pre-filled from the block: title, units, running unit total
   (overload/underload visible). Real courses toggle on/off. **Elective slots** show a "Fill
   this" catalog picker (IE slots pre-filtered to `**IE**`). **Add course** free-searches the
   term catalog for minors/overloads. Inline flag when a required course has **no sections** in
   the chosen term.
4. **Results** — unchanged v1 engine: ranked conflict-free schedules, weekly grid, Lock / Mark
   full / Exclude, N-way diagnostics, restore-excluded. Adds unit total and TBA/online flags.
5. **Preferences** — unchanged (criteria with compact-days default, time limits, protected
   blocks, prof ratings).

## 6. Matching, Error Handling, Testing

**Matching:** the existing engine, unchanged — resolved `requiredCourses` (electives → concrete
codes) is a list of course codes; generator gathers each code's sections from the term catalog,
produces conflict-free combos; ranker orders them. The only join is course-code → sections,
already shared by both datasets.

**Error handling (new modes):**
- Required course **not offered this term** → flagged inline on Courses, excluded from
  generation (not a silent zero-result).
- **Unfilled elective slot** → flagged, not treated as a phantom course.
- **Curriculum quirks** (mislabeled year blocks) → each printed block handled independently;
  seed JSON verified against the live page at capture time.
- **Catalog parse** → scraper/parser emits warnings, never throws; bad times → TBA-like, still
  listed (as v1).
- **Stale term, empty/oversized results** → existing guards.
- **localStorage v1→v2** → invalid/old-version state resets to v2 defaults with a notice
  (versioned-storage guard); a migration path clears v1 keys.

**Testing (TDD, with real captured AISIS fixtures):**
- Parser: real MATH-department rows (modality strip, multi-instructor, dotted codes, warnings).
- Curriculum loader: real BS AMDSc structure (electives flagged, units incl. 0, prereqs,
  quirk blocks).
- Matching flow: integration test program → block → term → required list → generate → results on
  real seed data.
- Generator/ranker keep their v1 suites; storage gets a v1→v2 migration test.
- One end-to-end smoke test through the real UI on seeded data.

## 7. Scaling Path (next, not now)
- **Supabase** backs `curriculum.ts` and `catalog.ts` (rewrite those two files only): tables for
  programs/curricula and per-term catalogs; the schedule scraper runs as a scheduled job
  (serverless/cron) writing to Supabase, giving auto-refreshed offerings and multi-program
  curricula without a redeploy.
- Login-session curriculum snippet to capture additional programs.
- Optional accounts/sync once Supabase is in.

## 8. Open Items
1. Confirm BS AMDSc version(s) to seed (2024 confirmed; 2020 optional).
2. Whether to bundle one term now (`2026-2`) or several — start with the upcoming enlistment term.
3. Prof-ratings seeding remains manual (carried from v1).
