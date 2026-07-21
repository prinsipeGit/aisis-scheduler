# Single-Page Cockpit UI Redesign — Design

Date: 2026-07-21
Status: approved direction (pending spec review)
Companion mockups: `.superpowers/brainstorm/` (layout option C, visual style B)
Related: `2026-07-21-multi-program-curricula-design.md` (Supabase/async data foundation)

## 1. Goal

Replace the five-tab flow with a single-page, three-zone "cockpit". The schedule stage is the
center of the app: empty until program + curriculum block + term are chosen, then always showing
one generated schedule at a time with previous/next navigation. No routing, no page changes —
everything manipulable in place, results re-rank instantly as today.

Non-goals: no change to scheduling logic (`generator`, `ranker`, `requirements`), storage shape
(`UserState` v2), or the data-module interfaces from the companion spec.

## 2. Layout — three zones

```
┌──────────────────────────────────────────────────────────────┐
│ header: wordmark · term select · units badge                 │
├───────────┬──────────────────────────────────┬───────────────┤
│ SETUP     │            STAGE                 │ CANDIDATES    │
│ (left     │  ◀  [ 02 / 41 ]  ▶   score 0.91  │ ranked list   │
│  rail)    │  ┌────────────────────────────┐  │ #1  0.94      │
│ Program   │  │      weekly grid           │  │ #2  0.91  ◂   │
│ Semester  │  │   (color-coded blocks)     │  │ #3  0.87      │
│ Courses   │  └────────────────────────────┘  │ …             │
│ Prefs     │  section chips: lock/full/excl.  │               │
└───────────┴──────────────────────────────────┴───────────────┘
```

- **Left rail — Setup** (~300 px): four collapsible sections replacing the first, second, third
  and fifth tabs: Program (search + select), Semester (block + term), Courses (requirement rows,
  elective fills, add-course search), Preferences (criteria, time limits, protected blocks,
  ratings, excluded/full lists). One section open at a time (accordion); each section header
  shows its completed state ("BS AMDSc · 2024", "22 units · 7 courses").
- **Center — Stage**: the pager (§4) plus the weekly `ScheduleGrid`, enlarged as the app's
  hero. Under the grid, one chip per section in the current schedule with the existing
  Lock / Mark full / Exclude actions. Diagnostics (no-schedule case) render on the stage.
- **Right rail — Candidates** (~240 px): the ranked list, one row per candidate (rank, score,
  days-on-campus glyph). Click a row to jump the stage to it; the current row is highlighted
  and kept scrolled into view. Replaces "Show more" paging — the list virtualizes/scrolls.

**Empty states (stage is an invitation to act):** before setup is complete the stage shows a
faint empty week grid and a 3-step checklist (Pick your program → Pick your semester → Review
courses), each step linking to (opening) the matching rail section, checking off as completed.
The candidates rail shows nothing but a quiet "Schedules appear here".

## 3. Visual identity — "Block Poster"

The timetable is the brand: course blocks in saturated hues on a calm, cool canvas.

- **Palette**: canvas `#EEF1F6`; card/surface `#FFFFFF`; ink `#1B2233`; muted `#8C96AA`;
  primary `#2F6DF6`. Course-block hues (assigned deterministically per course code, stable
  across candidates): `#2F6DF6` blue, `#F6A23B` amber, `#2FBF8F` green, `#E15B8D` pink,
  `#7A5AF8` violet, `#22B8CF` teal. White text on blocks; each block shows code, time, room.
- **Type**: display — Archivo Black (self-hosted via `@fontsource`, no CDN) for the wordmark,
  pager counter, and zone headings, used sparingly; body/UI — Inter with
  `font-variant-numeric: tabular-nums` for times, units, and scores. No serif, no mono.
- **Surfaces**: white cards, 12 px radius, soft single-layer shadow, generous whitespace.
  No hairline-rule newspaper styling, no dark mode in v1.
- **Signature element**: the split-flap-style pager counter — oversized `02 ⁄ 41` in Archivo
  Black; digits tick with a brief flap/slide animation when navigating. This is the one loud
  element; everything else stays quiet.
- **Copy register**: sentence case, plain verbs, user-side vocabulary ("Pick your program",
  "No schedule fits — loosen a time limit or swap a course"). Buttons keep their names through
  the flow (Lock → Locked chip).

## 4. Stage navigation

- ◀ ▶ buttons flank the counter; **← / → arrow keys** work globally (except when a text input
  is focused). Buttons disable at the ends — no wraparound (position awareness beats surprise).
- Counter is `aria-live="polite"` ("Schedule 2 of 41, score 0.91"). Buttons have proper labels;
  candidate rows are buttons.
- Current index resets to 1 whenever the candidate set changes (same triggers as today's
  `setShown` reset). Truncation notice ("Search hit the 500-schedule limit…") appears as a
  banner above the counter.
- Locking/excluding/marking-full re-generates as today; the stage stays on the nearest
  equivalent candidate when possible (match by schedule id, else reset to 1).

## 5. Responsive behavior

- **≥ 1100 px**: three zones side by side.
- **740–1100 px**: candidates rail collapses into a horizontal, scrollable strip of rank chips
  directly under the pager; setup rail stays.
- **< 740 px (mobile)**: single column — header, setup accordion (collapsed by default once
  complete), stage, candidate strip. Pager buttons get thumb-sized; arrow keys still work.
- Quality floor: visible keyboard focus everywhere, `prefers-reduced-motion` disables the flap
  animation (counter just swaps), grid scrolls inside its own container, no horizontal page
  scroll at any width.

## 6. Component mapping

| today | becomes |
|---|---|
| `App.tsx` tabs + notice stack | `App.tsx` cockpit shell: header, three zones, banners float above stage |
| `ProgramPicker` | Setup rail §Program (same logic, restyled) |
| `SemesterPicker` | Setup rail §Semester |
| `CourseRequirements` | Setup rail §Courses |
| `PreferencesPanel` | Setup rail §Preferences |
| `Results` | splits: `Stage` (pager + grid + section chips + diagnostics) and `CandidateList` (right rail); generation/ranking memos move to a `useSchedules` hook shared by both |
| `ScheduleGrid` | enlarged, color-coded blocks (hue by course code), otherwise same math |
| `index.css` | replaced by the Block Poster token system (CSS custom properties) |

State stays lifted in `App` exactly as today (`UserState` + `onChange`); no new state library.

## 7. Testing

- Component tests updated for the new structure; the pure-logic suites are untouched.
- New tests: pager next/prev/disabled-at-ends, keyboard navigation (and its suppression while
  typing in inputs), reset-to-1 on candidate-set change, candidate-row jump, empty-state
  checklist progression, per-course hue stability, reduced-motion fallback (class presence).
- The existing smoke test is rewritten for the cockpit flow (same real-catalog scenario:
  program → semester → courses → stage shows candidates → lock → re-rank).

## 8. Sequencing

Implemented as its own phase **after** the Supabase read-path swap (companion spec §9 phases
1–2) so components are rebuilt once, on the async foundation — and **before/parallel to** the
curricula scraper, which is independent of the UI. Font packages (`@fontsource/archivo-black`,
`@fontsource/inter`) are the only new runtime dependencies.
