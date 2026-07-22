# AISIS Scheduler

Generates and ranks conflict-free class-schedule candidates for Ateneo enlistment,
driven by your program's official curriculum (IPS).

Pick your program, the curriculum block you're taking (e.g. "2nd Year · First
Semester") and the calendar term to enlist in. The app pre-fills the required
courses from the official curriculum, you adjust them (fill electives, add a
minor, overload or underload), and it generates a bounded set of conflict-free
candidates ranked by your preferences. On enlistment day, exclude sections,
mark full classes, and lock
sections in and it re-ranks instantly. No accounts; everything personal stays
in your browser.

**Design spec:** `docs/superpowers/specs/2026-07-21-ips-driven-scheduler-design.md`
**Supabase/multi-program spec:** `docs/superpowers/specs/2026-07-21-multi-program-curricula-design.md`

## Development

```bash
npm install
npm run dev        # local dev server
npx vitest run     # all tests
npm run build      # type-check + production build (dist/)
npm run validate:data # validate catalog/curriculum consistency
```

## Refreshing the class schedule (once per semester)

The AISIS Schedule of Classes is a **public** page — no login required.

```bash
npm run scrape:schedule -- 2026-1
```

This loops every department for that term and safely writes
`data/catalogs/catalog-<term>.json`. Commit the file, then run
`npm run push:data` to publish it to Supabase — no site redeploy needed, the
app picks up the new term on next load. Valid terms: `2026-2`, `2026-1`,
`2026-0`, `2025-2`, `2025-1`, `2025-0`. A term with no data in Supabase shows
an in-app message telling you to run this command (and `push:data`).

Note: a term only has data once AISIS publishes it. As of 2026-07-21, `2026-2`
returns no results at all — that's AISIS, not a bug. The app defaults to
`2026-1`, which is the currently seeded catalog (`data/catalogs/catalog-2026-1.json`,
3,743 sections). Re-run the scraper for the enlistment term once it goes live.

The scraper never sends, prompts for, or stores student credentials. It obtains
a temporary anonymous session cookie from the public page. It refuses to replace
a catalog when the result is empty or suspiciously partial; use `--force` only
after manually confirming that such a result is legitimate.

Only terms with a catalog row in Supabase are enabled in the app. The database
currently has `2026-1` seeded; the other AISIS term labels remain visible but
disabled until scraped and pushed.

## Scheduling limits and uncertain times

To keep the browser responsive, generation stops after 500 conflict-free
candidates. When that limit is reached, the app says so and asks the user to
narrow the search with filters or locked sections. Ranking is exact within the
generated candidate set, but the app does not claim that an unbounded search was
exhausted.

Legitimate `TBA` classes may appear without a fixed meeting time. Future scrape
rows whose time cannot be parsed receive a separate `parse-error` status and are
excluded from generated schedules instead of being treated as conflict-free.

## Importing program curricula

Curricula come from AISIS → **Official Curriculum** (`J_VOFC.do`). Unlike the
class schedule, this page is behind the student login — but it is identical for
every student in a program, so the import carries no personal data.

```bash
AISIS_COOKIE='JSESSIONID=...' npm run scrape:curricula
npm run validate:data
npm run push:data
```

To get the cookie: log into AISIS, open DevTools → **Application → Cookies**,
and copy the session cookie. It is read from the environment only — never a
command-line argument, never prompted for, never written to disk or logged, and
held in memory just for the run. Never commit it.

The run takes about 6 minutes: ~233 programs at 1.5 s apart, plus a progress
line each. It imports the **newest version of each program track** — a program
with parallel tracks (e.g. `AB EU` has both `18BE` and `18IR`) keeps the latest
of each, shown in the picker as `2018 · BE`. Older version-years are skipped.

The scraper refuses to write when a run looks broken — zero programs parsed, or
fewer than 20% of those discovered. Use `--force` only after confirming the
result is legitimate. It never deletes files for programs missing from a run, so
a partial rerun is safe; `push:data` then reconciles the database, including
removing rows whose files are gone.

A program can still be added by hand: write the JSON in the same shape into
`data/curricula/`, add it to `data/curricula/index.json`, and run `npm run push:data`.

## Professor ratings

Ratings are **first-party**: you rate professors 0–5 stars in the app, per class
or overall, and they feed the "preferred professors" ranking criterion. They
live in your browser. There is deliberately no scraping of Facebook or any other
platform — see spec §6.1.

## Deploying

Static site — any host works. For Vercel: import the repo, framework preset
**Vite**, build `npm run build`, output `dist/`. Every push to main redeploys.

## Data hosting

Shared data (curricula, per-term catalogs, community professor ratings) lives
in this repo under `data/` — git is the source of truth, reviewed and
versioned like code. The app never bundles it; at runtime it reads only from
**Supabase**, which serves as the read layer:

| table | source file(s) |
|---|---|
| `programs` | `data/curricula/*.json` |
| `catalogs` | `data/catalogs/catalog-*.json` |
| `community_ratings` | `data/prof-ratings.json` |

`anon` access to all three tables is read-only (RLS: `SELECT` only, no
`INSERT`/`UPDATE`/`DELETE`); writes require the service role.

To publish a `data/` change, run:

```bash
SUPABASE_SERVICE_ROLE_KEY=<key> npm run push:data
```

This upserts every curriculum and catalog file and replaces
`community_ratings` wholesale. Get the service role key from the Supabase
dashboard → Project Settings → API. No site redeploy is needed — the app
picks up new rows on next load.

The app connects using the public defaults committed in `supabase/project.json`
(project URL + anon key — safe to commit, RLS keeps them read-only). Set
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to point the app at a different
project instead.

**Token rule:** no tool in this repo ever handles student username/password
credentials. Some tools accept a temporary, user-supplied token via
environment variable only — never a CLI argument, never written to disk or
logged, held in memory for the duration of the run: `SUPABASE_SERVICE_ROLE_KEY`
for `push:data` above, and `AISIS_COOKIE` for `scrape:curricula`, a session
cookie copied from DevTools after a normal student login.
