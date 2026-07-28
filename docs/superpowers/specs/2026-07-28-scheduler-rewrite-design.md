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

### 2.1 Branch base

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
  chosen: string | null;      // course code the student picked; null = unfilled elective
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
2. **Alias** — `data/course-aliases.json` maps a curriculum code to one or more catalog
   code prefixes, for irregular renames the rule cannot infer (`PATHFit 1 → PEPC …`).
3. **Variant** — a catalog code matches when it is the curriculum code plus a suffix that
   begins with `.` or `(`.

The variant rule is deliberately narrow so it cannot over-match: `MATH 10` does not match
`MATH 100` (remainder `"0"` starts with neither `.` nor `(`), but `PHILO 11` matches
`PHILO 11.03`–`.06` and `NSTP 11` matches `NSTP 11(CWTS)` and `NSTP 11(ROTC)`.

This is correct against the real data: `PHILO 11.03`–`.06` are four *tracks* of one
requirement and `NSTP 11(ROTC)`/`(CWTS)` are a pick-one — a student takes exactly one.

### 5.1 Alias file

```json
{
  "PATHFit 1": ["PEPC 10"]
}
```

Values are catalog code prefixes; the variant rule applies on top of each. The file ships
with only entries that can be justified against real catalog data. Unknown mappings are
**not guessed** — they surface through §5.2 instead.

### 5.2 Zero-offering slots must be loud

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

## 6. Generator

The unit of work changes from *"one section per course code"* to **"one section per slot,
drawn from any of that slot's acceptable codes."**

```ts
generate(catalog: Catalog, slots: ResolvedSlot[], state: UserState): GenerateResult
```

A normal course has one acceptable code and behaves exactly as today. `PHILO 11` has four,
and the generator picks whichever track fits the student's week — the correct behavior, and
it requires no extra clicking.

Otherwise unchanged: backtracking ordered by fewest candidates first, `MAX_SCHEDULES = 500`
with the find-one-extra truncation check, locked sections bypass filters and pin their
slot, `timeStatus === "parse-error"` excluded, TBA (no meetings) conflicts with nothing.
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
    time.ts          parse · format · overlap
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

Three corrections to that spec, from the review and from §5:

- **Day bounds derive from the data.** The grid hard-stops at 9:00 PM; `ITMGT 20.51 QRF`
  runs to 9:30 and overflows its column. Bounds come from the schedule's own extremes.
- **Multi-code slots show which code the current candidate used.** A `PHILO 11` slot may
  resolve to `.03` in one candidate and `.05` in the next. The chip carries the actual code.
- **Zero-offering slots warn on the stage** (§5.2), not only in the rail.

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
  resolves to at least one section in the newest catalog; the zero-offering report of §5.2.
- **Offerings unit tests** against the real catalog for the three known shapes (`PHILO 11`
  → 4 codes, `NSTP 11` → 2, `MATH 10` → 1) plus the `MATH 10` / `MATH 100` over-match guard.

## 13. Data refresh — operational, does not block the rewrite

| Step | Needs | Fixes |
|---|---|---|
| Re-scrape `2026-1` | nothing; public endpoint | All 3,743 sections currently lack `timeStatus` and carry raw `~` remarks — the catalog predates both parser fixes, so the parse-error guard is inert on production data |
| `scrape:curricula` | AISIS session cookie (user) | **1 program → ~233.** The app is currently useful only to BS AMDSc students |
| `push:data` | `SUPABASE_SERVICE_ROLE_KEY` (user) | `version`/`version_label` are `null` in the deployed rows; publishes the above |

The first can run during implementation. The other two are user-triggered and the rewrite
does not depend on them.

## 14. Risks

- **The alias file starts nearly empty.** `PATHFit → PEPC` and any similar renames need
  domain knowledge that is not in the repo. §5.2 makes the gaps visible rather than silent,
  which is the honest handling; the file fills in over time.
- **Strict priority ranking changes results.** Schedules that ranked well by blending will
  reorder. This is intended, but it is a visible behavior change.
- **v3 resets saved state.** Every existing user loses their selections once. Acceptable:
  the banner exists, and the current stored selections reference a model that no longer
  exists.
