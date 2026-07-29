# Scheduler Rewrite — Design

Date: 2026-07-28
Status: approved direction (pending spec review)
Supersedes the UI half of: `2026-07-21-cockpit-ui-redesign-design.md` (absorbed here)
Related: `2026-07-21-ips-driven-scheduler-design.md`, `2026-07-21-multi-program-curricula-design.md`

## 1. Goal

Rewrite `src/` from scratch. Same product, same feature set, same stack, same data
pipeline — a clean implementation that fixes the three defects found in the 2026-07-28
review and replaces the course-selection data model that is the source of most of the
complexity in the current code.

The rewrite also lands the single-page cockpit UI, which was specced on 2026-07-21,
approved, and never built.

**Non-goals.** No new features. No stack change. No change to the AISIS scrapers or their
verified endpoint contracts. No change to the Supabase schema beyond what already exists
in `migrations/`. No dark mode.

## 2. What carries over untouched

| Kept | Why |
|---|---|
| `data/` — catalog (3,743 sections), the one program IPS, ratings | The assets the rewrite exists to preserve |
| `tools/` — both scrapers, `curriculum-parse.mjs`, `extract-rows.mjs`, `push-data.mjs` | Verified against the live site; the endpoint contracts are expensive knowledge |
| `tools/fixtures/j-vofc-sample.html` | The strongest test in the repo asserts against it |
| `docs/`, `supabase/migrations/` | Design history and the deployed schema |

**Only `src/` is deleted and rebuilt.** The one addition elsewhere is
`data/course-aliases.json` (§5.1); no existing data file is edited by the rewrite.

### 2.1 `tools/` is not actually self-contained yet — fix it first

`tools/scrape-schedule.mjs:21` imports `parseRows` from `src/lib/parser.ts`, so deleting
`src/` breaks the schedule scraper. The app never imports that module — it reads
already-parsed sections from Supabase — so parsing scraped AISIS HTML is a scraper concern
sitting in the wrong directory.

**Before `src/` is touched**, move it:

| symbol | only consumer | destination |
|---|---|---|
| `parseRows`, `parseRow`, `parseTimeCell`, `parseDays`, `splitInstructors` | `scrape-schedule.mjs` | `tools/schedule-parse.mjs` |
| `parseTimeRange` | `parser.ts` | `tools/schedule-parse.mjs` |
| `overlaps`, `formatTime` | the app | stays in `src/lib/time.ts` |

The split is exact — nothing is duplicated and nothing is orphaned. Afterwards
`tools/schedule-parse.mjs` is dependency-free like its siblings `curriculum-parse.mjs` and
`extract-rows.mjs`, `tools/` imports nothing from `src/`, and `scrape:schedule` no longer
needs `tsx` (`node tools/scrape-schedule.mjs`). `src/lib/parser.test.ts` moves with it.

**Two time-parsing findings must survive the move.** Re-scraping 2026-1 on 2026-07-28
surfaced 112 sections the parser could not read, in two classes:

1. **Semicolon-separated meetings — a real bug, fixed.** `parseTimeCell` split multi-meeting
   cells on `/` only, but AISIS also uses `;`: `"M-TH 1230-1400; W 1100-1300"`,
   `"M 0800-1100; M 1130-1430"`. Eleven fully-scheduled sections were being discarded, and
   before `timeStatus` existed they were treated as **conflict-free**, so the app could emit
   a schedule containing a genuine clash. The split is now `/[/;]/`, with tests for the
   two-day and same-day-twice forms.
2. **`TUTORIAL 0000-0000` — 101 sections, an open question (§14).** Not malformed; it is how
   AISIS writes "tutorial, no fixed meeting time." It parses as an error today because
   `parseTimeRange` rejects `start >= end`, so these are excluded from generation entirely.

### 2.2 Branch base

Branch off **`curricula-scraper`**, not `main`. `curricula-scraper` is 9 commits ahead and
those commits contain `tools/scrape-curricula.mjs`, `tools/curriculum-parse.mjs`, migration
`0002_program_version_label.sql`, and the fixture-backed parser tests — all on the keep
list. Branching off `main` would discard them.

## 3. The problem being solved

Course selection is currently spread across three structures kept in manual sync:

- `requiredCourses: string[]` — flat course codes
- `electiveFills: Record<slotId, string>` — slot → code
- `block.entries` — the IPS slots themselves

No structure owns the truth, so the code reconciles them by hand. Consequences visible in
the current source:

- `selected` means *"is in `requiredCourses`"* for a normal course but *"has a fill"* for an
  elective. The asymmetry needs a three-line comment to explain (`requirements.ts:38-40`).
- `codeStillNeeded` and `withoutUnreferencedCode` exist only to garbage-collect
  `requiredCourses` when a fill changes.
- `extraCourseRows` reconstructs user-added courses by diffing `requiredCourses` against the
  block.
- Unchecking a filled elective silently clears its fill (already logged as a UX oddity in
  `.superpowers/sdd/deferred-minors.md`).
- Two elective slots filled with the same course collapse into one.

That is roughly 80 lines of pure bookkeeping, and it is where the selection bugs live.

## 4. Selection model — one list of slots

```ts
interface Slot {
  id: string;                 // "ips:First Year|First Semester#4" | "added:3"
  origin: "ips" | "added";
  label: string;              // "PHILO 11" | "MATHEMATICS ELECTIVE"
  requirement: string | null; // curriculum catNo; null when user-added
  category: string | null;    // AISIS requirement category, e.g. "PFT2"; null when user-added
  chosen: string | null;      // course code the student picked; null = unfilled elective
  pairedWith: string | null;  // id of a slot this must share a subject prefix with (§5.4)
  included: boolean;          // counts toward generation
}
```

Single source of truth. `included` means the same thing for every row. Unchecking a slot
keeps `chosen`, so re-checking restores the choice. Two electives on the same course are
two independent slots.

Deleted outright: `codeStillNeeded`, `withoutUnreferencedCode`, `extraCourseRows`, and the
asymmetric `selected`.

Choosing a curriculum block seeds one slot per block entry: non-elective entries get
`included: true` and `chosen: null` (they resolve through §5); elective entries get
`included: false` until filled. "Add another course" appends an `origin: "added"` slot.

## 5. Offerings — a slot resolves to a *set* of acceptable codes

`lib/offerings.ts` exposes:

```ts
acceptableCodes(slot: Slot, catalog: Catalog, aliases: AliasMap): string[]
sectionsFor(slot: Slot, catalog: Catalog, aliases: AliasMap): Section[]
```

Three rules apply to a slot's `chosen ?? requirement`. They are **not** a precedence chain —
the result is the deduplicated **union** of all three, so a code that matches more than one
rule does not shadow the others:

1. **Exact** — canonical match against a catalog `courseCode`.
2. **Alias** — `data/course-aliases.json` maps a slot to one or more catalog code prefixes,
   for irregular renames the rule cannot infer (`PFT1 → PEPC 10`). Keyed by the slot's
   **`category`** when it has one, falling back to `requirement` (§5.1).
3. **Variant** — a catalog code matches when it is the curriculum code plus a suffix that
   begins with `.` or `(`.

The variant rule is deliberately narrow so it cannot over-match: `MATH 10` does not match
`MATH 100` (remainder `"0"` starts with neither `.` nor `(`), but `PHILO 11` matches
`PHILO 11.03`–`.06` and `NSTP 11` matches `NSTP 11(CWTS)` and `NSTP 11(ROTC)`.

This is correct against the real data: `PHILO 11.03`–`.06` are four *tracks* of one
requirement and `NSTP 11(ROTC)`/`(CWTS)` are a pick-one — a student takes exactly one.

### 5.1 Alias file

Keys are AISIS **requirement categories** where the slot has one, and catNo otherwise.
Values are catalog code prefixes; the variant rule applies on top of each, so `"PEPC 13"`
matches `PEPC 13.03`, `13.15`, and the rest of that family.

```json
{
  "PFT1": ["PEPC 10"],
  "PFT2": ["PEPC 11", "PEPC 12"],
  "PFT3": ["PEPC 13", "PEPC 14", "PEPC 15", "PEPC 16",
           "PEPC 17", "PEPC 18", "PEPC 19"],
  "PFT4": ["PEPC 13", "PEPC 14", "PEPC 15", "PEPC 16",
           "PEPC 17", "PEPC 18", "PEPC 19"],

  "PE1": ["PEPC 10"],
  "PE2": ["PEPC 11", "PEPC 12"],
  "PE3": ["PEPC 13", "PEPC 14", "PEPC 15", "PEPC 16",
          "PEPC 17", "PEPC 18", "PEPC 19"],
  "PE4": ["PEPC 13", "PEPC 14", "PEPC 15", "PEPC 16",
          "PEPC 17", "PEPC 18", "PEPC 19"],

  "NS1A": ["BIO 10.01", "CHEM 10.01", "ENVI 10.01", "PHYS 10.01"],
  "NS1B": ["BIO 10.02", "CHEM 10.02", "ENVI 10.02", "PHYS 10.02"],

  "FLC1": ["FRE 11", "GER 11", "ITA 11", "JPN 11", "KRN 11", "RUSS 11", "SPA 11"],
  "FLC 12": ["FRE 12", "GER 12", "JPN 12", "KRN 12", "SPA 12"]
}
```

Note `KRN`, not `KOR`: `KRN 11`–`14` are the Korean *language* courses, while `KOR 113`/`115`
are upper-level Korean studies. The narrow variant rule (§5) is what keeps `KOR 11` from
quietly swallowing `KOR 113` — the remainder `3` starts with neither `.` nor `(`.

`FLC 12` is keyed by **catNo, not category**: in the 6 programs that require it the category
is `RM1`, which is program-local and therefore not a safe alias key (§5.1).

Each family was derived from the 69-program zero-offering report (§5.3), not guessed:

- **`PE1`–`PE4`** are the older numbering for `PFT1`–`PFT4`, used by 9 programs on
  pre-PATHFit curricula (`PHYED 1`–`4`, `PE 1`–`4`). Same PEPC targets.
- **`NS1A`/`NS1B`** are the Natural Science lecture and lab, in 47 programs. The student
  takes one science; the four departments each offer a `10.01` lecture and a `10.02` lab.
  The two slots are **paired** — see §5.4.
- **`FLC1`** is Foreign Language and Culture, in 49 programs, satisfied by the first course
  of any offered language. `FILI` is deliberately excluded: Filipino is a separate national
  language requirement, not a foreign one.

**Why category, not catNo.** The curriculum carries a `category` per entry — `PFT1`–`PFT4`,
`NP1`/`NP2` (NSTP 11/12), `CPH1` (PHILO 11), `NS1A`/`NS1B` (NatSc lecture/lab), `FLC1`,
`IE1E`. These are AISIS's own requirement identifiers and are stable, whereas `catNo` is a
printed label. Categories also disambiguate slots whose catNo is identical: `RM1` and `RM2`
both print "MATHEMATICS ELECTIVE".

**The PATHFit mapping, verified against both sides.** `PEPC 10` is a single foundational
course (123 sections) → `PFT1`. `PEPC 11` is a *second* foundational tier — "FUNCTIONAL
TRAINING", "FOUNDATIONAL MOVEMENT AND EXERCISE FOR GAMES AND SPORTS" — not an activity
elective, which is why `PFT2` stands apart from `PFT3`/`PFT4`. `PEPC 13`–`19` are the
activity pool (martial arts, dance, aquatics, racquet and board, team sports, recreation),
shared by `PFT3` and `PFT4`. `PEPC 12` is absent from the 2026-1 catalog and is grouped with
`PFT2` on the assumption that it is the adjacent foundational family; it costs nothing today
and is the first thing to re-check if a `PEPC 12` course ever appears.

**Verified across all 69 undergraduate programs** (scraped 2026-07-28). `PFT1`–`PFT4` map to
exactly one catNo each. More decisively, where catNos *drift between programs* the category
does not:

| category | catNos it is printed as |
|---|---|
| `NP1` | `NSTP 11` ×63, `NSTP 1` ×6 |
| `NS1A` | `NatSc 10.01` ×44, `NATSCI 1A` ×3 |
| `FLC1` | `FLC 11` ×52, `FLC` ×6 |
| `CPH1` | `PHILO 11` ×63, `PH 103/PH 104` ×1 |

Keying on catNo would need a separate entry per spelling; keying on category collapses them.
Program-specific categories such as `RM1`–`RM5` are local by nature and are not alias keys.

The file ships with only entries justified against real catalog data. Unknown mappings are
**not guessed** — they surface through §5.3 instead.

### 5.2 Narrowing a multi-code slot

`chosen` is the student's explicit pick and it **overrides automatic resolution**. It needs
no new field, because §5 already resolves `chosen ?? requirement`:

| Slot | `chosen: null` resolves to | after the student picks |
|---|---|---|
| `MATH 10` | `["MATH 10"]` | unchanged — narrowing is a no-op |
| `PHILO 11` (`CPH1`) | the four tracks | `["PHILO 11.05"]` |
| `NSTP 11` (`NP1`) | `(CWTS)`, `(ROTC)` | `["NSTP 11(ROTC)"]` |
| `PATHFit 1` (`PFT1`) | `["PEPC 10"]` | no-op |
| `PATHFit 2` (`PFT2`) | 2 foundational codes | `["PEPC 11.05"]` |
| `PATHFit 3` (`PFT3`) | 23 activity codes | `["PEPC 13.15"]` |
| elective | `[]` — unsatisfiable | `["MATH 101"]` |

Filling an elective and narrowing a requirement are the same operation on the same field.
The difference is only that an unfilled elective resolves to nothing while an un-narrowed
requirement resolves to its full acceptable set, so leaving it alone is a valid choice that
lets the generator optimize.

### 5.3 Zero-offering slots must be loud

The current code silently drops a required course that resolves to nothing
(`resolveCourseCodes` skips `offeredSections === 0`), so a student gets a schedule missing
a requirement with no clear signal.

A zero-offering slot is **excluded from generation, never blocking**. Blocking would leave
a student with no schedule at all because of one unmappable code, which is worse than a
schedule they know is short a course. What changes is that the exclusion becomes loud
instead of silent. An `included` slot resolving to zero sections:

- renders as a warning on the stage, not merely a note in the rail;
- is listed by name in the "why is my schedule incomplete" summary;
- is counted by `validate:data`, which prints every curriculum code in every program that
  resolves to zero offerings in the newest catalog. That report is how the alias file gets
  maintained.

### 5.4 Paired slots — lecture and lab must come from the same science

`NS1A` (lecture) and `NS1B` (lab) are two separate curriculum entries, each resolving to
four codes. Chosen independently, the generator is free to pair a `BIO 10.01` lecture with a
`CHEM 10.02` lab: **12 of the 16 combinations are invalid**, in 47 of 69 programs. This is
the most common shape in the dataset, so it cannot be left to the student to notice.

`Slot` gains an optional link:

```ts
pairedWith: string | null;  // id of a slot this one must agree with
```

Two linked slots must resolve to catalog codes sharing a **subject prefix** — the code up to
its first space. `BIO 10.01` and `BIO 10.02` agree; `BIO 10.01` and `CHEM 10.02` do not. The
generator enforces this as an ordinary constraint during backtracking, alongside time
conflicts (§6).

Pairing is **data, not hardcoded**: `data/course-aliases.json` grows a `pairs` section
listing category pairs, and `seedSlots` links the two slots when both categories appear in
the same block.

```json
"pairs": [["NS1A", "NS1B"]]
```

Narrowing either slot (§5.2) narrows the acceptable set of the other through the same rule,
so a student who picks Chemistry lecture cannot then be given a Biology lab.

### 5.5 `INTACT` is missing from the catalog, and is not an alias problem

`INTACT 11` and `INTACT 12` are required by 59 of 69 programs and match **nothing** in the
2026-1 catalog under any code or title. That is a data-coverage question, not a naming one:
either the course is not offered in this term, or the scraper's 42-department list (from
`tools/departments.mjs`, captured 2026-07-21) is missing the department that teaches it.

No alias entry is invented for it. It surfaces through the §5.3 zero-offering report until
the cause is established, which is the correct handling for "we do not know" — inventing a
target would produce confidently wrong schedules for most of the university.

### 5.6 Pre-assigned courses — the student is given a section, not a choice

Some courses are pre-enlisted: the university assigns the section and the student cannot
pick. `INTACT 11` is the clearest case — 103 sections, codes like `INT-FJ`, `INT-MA1` that
are block identifiers rather than enlistment options, all one-hour single-day meetings with
instructor `TBA`. It is required by 59 of the 69 programs.

Treating those 103 as free choices is wrong twice over. It models a decision the student
does not get to make, and it **multiplies the search space by 103**, so generation hits the
500-candidate cap immediately and every ranking below it becomes arbitrary. This is not
hypothetical: it is what made the existing smoke test's truncation notice fire identically
before and after locking a section.

**Mechanism — no new state.** Pinning is the existing `lockedSections`: a locked section
already pins its slot and bypasses filters (§6). What changes is *where* it can be set. Today
a section can only be locked from the results list, which is useless when the results are the
thing being swamped. The Courses rail gains a section picker for any slot (§11), writing to
the same `lockedSections`.

A slot counts as **pinned** when some entry in `lockedSections` names a section whose course
code is in that slot's acceptable set (§5).

**Before it is pinned**, a pre-assigned slot is *excluded from generation and prompts*:

- it does not contribute candidates, so the search space stays small and rankings stay
  meaningful;
- the slot shows "pre-assigned — enter the section you were given", not the generic
  "not offered this term", because the two mean entirely different things;
- the stage lists it among the classes the displayed schedule does not include, so the week
  is never silently presented as complete.

**Which courses are pre-assigned is data, not a rule.** `data/course-aliases.json` gains:

```json
"preAssigned": ["INTACT 11"]
```

Keyed by category-or-catNo exactly like the alias map (§5.1). It is a policy fact that no
part of the AISIS export states, so it cannot be derived — a heuristic over section counts or
`TBA` instructors would be guessing. The list is small, user-maintained, and affects only
prompting and exclusion; every slot remains pinnable whether or not it is listed.

## 6. Generator

The unit of work changes from *"one section per course code"* to **"one section per slot,
drawn from any of that slot's acceptable codes."**

```ts
generate(catalog: Catalog, slots: ResolvedSlot[], state: UserState): GenerateResult
```

A normal course has one acceptable code and behaves exactly as today. `PHILO 11` has four,
and the generator picks whichever track fits the student's week — the correct behavior, and
it requires no extra clicking.

Backtracking gains one constraint beyond time conflicts: a slot with `pairedWith` must take
a section whose **subject prefix** matches its partner's (§5.4). Checked as each section is
placed, so invalid lecture/lab pairs are pruned rather than generated and filtered.

Otherwise unchanged: ordered by fewest candidates first, `MAX_SCHEDULES = 500` with the
find-one-extra truncation check, locked sections bypass filters and pin their slot,
`timeStatus === "parse-error"` excluded, TBA (no meetings) conflicts with nothing.
Diagnostics keep the per-slot counts, pairwise-conflict list, and n-way flag.

## 7. Ranker — strict priority

Criteria compare **lexicographically**: criterion 1 decides, criterion 2 only breaks ties in
criterion 1, and so on. This matches what the UI's "priority 1, 2, 3…" labels promise; the
current weighted blend (`1, ½, ¼, ⅛…`) lets several low-priority criteria collectively
outvote the top one.

Raw metrics are floats (gap minutes, mean start times), so "tie" is defined with an epsilon
— metrics compare rounded to the whole minute. Without this, criterion 2 would almost never
get to speak. Final tiebreak stays the deterministic schedule id, so ordering is stable.

Metric definitions and the higher-is-better sign convention carry over unchanged.

## 8. Data layer

`lib/db.ts` merges the old `supabase.ts` and `rows.ts`: the `Db` interface, the Supabase
implementation, and the row↔domain mappers in one place, since they change together.

Three review defects fixed here:

1. **`version` / `version_label` join the `SELECT` column lists.** They are read by the row
   mappers but were never requested, so `versionLabel` arrives `undefined` and the program
   picker renders `— undefined`.
2. **The test `Db` stub asserts requested columns** against the row shape it returns. Every
   existing test either injected rows directly or stubbed a `Db` that ignored the `columns`
   argument, which is why the bug above survived a full test suite. This assertion is the
   structural fix, not the column edit.
3. **Load failures surface.** `getTerms`, `getPrograms`, and `loadCommunityRatings` currently
   fail silently via `.catch(() => {})`, leaving an empty program picker with no
   explanation — a deviation from `multi-program-curricula-design.md` §6.2. Each gets
   loading / error / loaded states and an error banner.

## 9. Storage — v3

`UserState.version` bumps to 3; `requiredCourses` and `electiveFills` are replaced by
`slots: Slot[]`. v2 state fails validation and resets with the existing "settings were from
an older version" banner. No migration is written — the selection model changed shape and
the reset path already exists and is tested.

Validation stays strict and total, as today: unknown criteria, malformed protected blocks,
out-of-range ratings, and duplicate entries all reject.

## 10. Module layout

`lib/` stays framework-free and directly testable. Nothing in `lib/` imports from `ui/`.

```
src/
  lib/
    types.ts         domain types
    time.ts          overlap · format (parsing moved to tools/, §2.1)
    course-code.ts   canonicalization
    offerings.ts     NEW — slot → acceptable codes → sections (§5)
    slots.ts         NEW — the selection model (§4), replaces requirements.ts
    generator.ts     backtracking, one section per slot (§6)
    ranker.ts        lexicographic comparison (§7)
    profs.ts         rating lookup + merge
    storage.ts       v3 validation (§9)
    db.ts            Supabase boundary + row mappers (§8)
    catalog.ts       term list, catalog read
    curriculum.ts    program list, program read
  ui/
    App.tsx          three-zone shell
    setup/           Program · Semester · Courses · Preferences (accordion rail)
    stage/           WeekGrid · Pager · SectionChips · Diagnostics · EmptyStage
    candidates/      CandidateList
```

## 11. UI — the cockpit

Layout, palette, type, and copy register are as specified in
`2026-07-21-cockpit-ui-redesign-design.md` §2–3 and are not restated here. Three zones:
left setup rail (accordion, one section open, headers showing completed state), center
stage (candidate pager `◀ 02 / 41 ▶`, weekly grid as hero, section chips carrying
Lock / Mark full / Exclude), right candidates rail (ranked list, click to jump).

Four corrections to that spec, from the review and from §5:

- **Day bounds derive from the data.** The grid hard-stops at 9:00 PM; `ITMGT 20.51 QRF`
  runs to 9:30 and overflows its column. Bounds come from the schedule's own extremes.
- **Multi-code slots show which code the current candidate used.** A `PHILO 11` slot may
  resolve to `.03` in one candidate and `.05` in the next. The chip carries the actual code.
- **Zero-offering slots warn on the stage** (§5.3), not only in the rail.
- **The Courses rail gains a narrowing control** (§5.2). Any slot resolving to more than one
  code shows a picker listing those codes with their titles — `PATHFit 3` lists Arnis, Tai
  Chi, Badminton and the rest by name, not by code. Its default option is explicit ("any —
  let the scheduler choose"), so leaving it open reads as a decision rather than an
  oversight. Electives keep the catalog-wide search they have today, since their acceptable
  set is unbounded.
- **The Courses rail gains a section picker** (§5.6). Any slot can be pinned to a specific
  section — "I already have this one" — writing to `lockedSections`. Pre-assigned slots show
  it prominently with the "enter the section you were given" prompt; every other slot offers
  it quietly, since locking is currently reachable only from the results list and that is
  the wrong place when the results are the thing being drowned.

## 12. Testing

The existing discipline is kept — it is the reason the review had solid ground. `lib/` is
tested directly; components are tested through Testing Library; the end-to-end smoke test
runs the real 2026-1 catalog through the whole flow.

Additions targeting the gaps that let real bugs through:

- **Column-asserting `Db` stub** (§8.2) — the structural fix for the `version_label` class
  of bug.
- **Generator property test** — every emitted schedule is pairwise conflict-free and
  contains exactly one section per *satisfiable* slot (included, and resolving to at least
  one section after filters), and none for the rest.
- **`validate:data` gains**: every catalog section carries `timeStatus`; every alias target
  resolves to at least one section in the newest catalog; the zero-offering report of §5.3.
- **Offerings unit tests** against the real 2026-1 catalog, with counts verified while
  writing this spec: `PHILO 11` → 4 tracks, `NSTP 11` → 2, `MATH 10` → 1 (the
  `MATH 100`/`MATH 101` over-match guard), `PFT1` → 1, `PFT2` → 2, `PFT3` → 23,
  `NS1A` → 4, `FLC1` → 7. Plus category-over-catNo key precedence, and narrowing
  (`chosen` set → exactly that one code, §5.2).
- **Paired-slot tests** (§5.4): a linked `NS1A`/`NS1B` pair never yields a schedule whose
  lecture and lab have different subject prefixes; narrowing the lecture constrains the lab;
  an unpaired slot is unaffected.
- **Pre-assigned tests** (§5.6): an unpinned `INTACT 11` slot contributes no candidates and
  is reported as pre-assigned rather than not-offered; pinning a section makes it contribute
  exactly that section; the candidate count with `INTACT 11` in the block does not collapse
  into truncation — the regression that the old smoke test was silently absorbing.
- **Cross-program regression** over all 69 curricula: every program seeds without throwing,
  every `slotId` is unique within a program, and the resolved-requirement percentage does
  not fall below its recorded baseline — so an alias or rule edit that helps one program
  while breaking others fails the suite.

## 13. Data refresh — operational, does not block the rewrite

| Step | Needs | Fixes |
|---|---|---|
| ~~Re-scrape `2026-1`~~ | — | **Done 2026-07-28.** 3,781 sections, all carrying `timeStatus`; `parse-error` 112 → 0 after two parser fixes (§2.1) |
| ~~`scrape:curricula`~~ | — | **Done 2026-07-28.** 1 program → **69** (undergraduate only; 164 graduate/non-degree skipped) |
| `push:data` | `SUPABASE_SERVICE_ROLE_KEY` (user) | **Still outstanding.** `version`/`version_label` are `null` in the deployed rows, and the DB still holds 1 program and the stale catalog. The app reads only from Supabase, so none of the above reaches users until this runs |

The first can run during implementation. The other two are user-triggered and the rewrite
does not depend on them.

## 14. Open decision: `TUTORIAL 0000-0000`

101 sections in 2026-1 print their time as `TUTORIAL 0000-0000` — graduate tutorials, thesis
and special-topics slots with no fixed meeting. Today they resolve to `parse-error` and are
excluded from generation, so a student who needs `BIO 290` can never receive a schedule
containing it; the Results diagnostics say "0 of 1 section(s) usable".

The two options:

- **Treat `0000-0000` as TBA.** Those sections become schedulable with no meeting time,
  exactly like the 667 sections already marked `tba`. A grad student can plan around a
  tutorial. The cost is that a genuinely corrupt `0000-0000` would be silently accepted.
- **Leave as `parse-error`.** Conservative; nothing schedules that the app cannot verify.
  The cost is that 101 real, enlistable sections stay invisible to the generator.

The recommendation is the first: the string is `TUTORIAL`, not a mangled time, so this is a
recognised AISIS idiom rather than bad data — and the app's own `tba` handling already
covers "real section, no fixed time". This is a behaviour change, so it is the user's call
and is not implemented until they make it.

## 15. Risks

- **The alias file covers only what has been confirmed.** `PATHFit → PEPC` is mapped (§5.1);
  other irregular renames need domain knowledge that is not in the repo. §5.3 makes the gaps
  visible rather than silent, which is the honest handling; the file fills in over time.
- **`PFT3` and `PFT4` share one activity pool.** They are not distinguished, so a student
  could in principle take the same activity family for both. AISIS rejects an invalid
  enlistment; the app cannot catch it, and the README should say so.
- ~~Category universality is unverified.~~ **Resolved 2026-07-28** by scraping all 69
  undergraduate programs: categories are stable where catNos drift (§5.1). Category keying
  is now the better-evidenced choice, not the assumption.
- **Coverage, not naming, is the remaining gap.** Only 61.9% of the 4,010 non-elective
  requirement entries across 69 programs resolve to a section offered in 2026-1. Most of the
  remainder is legitimate (upper-year courses not offered this term, old curriculum
  versions), but `INTACT 11`/`12` alone affects 59 programs and is unexplained (§5.5). The
  §5.3 report is the working list; it is expected to shrink, not reach zero.

**Scope: undergraduate programs.** Graduate curricula (MA/MS/PhD) are not a target. They may
be scraped and stored, but unmapped codes or parse warnings from a masters program are not
release blockers and no alias entries are written for them. The IPS-driven flow is built
around the undergraduate year/semester block structure.
- **Strict priority ranking changes results.** Schedules that ranked well by blending will
  reorder. This is intended, but it is a visible behavior change.
- **v3 resets saved state.** Every existing user loses their selections once. Acceptable:
  the banner exists, and the current stored selections reference a model that no longer
  exists.
