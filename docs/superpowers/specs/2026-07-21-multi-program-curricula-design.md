# Multi-Program Curricula + Supabase Serving Layer — Design

Date: 2026-07-21 (revised same day to fold in the Supabase migration)
Status: approved (pending spec review)
Builds on: `2026-07-21-ips-driven-scheduler-design.md` (esp. §2.2 for the J_VOFC.do page layout).
Supersedes that spec's §7 "defer Supabase" stance.

## 1. Goal

Two coupled changes, implemented as one initiative:

1. Cover every program in the AISIS **Official Curriculum** dropdown (~233 programs — the
   latest version of each (code, track) pair, see §2.2), imported via a repeatable,
   cookie-based bulk scraper the user runs locally.
2. Serve all **shared** data (curricula, per-term catalogs, community prof ratings) from
   **Supabase** instead of bundling JSON into the site build. Personal data (selections,
   preferences, personal ratings) stays in localStorage — the "Saved on this device" promise is
   unchanged. No accounts.

Non-goals:
- Importing historical version-years (latest per (code, track) only, per user decision).
- Automating the AISIS login in any form.
- Any user-authenticated or write path from the app; the app is read-only toward Supabase.

## 2. Curricula acquisition — `tools/scrape-curricula.mjs`

New script, run as `npm run scrape:curricula`.

### 2.1 Session handling (security posture)

`J_VOFC.do` is behind the student login. The tool:
- Reads the user's session cookie from the **`AISIS_COOKIE` env var only**. Never a CLI argument
  (visible in `ps`), never prompted interactively, never written to disk or logs.
- The README documents the copy-from-DevTools procedure and states the cookie is held in memory
  for the duration of the run only.
- README's tooling-credential rule is amended: *credentials* (username/password) are never
  handled by any tool in this repo; *temporary tokens supplied by the user via env var*
  (`AISIS_COOKIE` here, `SUPABASE_SERVICE_ROLE_KEY` in §5) are accepted, held only in memory.
- If the cookie is missing or the response looks like the login page, abort immediately with a
  clear message — do not retry.

### 2.2 Program discovery

- GET `J_VOFC.do` with the cookie; parse the program `<select>` out of the live form HTML
  (field/option names are read from the page, not hardcoded).
- **Parse each option from its `value`, not its label.** The value is `{code}_{version}_{sem}`
  (e.g. `AB LIT(ENG)_24TB_1`), which is unambiguous; the label form
  `(CODE) NAME(Ver Sem N, Ver Year V)` cannot be parsed reliably because real codes contain
  parentheses (`AB LIT(ENG)`). The display name is the label with the leading `(CODE)` and the
  trailing `(Ver Sem …)` removed.
- **"Ver Year" is not always a year.** 20 of 472 real options carry track-suffixed versions —
  `24BE`, `18IR`, `20TB`, `99TB` — a 2-digit year plus a track code. Parse as
  `versionYear` (2-digit → 20xx when ≤ 50, else 19xx) plus an uppercase `track` string
  (empty for plain years). An option whose version matches neither shape is skipped **and
  reported**, never dropped silently.
- **Keep the latest version per (code, track), not per code.** Three programs — `AB EU`,
  `AB LIT(ENG)`, `AB LIT(ENG)-LCS` — have *only* track-suffixed versions, so grouping by code
  alone would drop them entirely; `BS LfSci` and `MS BIO` would lose tracks. Grouping by
  (code, track) yields ~233 programs from 227 distinct codes.
- Program id = slugified code + `-` + the raw version string (`AB-EU-24BE`,
  `BS-AMDSc-M-DSc-2024`), which stays unique across tracks and reproduces the
  already-committed BS AMDSc id.
- Each program carries a display `versionLabel`: `"2024"`, or `"2024 · BE"` when a track is
  present, so the picker can distinguish same-year tracks.

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
  `entries[]` with `slotId: "Year|Term#index"`), so consumers are unchanged.

### 2.5 Output and safety rails

- Program id: slugified code + `-` + the raw version string — non-alphanumeric runs in the
  code become `-` (e.g. `BS AMDSc-M DSc` + `2024` → `BS-AMDSc-M-DSc-2024`;
  `AB LIT(ENG)` + `24TB` → `AB-LIT-ENG-24TB`).
- Writes one file per program: `data/curricula/<id>.json`, plus regenerates
  `data/curricula/index.json` containing `ProgramSummary[]` (id, code, name, versionYear, versionLabel).
- Atomic writes (`.tmp` + rename), like the schedule scraper.
- Refuses to write anything when the run is suspicious — zero programs parsed, or fewer than
  `max(10, 20%)` of discovered programs parsed successfully — unless `--force`.
- Existing files for programs absent from this run are left in place (a partial rerun never
  deletes data); the index is regenerated from the files present on disk, not from the run.

## 3. Repository data layout — git stays the source of truth

All scraped/shared data lives under a top-level `data/` directory, **outside `src/`**, so none
of it is ever bundled by Vite:

```
data/
  curricula/<program-id>.json   (one per program)
  curricula/index.json          (ProgramSummary[])
  catalogs/catalog-<term>.json  (moved from src/data/)
  prof-ratings.json             (moved from src/data/)
```

Scrapers keep writing reviewable, versioned JSON here exactly as they do today (diff review,
history, safety rails). Supabase is the **serving layer**, populated from these files (§5).
The seeded `curriculum-BS-AMDSc-2024.json` is hand-migrated to
`data/curricula/BS-AMDSc-M-DSc-2024.json` (content unchanged except `id`) with a one-entry
`index.json`, so the pipeline works before any scrape.

## 4. Supabase project and schema

- New free-tier project **`aisis-scheduler`** in org `prinsipe` (id `kibvzntiobjhtqzhpvcx`),
  region `ap-southeast-1` (closest to Manila). Confirmed cost: **$0/month**. Created via the
  Supabase connector at implementation start, after a final user go-ahead.
- Tables (all in `public`, RLS enabled, `anon` gets SELECT only; no INSERT/UPDATE/DELETE
  policies for `anon`, so writes require the service role):

| table | columns |
|---|---|
| `programs` | `id text PK`, `code text`, `name text`, `version_year int`, `version_label text`, `blocks jsonb`, `updated_at timestamptz default now()` |
| `catalogs` | `term text PK`, `exported_at timestamptz`, `sections jsonb`, `warnings jsonb`, `updated_at timestamptz default now()` |
| `community_ratings` | `id bigint identity PK`, `name text`, `rating numeric`, `course_code text null`, `note text null`, `as_of date null`, unique `(name, course_code)` |

Whole-blob `jsonb` for `blocks`/`sections` because the app always consumes a full program/term
at once: one fetch, gzipped in transit, row shape identical to the TypeScript types.
Schema applied via connector migrations (`apply_migration`), kept in `supabase/migrations/`.

## 5. Publishing — `tools/push-data.mjs` (`npm run push:data`)

- Upserts everything under `data/` into Supabase: each curriculum file → `programs`, each
  catalog file → `catalogs`, `prof-ratings.json` → `community_ratings` (upsert-by-PK for
  programs/catalogs; ratings are replaced via delete-then-insert on `(name, course_code)` —
  a brief inconsistency window is acceptable for a ratings seed).
- Auth: `SUPABASE_SERVICE_ROLE_KEY` env var only — same handling rules as `AISIS_COOKIE`
  (never a CLI arg, never stored, never logged). URL from `SUPABASE_URL` env var or a committed
  default.
- Prints a per-table summary (rows written / skipped) and fails loudly on any error.
- Semester workflow becomes: scrape → review diff → commit → `push:data`. No site redeploy.

## 6. App changes

### 6.1 Data modules (`src/lib/catalog.ts`, `src/lib/curriculum.ts`)

Still the ONLY modules that touch shared data; their consumers keep the same call shapes,
now async end-to-end:

- `getTerms(): Promise<TermOption[]>` — `select term, exported_at from catalogs`, ordered
  newest first; "available" derives from presence in the table (replaces build-time globbing).
  The static `TERMS` list of AISIS term labels remains for labeling/ordering.
- `loadCatalog(term): Promise<Catalog>` — one row fetch; `CatalogUnavailableError` when absent
  (message now points at `scrape:schedule` + `push:data`).
- `getPrograms(): Promise<ProgramSummary[]>` — `select id, code, name, version_year from programs`.
- `loadProgram(id): Promise<Program>` — one row fetch; `ProgramUnavailableError` when absent.
  Sync `getCurriculum()` is removed.
- `loadCommunityRatings(): Promise<ProfRating[]>` — replaces sync `getCommunityRatings()`.
- Client: `@supabase/supabase-js` with the anon (publishable) key. `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` env vars with committed defaults — anon keys are public by design.

### 6.2 Consumers

- `App.tsx`: program list, selected program, and community ratings each load in an effect
  symmetrical to the existing catalog effect (cancelled flag, error banner, loading text).
  Ratings merge into the memo once loaded; until then personal ratings alone apply.
- `Results.tsx` stops importing `curriculum.ts`; it receives `block` as a prop from `App`
  (it already receives `catalog`, `state`, `ratings`). Its zero-block fallback path is kept.
- No bundled-JSON fallback and no offline mode: this is an enlistment tool used online. Network
  failures surface as the existing banner + per-tab error states.
- No storage-shape change; `UserState.version` stays 2. A saved `programId` using the old
  `BS-AMDSc-2024` id will no longer resolve → the app behaves as "no program chosen" and the
  user re-picks once. All other saved state survives.

## 7. Validation — `tools/validate-data.mjs`

Runs against the repo `data/` directory (pre-push gate, not against the DB):
- index entries ↔ files on disk agree, ids unique, block keys unique per program, slotIds
  unique per program, `totalUnits` equals the sum of entry units (report-only), units finite ≥ 0.
- The existing required-courses-vs-catalog offering report runs for every program × the newest
  catalog, informational (non-fatal), as today.

## 8. Testing (TDD throughout)

- **Curriculum page parser**: fixture-driven tests from a real saved `J_VOFC.do` HTML page
  (user-provided save, or captured on the first cookie run), reduced to a committed fixture like
  `fixtures/aisis-real.ts`. Synthetic edge fixtures: elective placeholders (`FREE ELECTIVE`,
  `MATHEMATICS ELECTIVE`, `IE 1`), 0-unit rows, blank/multi prerequisites, the mislabeled-year
  quirk, login-page-instead-of-data detection.
- **Dropdown label parser**: `(CODE) NAME(Ver Sem 1, Ver Year YYYY)` variants, latest-year
  grouping.
- **Data modules**: unit tests inject a stubbed supabase client (the modules take it as an
  injectable for tests, defaulting to the real one); cover success, missing-row errors, and
  `getTerms` ordering. No live network in tests.
- **App/components**: async loading states (loading, error banner, loaded) for program list,
  program, catalog, ratings; Results with `block` as a prop; old-programId graceful fallback.
  Component tests mock the two data modules, as the smoke test does today.
- **push-data**: pure transform functions (file → row shape) unit-tested; the network loop is
  not, same stance as the scrapers.

## 9. Sequencing and user-run steps

Implementation order: (1) Supabase project + schema + `push:data` + seed with existing data,
(2) app read-path swap to Supabase, (3) multi-program curricula scraper on top, (4) user runs
the bulk scrape and we review + push.

Steps only the user can perform:
- Final go-ahead to create the `aisis-scheduler` project (confirmed $0/month).
- Provide one real `J_VOFC.do` page early in phase 3 for parser fixtures.
- Run `AISIS_COOKIE=... npm run scrape:curricula`, review warnings with me, commit.
- Run `SUPABASE_SERVICE_ROLE_KEY=... npm run push:data` after each data commit.
