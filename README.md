# AISIS Scheduler

Generates and ranks all conflict-free class schedules for Ateneo enlistment,
driven by your program's official curriculum (IPS).

Pick your program, the curriculum block you're taking (e.g. "2nd Year · First
Semester") and the calendar term to enlist in. The app pre-fills the required
courses from the official curriculum, you adjust them (fill electives, add a
minor, overload or underload), and it generates every conflict-free schedule
ranked by your preferences. On enlistment day, mark sections full and it
re-ranks instantly. No accounts; everything personal stays in your browser.

**Design spec:** `docs/superpowers/specs/2026-07-21-ips-driven-scheduler-design.md`

## Development

```bash
npm install
npm run dev        # local dev server
npx vitest run     # all tests
npm run build      # type-check + production build (dist/)
```

## Refreshing the class schedule (once per semester)

The AISIS Schedule of Classes is a **public** page — no login required.

```bash
npm run scrape:schedule -- 2026-1
```

This loops every department for that term and writes
`src/data/catalog-<term>.json`. Commit the file and push; the site redeploys
with fresh offerings. Valid terms: `2026-2`, `2026-1`, `2026-0`, `2025-2`,
`2025-1`, `2025-0`. A term with no data file shows an in-app message telling
you to run this command.

Note: a term only has data once AISIS publishes it. As of 2026-07-21, `2026-2`
returns no results at all — that's AISIS, not a bug. The app defaults to
`2026-1`, which is the currently committed catalog (`src/data/catalog-2026-1.json`,
3,743 sections). Re-run the scraper for the enlistment term once it goes live.

The scraper never sends, prompts for, or stores credentials — don't add auth.

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

`src/lib/curriculum.ts` and `src/lib/catalog.ts` are the only modules that read
bundled data. Backing them with Supabase means rewriting those two files and
nothing else — see spec §7.
