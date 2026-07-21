# AISIS Scheduler

Generates and ranks all conflict-free class schedules for Ateneo enlistment.
Pick your courses, set preferences (compact days by default), and get every
valid schedule ranked — then mark sections full on enlistment day to instantly
re-rank around them. No accounts; everything personal stays in your browser.

**Design spec:** `docs/superpowers/specs/2026-07-19-aisis-scheduler-design.md`

## Development

```bash
npm install
npm run dev        # local dev server
npx vitest run     # all tests
npm run build      # type-check + production build (dist/)
```

## Updating the catalog (maintainer, once per semester)

1. Log into AISIS, open the Class Schedule page, run `tools/aisis-export.js`
   in the DevTools console (instructions in the file). A .txt downloads.
2. Open the app's **Import** tab, paste the .txt contents, click **Parse**,
   review warnings, then **Download merged catalog JSON**.
3. Commit the downloaded file over `src/data/catalog-<semester>.json`
   (new semester: add the new file and update the import in
   `src/lib/catalog.ts`). Push — the site redeploys with fresh data.

Fallback if the snippet breaks: copy-paste department tables from AISIS
directly into the Import tab.

## Professor ratings

`src/data/prof-ratings.json` is curated manually from the "Ateneo Profs to
Pick" Facebook group (no scraping). Users can override any rating in-app;
personal ratings stay in their browser.

## Deploying

Static site — any host works. For Vercel: import the GitHub repo, framework
preset **Vite**, build `npm run build`, output `dist/`. Every push to main
redeploys.
