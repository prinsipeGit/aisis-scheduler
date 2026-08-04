# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Ateneo de Manila undergraduates planning their enlistment, plus the friends and
blockmates they share the link with. They already know what AISIS is, what a
section code looks like, and what their program's curriculum requires — the
product does not have to teach the domain, and jargon like "IPS", "block",
"INTACT", or "PATHFit" reads as plain language to them.

Two situations, not one:

- **Planning**, days before enlistment: unhurried, exploratory, comparing many
  candidate schedules and tuning preferences.
- **Enlistment day**: the real test. Seats disappear in seconds. The student is
  on a laptop with AISIS open in another tab, reading section codes off this app
  and retyping them into that one, re-ranking after each class that fills up.

The enlistment-day scene is the one that governs. Desktop is the primary
viewport; the phone is a secondary case, not the design target.

## Product Purpose

Turn a program's official curriculum plus the term's real class catalog into a
bounded set of conflict-free schedule candidates, ranked by the student's own
stated priorities, and keep that ranking correct as reality changes during
enlistment (sections fill, sections get locked in, sections get excluded).

Success is narrow and physical: the student ends up with a short list of section
codes they can type into AISIS quickly and confidently, and they got there
faster than they would have by hand.

## Positioning

Curriculum-driven rather than course-list-driven. The app starts from the
official IPS curriculum for the student's program, version, and track — it
pre-fills what they actually owe this block instead of asking them to remember
it. Course codes from the curriculum are reconciled against what AISIS actually
offers through exact match, a variant rule (`PHILO 11` covers `.03`–`.06`), and
a maintained alias file; a requirement that resolves to nothing is reported, not
silently dropped.

The second differentiator is honesty about its own limits. Generation stops at
500 conflict-free candidates and the UI says so, naming what would narrow the
search. Ranking is exact within the generated set and the app never claims an
exhaustive search it did not perform. Unparseable times are quarantined as
`parse-error` and excluded rather than treated as conflict-free.

## Operating Context

- Two tabs: this app and AISIS. The transfer between them is manual retyping, so
  the section code is the single most important string on screen.
- Ranking is **strict priority**: the first criterion decides, later ones only
  break ties.
- Five-step setup in a fixed dependency order — program → semester → courses →
  classes already held → preferences. The order is real; you cannot pick courses
  before a semester.
- Some classes are assigned rather than chosen (INTACT), so they are entered as
  pre-assigned facts and planned around.
- Data refreshes are an operator ritual, not a user one: scrape the catalog once
  per semester, commit it, push to Supabase; the app picks it up on next load
  with no redeploy.

## Capabilities and Constraints

- No accounts. Everything personal — preferences, locks, exclusions, personal
  professor ratings — lives in the browser's local storage.
- Runtime reads only from Supabase (`programs`, `catalogs`, `community_ratings`),
  anon access read-only via RLS. Shared data is versioned in `data/` in git;
  Supabase is the read layer, not the source of truth.
- Static Vite + React SPA, no server of its own. Deployed as static files.
- **No credential handling, ever.** No tool in the repo takes a student username
  or password. The schedule scraper uses the public page. The curriculum scraper
  takes a user-supplied session cookie by environment variable only, held in
  memory for the run.
- Professor ratings are first-party only: students rate 0–5 in the app, layered
  over shared community ratings. Deliberately no scraping of Facebook or any
  other platform.
- Generation is bounded at 500 candidates to keep the browser responsive.
- Instructor names arrive "as printed by AISIS" (`LAST, FIRST M.`) and are
  sometimes split wrong by the scraper, because the AISIS field separates
  multiple instructors with the same comma that separates last from first. Any
  display of instructor names must degrade gracefully on those fragments.
- A term only exists in the app once its catalog is scraped and pushed. Terms
  without data stay visible but disabled.

## Brand Commitments

- Name: **AISIS Scheduler**. Unofficial — the product says so, and every surface
  that could be mistaken for a final answer carries the "always verify in AISIS"
  caveat.
- Ateneo blue is the accent lineage.
- Type is shipped, never a system stack, so the app looks identical on a Windows
  lab machine and a Mac: Space Grotesk (display), Plus Jakarta Sans (body),
  JetBrains Mono (data and codes).
- Voice: plain, specific, and candid about uncertainty. It names what it does not
  know (PATHFit 3 vs 4 activity pools, TBA times, the 500-candidate ceiling)
  rather than smoothing over it.

## Evidence on Hand

- `data/catalogs/catalog-2026-1.json` — 3,902 real sections, the seeded term.
- `data/curricula/` — 69 undergraduate program curricula scraped from AISIS.
- `data/prof-ratings.json` — community professor ratings.
- `docs/superpowers/specs/` — design specs; the scheduler rewrite spec is current.
- No testimonials, usage numbers, endorsements, or institutional affiliation
  exist. The product is not endorsed by the Ateneo and future work must not
  imply that it is.

## Product Principles

1. **The section code is the product.** Everything else on screen exists to make
   the student trust the code enough to type it. It never competes for weight.
2. **Enlistment day sets the bar.** Optimize for a fast, high-pressure re-read
   under time pressure, not for a leisurely first visit.
3. **Say what you don't know.** Bounded searches, TBA times, unresolved
   requirements, and unparseable rows are surfaced, never smoothed over.
4. **Nothing personal leaves the browser.** Local storage by default; no
   accounts; no credentials in any tool in the repo.
5. **The curriculum is the starting point**, not a blank course list — the app
   should already know what the student owes before they type anything.

## Accessibility & Inclusion

No formal standard was set for this audience. The floor future work must hold:
text contrast at WCAG AA, visible keyboard focus, real labels on every control,
and `prefers-reduced-motion` honored — all of which the current build already
does.
