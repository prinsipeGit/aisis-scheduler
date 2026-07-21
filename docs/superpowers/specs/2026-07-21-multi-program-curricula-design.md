# Multi-Program Curricula — Design

Date: 2026-07-21
Status: approved (pending spec review)
Builds on: `2026-07-21-ips-driven-scheduler-design.md` (esp. §2.2 for the J_VOFC.do page layout)

## 1. Goal

Cover every program in the AISIS **Official Curriculum** dropdown (~250 programs), not just the
hand-transcribed `BS AMDSc-M DSc` 2024. Import the **latest version-year per program** via a
repeatable, cookie-based bulk scraper the user runs locally. The app lazy-loads one curriculum
at a time, mirroring the existing catalog pattern.

Non-goals:
- Importing every historical version-year of each program (latest only, per user decision).
- Supabase or any remote data source (spec §7 of the v2 design still defers this).
- Automating the AISIS login in any form.

## 2. Data acquisition — `tools/scrape-curricula.mjs`

New script, run as `npm run scrape:curricula`.

### 2.1 Session handling (security posture)

`J_VOFC.do` is behind the student login. The tool:
- Reads the user's session cookie from the **`AISIS_COOKIE` env var only**. Never a CLI argument
  (visible in `ps`), never prompted interactively, never written to disk or logs.
- The README documents the copy-from-DevTools procedure and states the cookie is held in memory
  for the duration of the run only.
- README's tooling-credential rule is amended: *credentials* (username/password) are never
  handled by any tool in this repo; a *temporary session token supplied by the user via env var*
  is accepted by this one tool, held only in memory.
- If the cookie is missing or the response looks like the login page, abort immediately with a
  clear message — do not retry.

### 2.2 Program discovery

- GET `J_VOFC.do` with the cookie; parse the program `<select>` out of the live form HTML
  (field/option names are read from the page, not hardcoded).
- Option labels follow `(CODE) NAME(Ver Sem N, Ver Year YYYY)`. Parse code, name, version year.
- Group options by program code; keep only the **highest version year** per code.

### 2.3 Fetch loop

- POST per selected program with the form's own field names, `Cookie` header attached.
- 1500 ms politeness delay between requests (same as `scrape-schedule.mjs`); ~250 requests ≈ 7 min.
- Per-program failures (HTTP error, unparseable page) are warnings, not aborts.

### 2.4 Page parsing

Structure per the v2 spec §2.2: **Year** heading → **Term** heading → 5-column table
(Cat No · Course Title · Units · Prerequisites · Category), total units in the table header.

- Each printed block is handled independently (known quirk: mislabeled year headers such as a
  "Fourth Year" block printed under "Third Year"/"Fifth Year" — transcribe as printed).
- `prerequisites`: split on commas, trimmed; blank → `[]`. `units` may be 0.
- Elective detection: an entry is `isElective: true` when its Cat No **or** title matches
  `/ELECTIVE/i`, or its Cat No matches `/^IE \d/`. `IE`-pattern slots additionally get
  `electiveDept: "**IE**"`. Everything else imports as non-elective; entries whose Cat No looks
  suspicious (e.g. contains no digit and is not a detected elective) are listed in a run-end
  warnings summary for manual eyeballing.
- Output shape: exactly the existing `Program` type (`blocks[]` with `key: "Year|Term"`,
  `entries[]` with `slotId: "Year|Term#index"`), so `curriculum.ts` consumers are unchanged.

### 2.5 Output and safety rails

- Program id: slugified `CODE-YEAR` — non-alphanumeric runs in the code become `-`
  (e.g. `BS AMDSc-M DSc` + 2024 → `BS-AMDSc-M-DSc-2024`).
- Writes one file per program: `src/data/curricula/<id>.json`, plus regenerates
  `src/data/curricula/index.json` containing `ProgramSummary[]` (id, code, name, versionYear).
- Atomic writes (`.tmp` + rename), like the schedule scraper.
- Refuses to write anything when the run is suspicious — zero programs parsed, or fewer than
  `max(10, 20%)` of discovered programs parsed successfully — unless `--force`.
- Existing files for programs absent from this run are left in place (a partial rerun never
  deletes data); the index is regenerated from the files present on disk, not from the run.

## 3. App changes

### 3.1 `src/lib/curriculum.ts`

Remains the ONLY module that reads curriculum JSON.
- `getPrograms(): ProgramSummary[]` — static import of `curricula/index.json`.
- `loadProgram(id): Promise<Program>` — `import.meta.glob("../data/curricula/*.json")`, keyed by
  id; throws `ProgramUnavailableError` (message: run `npm run scrape:curricula`) when missing.
- `getBlock(program, blockKey)` unchanged. `getCurriculum()` (sync) is removed.

### 3.2 Consumers

- `App.tsx` gains a program-loading effect symmetrical to the catalog effect (cancelled-flag,
  error banner, `program === null` while loading). It already memoizes `program`/`block`; those
  now come from the effect and are passed down as today.
- `Results.tsx` stops importing `curriculum.ts`; it receives `block` as a prop from `App`
  (it already receives `catalog`, `state`, `ratings`). Its zero-block fallback path is kept.
- No storage-shape change; `UserState.version` stays 2. A saved `programId` using the old
  `BS-AMDSc-2024` id will no longer resolve → the app behaves as "no program chosen" and the
  user re-picks once. All other saved state survives.

### 3.3 Seed migration (works before any scrape)

The hand-transcribed `curriculum-BS-AMDSc-2024.json` is moved (content unchanged except
`id`) to `src/data/curricula/BS-AMDSc-M-DSc-2024.json`, and an initial `index.json` with that
single entry is committed. The old file path is deleted.

## 4. Validation — `tools/validate-data.mjs`

Loops every curriculum in `index.json` instead of the one hardcoded file:
- index entries ↔ files on disk agree, ids unique, block keys unique per program,
  slotIds unique per program, `totalUnits` equals the sum of entry units (report-only, AISIS
  sometimes disagrees with itself), units are finite ≥ 0.
- The existing required-courses-vs-catalog offering report runs for every program but stays
  informational (non-fatal), as today.

## 5. Testing (TDD throughout)

- **Curriculum page parser**: fixture-driven tests from a real saved `J_VOFC.do` HTML page.
  A real page (user-provided save, or captured on the first cookie run) is reduced to a
  committed fixture, like `fixtures/aisis-real.ts`. Synthetic edge fixtures for: elective
  placeholders (`FREE ELECTIVE`, `MATHEMATICS ELECTIVE`, `IE 1`), 0-unit rows, blank/multi
  prerequisites, the mislabeled-year quirk, login-page-instead-of-data detection.
- **Dropdown label parser**: `(CODE) NAME(Ver Sem 1, Ver Year YYYY)` variants, latest-year
  grouping.
- **curriculum.ts**: index loading, `loadProgram` success + `ProgramUnavailableError`.
- **App/Results**: async program loading states (loading, error banner, loaded), Results with
  `block` as a prop, old-programId graceful fallback.
- Scraper network loop itself is not unit-tested (same stance as `scrape-schedule.mjs`);
  everything parseable is extracted into pure, tested functions.

## 6. Constraints and follow-ups

- The scraper can only be executed by the user (their session). Final verification step of the
  implementation plan: user runs `AISIS_COOKIE=... npm run scrape:curricula`, then
  `npm run validate:data`, and we review warnings together before committing the data.
- Until that run, the app ships with the single migrated BS AMDSc 2024 curriculum and is fully
  functional.
- Fixture capture for §5 needs one real curriculum page early in implementation; the parser
  tasks are ordered after that capture.
