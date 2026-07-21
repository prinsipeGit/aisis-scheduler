# Multi-Program Curricula Scraper Implementation Plan (Plan C of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import every program in the AISIS Official Curriculum dropdown (~250, latest version-year each) into `data/curricula/`, publishable to Supabase with the existing `npm run push:data`.

**Architecture:** Pure, unit-tested parsers (`tools/curriculum-parse.mjs`) separated from a thin network loop (`tools/scrape-curricula.mjs`), mirroring how `extract-rows.mjs` and `scrape-schedule.mjs` are already split. The scraper reads the user's AISIS session cookie from `AISIS_COOKIE`, discovers programs from the live form, keeps the newest version-year per program code, fetches each politely, and writes one JSON per program plus a regenerated index.

**Tech Stack:** Node 20 ESM (no new dependencies — regex/string parsing like the existing scraper), Vitest 2.

**Spec:** `docs/superpowers/specs/2026-07-21-multi-program-curricula-design.md` §2 (acquisition), §3 (repo layout), §7 (validation), §8 (testing), §9 phase 3.

## Global Constraints

- **Secrets:** `AISIS_COOKIE` env-var only — never a CLI argument, never prompted, never written to disk or logged. Abort immediately (no retry) when it is missing or when a response looks like the login page.
- No new runtime or dev dependencies. Dependency-free HTML parsing, consistent with `tools/extract-rows.mjs`.
- Politeness: 1500 ms between program requests, matching `tools/scrape-schedule.mjs`.
- Output shape is exactly the existing `Program` type: `blocks[]` with `key: "${year}|${term}"`, `entries[]` with `slotId: "${year}|${term}#${index}"`. `data/curricula/index.json` is `ProgramSummary[]` (`id`, `code`, `name`, `versionYear`).
- Program id: slugified `CODE-YEAR` — every run of non-alphanumeric characters in the code becomes a single `-`, e.g. `BS AMDSc-M DSc` + 2024 → `BS-AMDSc-M-DSc-2024`. This must reproduce the existing committed id exactly.
- Safety rails: atomic writes (`.tmp` + rename); refuse to write when zero programs parsed or fewer than `max(10, ceil(20% of discovered))` succeeded, unless `--force`; never delete existing program files for programs absent from a run.
- Every task leaves `npx vitest run` green and `npm run validate:data` exit-0.
- Commit messages end with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Capture a real curriculum page as a test fixture

**USER-ASSISTED task.** The page is behind the AISIS student login, so the orchestrator cannot fetch it.

**Files:**
- Create: `tools/fixtures/j-vofc-sample.html` (raw saved page, trimmed)
- Create: `tools/fixtures/README.md`

**Interfaces:**
- Produces: the fixture file every parser task in this plan reads. Until it exists, Tasks 2–4 cannot write honest tests.

- [ ] **Step 1 (USER):** Log into AISIS, open **Official Curriculum** (`J_VOFC.do`), select any program (BS AMDSc 2024 is ideal — its parsed output can be diffed against the already-committed file), and save the results page: browser **File → Save Page As → "Web Page, HTML Only"**. Put it at `tools/fixtures/j-vofc-sample.html` in the repo.

- [ ] **Step 2 (orchestrator):** Read the saved file and confirm it contains (a) the program `<select>` with its option labels, (b) year/term headings, (c) the 5-column curriculum table. If the save produced a login page instead, stop and tell the user to re-save while logged in.

  **Also record the form's real submission contract**, which Task 5 depends on and which cannot be guessed: the `<form>`'s `action` and `method`, the program `<select>`'s `name`, and **every hidden input's name and value** (especially any `command`-style field — `scrape-schedule.mjs` uses `command=displayResults` for a *different* endpoint, and that value must not be assumed to carry over). Write these findings into the task report so Task 5 can encode them.

- [ ] **Step 3 (orchestrator):** Trim the fixture to keep the parser-relevant markup: the full `<form>`/`<select>` block and the complete set of year/term tables for that one program. Strip `<script>`, `<style>`, and navigation chrome. Keep it under ~200 KB. Preserve the exact tag/attribute style AISIS emits — do not reformat or "clean up" attribute quoting, casing, or whitespace inside the parts you keep.

- [ ] **Step 4:** Write `tools/fixtures/README.md`:

```markdown
# Fixtures

`j-vofc-sample.html` — a real AISIS Official Curriculum (`J_VOFC.do`) results page,
saved from a logged-in browser session and trimmed to the markup the parsers read
(program `<select>`, year/term headings, 5-column tables). Contains no personal data:
the Official Curriculum page is identical for every student in a program.

Re-capture it if AISIS changes the page layout and the parser tests start failing
for reasons other than a parser bug.
```

- [ ] **Step 5: Commit**

```bash
git add tools/fixtures/
git commit -m "test: add real AISIS Official Curriculum page fixture"
```

---

### Task 2: Program-dropdown parser

**Files:**
- Create: `tools/curriculum-parse.mjs`, `tools/curriculum-parse.test.ts`

**Interfaces:**
- Consumes: `tools/fixtures/j-vofc-sample.html` (Task 1).
- Produces (used by Tasks 3–5):

```js
export function parseProgramOptions(html)  // → [{ value, code, name, versionYear }]
export function latestPerCode(options)     // → same shape, one per code, highest versionYear, sorted by code
export function programId(code, versionYear) // → "BS-AMDSc-M-DSc-2024"
```

- [ ] **Step 1: Write the failing tests** in `tools/curriculum-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseProgramOptions, latestPerCode, programId } from "./curriculum-parse.mjs";

const SAMPLE = readFileSync(new URL("./fixtures/j-vofc-sample.html", import.meta.url), "utf8");

describe("programId", () => {
  it("slugifies the code and appends the version year", () => {
    expect(programId("BS AMDSc-M DSc", 2024)).toBe("BS-AMDSc-M-DSc-2024");
  });
  it("collapses runs of non-alphanumerics into one dash", () => {
    expect(programId("AB  (CD)/EF", 2020)).toBe("AB-CD-EF-2020");
  });
});

describe("parseProgramOptions", () => {
  it("parses (CODE) NAME(Ver Sem N, Ver Year YYYY) labels", () => {
    const options = parseProgramOptions(
      `<select name="curriculumCode">
         <option value="">-- Select --</option>
         <option value="X1">(BS AMDSc-M DSc) BACHELOR OF SCIENCE IN APPLIED MATHEMATICS(Ver Sem 1, Ver Year 2024)</option>
         <option value="X2">(AB IS) INTERDISCIPLINARY STUDIES(Ver Sem 2, Ver Year 2020)</option>
       </select>`
    );
    expect(options).toEqual([
      { value: "X1", code: "BS AMDSc-M DSc", name: "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS", versionYear: 2024 },
      { value: "X2", code: "AB IS", name: "INTERDISCIPLINARY STUDIES", versionYear: 2020 },
    ]);
  });
  it("skips placeholder and unparseable options", () => {
    expect(parseProgramOptions(`<select><option value="">-- Select --</option><option value="Z">JUNK</option></select>`)).toEqual([]);
  });
  it("finds real options in the captured AISIS page", () => {
    const options = parseProgramOptions(SAMPLE);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(o.code).not.toBe("");
      expect(Number.isInteger(o.versionYear)).toBe(true);
    }
  });
});

describe("latestPerCode", () => {
  it("keeps only the highest version year per code, sorted by code", () => {
    const options = [
      { value: "b", code: "BS AMDSc-M DSc", name: "N", versionYear: 2020 },
      { value: "a", code: "BS AMDSc-M DSc", name: "N", versionYear: 2024 },
      { value: "c", code: "AB IS", name: "M", versionYear: 2018 },
    ];
    expect(latestPerCode(options)).toEqual([
      { value: "c", code: "AB IS", name: "M", versionYear: 2018 },
      { value: "a", code: "BS AMDSc-M DSc", name: "N", versionYear: 2024 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tools/curriculum-parse.test.ts`
Expected: FAIL — cannot resolve `./curriculum-parse.mjs`.

- [ ] **Step 3: Implement** `tools/curriculum-parse.mjs`:

```js
// Parsers for the AISIS Official Curriculum page (J_VOFC.do).
// Dependency-free by design, like tools/extract-rows.mjs.

const LABEL = /^\(([^)]+)\)\s*(.+?)\s*\(\s*Ver\s+Sem\s+\d+\s*,\s*Ver\s+Year\s+(\d{4})\s*\)\s*$/i;

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

const textOf = (html) =>
  decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function programId(code, versionYear) {
  const slug = code.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug}-${versionYear}`;
}

export function parseProgramOptions(html) {
  const options = [];
  for (const m of html.matchAll(/<option\b[^>]*value\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)) {
    const value = m[1].trim();
    if (!value) continue;
    const label = LABEL.exec(textOf(m[2]));
    if (!label) continue;
    options.push({
      value,
      code: label[1].trim(),
      name: label[2].trim(),
      versionYear: Number(label[3]),
    });
  }
  return options;
}

export function latestPerCode(options) {
  const best = new Map();
  for (const option of options) {
    const current = best.get(option.code);
    if (!current || option.versionYear > current.versionYear) best.set(option.code, option);
  }
  return [...best.values()].sort((a, b) => a.code.localeCompare(b.code));
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tools/curriculum-parse.test.ts`
Expected: PASS (6 tests). If the real-page test fails, the fixture's option markup differs from the assumed shape — fix the regex to match the fixture, never the fixture to match the regex.

- [ ] **Step 5: Commit**

```bash
git add tools/curriculum-parse.mjs tools/curriculum-parse.test.ts
git commit -m "feat: parse the AISIS curriculum program dropdown"
```

---

### Task 3: Curriculum table parser

**Files:**
- Modify: `tools/curriculum-parse.mjs`, `tools/curriculum-parse.test.ts`

**Interfaces:**
- Consumes: `textOf`/`decodeEntities` helpers from Task 2.
- Produces:

```js
export function isElectiveEntry(catNo, title) // → boolean
export function electiveDeptFor(catNo)        // → "**IE**" | undefined
export function parseCurriculumPage(html)     // → { blocks, warnings }
```

`blocks` are `CurriculumBlock[]`: `{ year, term, key, totalUnits, entries[] }`, entries
`{ catNo, title, units, prerequisites, category, isElective, electiveDept?, slotId }`.

- [ ] **Step 1: Write the failing tests** — append to `tools/curriculum-parse.test.ts`:

```ts
import { isElectiveEntry, electiveDeptFor, parseCurriculumPage } from "./curriculum-parse.mjs";

describe("elective detection", () => {
  it("flags placeholder elective slots by catNo or title", () => {
    expect(isElectiveEntry("MATHEMATICS ELECTIVE", "")).toBe(true);
    expect(isElectiveEntry("FREE ELECTIVE", "")).toBe(true);
    expect(isElectiveEntry("IE 1", "INTERDISCIPLINARY ELECTIVE 1 - ENGLISH")).toBe(true);
    expect(isElectiveEntry("X 10", "MATH GRAD ELECTIVE")).toBe(true);
  });
  it("does not flag ordinary courses", () => {
    expect(isElectiveEntry("MATH 31.1", "MATHEMATICAL ANALYSIS IA")).toBe(false);
    expect(isElectiveEntry("THEO 11", "FAITH, SPIRITUALITY, AND THE CHURCH")).toBe(false);
  });
  it("marks IE slots with their department, others with none", () => {
    expect(electiveDeptFor("IE 1")).toBe("**IE**");
    expect(electiveDeptFor("FREE ELECTIVE")).toBeUndefined();
  });
});

describe("parseCurriculumPage", () => {
  const HTML = `
    <h3>First Year</h3>
    <h4>First Semester</h4>
    <table>
      <tr><th>Cat No</th><th>Course Title</th><th>Units</th><th>Prerequisites</th><th>Category</th>
          <th>Total Units: 6.0</th></tr>
      <tr><td>MATH 10</td><td>MATHEMATICS IN THE MODERN WORLD</td><td>3</td><td></td><td>C</td></tr>
      <tr><td>INTACT 11</td><td>INTRO TO ATENEO CULTURE</td><td>0</td><td></td><td>C</td></tr>
      <tr><td>PATHFit 2</td><td>PHYSICAL ACTIVITIES 2</td><td>3</td><td>PATHFit 1, MATH 10</td><td>PFT2</td></tr>
    </table>
    <h3>Second Year</h3>
    <h4>Second Semester</h4>
    <table>
      <tr><th>Cat No</th><th>Course Title</th><th>Units</th><th>Prerequisites</th><th>Category</th>
          <th>Total Units: 3.0</th></tr>
      <tr><td>IE 1</td><td>INTERDISCIPLINARY ELECTIVE 1 - ENGLISH</td><td>3</td><td>ENGL 11</td><td>IE1E</td></tr>
    </table>`;

  it("groups entries into year|term blocks with keys and slotIds", () => {
    const { blocks } = parseCurriculumPage(HTML);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].key).toBe("First Year|First Semester");
    expect(blocks[0].year).toBe("First Year");
    expect(blocks[0].term).toBe("First Semester");
    expect(blocks[0].entries.map((e) => e.slotId)).toEqual([
      "First Year|First Semester#0", "First Year|First Semester#1", "First Year|First Semester#2",
    ]);
  });
  it("reads the printed total units from the table header", () => {
    expect(parseCurriculumPage(HTML).blocks[0].totalUnits).toBe(6);
  });
  it("keeps zero-unit courses and splits comma-separated prerequisites", () => {
    const entries = parseCurriculumPage(HTML).blocks[0].entries;
    expect(entries.find((e) => e.catNo === "INTACT 11").units).toBe(0);
    expect(entries.find((e) => e.catNo === "PATHFit 2").prerequisites).toEqual(["PATHFit 1", "MATH 10"]);
    expect(entries.find((e) => e.catNo === "MATH 10").prerequisites).toEqual([]);
  });
  it("marks the IE slot elective with its department", () => {
    const ie = parseCurriculumPage(HTML).blocks[1].entries[0];
    expect(ie.isElective).toBe(true);
    expect(ie.electiveDept).toBe("**IE**");
    expect(ie.category).toBe("IE1E");
  });
  it("warns instead of throwing when a block has no parseable rows", () => {
    const { blocks, warnings } = parseCurriculumPage(`<h3>First Year</h3><h4>First Semester</h4><table></table>`);
    expect(blocks).toEqual([]);
    expect(warnings.join(" ")).toMatch(/no entries/i);
  });
  it("parses the captured AISIS page into non-empty blocks", () => {
    const { blocks } = parseCurriculumPage(SAMPLE);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.key).toBe(`${block.year}|${block.term}`);
      expect(block.entries.length).toBeGreaterThan(0);
      expect(new Set(block.entries.map((e) => e.slotId)).size).toBe(block.entries.length);
    }
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tools/curriculum-parse.test.ts`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 3: Implement** — append to `tools/curriculum-parse.mjs`:

```js
const ELECTIVE = /ELECTIVE/i;
const IE_SLOT = /^IE\s*\d+$/i;

export function isElectiveEntry(catNo, title) {
  return ELECTIVE.test(catNo) || ELECTIVE.test(title) || IE_SLOT.test(catNo.trim());
}

export function electiveDeptFor(catNo) {
  return IE_SLOT.test(catNo.trim()) ? "**IE**" : undefined;
}

// The page prints Year heading → Term heading → one 5-column table per block.
// Each printed block is handled independently: AISIS sometimes mislabels year
// headings (a "Fourth Year" block printed under "Third Year"), and we transcribe
// exactly what is printed rather than trying to correct it.
const YEAR = /\b((?:First|Second|Third|Fourth|Fifth)\s+Year)\b/i;
const TERM = /\b(First\s+Semester|Second\s+Semester|Intersession|(?:First|Second|Third|Fourth|Fifth)\s+Year)\b/i;

export function parseCurriculumPage(html) {
  const blocks = [];
  const warnings = [];
  // Split on tables: everything before a table since the previous one carries its headings.
  const chunks = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  let cursor = 0;
  let year = "";
  let term = "";
  for (const table of chunks) {
    const preamble = html.slice(cursor, table.index);
    cursor = table.index + table[0].length;
    const headingText = textOf(preamble);
    const yearMatch = YEAR.exec(headingText);
    if (yearMatch) year = yearMatch[1].replace(/\s+/g, " ");
    // The term heading is whatever term-ish label appears AFTER the year heading.
    const afterYear = yearMatch ? headingText.slice(yearMatch.index + yearMatch[0].length) : headingText;
    const termMatch = TERM.exec(afterYear);
    if (termMatch) term = termMatch[1].replace(/\s+/g, " ");
    if (!year || !term) continue;

    const key = `${year}|${term}`;
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    let totalUnits = 0;
    const entries = [];
    for (const row of rows) {
      const headerCells = [...row[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((c) => textOf(c[1]));
      const totalMatch = /Total\s+Units\s*:?\s*([\d.]+)/i.exec(headerCells.join(" "));
      if (totalMatch) totalUnits = Number(totalMatch[1]);
      if (headerCells.length > 0) continue;

      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => textOf(c[1]));
      if (cells.length < 5) continue;
      const [catNo, title, unitsText, prereqText, category] = cells;
      if (!catNo || /^cat\s*no$/i.test(catNo)) continue;
      const units = Number(unitsText.replace(/[()]/g, ""));
      entries.push({
        catNo,
        title,
        units: Number.isFinite(units) ? units : 0,
        prerequisites: prereqText.split(",").map((p) => p.trim()).filter(Boolean),
        category,
        isElective: isElectiveEntry(catNo, title),
        ...(electiveDeptFor(catNo) ? { electiveDept: electiveDeptFor(catNo) } : {}),
        slotId: `${key}#${entries.length}`,
      });
    }
    if (entries.length === 0) {
      warnings.push(`${key}: table has no entries — check the page layout`);
      continue;
    }
    blocks.push({ year, term, key, totalUnits, entries });
  }
  return { blocks, warnings };
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tools/curriculum-parse.test.ts`
Expected: PASS. If the real-page test fails, adjust the heading/table regexes to the fixture's actual markup — never edit the fixture.

- [ ] **Step 5: Cross-check against the known-good committed program.** Write a throwaway script under the scratchpad (not committed) that runs `parseCurriculumPage` on the fixture and diffs the block keys and entry `catNo`s against `data/curricula/BS-AMDSc-M-DSc-2024.json`. If the fixture is the BS AMDSc 2024 page, they must match; report any difference in the task report rather than silently accepting it.

- [ ] **Step 6: Commit**

```bash
git add tools/curriculum-parse.mjs tools/curriculum-parse.test.ts
git commit -m "feat: parse AISIS curriculum year/term blocks and entries"
```

---

### Task 4: Login-page detection and program-file assembly

**Files:**
- Modify: `tools/curriculum-parse.mjs`, `tools/curriculum-parse.test.ts`

**Interfaces:**
- Produces:

```js
export function looksLikeLoginPage(html)                       // → boolean
export function buildProgram({ code, name, versionYear, blocks }) // → Program object
export function buildIndex(programs)                            // → ProgramSummary[] sorted by code
```

- [ ] **Step 1: Write the failing tests** — append to `tools/curriculum-parse.test.ts`:

```ts
import { looksLikeLoginPage, buildProgram, buildIndex } from "./curriculum-parse.mjs";

describe("looksLikeLoginPage", () => {
  it("detects a login form", () => {
    expect(looksLikeLoginPage(`<form><input type="password" name="userPwd"></form>`)).toBe(true);
    expect(looksLikeLoginPage(`<p>Your session has expired. Please log in again.</p>`)).toBe(true);
  });
  it("does not flag a real curriculum page", () => {
    expect(looksLikeLoginPage(SAMPLE)).toBe(false);
  });
});

describe("buildProgram / buildIndex", () => {
  const blocks = [{ year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 3, entries: [] }];
  it("assembles a Program with the slugified id", () => {
    expect(buildProgram({ code: "BS AMDSc-M DSc", name: "APPLIED MATH", versionYear: 2024, blocks })).toEqual({
      id: "BS-AMDSc-M-DSc-2024", code: "BS AMDSc-M DSc", name: "APPLIED MATH", versionYear: 2024, blocks,
    });
  });
  it("builds a summary index sorted by code", () => {
    const programs = [
      { id: "Z-2024", code: "Z", name: "Zed", versionYear: 2024, blocks },
      { id: "A-2020", code: "A", name: "Ay", versionYear: 2020, blocks },
    ];
    expect(buildIndex(programs)).toEqual([
      { id: "A-2020", code: "A", name: "Ay", versionYear: 2020 },
      { id: "Z-2024", code: "Z", name: "Zed", versionYear: 2024 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run tools/curriculum-parse.test.ts`
Expected: FAIL — new exports missing.

- [ ] **Step 3: Implement** — append to `tools/curriculum-parse.mjs`:

```js
export function looksLikeLoginPage(html) {
  if (/<input[^>]+type\s*=\s*"password"/i.test(html)) return true;
  return /(session\s+has\s+expired|please\s+log\s*in)/i.test(textOf(html));
}

export function buildProgram({ code, name, versionYear, blocks }) {
  return { id: programId(code, versionYear), code, name, versionYear, blocks };
}

export function buildIndex(programs) {
  return programs
    .map(({ id, code, name, versionYear }) => ({ id, code, name, versionYear }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `npx vitest run tools/curriculum-parse.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add tools/curriculum-parse.mjs tools/curriculum-parse.test.ts
git commit -m "feat: login detection and curriculum program assembly"
```

---

### Task 5: The scraper script

**Files:**
- Create: `tools/scrape-curricula.mjs`
- Modify: `package.json` (add `"scrape:curricula": "node tools/scrape-curricula.mjs"`)

**Interfaces:**
- Consumes: every export from `tools/curriculum-parse.mjs` (Tasks 2–4).
- Produces: `npm run scrape:curricula`, writing `data/curricula/<id>.json` + `index.json`.

The network loop is deliberately not unit-tested (same stance as `tools/scrape-schedule.mjs`); all parseable logic already lives in the tested module.

- [ ] **Step 1: Write** `tools/scrape-curricula.mjs`:

```js
#!/usr/bin/env node
/**
 * Scrape every program's Official Curriculum from AISIS (J_VOFC.do).
 *
 *   AISIS_COOKIE='JSESSIONID=...' npm run scrape:curricula
 *
 * Writes data/curricula/<program-id>.json and regenerates index.json.
 *
 * This page is behind the student login. The cookie is read from the environment
 * ONLY — never a CLI argument, never prompted, never written to disk or logged.
 * Get it from DevTools → Application → Cookies after logging into AISIS.
 */
import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseProgramOptions, latestPerCode, parseCurriculumPage,
  looksLikeLoginPage, buildProgram, buildIndex,
} from "./curriculum-parse.mjs";

const ENDPOINT = "https://aisis.ateneo.edu/j_aisis/J_VOFC.do";
const DELAY_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const force = process.argv.includes("--force");

const COOKIE = process.env.AISIS_COOKIE;
if (!COOKIE) {
  console.error(
    "Set AISIS_COOKIE in the environment (log into AISIS, then copy the cookie from " +
    "DevTools → Application → Cookies). It is never stored or logged."
  );
  process.exit(1);
}

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "curricula");

const fetchPage = async (body) => {
  const res = await fetch(ENDPOINT, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: COOKIE,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(body ? { body } : {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (looksLikeLoginPage(html)) {
    console.error("AISIS returned the login page — the cookie is missing, wrong, or expired.");
    process.exit(1);
  }
  return html;
};

const landing = await fetchPage(null);
const discovered = latestPerCode(parseProgramOptions(landing));
if (discovered.length === 0) {
  console.error("No programs found in the page's dropdown — the page layout may have changed.");
  process.exit(1);
}
console.log(`Discovered ${discovered.length} programs (latest version-year each).`);

// The form field names are read from the live page so a rename upstream is visible
// immediately rather than silently producing empty results.
const selectName = /<select\b[^>]*\bname\s*=\s*"([^"]+)"/i.exec(landing)?.[1];
if (!selectName) {
  console.error("Could not find the program <select> field name — the page layout may have changed.");
  process.exit(1);
}
// Hidden inputs carry the form's command/state fields. Their names and values are
// NOT guessable — replay exactly what the page ships. (Task 1 Step 2 recorded these
// from the real page; this code re-derives them at run time so it stays correct.)
const hiddenFields = {};
for (const m of landing.matchAll(/<input\b[^>]*type\s*=\s*"hidden"[^>]*>/gi)) {
  const name = /\bname\s*=\s*"([^"]*)"/i.exec(m[0])?.[1];
  const value = /\bvalue\s*=\s*"([^"]*)"/i.exec(m[0])?.[1] ?? "";
  if (name) hiddenFields[name] = value;
}

const programs = [];
const warnings = [];
for (const option of discovered) {
  try {
    const html = await fetchPage(
      new URLSearchParams({ ...hiddenFields, [selectName]: option.value }).toString()
    );
    const { blocks, warnings: parseWarnings } = parseCurriculumPage(html);
    for (const w of parseWarnings) warnings.push(`${option.code}: ${w}`);
    if (blocks.length === 0) {
      warnings.push(`${option.code} (${option.versionYear}): no blocks parsed — skipped`);
      console.warn(`  ! ${option.code}: no blocks parsed`);
    } else {
      programs.push(buildProgram({ ...option, blocks }));
      console.log(`  ${option.code} (${option.versionYear}): ${blocks.length} blocks`);
    }
  } catch (err) {
    warnings.push(`${option.code}: ${err.message} — skipped`);
    console.warn(`  ! ${option.code}: ${err.message}`);
  }
  await sleep(DELAY_MS);
}

const minimum = Math.max(10, Math.ceil(discovered.length * 0.2));
if ((programs.length === 0 || programs.length < minimum) && !force) {
  console.error(
    `Refusing to write: parsed ${programs.length} of ${discovered.length} programs ` +
    `(minimum ${minimum}). Investigate the AISIS response, or rerun with --force.`
  );
  process.exit(1);
}

const writeAtomic = async (file, data) => {
  const temporary = `${file}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2));
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
};

for (const program of programs) {
  await writeAtomic(path.join(OUT_DIR, `${program.id}.json`), program);
}

// Rebuild the index from every file on disk, so programs absent from this run
// (a partial rerun) keep their entries rather than disappearing.
const onDisk = [];
for (const file of (await readdir(OUT_DIR)).filter((f) => f.endsWith(".json") && f !== "index.json")) {
  onDisk.push(JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8")));
}
await writeAtomic(path.join(OUT_DIR, "index.json"), buildIndex(onDisk));

console.log(`\nWrote ${programs.length} program file(s); index lists ${onDisk.length}.`);
if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`- ${w}`);
}
```

- [ ] **Step 2: Add the script** to `package.json` `"scripts"`:

```json
"scrape:curricula": "node tools/scrape-curricula.mjs"
```

- [ ] **Step 3: Verify the guard path** (the only executable check without a real cookie)

Run: `node tools/scrape-curricula.mjs`
Expected: the one-line "Set AISIS_COOKIE…" message, exit code 1. Confirm with `echo $?` → `1`.

- [ ] **Step 4: Reconcile the request shape with the real page.** Compare the hidden-field derivation above against what Task 1 Step 2 recorded from the saved page (form action, method, select name, hidden inputs). If the real form posts to a different action than `J_VOFC.do`, or carries a field the hidden-input scan misses (for example a value set by JavaScript rather than markup), encode the real contract here and note the correction in the task report. Do not leave a guessed field in the body.

- [ ] **Step 5: Verify the suite is untouched**

Run: `npx vitest run`
Expected: all tests pass (the scraper adds no tests; its logic is covered by `curriculum-parse.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add tools/scrape-curricula.mjs package.json
git commit -m "feat: bulk-scrape every program's official curriculum"
```

---

### Task 6: README documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the "Adding a program's curriculum" section** with a section documenting the scraper. It must state: the command (`AISIS_COOKIE='...' npm run scrape:curricula`), how to get the cookie (log into AISIS → DevTools → Application → Cookies), that the cookie is env-var-only and never stored or logged, that the run takes roughly 7 minutes for ~250 programs at 1.5 s each, that only the newest version-year per program is imported, that it refuses to write on a suspiciously partial run unless `--force`, and that the follow-up is `npm run validate:data` then `npm run push:data`. Keep the existing note that a hand-transcribed program can still be added by writing the JSON directly.

- [ ] **Step 2: Verify docs match reality** — reread the section against `tools/scrape-curricula.mjs` and confirm every command, env var, and flag named in it exists exactly as written.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the curricula scraper workflow"
```

---

### Task 7: Live bulk run and publish

**USER-ASSISTED task.** Only the user can supply the AISIS session.

- [ ] **Step 1 (USER):** Log into AISIS, copy the session cookie from DevTools → Application → Cookies, and run from the repo root:

```bash
AISIS_COOKIE='<paste cookie here>' npm run scrape:curricula
```

Expect ~7 minutes, a per-program progress line, and a final count plus warnings summary.

- [ ] **Step 2 (orchestrator):** Review the run. Check `git status` / `git diff --stat data/curricula/` for the file count, read the warnings summary, and spot-check two or three parsed programs against what AISIS shows. Confirm `data/curricula/BS-AMDSc-M-DSc-2024.json` either matches its previous content or that any difference is explainable (the scraper output is authoritative going forward).

- [ ] **Step 3 (orchestrator):** Run `npm run validate:data`. Expect exit 0. Investigate every `Data validation failed:` line before proceeding — those are hard failures, unlike the informational "not offered" report.

- [ ] **Step 4: Commit the data**

```bash
git add data/curricula
git commit -m "data: import all AISIS program curricula"
```

- [ ] **Step 5 (USER):** Publish to Supabase:

```bash
SUPABASE_SERVICE_ROLE_KEY=<key> npm run push:data
```

- [ ] **Step 6 (orchestrator):** Verify via the Supabase connector (`select count(*) from programs;` — expect roughly the scraped count) and click through the running app to confirm the program picker lists them and a non-AMDSc program produces schedules.
