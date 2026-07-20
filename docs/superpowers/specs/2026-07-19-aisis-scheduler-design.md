# AISIS Enlistment Scheduler — Design Spec

**Date:** 2026-07-19
**Status:** Approved design, pre-implementation
**Author:** Prince (with Claude)

## 1. Overview

A web app that helps Ateneo students find the best conflict-free combination of class
sections during enlistment. The student picks the courses they need this semester, sets
ranking preferences, and the app generates and ranks every valid schedule, with live
"section is full" re-ranking during enlistment itself.

Prior art: https://schedule.alexi.life/ (manual schedule builder). This app's
differentiator is **automatic generation and ranking** of schedules rather than manual
assembly, plus professor-quality-aware ranking.

### Goals

- Generate all conflict-free schedules from the user's chosen courses and rank them by
  user-selected criteria (default: compact days).
- Work for Prince + a few friends immediately; be structurally ready to scale to more
  users later without a rewrite.
- Zero cost to run; zero accounts; nothing personal leaves the browser.
- Survive enlistment week: when a section fills up, one click re-ranks around it.

### Non-goals (v1)

- IPS parsing / auto-suggesting which courses to take (user picks courses manually).
- Accounts, sync across devices, or any backend.
- Automated scraping of the "Ateneo Profs to Pick" Facebook group (see §5).
- Actually enlisting for the user in AISIS. This is a planning tool only.

## 2. Users & Scaling Posture

- **Now:** Prince and a few friends, via a shared URL.
- **Later:** potentially all Ateneans. The design isolates everything that would need to
  change behind one data-layer module (§3), so scaling is a hosting/data problem, not a
  rewrite.

## 3. Architecture (Approach 3: static now, backend-shaped)

Single-page React app (Vite + TypeScript), deployed as a static site (Vercel/Netlify).
No backend, no accounts.

```
Browser (React SPA)
├── UI screens
│   ├── Import/Admin page   (catalog + ratings import; maintainer-only in practice)
│   ├── Course picker       (choose this sem's courses from the catalog)
│   ├── Preferences         (ranking criteria, filters, protected time blocks)
│   └── Results             (ranked schedules, grid view, lock/mark-full)
├── Pure logic modules (framework-free, unit-tested)
│   ├── parser.ts           AISIS table text/HTML → Section[]
│   ├── generator.ts        Section[] × chosen courses → conflict-free Schedule[]
│   └── ranker.ts           Schedule[] × preferences → scored, ordered results
├── Data layer (the swap point)
│   └── catalog.ts          getCatalog(semester), getProfRatings()
│                           reads bundled JSON now; same interface backed by an API later
└── localStorage            chosen courses, preferences, locked sections,
                            sections marked full, personal prof ratings
```

**Rules:**

- `parser`, `generator`, `ranker` are pure functions with no React/DOM imports.
- All catalog/ratings reads go through `catalog.ts`. Nothing else touches the JSON files.
- All user-specific state lives in `localStorage` under a versioned schema.

## 4. Catalog Acquisition (AISIS data)

AISIS has no API and shows class schedules **per department**, so whole-catalog
copy-paste is impractical. Two ingestion paths, both feeding the same parser:

### 4.1 Primary: export snippet (chosen: "option 2")

A JavaScript snippet (run from the browser DevTools console, or as a bookmarklet) while
the maintainer is **logged into AISIS in their own session**:

1. From the class-schedule page, enumerate the department list.
2. Fetch each department's schedule table sequentially (small delay between requests —
   polite, low volume, read-only, within the user's own authenticated session).
3. Parse rows client-side and trigger a download of `catalog-<semester>.json`.

The maintainer commits that JSON to the repo; the static site redeploys; every user has
the new semester's data. Friends never import anything.

Notes:

- The snippet handles **auth by not handling it**: it runs inside the user's already
  logged-in browser session. No credentials are ever stored or transmitted by the app.
- The snippet is versioned in this repo (`tools/aisis-export.js`) so it can be fixed
  quickly when AISIS markup changes.

### 4.2 Fallback: paste import

The Import page accepts a pasted AISIS schedule table (one department at a time) and
merges it into the working catalog. This is the safety net for the week AISIS changes
its markup and breaks the snippet.

### 4.3 Catalog freshness

The catalog JSON records `exportedAt`. The UI shows a staleness banner when it exceeds
~30 days. Intra-day changes during enlistment (sections filling up) are handled
client-side per user via "mark as full" (§7), not by re-exporting.

## 5. Professor Ratings ("Ateneo Profs to Pick")

The Facebook group is login-walled, private, and scraping it would violate Facebook's
ToS — so **no automated scraping**. Instead:

- A **community-maintained ratings file** (`prof-ratings.json`) curated manually from
  group feedback, committed to the repo like the catalog. Simple schema:
  professor name → rating (1–5) + optional one-line note + source date.
- **Personal overrides:** any user can rate professors in-app; personal ratings live in
  localStorage and take precedence over the community file for that user.
- The ranker's "preferred professors" criterion consumes the merged view
  (personal overrides > community file > unrated).

Name matching between AISIS professor strings and ratings entries is normalized
(case, punctuation, "LASTNAME, FIRSTNAME" vs "Firstname Lastname") with fuzzy fallback;
unmatched professors simply score neutral.

## 6. Data Model

```ts
// Catalog (bundled JSON, produced by parser)
interface Catalog {
  semester: string;          // e.g. "2026-1"
  exportedAt: string;        // ISO timestamp
  sections: Section[];
  warnings: string[];        // rows the parser skipped/flagged
}

interface Section {
  courseCode: string;        // "PHILO 11"
  sectionCode: string;       // "A", "B2"
  title: string;
  units: number;
  instructor: string;        // as printed by AISIS
  meetings: Meeting[];       // empty ⇒ TBA; excluded from conflict math, flagged in UI
  room: string;
  remarks: string;           // free-text AISIS remarks
  raw: string;               // original row text, for debugging/fixtures
}

interface Meeting {
  days: Day[];               // e.g. ["M","TH"] — AISIS "M-TH" style pairs expanded
  start: number;             // minutes from midnight
  end: number;
}
// A section may have multiple meetings (lecture + lab).

// Community ratings (bundled JSON)
interface ProfRating { name: string; rating: 1|2|3|4|5; note?: string; asOf?: string; }

// User state (localStorage, versioned)
interface UserState {
  version: number;
  semester: string;
  chosenCourses: string[];           // course codes
  lockedSections: string[];          // sectionKey = courseCode + sectionCode
  fullSections: string[];            // marked-as-full during enlistment
  preferences: Preferences;
  personalRatings: ProfRating[];
}

interface Preferences {
  criteria: RankCriterion[];         // ordered/weighted; default: ["compactDays"]
  earliestStart?: number;            // e.g. no classes before 09:00
  latestEnd?: number;
  protectedBlocks: Meeting[];        // times that must stay free (org meetings, commute)
  excludedSections: string[];
}
```

## 7. Core Logic

### 7.1 Parser (`parser.ts`)

- Input: AISIS table text/HTML (from snippet or paste). Output: `{ sections, warnings }`.
- **Never throws.** Unparseable rows become warnings shown at import time; sections with
  unparseable time strings enter the catalog as TBA-like (visible, excluded from
  conflict math).
- Handles: multi-meeting rows (lecture+lab), day-pair notation, TBA, room/remarks noise.
- **Open item:** built against best-guess fixtures until Prince supplies a real copied
  AISIS table; that sample becomes the canonical test fixture (§10).

### 7.2 Generator (`generator.ts`)

- For the chosen courses, take the cartesian product of each course's sections with
  **early conflict pruning** (course-by-course backtracking, not full product then
  filter). With 6–8 courses × ~2–10 sections each, this is instant in-browser.
- Respects: locked sections (fixed choices), marked-full and excluded sections
  (removed), time-window filters and protected blocks (violating sections removed
  up-front).
- **Zero-result diagnostics:** when nothing survives, report *why* — which course pair
  has no compatible sections, or which single constraint (e.g. "no classes before 9")
  eliminated the last option — so the user always gets an actionable next step, never a
  dead end.

### 7.3 Ranker (`ranker.ts`)

- Scores each valid schedule on user-selected criteria (weighted sum, deterministic
  tie-breaking). Criteria for v1:
  - **Compact days** *(default)* — minimize total gap time between classes each day.
  - **Fewest days on campus** — maximize free days.
  - **Late starts / early ends** — respect body-clock preferences beyond hard filters.
  - **Preferred professors** — merged prof ratings (§5).
- User picks/weights criteria on the Preferences screen; default preset is compact days.

### 7.4 Enlistment-day loop

Results screen → user attempts enlistment in AISIS → a section is gone → one click
"mark as full" → generator/ranker instantly re-rank remaining schedules. Locks let the
user pin sections they successfully got.

## 8. UI Screens

1. **Import/Admin** — paste box + snippet instructions; shows parse warnings; downloads
   catalog JSON. Used ~once a semester by the maintainer; hidden from the main flow.
2. **Course picker** — searchable list from the catalog; user ticks this sem's courses.
3. **Preferences** — criteria selection/weighting, time-window filters, protected
   blocks, prof ratings editor.
4. **Results** — ranked list of schedules; each renders as a weekly grid; per-section
   controls: lock / mark full / exclude; staleness banner; zero-result diagnostic view.

## 9. Error Handling

- **Catalog is untrusted input:** parser warnings surfaced at import, never silent
  drops or crashes.
- **Stale catalog:** banner past ~30 days.
- **localStorage corruption/schema drift:** validate on load; invalid → reset to
  defaults with a notice; `version` field enables future migrations.
- **Snippet breakage:** paste-import fallback + explicit "AISIS layout changed" error.
- **Zero results:** always the diagnostic screen, never a dead end.

## 10. Testing

- **Unit tests (bulk):** parser (real AISIS fixtures incl. lecture+lab, TBA, malformed
  rows), generator (conflict detection, locks, filters, zero-result diagnostics),
  ranker (each criterion orders known fixtures correctly; deterministic ties).
- **Fixtures:** placeholder fixtures clearly marked until a real AISIS sample replaces
  them.
- **One end-to-end smoke test:** load → pick courses → generate → mark full → re-rank.
- Pure-function modules run in plain Vitest/CI; only the smoke test needs a browser.

## 11. Scaling Path & Future Features (later, not now)

- **Saved schedules:** name and save generated schedules to localStorage ("Plan A",
  "Plan B backup") and reopen them later — useful for pre-saving fallback plans before
  enlistment day. (Note: "keep generating" and "lock sections" are already v1 — the
  ranked results list is exhaustive, and locks are in §7.2/§7.4.)
- Swap `catalog.ts` JSON reads for an API + DB (instant catalog updates, no redeploys).
- Optional accounts/sync; crowdsourced live "section full" signals; multiple curricula;
  IPS parsing as an add-on.
- None of these require changes to parser/generator/ranker or the UI's data contracts.

## 12. Open Items

1. Real AISIS schedule-table sample from Prince → canonical parser fixture (§7.1).
2. Seed `prof-ratings.json` (manual curation from the Facebook group).
3. Project name (working name: `aisis-scheduler`).
