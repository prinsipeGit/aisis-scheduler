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
`src/data/catalog-<term>.json`. Commit the file and push; the site redeploys
with fresh offerings. Valid terms: `2026-2`, `2026-1`, `2026-0`, `2025-2`,
`2025-1`, `2025-0`. A term with no data file shows an in-app message telling
you to run this command.

Note: a term only has data once AISIS publishes it. As of 2026-07-21, `2026-2`
returns no results at all — that's AISIS, not a bug. The app defaults to
`2026-1`, which is the currently committed catalog (`src/data/catalog-2026-1.json`,
3,743 sections). Re-run the scraper for the enlistment term once it goes live.

The scraper never sends, prompts for, or stores student credentials. It obtains
a temporary anonymous session cookie from the public page. It refuses to replace
a catalog when the result is empty or suspiciously partial; use `--force` only
after manually confirming that such a result is legitimate.

Only terms with a bundled catalog are enabled in the app. The repository
currently ships `2026-1`; the other AISIS term labels remain visible but disabled.

## Scheduling limits and uncertain times

To keep the browser responsive, generation stops after 500 conflict-free
candidates. When that limit is reached, the app says so and asks the user to
narrow the search with filters or locked sections. Ranking is exact within the
generated candidate set, but the app does not claim that an unbounded search was
exhausted.

Legitimate `TBA` classes may appear without a fixed meeting time. Future scrape
rows whose time cannot be parsed receive a separate `parse-error` status and are
excluded from generated schedules instead of being treated as conflict-free.

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

`src/lib/curriculum.ts` and `src/lib/catalog.ts` are the boundaries that read
bundled data. They are the starting points for a future Supabase migration, but
remote data would also require asynchronous loading, caching, error handling,
and tests in their UI consumers — see spec §7.
