# AISIS Enlistment Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static React web app that generates and ranks all conflict-free class schedules from an imported AISIS catalog, with lock/mark-full re-ranking for enlistment day.

**Architecture:** Single-page Vite + React + TypeScript app, deployed as a static site. All scheduling logic (parser, generator, ranker, prof matching) lives in pure, framework-free modules under `src/lib/`. Catalog and prof-rating JSON are bundled at build time and accessed only through `src/lib/catalog.ts` (the future API swap point). All user state is in versioned localStorage.

**Tech Stack:** Vite 5, React 18, TypeScript 5 (strict), Vitest 2 + jsdom + @testing-library/react. No backend, no other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-07-19-aisis-scheduler-design.md`

## Global Constraints

- TypeScript `strict: true`; all code type-checks with `npm run build`.
- Files under `src/lib/` MUST NOT import React, DOM APIs (except `src/lib/storage.ts` which uses `localStorage`), or anything from `src/components/`.
- All catalog/ratings reads go through `src/lib/catalog.ts`. No other file imports the JSON data files.
- Times are integer minutes-from-midnight (e.g. 0800 → 480).
- Section identity everywhere is `sectionKey(section)` = `` `${courseCode} ${sectionCode}` `` (e.g. `"PHILO 11 A"`).
- localStorage schema is versioned: `STORAGE_VERSION = 1`, storage key `"aisis-scheduler-state"`.
- The parser NEVER throws on bad input — it returns warnings.
- Test command: `npx vitest run` (all tests), `npm run build` must pass before every commit.
- Parser fixtures are best-guess placeholders until a real AISIS sample arrives (spec §12 item 1); they are marked with a `PLACEHOLDER FIXTURE` comment and must not be silently treated as ground truth.
- Working directory for all commands: repo root `/Users/princeangelorivera/Documents/PROJECTS/aisis-scheduler`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a building, testable Vite+React+TS project. Later tasks rely on scripts `npm run build`, `npx vitest run`, and vitest configured with `environment: "jsdom"`.

- [ ] **Step 1: Write the scaffold files**

`package.json`:

```json
{
  "name": "aisis-scheduler",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vitest": "^2.0.3"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom" },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AISIS Scheduler</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules
dist
```

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/App.tsx` (placeholder; replaced in Task 9):

```tsx
export default function App() {
  return <h1>AISIS Scheduler</h1>;
}
```

`src/index.css`:

```css
:root { font-family: system-ui, sans-serif; color-scheme: light dark; }
body { margin: 0; }
main { max-width: 960px; margin: 0 auto; padding: 1rem; }
.banner { background: #fef3c7; color: #92400e; padding: 0.5rem 1rem; border-radius: 6px; }
nav button { margin-right: 0.5rem; }
nav button.active { font-weight: bold; text-decoration: underline; }
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` and `package-lock.json` created.

- [ ] **Step 3: Verify tests run**

Run: `npm test`
Expected: exit 0 with "No test files found" (passWithNoTests).

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: `tsc` silent, Vite writes `dist/` with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS project with Vitest"
```

---

### Task 2: Core types and time utilities

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/time.ts`
- Test: `src/lib/time.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - All types below, exported from `src/lib/types.ts`.
  - `sectionKey(s: Section): string`
  - `parseTimeRange(text: string): { start: number; end: number } | null`
  - `overlaps(a: Meeting, b: Meeting): boolean`
  - `formatTime(minutes: number): string` — e.g. `480` → `"8:00 AM"`

- [ ] **Step 1: Write `src/lib/types.ts`** (no test needed — types only, plus one trivial function tested via time.test.ts consumers later)

```ts
export type Day = "M" | "T" | "W" | "TH" | "F" | "SAT" | "SUN";

export interface Meeting {
  days: Day[];
  start: number; // minutes from midnight
  end: number;
}

export interface Section {
  courseCode: string;   // "PHILO 11"
  sectionCode: string;  // "A", "B2"
  title: string;
  units: number;
  instructor: string;   // as printed by AISIS, e.g. "GARCIA, JUAN"
  meetings: Meeting[];  // empty ⇒ TBA (excluded from conflict math)
  room: string;
  remarks: string;
  raw: string;          // original row text for debugging/fixtures
}

export interface Catalog {
  semester: string;     // e.g. "2026-1"
  exportedAt: string;   // ISO timestamp
  sections: Section[];
  warnings: string[];
}

export interface ProfRating {
  name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  note?: string;
  asOf?: string;
}

export type RankCriterion =
  | "compactDays"
  | "fewestDays"
  | "lateStart"
  | "earlyEnd"
  | "preferredProfs";

export interface Preferences {
  criteria: RankCriterion[];      // ordered by priority; default ["compactDays"]
  earliestStart?: number;
  latestEnd?: number;
  protectedBlocks: Meeting[];
  excludedSections: string[];     // sectionKeys
}

export interface UserState {
  version: number;
  semester: string;
  chosenCourses: string[];        // course codes
  lockedSections: string[];       // sectionKeys
  fullSections: string[];         // sectionKeys
  preferences: Preferences;
  personalRatings: ProfRating[];
}

export type Schedule = Section[];

export interface Diagnostics {
  perCourse: { courseCode: string; total: number; afterFilters: number }[];
  conflictPairs: { a: string; b: string }[];
}

export function sectionKey(s: Section): string {
  return `${s.courseCode} ${s.sectionCode}`;
}
```

- [ ] **Step 2: Write the failing tests** — `src/lib/time.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseTimeRange, overlaps, formatTime } from "./time";
import type { Meeting } from "./types";

describe("parseTimeRange", () => {
  it("parses AISIS 0800-0930 style ranges", () => {
    expect(parseTimeRange("0800-0930")).toEqual({ start: 480, end: 570 });
    expect(parseTimeRange("1330-1430")).toEqual({ start: 810, end: 870 });
  });
  it("returns null for garbage or inverted ranges", () => {
    expect(parseTimeRange("TBA")).toBeNull();
    expect(parseTimeRange("0930-0800")).toBeNull();
    expect(parseTimeRange("8:00-9:30")).toBeNull();
  });
});

describe("overlaps", () => {
  const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });
  it("detects overlap on a shared day", () => {
    expect(overlaps(m(["M", "TH"], 480, 570), m(["TH"], 540, 630))).toBe(true);
  });
  it("no overlap on different days even at same time", () => {
    expect(overlaps(m(["M"], 480, 570), m(["T"], 480, 570))).toBe(false);
  });
  it("back-to-back classes do not overlap", () => {
    expect(overlaps(m(["M"], 480, 570), m(["M"], 570, 660))).toBe(false);
  });
});

describe("formatTime", () => {
  it("formats minutes as 12-hour time", () => {
    expect(formatTime(480)).toBe("8:00 AM");
    expect(formatTime(810)).toBe("1:30 PM");
    expect(formatTime(720)).toBe("12:00 PM");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/time.test.ts`
Expected: FAIL — cannot resolve `./time`.

- [ ] **Step 4: Write `src/lib/time.ts`**

```ts
import type { Meeting } from "./types";

export function parseTimeRange(text: string): { start: number; end: number } | null {
  const m = text.trim().match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (start >= end || Number(m[2]) > 59 || Number(m[4]) > 59 || end > 24 * 60) return null;
  return { start, end };
}

export function overlaps(a: Meeting, b: Meeting): boolean {
  const sharedDay = a.days.some((d) => b.days.includes(d));
  return sharedDay && a.start < b.end && b.start < a.end;
}

export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${suffix}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/time.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/time.ts src/lib/time.test.ts
git commit -m "feat: core types and time utilities"
```

---

### Task 3: AISIS table parser

**Files:**
- Create: `src/lib/fixtures/aisis-sample.ts`
- Create: `src/lib/parser.ts`
- Test: `src/lib/parser.test.ts`

**Interfaces:**
- Consumes: `parseTimeRange` from `src/lib/time.ts`; `Day`, `Meeting`, `Section` from `src/lib/types.ts`.
- Produces:
  - `parseAisisTable(text: string): { sections: Section[]; warnings: string[] }` — used by Import page (Task 12) and to regenerate catalog JSON.
  - `parseDays(token: string): Day[] | null`
  - `parseMeetings(cell: string): { meetings: Meeting[]; ok: boolean }`
  - `AISIS_SAMPLE: string` fixture — reused by generator/ranker/UI tests.

- [ ] **Step 1: Write the fixture** — `src/lib/fixtures/aisis-sample.ts`

```ts
// PLACEHOLDER FIXTURE — best-guess AISIS class-schedule table format.
// Replace with a REAL copied AISIS table when available (spec §12 open item 1).
// Columns: Subject Code | Section | Course Title | Units | Time | Room | Instructor
//          | Max No. | Lang | Level | Free Slots | Remarks
export const AISIS_SAMPLE = [
  "Subject Code\tSection\tCourse Title\tUnits\tTime\tRoom\tInstructor\tMax No.\tLang\tLevel\tFree Slots\tRemarks",
  "PHILO 11\tA\tPHILOSOPHY OF THE HUMAN PERSON I\t3\tM-TH 0800-0930\tCTC 102\tGARCIA, JUAN\t35\tENG\tU\t12\t",
  "PHILO 11\tB\tPHILOSOPHY OF THE HUMAN PERSON I\t3\tT-F 1100-1230\tCTC 105\tSANTOS, ANA\t35\tENG\tU\t3\t",
  "CSCI 30\tA\tDATA STRUCTURES AND ALGORITHMS\t3\tM-TH 0930-1100\tCTC 118\tSY, MARIA\t30\tENG\tU\t0\t",
  "CSCI 30\tB2\tDATA STRUCTURES AND ALGORITHMS\t3\tT-F 1300-1430\tCTC 118\tSY, MARIA\t30\tENG\tU\t8\t",
  "MATH 31.1\tC\tCALCULUS LAB\t1\tW 1400-1700\tSEC A201\tTBA\t25\tENG\tU\t5\t",
  "PHYS 72.1\tD\tPHYSICS LAB\t1\tM 1000-1100/SAT 0900-1200\tSEC B105\tREYES, PEDRO\t20\tENG\tU\t3\tLEC+LAB",
  "NSTP 11\tA\tCWTS STREAM\t(3)\tTBA\tTBA\tTBA\t50\tFIL\tU\t50\t",
].join("\n");

// Deliberately malformed rows for warning-path tests.
export const AISIS_SAMPLE_WITH_BAD_ROWS =
  AISIS_SAMPLE +
  "\n" +
  [
    "THEO 11\tA\tFOUNDATIONS OF THEOLOGY\t3\tM-TH 25:00-2600\tCTC 201\tCRUZ, JOSE\t35\tENG\tU\t9\t",
    "not a real row at all",
  ].join("\n");
```

- [ ] **Step 2: Write the failing tests** — `src/lib/parser.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseAisisTable, parseDays, parseMeetings } from "./parser";
import { AISIS_SAMPLE, AISIS_SAMPLE_WITH_BAD_ROWS } from "./fixtures/aisis-sample";

describe("parseDays", () => {
  it("expands Ateneo day-pair notation", () => {
    expect(parseDays("M-TH")).toEqual(["M", "TH"]);
    expect(parseDays("T-F")).toEqual(["T", "F"]);
    expect(parseDays("SAT")).toEqual(["SAT"]);
    expect(parseDays("MWF")).toEqual(["M", "W", "F"]);
    expect(parseDays("TTH")).toEqual(["T", "TH"]);
  });
  it("rejects unknown tokens", () => {
    expect(parseDays("XYZ")).toBeNull();
    expect(parseDays("")).toBeNull();
  });
});

describe("parseMeetings", () => {
  it("parses a single meeting", () => {
    expect(parseMeetings("M-TH 0800-0930")).toEqual({
      meetings: [{ days: ["M", "TH"], start: 480, end: 570 }],
      ok: true,
    });
  });
  it("parses slash-separated multiple meetings (lec+lab)", () => {
    expect(parseMeetings("M 1000-1100/SAT 0900-1200")).toEqual({
      meetings: [
        { days: ["M"], start: 600, end: 660 },
        { days: ["SAT"], start: 540, end: 720 },
      ],
      ok: true,
    });
  });
  it("treats TBA and empty as no meetings, ok", () => {
    expect(parseMeetings("TBA")).toEqual({ meetings: [], ok: true });
    expect(parseMeetings("")).toEqual({ meetings: [], ok: true });
  });
  it("flags unparseable time as not ok", () => {
    expect(parseMeetings("M-TH 25:00-2600").ok).toBe(false);
  });
});

describe("parseAisisTable", () => {
  it("parses the sample, skipping the header", () => {
    const { sections, warnings } = parseAisisTable(AISIS_SAMPLE);
    expect(sections).toHaveLength(7);
    expect(warnings).toHaveLength(0);
    const philo = sections[0];
    expect(philo.courseCode).toBe("PHILO 11");
    expect(philo.sectionCode).toBe("A");
    expect(philo.units).toBe(3);
    expect(philo.instructor).toBe("GARCIA, JUAN");
    expect(philo.meetings).toEqual([{ days: ["M", "TH"], start: 480, end: 570 }]);
  });
  it("parses parenthesized units and TBA sections", () => {
    const { sections } = parseAisisTable(AISIS_SAMPLE);
    const nstp = sections.find((s) => s.courseCode === "NSTP 11")!;
    expect(nstp.units).toBe(3);
    expect(nstp.meetings).toEqual([]);
  });
  it("never throws on bad rows; emits warnings instead", () => {
    const { sections, warnings } = parseAisisTable(AISIS_SAMPLE_WITH_BAD_ROWS);
    expect(warnings.length).toBe(2);
    // bad-time row is still imported, as TBA-like
    const theo = sections.find((s) => s.courseCode === "THEO 11")!;
    expect(theo.meetings).toEqual([]);
  });
  it("falls back to multi-space splitting when there are no tabs", () => {
    const spaced = "HISTO 11  A  RIZAL AND THE EMERGENCE OF THE NATION  3  M-TH 1230-1400  BEL 204  DELA CRUZ, RIA  35  ENG  U  10  ";
    const { sections, warnings } = parseAisisTable(spaced);
    expect(warnings).toHaveLength(0);
    expect(sections[0].courseCode).toBe("HISTO 11");
    expect(sections[0].meetings[0].days).toEqual(["M", "TH"]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/parser.test.ts`
Expected: FAIL — cannot resolve `./parser`.

- [ ] **Step 4: Write `src/lib/parser.ts`**

```ts
import type { Day, Meeting, Section } from "./types";
import { parseTimeRange } from "./time";

// Longest tokens first so "TH" wins over "T" when scanning compact strings.
const DAY_TOKENS: Day[] = ["SAT", "SUN", "TH", "M", "T", "W", "F"];

export function parseDays(token: string): Day[] | null {
  const cleaned = token.toUpperCase().trim();
  if (!cleaned) return null;
  const parts = cleaned.includes("-") ? cleaned.split("-") : [cleaned];
  const days: Day[] = [];
  for (const part of parts) {
    let rest = part.trim();
    if (!rest) return null;
    while (rest.length > 0) {
      const match = DAY_TOKENS.find((d) => rest.startsWith(d));
      if (!match) return null;
      days.push(match);
      rest = rest.slice(match.length);
    }
  }
  return days.length > 0 ? days : null;
}

export function parseMeetings(cell: string): { meetings: Meeting[]; ok: boolean } {
  const text = cell.trim();
  if (!text || text.toUpperCase() === "TBA") return { meetings: [], ok: true };
  const meetings: Meeting[] = [];
  for (const chunk of text.split("/")) {
    const m = chunk.trim().match(/^(.+?)\s+(\S+)$/);
    if (!m) return { meetings: [], ok: false };
    const days = parseDays(m[1]);
    const range = parseTimeRange(m[2]);
    if (!days || !range) return { meetings: [], ok: false };
    meetings.push({ days, start: range.start, end: range.end });
  }
  return { meetings, ok: true };
}

const COL = { subjectCode: 0, section: 1, title: 2, units: 3, time: 4, room: 5, instructor: 6, remarks: 11 };
const MIN_COLUMNS = 7;

export function parseAisisTable(text: string): { sections: Section[]; warnings: string[] } {
  const sections: Section[] = [];
  const warnings: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    if (/subject\s*code/i.test(raw)) continue; // header row
    let cells = line.split("\t").map((c) => c.trim());
    if (cells.length < MIN_COLUMNS) cells = raw.split(/ {2,}/).map((c) => c.trim());
    if (cells.length < MIN_COLUMNS) {
      warnings.push(`Skipped row (unrecognized format): ${raw}`);
      continue;
    }
    const units = Number(cells[COL.units].replace(/[()]/g, ""));
    const { meetings, ok } = parseMeetings(cells[COL.time]);
    if (!ok) {
      warnings.push(`Unparseable time "${cells[COL.time]}" — imported without schedule (treated as TBA): ${raw}`);
    }
    sections.push({
      courseCode: cells[COL.subjectCode],
      sectionCode: cells[COL.section],
      title: cells[COL.title],
      units: Number.isFinite(units) ? units : 0,
      instructor: cells[COL.instructor] ?? "",
      meetings,
      room: cells[COL.room] ?? "",
      remarks: cells[COL.remarks] ?? "",
      raw,
    });
  }
  return { sections, warnings };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/parser.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/parser.ts src/lib/parser.test.ts src/lib/fixtures/aisis-sample.ts
git commit -m "feat: AISIS table parser with warning-based error handling"
```

---

### Task 4: Professor name matching and ratings merge

**Files:**
- Create: `src/lib/profs.ts`
- Test: `src/lib/profs.test.ts`

**Interfaces:**
- Consumes: `ProfRating` from `src/lib/types.ts`.
- Produces (used by ranker Task 6 and Preferences UI Task 10):
  - `normalizeName(name: string): string` — `"GARCIA, JUAN"` → `"juan garcia"`
  - `mergeRatings(community: ProfRating[], personal: ProfRating[]): Map<string, ProfRating>` — keys are normalized names; personal overrides community.
  - `ratingFor(instructor: string, merged: Map<string, ProfRating>): ProfRating | undefined` — exact normalized match, else unique-last-name fuzzy fallback, else undefined.

- [ ] **Step 1: Write the failing tests** — `src/lib/profs.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { normalizeName, mergeRatings, ratingFor } from "./profs";
import type { ProfRating } from "./types";

const r = (name: string, rating: ProfRating["rating"]): ProfRating => ({ name, rating });

describe("normalizeName", () => {
  it("swaps LASTNAME, FIRSTNAME to firstname lastname", () => {
    expect(normalizeName("GARCIA, JUAN")).toBe("juan garcia");
  });
  it("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeName("  Dela  Cruz,  Ma.  Ria ")).toBe("ma ria dela cruz");
    expect(normalizeName("Juan Garcia")).toBe("juan garcia");
  });
});

describe("mergeRatings", () => {
  it("personal overrides community for the same prof", () => {
    const merged = mergeRatings([r("GARCIA, JUAN", 2)], [r("Juan Garcia", 5)]);
    expect(merged.get("juan garcia")?.rating).toBe(5);
  });
  it("keeps community entries without personal override", () => {
    const merged = mergeRatings([r("SY, MARIA", 4)], []);
    expect(merged.get("maria sy")?.rating).toBe(4);
  });
});

describe("ratingFor", () => {
  const merged = mergeRatings([r("GARCIA, JUAN", 4), r("SY, MARIA", 5), r("SY, PEDRO", 2)], []);
  it("finds exact normalized matches across name formats", () => {
    expect(ratingFor("Juan Garcia", merged)?.rating).toBe(4);
  });
  it("falls back to last name only when unique", () => {
    expect(ratingFor("GARCIA, J.", merged)?.rating).toBe(4);
  });
  it("returns undefined when last name is ambiguous", () => {
    expect(ratingFor("SY, M.A.", merged)).toBeUndefined();
  });
  it("returns undefined for unknown profs and TBA", () => {
    expect(ratingFor("UNKNOWN, PERSON", merged)).toBeUndefined();
    expect(ratingFor("TBA", merged)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/profs.test.ts`
Expected: FAIL — cannot resolve `./profs`.

- [ ] **Step 3: Write `src/lib/profs.ts`**

```ts
import type { ProfRating } from "./types";

export function normalizeName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const comma = cleaned.indexOf(",");
  if (comma >= 0) {
    const last = cleaned.slice(0, comma).trim();
    const first = cleaned.slice(comma + 1).replace(/,/g, " ").replace(/\s+/g, " ").trim();
    return `${first} ${last}`.trim();
  }
  return cleaned;
}

export function mergeRatings(
  community: ProfRating[],
  personal: ProfRating[]
): Map<string, ProfRating> {
  const merged = new Map<string, ProfRating>();
  for (const rating of community) merged.set(normalizeName(rating.name), rating);
  for (const rating of personal) merged.set(normalizeName(rating.name), rating);
  return merged;
}

export function ratingFor(
  instructor: string,
  merged: Map<string, ProfRating>
): ProfRating | undefined {
  const key = normalizeName(instructor);
  if (!key) return undefined;
  const exact = merged.get(key);
  if (exact) return exact;
  const lastName = key.split(" ").pop();
  if (!lastName) return undefined;
  const candidates = [...merged.entries()].filter(([k]) => k.split(" ").includes(lastName));
  return candidates.length === 1 ? candidates[0][1] : undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/profs.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profs.ts src/lib/profs.test.ts
git commit -m "feat: professor name normalization and ratings merge"
```

---

### Task 5: Schedule generator

**Files:**
- Create: `src/lib/generator.ts`
- Test: `src/lib/generator.test.ts`

**Interfaces:**
- Consumes: `overlaps` from `src/lib/time.ts`; `Diagnostics`, `Schedule`, `Section`, `UserState`, `sectionKey` from `src/lib/types.ts`.
- Produces (used by Results UI Task 11 and smoke test Task 14):
  - `interface GenerateResult { schedules: Schedule[]; diagnostics: Diagnostics | null }`
  - `generate(all: Section[], state: UserState): GenerateResult` — diagnostics is non-null exactly when `schedules` is empty.
  - Filter semantics: locked sections bypass ALL filters and pin their course; full/excluded sections are removed; sections violating `earliestStart`/`latestEnd`/`protectedBlocks` are removed; TBA sections (no meetings) pass time filters and never conflict.

- [ ] **Step 1: Write the failing tests** — `src/lib/generator.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { generate } from "./generator";
import type { Meeting, Section, UserState } from "./types";
import { sectionKey } from "./types";

function sec(courseCode: string, sectionCode: string, meetings: Meeting[]): Section {
  return {
    courseCode, sectionCode, meetings,
    title: courseCode, units: 3, instructor: "TBA", room: "X", remarks: "", raw: "",
  };
}
const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });

function state(overrides: Partial<UserState>): UserState {
  return {
    version: 1, semester: "2026-1", chosenCourses: [], lockedSections: [],
    fullSections: [], personalRatings: [],
    preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
    ...overrides,
  };
}

// A: two sections; B: two sections; A2 conflicts with B1.
const A1 = sec("COURSE A", "1", [m(["M", "TH"], 480, 570)]);
const A2 = sec("COURSE A", "2", [m(["T", "F"], 600, 690)]);
const B1 = sec("COURSE B", "1", [m(["T", "F"], 600, 690)]);
const B2 = sec("COURSE B", "2", [m(["T", "F"], 720, 810)]);
const ALL = [A1, A2, B1, B2];
const CHOSEN = { chosenCourses: ["COURSE A", "COURSE B"] };

describe("generate", () => {
  it("produces only conflict-free combinations", () => {
    const { schedules, diagnostics } = generate(ALL, state(CHOSEN));
    expect(diagnostics).toBeNull();
    const keys = schedules.map((s) => s.map(sectionKey).sort().join("|")).sort();
    expect(keys).toEqual([
      "COURSE A 1|COURSE B 1",
      "COURSE A 1|COURSE B 2",
      "COURSE A 2|COURSE B 2",
    ]);
  });

  it("honors locked sections", () => {
    const { schedules } = generate(ALL, state({ ...CHOSEN, lockedSections: ["COURSE A 2"] }));
    expect(schedules).toHaveLength(1);
    expect(schedules[0].map(sectionKey).sort()).toEqual(["COURSE A 2", "COURSE B 2"]);
  });

  it("removes sections marked full", () => {
    const { schedules } = generate(ALL, state({ ...CHOSEN, fullSections: ["COURSE B 2"] }));
    const keys = schedules.map((s) => s.map(sectionKey).sort().join("|"));
    expect(keys).toEqual(["COURSE A 1|COURSE B 1"]);
  });

  it("locked wins over marked-full", () => {
    const { schedules } = generate(
      ALL,
      state({ ...CHOSEN, lockedSections: ["COURSE B 2"], fullSections: ["COURSE B 2"] })
    );
    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules.every((s) => s.some((x) => sectionKey(x) === "COURSE B 2"))).toBe(true);
  });

  it("applies earliestStart filter", () => {
    const { schedules } = generate(ALL, state({ ...CHOSEN, preferences: {
      criteria: ["compactDays"], protectedBlocks: [], excludedSections: [], earliestStart: 540,
    }}));
    // A1 starts 480 < 540 → removed; only A2 remains for COURSE A
    expect(schedules.every((s) => s.some((x) => sectionKey(x) === "COURSE A 2"))).toBe(true);
  });

  it("removes sections overlapping protected blocks", () => {
    const { schedules } = generate(ALL, state({ ...CHOSEN, preferences: {
      criteria: ["compactDays"], excludedSections: [],
      protectedBlocks: [m(["T"], 700, 760)], // kills B2 (720-810 on T)
    }}));
    expect(schedules.every((s) => s.every((x) => sectionKey(x) !== "COURSE B 2"))).toBe(true);
  });

  it("TBA sections never conflict", () => {
    const tba = sec("COURSE C", "1", []);
    const { schedules, diagnostics } = generate([A1, tba], state({ chosenCourses: ["COURSE A", "COURSE C"] }));
    expect(diagnostics).toBeNull();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toHaveLength(2); // both sections present, TBA included
  });

  it("zero results yields per-course and pair diagnostics", () => {
    // Both courses only offer the same timeslot → impossible.
    const X1 = sec("COURSE X", "1", [m(["M"], 480, 570)]);
    const Y1 = sec("COURSE Y", "1", [m(["M"], 480, 570)]);
    const { schedules, diagnostics } = generate([X1, Y1], state({ chosenCourses: ["COURSE X", "COURSE Y"] }));
    expect(schedules).toHaveLength(0);
    expect(diagnostics).not.toBeNull();
    expect(diagnostics!.perCourse).toEqual([
      { courseCode: "COURSE X", total: 1, afterFilters: 1 },
      { courseCode: "COURSE Y", total: 1, afterFilters: 1 },
    ]);
    expect(diagnostics!.conflictPairs).toEqual([{ a: "COURSE X", b: "COURSE Y" }]);
  });

  it("zero results from over-filtering shows afterFilters: 0", () => {
    const { diagnostics } = generate(ALL, state({ ...CHOSEN, fullSections: ["COURSE B 1", "COURSE B 2"] }));
    expect(diagnostics!.perCourse).toContainEqual({ courseCode: "COURSE B", total: 2, afterFilters: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/generator.test.ts`
Expected: FAIL — cannot resolve `./generator`.

- [ ] **Step 3: Write `src/lib/generator.ts`**

```ts
import type { Diagnostics, Schedule, Section, UserState } from "./types";
import { sectionKey } from "./types";
import { overlaps } from "./time";

const MAX_SCHEDULES = 5000; // safety cap; far above realistic course loads

export interface GenerateResult {
  schedules: Schedule[];
  diagnostics: Diagnostics | null;
}

function sectionsConflict(a: Section, b: Section): boolean {
  for (const ma of a.meetings) {
    for (const mb of b.meetings) {
      if (overlaps(ma, mb)) return true;
    }
  }
  return false;
}

function passesFilters(s: Section, state: UserState): boolean {
  const key = sectionKey(s);
  if (state.fullSections.includes(key)) return false;
  if (state.preferences.excludedSections.includes(key)) return false;
  const { earliestStart, latestEnd, protectedBlocks } = state.preferences;
  for (const meeting of s.meetings) {
    if (earliestStart !== undefined && meeting.start < earliestStart) return false;
    if (latestEnd !== undefined && meeting.end > latestEnd) return false;
    for (const block of protectedBlocks) {
      if (overlaps(meeting, block)) return false;
    }
  }
  return true;
}

export function generate(all: Section[], state: UserState): GenerateResult {
  const perCourse: Diagnostics["perCourse"] = [];
  const candidates = new Map<string, Section[]>();

  for (const course of state.chosenCourses) {
    const total = all.filter((s) => s.courseCode === course);
    const locked = total.filter((s) => state.lockedSections.includes(sectionKey(s)));
    // A locked section pins the course and bypasses all filters.
    const filtered = locked.length > 0 ? locked : total.filter((s) => passesFilters(s, state));
    candidates.set(course, filtered);
    perCourse.push({ courseCode: course, total: total.length, afterFilters: filtered.length });
  }

  const order = [...state.chosenCourses].sort(
    (a, b) => candidates.get(a)!.length - candidates.get(b)!.length
  );
  const schedules: Schedule[] = [];
  const current: Section[] = [];

  const walk = (i: number): void => {
    if (schedules.length >= MAX_SCHEDULES) return;
    if (i === order.length) {
      schedules.push([...current]);
      return;
    }
    for (const s of candidates.get(order[i])!) {
      if (current.some((chosen) => sectionsConflict(chosen, s))) continue;
      current.push(s);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);

  if (schedules.length > 0) return { schedules, diagnostics: null };

  const conflictPairs: Diagnostics["conflictPairs"] = [];
  for (let i = 0; i < state.chosenCourses.length; i++) {
    for (let j = i + 1; j < state.chosenCourses.length; j++) {
      const aCourse = state.chosenCourses[i];
      const bCourse = state.chosenCourses[j];
      const as = candidates.get(aCourse)!;
      const bs = candidates.get(bCourse)!;
      if (as.length === 0 || bs.length === 0) continue;
      const compatible = as.some((a) => bs.some((b) => !sectionsConflict(a, b)));
      if (!compatible) conflictPairs.push({ a: aCourse, b: bCourse });
    }
  }
  return { schedules, diagnostics: { perCourse, conflictPairs } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/generator.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/generator.ts src/lib/generator.test.ts
git commit -m "feat: conflict-free schedule generator with locks, filters, diagnostics"
```

---

### Task 6: Schedule ranker

**Files:**
- Create: `src/lib/ranker.ts`
- Test: `src/lib/ranker.test.ts`

**Interfaces:**
- Consumes: `Preferences`, `ProfRating`, `RankCriterion`, `Schedule`, `sectionKey` from `src/lib/types.ts`; `ratingFor` from `src/lib/profs.ts`.
- Produces (used by Results UI Task 11):
  - `interface RankedSchedule { schedule: Schedule; score: number }`
  - `rank(schedules: Schedule[], prefs: Preferences, ratings: Map<string, ProfRating>): RankedSchedule[]` — sorted best-first; deterministic tie-break; empty `prefs.criteria` behaves as `["compactDays"]`.
  - Scoring: each criterion's raw metric is min-max normalized to 0..1 across the candidate set (0.5 when all equal); criterion i contributes with weight `1 / 2**i` (first criterion counts double the second, etc.).

- [ ] **Step 1: Write the failing tests** — `src/lib/ranker.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { rank } from "./ranker";
import { mergeRatings } from "./profs";
import type { Meeting, Preferences, Schedule, Section } from "./types";
import { sectionKey } from "./types";

function sec(courseCode: string, sectionCode: string, meetings: Meeting[], instructor = "TBA"): Section {
  return { courseCode, sectionCode, meetings, instructor,
    title: courseCode, units: 3, room: "X", remarks: "", raw: "" };
}
const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });
const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  criteria: ["compactDays"], protectedBlocks: [], excludedSections: [], ...over,
});
const noRatings = mergeRatings([], []);
const first = (ranked: { schedule: Schedule }[]) =>
  ranked[0].schedule.map(sectionKey).sort().join("|");

describe("rank", () => {
  it("compactDays prefers the schedule with smaller gaps", () => {
    const tight: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "1", [m(["M"], 570, 660)])];
    const gappy: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "2", [m(["M"], 780, 870)])];
    const ranked = rank([gappy, tight], prefs(), noRatings);
    expect(first(ranked)).toBe("A 1|B 1");
  });

  it("fewestDays prefers fewer campus days", () => {
    const twoDays: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "1", [m(["T"], 480, 570)])];
    const oneDay: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "2", [m(["M"], 600, 690)])];
    const ranked = rank([twoDays, oneDay], prefs({ criteria: ["fewestDays"] }), noRatings);
    expect(first(ranked)).toBe("A 1|B 2");
  });

  it("lateStart prefers later first classes; earlyEnd prefers earlier last classes", () => {
    const early: Schedule = [sec("A", "1", [m(["M"], 480, 570)])];
    const late: Schedule = [sec("A", "2", [m(["M"], 660, 750)])];
    expect(first(rank([early, late], prefs({ criteria: ["lateStart"] }), noRatings))).toBe("A 2");
    expect(first(rank([early, late], prefs({ criteria: ["earlyEnd"] }), noRatings))).toBe("A 1");
  });

  it("preferredProfs prefers higher-rated instructors; unrated scores neutral 3", () => {
    const good: Schedule = [sec("A", "1", [m(["M"], 480, 570)], "GARCIA, JUAN")];
    const bad: Schedule = [sec("A", "2", [m(["M"], 480, 570)], "CRUZ, JOSE")];
    const unknown: Schedule = [sec("A", "3", [m(["M"], 480, 570)], "WHO, KNOWS")];
    const ratings = mergeRatings(
      [{ name: "GARCIA, JUAN", rating: 5 }, { name: "CRUZ, JOSE", rating: 1 }], []);
    const ranked = rank([bad, unknown, good], prefs({ criteria: ["preferredProfs"] }), ratings);
    expect(ranked.map((r) => first([r]))).toEqual(["A 1", "A 3", "A 2"]);
  });

  it("first criterion outweighs the second", () => {
    // s1 wins compactDays, s2 wins fewestDays.
    const s1: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "1", [m(["M"], 570, 660), m(["T"], 480, 570)])];
    const s2: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "2", [m(["M"], 780, 870)])];
    const ranked = rank([s2, s1], prefs({ criteria: ["compactDays", "fewestDays"] }), noRatings);
    expect(first(ranked)).toBe("A 1|B 1");
  });

  it("is deterministic on ties", () => {
    const x: Schedule = [sec("A", "1", [m(["M"], 480, 570)])];
    const y: Schedule = [sec("A", "2", [m(["T"], 480, 570)])];
    const r1 = rank([x, y], prefs(), noRatings).map((r) => first([r]));
    const r2 = rank([y, x], prefs(), noRatings).map((r) => first([r]));
    expect(r1).toEqual(r2);
  });

  it("empty criteria defaults to compactDays", () => {
    const tight: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "1", [m(["M"], 570, 660)])];
    const gappy: Schedule = [sec("A", "1", [m(["M"], 480, 570)]), sec("B", "2", [m(["M"], 780, 870)])];
    const ranked = rank([gappy, tight], prefs({ criteria: [] }), noRatings);
    expect(first(ranked)).toBe("A 1|B 1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ranker.test.ts`
Expected: FAIL — cannot resolve `./ranker`.

- [ ] **Step 3: Write `src/lib/ranker.ts`**

```ts
import type { Day, ProfRating, Preferences, RankCriterion, Schedule } from "./types";
import { sectionKey } from "./types";
import { ratingFor } from "./profs";

export interface RankedSchedule {
  schedule: Schedule;
  score: number;
}

type DayIntervals = Map<Day, { start: number; end: number }[]>;

function intervalsByDay(schedule: Schedule): DayIntervals {
  const byDay: DayIntervals = new Map();
  for (const section of schedule) {
    for (const meeting of section.meetings) {
      for (const day of meeting.days) {
        const list = byDay.get(day) ?? [];
        list.push({ start: meeting.start, end: meeting.end });
        byDay.set(day, list);
      }
    }
  }
  return byDay;
}

// Raw metric per criterion. Sign convention: HIGHER is always BETTER.
function rawMetric(
  schedule: Schedule,
  criterion: RankCriterion,
  ratings: Map<string, ProfRating>
): number {
  const byDay = intervalsByDay(schedule);
  switch (criterion) {
    case "compactDays": {
      let gaps = 0;
      for (const list of byDay.values()) {
        list.sort((a, b) => a.start - b.start);
        for (let i = 1; i < list.length; i++) {
          gaps += Math.max(0, list[i].start - list[i - 1].end);
        }
      }
      return -gaps;
    }
    case "fewestDays":
      return -byDay.size;
    case "lateStart": {
      const starts = [...byDay.values()].map((l) => Math.min(...l.map((x) => x.start)));
      return starts.length ? starts.reduce((a, b) => a + b, 0) / starts.length : 0;
    }
    case "earlyEnd": {
      const ends = [...byDay.values()].map((l) => Math.max(...l.map((x) => x.end)));
      return ends.length ? -(ends.reduce((a, b) => a + b, 0) / ends.length) : 0;
    }
    case "preferredProfs": {
      const scores = schedule.map((s) => ratingFor(s.instructor, ratings)?.rating ?? 3);
      return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 3;
    }
  }
}

const scheduleId = (s: Schedule): string => s.map(sectionKey).sort().join("|");

export function rank(
  schedules: Schedule[],
  prefs: Preferences,
  ratings: Map<string, ProfRating>
): RankedSchedule[] {
  const criteria: RankCriterion[] = prefs.criteria.length > 0 ? prefs.criteria : ["compactDays"];
  const metrics = schedules.map((schedule) =>
    criteria.map((c) => rawMetric(schedule, c, ratings))
  );
  const mins = criteria.map((_, i) => Math.min(...metrics.map((row) => row[i])));
  const maxs = criteria.map((_, i) => Math.max(...metrics.map((row) => row[i])));

  const ranked = schedules.map((schedule, idx) => {
    let score = 0;
    criteria.forEach((_, i) => {
      const spread = maxs[i] - mins[i];
      const normalized = spread === 0 ? 0.5 : (metrics[idx][i] - mins[i]) / spread;
      score += normalized / 2 ** i;
    });
    return { schedule, score };
  });

  return ranked.sort(
    (a, b) => b.score - a.score || scheduleId(a.schedule).localeCompare(scheduleId(b.schedule))
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ranker.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ranker.ts src/lib/ranker.test.ts
git commit -m "feat: weighted multi-criteria schedule ranker"
```

---

### Task 7: Versioned localStorage state

**Files:**
- Create: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `Preferences`, `UserState` from `src/lib/types.ts`.
- Produces (used by App shell Task 9):
  - `STORAGE_VERSION = 1`, storage key `"aisis-scheduler-state"`.
  - `defaultState(semester: string): UserState` — default criteria `["compactDays"]`.
  - `loadState(semester: string): { state: UserState; wasReset: boolean }` — `wasReset` is true only when existing stored data was discarded (corrupt, wrong version, or different semester).
  - `saveState(state: UserState): void`

- [ ] **Step 1: Write the failing tests** — `src/lib/storage.test.ts`

```ts
import { beforeEach, describe, it, expect } from "vitest";
import { defaultState, loadState, saveState, STORAGE_VERSION } from "./storage";

const KEY = "aisis-scheduler-state";

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored (not a reset)", () => {
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(false);
    expect(state).toEqual(defaultState("2026-1"));
    expect(state.preferences.criteria).toEqual(["compactDays"]);
  });

  it("round-trips saved state", () => {
    const state = defaultState("2026-1");
    state.chosenCourses = ["PHILO 11"];
    saveState(state);
    expect(loadState("2026-1")).toEqual({ state, wasReset: false });
  });

  it("resets on corrupted JSON", () => {
    localStorage.setItem(KEY, "{not json");
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(true);
    expect(state).toEqual(defaultState("2026-1"));
  });

  it("resets on wrong version", () => {
    saveState({ ...defaultState("2026-1"), version: STORAGE_VERSION + 1 });
    expect(loadState("2026-1").wasReset).toBe(true);
  });

  it("resets on semester change", () => {
    saveState({ ...defaultState("2025-2"), chosenCourses: ["OLD 1"] });
    const { state, wasReset } = loadState("2026-1");
    expect(wasReset).toBe(true);
    expect(state.chosenCourses).toEqual([]);
  });

  it("resets on structurally invalid state", () => {
    localStorage.setItem(KEY, JSON.stringify({ version: STORAGE_VERSION, semester: "2026-1", chosenCourses: "oops" }));
    expect(loadState("2026-1").wasReset).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL — cannot resolve `./storage`.

- [ ] **Step 3: Write `src/lib/storage.ts`**

```ts
import type { Preferences, UserState } from "./types";

export const STORAGE_VERSION = 1;
const KEY = "aisis-scheduler-state";

const defaultPreferences = (): Preferences => ({
  criteria: ["compactDays"],
  protectedBlocks: [],
  excludedSections: [],
});

export function defaultState(semester: string): UserState {
  return {
    version: STORAGE_VERSION,
    semester,
    chosenCourses: [],
    lockedSections: [],
    fullSections: [],
    preferences: defaultPreferences(),
    personalRatings: [],
  };
}

function isValidState(v: unknown): v is UserState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  const isStringArray = (x: unknown) => Array.isArray(x) && x.every((e) => typeof e === "string");
  return (
    typeof s.version === "number" &&
    typeof s.semester === "string" &&
    isStringArray(s.chosenCourses) &&
    isStringArray(s.lockedSections) &&
    isStringArray(s.fullSections) &&
    Array.isArray(s.personalRatings) &&
    typeof s.preferences === "object" && s.preferences !== null &&
    Array.isArray((s.preferences as Record<string, unknown>).criteria) &&
    Array.isArray((s.preferences as Record<string, unknown>).protectedBlocks) &&
    isStringArray((s.preferences as Record<string, unknown>).excludedSections)
  );
}

export function loadState(semester: string): { state: UserState; wasReset: boolean } {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return { state: defaultState(semester), wasReset: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed) || parsed.version !== STORAGE_VERSION || parsed.semester !== semester) {
      return { state: defaultState(semester), wasReset: true };
    }
    return { state: parsed, wasReset: false };
  } catch {
    return { state: defaultState(semester), wasReset: true };
  }
}

export function saveState(state: UserState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat: versioned localStorage user state"
```

---

### Task 8: Catalog data layer (the swap point)

**Files:**
- Create: `src/data/catalog-2026-1.json`
- Create: `src/data/prof-ratings.json`
- Create: `src/lib/catalog.ts`
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `ProfRating` from `src/lib/types.ts`.
- Produces (the ONLY module allowed to import the JSON files; used by App Task 9):
  - `getCatalog(): Catalog`
  - `getCommunityRatings(): ProfRating[]`
  - `isStale(catalog: Catalog, now?: Date): boolean` — true when `exportedAt` is more than 30 days before `now`.

- [ ] **Step 1: Write the placeholder data files**

`src/data/catalog-2026-1.json` — PLACEHOLDER data mirroring the Task 3 fixture (replace via real AISIS export; spec §12). Note `exportedAt` is intentionally recent so the dev build doesn't show the staleness banner; the real export tool stamps the actual export time:

```json
{
  "semester": "2026-1",
  "exportedAt": "2026-07-20T00:00:00.000Z",
  "warnings": [],
  "sections": [
    { "courseCode": "PHILO 11", "sectionCode": "A", "title": "PHILOSOPHY OF THE HUMAN PERSON I", "units": 3, "instructor": "GARCIA, JUAN", "meetings": [{ "days": ["M", "TH"], "start": 480, "end": 570 }], "room": "CTC 102", "remarks": "", "raw": "" },
    { "courseCode": "PHILO 11", "sectionCode": "B", "title": "PHILOSOPHY OF THE HUMAN PERSON I", "units": 3, "instructor": "SANTOS, ANA", "meetings": [{ "days": ["T", "F"], "start": 660, "end": 750 }], "room": "CTC 105", "remarks": "", "raw": "" },
    { "courseCode": "CSCI 30", "sectionCode": "A", "title": "DATA STRUCTURES AND ALGORITHMS", "units": 3, "instructor": "SY, MARIA", "meetings": [{ "days": ["M", "TH"], "start": 570, "end": 660 }], "room": "CTC 118", "remarks": "", "raw": "" },
    { "courseCode": "CSCI 30", "sectionCode": "B2", "title": "DATA STRUCTURES AND ALGORITHMS", "units": 3, "instructor": "SY, MARIA", "meetings": [{ "days": ["T", "F"], "start": 780, "end": 870 }], "room": "CTC 118", "remarks": "", "raw": "" },
    { "courseCode": "MATH 31.1", "sectionCode": "C", "title": "CALCULUS LAB", "units": 1, "instructor": "TBA", "meetings": [{ "days": ["W"], "start": 840, "end": 1020 }], "room": "SEC A201", "remarks": "", "raw": "" },
    { "courseCode": "PHYS 72.1", "sectionCode": "D", "title": "PHYSICS LAB", "units": 1, "instructor": "REYES, PEDRO", "meetings": [{ "days": ["M"], "start": 600, "end": 660 }, { "days": ["SAT"], "start": 540, "end": 720 }], "room": "SEC B105", "remarks": "LEC+LAB", "raw": "" },
    { "courseCode": "NSTP 11", "sectionCode": "A", "title": "CWTS STREAM", "units": 3, "instructor": "TBA", "meetings": [], "room": "TBA", "remarks": "", "raw": "" }
  ]
}
```

`src/data/prof-ratings.json` — PLACEHOLDER; to be curated manually from "Ateneo Profs to Pick" (spec §5, §12):

```json
[
  { "name": "GARCIA, JUAN", "rating": 5, "note": "placeholder rating", "asOf": "2026-07-20" },
  { "name": "SY, MARIA", "rating": 4, "note": "placeholder rating", "asOf": "2026-07-20" }
]
```

- [ ] **Step 2: Write the failing tests** — `src/lib/catalog.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { getCatalog, getCommunityRatings, isStale } from "./catalog";

describe("catalog data layer", () => {
  it("returns the bundled catalog with sections", () => {
    const catalog = getCatalog();
    expect(catalog.semester).toBe("2026-1");
    expect(catalog.sections.length).toBeGreaterThan(0);
    expect(catalog.sections[0].courseCode).toBe("PHILO 11");
  });

  it("returns community ratings", () => {
    expect(getCommunityRatings().length).toBeGreaterThan(0);
  });

  it("isStale is false within 30 days, true after", () => {
    const catalog = { ...getCatalog(), exportedAt: "2026-07-01T00:00:00.000Z" };
    expect(isStale(catalog, new Date("2026-07-20T00:00:00.000Z"))).toBe(false);
    expect(isStale(catalog, new Date("2026-08-05T00:00:00.000Z"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: FAIL — cannot resolve `./catalog`.

- [ ] **Step 4: Write `src/lib/catalog.ts`**

```ts
import type { Catalog, ProfRating } from "./types";
import catalogJson from "../data/catalog-2026-1.json";
import ratingsJson from "../data/prof-ratings.json";

// This module is the ONLY place the bundled JSON is read. Swapping the static
// files for an API later means changing only this file (spec §3, §11).

const STALE_AFTER_DAYS = 30;

export function getCatalog(): Catalog {
  return catalogJson as Catalog;
}

export function getCommunityRatings(): ProfRating[] {
  return ratingsJson as ProfRating[];
}

export function isStale(catalog: Catalog, now: Date = new Date()): boolean {
  const exported = new Date(catalog.exportedAt).getTime();
  if (Number.isNaN(exported)) return true;
  return now.getTime() - exported > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the JSON satisfies the Catalog type**

Run: `npm run build`
Expected: no type errors (the `as Catalog` cast compiles and `resolveJsonModule` is on).

- [ ] **Step 7: Commit**

```bash
git add src/data/catalog-2026-1.json src/data/prof-ratings.json src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "feat: catalog data layer over bundled placeholder JSON"
```

---

### Task 9: App shell and course picker

**Files:**
- Modify: `src/App.tsx` (replace the Task 1 placeholder entirely)
- Create: `src/components/CoursePicker.tsx`
- Test: `src/components/CoursePicker.test.tsx`

**Interfaces:**
- Consumes: `getCatalog`, `isStale` from `src/lib/catalog.ts`; `loadState`, `saveState` from `src/lib/storage.ts`; `Catalog`, `UserState` from `src/lib/types.ts`.
- Produces:
  - `CoursePicker` component: `{ catalog: Catalog; chosen: string[]; onChange: (chosen: string[]) => void }`.
  - App tab structure with tabs `courses | preferences | results | import`; Tasks 10–12 each replace one stub line in `src/App.tsx` with their component.
  - App owns the single `UserState` and persists it via `saveState` on every change; Tasks 10–12 receive `state` + `onChange` from App.

- [ ] **Step 1: Write the failing test** — `src/components/CoursePicker.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CoursePicker } from "./CoursePicker";
import type { Catalog, Section } from "../lib/types";

const sec = (courseCode: string, sectionCode: string, title: string): Section => ({
  courseCode, sectionCode, title, units: 3, instructor: "TBA", meetings: [], room: "", remarks: "", raw: "",
});
const catalog: Catalog = {
  semester: "2026-1", exportedAt: "2026-07-20T00:00:00.000Z", warnings: [],
  sections: [sec("PHILO 11", "A", "PHILOSOPHY I"), sec("PHILO 11", "B", "PHILOSOPHY I"), sec("CSCI 30", "A", "DATA STRUCTURES")],
};

afterEach(cleanup);

describe("CoursePicker", () => {
  it("lists unique courses with section counts", () => {
    render(<CoursePicker catalog={catalog} chosen={[]} onChange={() => {}} />);
    expect(screen.getByText(/PHILO 11/).textContent).toBeTruthy();
    expect(screen.getByLabelText(/PHILO 11.*2 sections/)).toBeTruthy();
    expect(screen.getByLabelText(/CSCI 30.*1 section\b/)).toBeTruthy();
  });

  it("toggling a course calls onChange with it added", () => {
    const onChange = vi.fn();
    render(<CoursePicker catalog={catalog} chosen={[]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/CSCI 30/));
    expect(onChange).toHaveBeenCalledWith(["CSCI 30"]);
  });

  it("search filters the list", () => {
    render(<CoursePicker catalog={catalog} chosen={[]} onChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Search courses…"), { target: { value: "csci" } });
    expect(screen.queryByLabelText(/PHILO 11/)).toBeNull();
    expect(screen.getByLabelText(/CSCI 30/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CoursePicker.test.tsx`
Expected: FAIL — cannot resolve `./CoursePicker`.

- [ ] **Step 3: Write `src/components/CoursePicker.tsx`**

```tsx
import { useMemo, useState } from "react";
import type { Catalog } from "../lib/types";

interface Props {
  catalog: Catalog;
  chosen: string[];
  onChange: (chosen: string[]) => void;
}

export function CoursePicker({ catalog, chosen, onChange }: Props) {
  const [search, setSearch] = useState("");
  const courses = useMemo(() => {
    const byCode = new Map<string, { title: string; sections: number }>();
    for (const s of catalog.sections) {
      const entry = byCode.get(s.courseCode) ?? { title: s.title, sections: 0 };
      entry.sections += 1;
      byCode.set(s.courseCode, entry);
    }
    return [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const visible = courses.filter(([code, info]) =>
    `${code} ${info.title}`.toLowerCase().includes(search.toLowerCase())
  );
  const toggle = (code: string) =>
    onChange(chosen.includes(code) ? chosen.filter((c) => c !== code) : [...chosen, code]);

  return (
    <section>
      <h2>Pick your courses this semester</h2>
      <input placeholder="Search courses…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul>
        {visible.map(([code, info]) => (
          <li key={code}>
            <label>
              <input type="checkbox" checked={chosen.includes(code)} onChange={() => toggle(code)} />{" "}
              <strong>{code}</strong> — {info.title} ({info.sections} section{info.sections === 1 ? "" : "s"})
            </label>
          </li>
        ))}
      </ul>
      <p>{chosen.length} course(s) chosen.</p>
    </section>
  );
}
```

- [ ] **Step 4: Replace `src/App.tsx` entirely with the tabbed shell**

```tsx
import { useEffect, useMemo, useState } from "react";
import { getCatalog, isStale } from "./lib/catalog";
import { loadState, saveState } from "./lib/storage";
import type { UserState } from "./lib/types";
import { CoursePicker } from "./components/CoursePicker";

type Tab = "courses" | "preferences" | "results" | "import";
const TABS: { id: Tab; label: string }[] = [
  { id: "courses", label: "Courses" },
  { id: "preferences", label: "Preferences" },
  { id: "results", label: "Results" },
  { id: "import", label: "Import" },
];

export default function App() {
  const catalog = useMemo(() => getCatalog(), []);
  const [loaded] = useState(() => loadState(catalog.semester));
  const [state, setState] = useState<UserState>(loaded.state);
  const [tab, setTab] = useState<Tab>("courses");
  useEffect(() => { saveState(state); }, [state]);

  return (
    <main>
      <h1>AISIS Scheduler</h1>
      <nav>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {isStale(catalog) && (
        <p className="banner">This catalog data is over 30 days old — it may be outdated.</p>
      )}
      {loaded.wasReset && (
        <p className="banner">Saved settings were invalid or from another semester, so they were reset.</p>
      )}
      {tab === "courses" && (
        <CoursePicker
          catalog={catalog}
          chosen={state.chosenCourses}
          onChange={(chosenCourses) => setState((s) => ({ ...s, chosenCourses }))}
        />
      )}
      {tab === "preferences" && <p>Preferences — added in Task 10.</p>}
      {tab === "results" && <p>Results — added in Task 11.</p>}
      {tab === "import" && <p>Import — added in Task 12.</p>}
    </main>
  );
}
```

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run src/components/CoursePicker.test.tsx && npm run build`
Expected: PASS (3 tests); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/CoursePicker.tsx src/components/CoursePicker.test.tsx
git commit -m "feat: tabbed app shell with course picker"
```

---

### Task 10: Preferences panel

**Files:**
- Create: `src/components/PreferencesPanel.tsx`
- Modify: `src/App.tsx` (wire in the component)
- Test: `src/components/PreferencesPanel.test.tsx`

**Interfaces:**
- Consumes: `Catalog`, `Day`, `Meeting`, `ProfRating`, `RankCriterion`, `UserState` from `src/lib/types.ts`; `formatTime` from `src/lib/time.ts`.
- Produces: `PreferencesPanel` component: `{ catalog: Catalog; state: UserState; onChange: (s: UserState) => void }`. Criteria order = click order (checking appends to `preferences.criteria`, unchecking removes). Setting a prof rating to "unrated" removes the entry from `personalRatings`.

- [ ] **Step 1: Write the failing test** — `src/components/PreferencesPanel.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreferencesPanel } from "./PreferencesPanel";
import type { Catalog, Section, UserState } from "../lib/types";

const sec = (courseCode: string, sectionCode: string, instructor: string): Section => ({
  courseCode, sectionCode, instructor, title: courseCode, units: 3, meetings: [], room: "", remarks: "", raw: "",
});
const catalog: Catalog = {
  semester: "2026-1", exportedAt: "2026-07-20T00:00:00.000Z", warnings: [],
  sections: [sec("PHILO 11", "A", "GARCIA, JUAN"), sec("CSCI 30", "A", "SY, MARIA")],
};
const baseState: UserState = {
  version: 1, semester: "2026-1", chosenCourses: ["PHILO 11"], lockedSections: [],
  fullSections: [], personalRatings: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
};

afterEach(cleanup);

describe("PreferencesPanel", () => {
  it("checking a criterion appends it in priority order", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Fewest days on campus/));
    expect(onChange).toHaveBeenCalledWith({
      ...baseState,
      preferences: { ...baseState.preferences, criteria: ["compactDays", "fewestDays"] },
    });
  });

  it("unchecking a criterion removes it", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Compact days/));
    expect(onChange).toHaveBeenCalledWith({
      ...baseState,
      preferences: { ...baseState.preferences, criteria: [] },
    });
  });

  it("lists only instructors of chosen courses for rating", () => {
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={() => {}} />);
    expect(screen.getByText(/GARCIA, JUAN/)).toBeTruthy();
    expect(screen.queryByText(/SY, MARIA/)).toBeNull();
  });

  it("rating a professor adds a personal rating", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/GARCIA, JUAN/), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({
      ...baseState,
      personalRatings: [{ name: "GARCIA, JUAN", rating: 5 }],
    });
  });

  it("adds a protected block", () => {
    const onChange = vi.fn();
    render(<PreferencesPanel catalog={catalog} state={baseState} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add protected block"));
    expect(onChange).toHaveBeenCalledWith({
      ...baseState,
      preferences: {
        ...baseState.preferences,
        protectedBlocks: [{ days: ["M"], start: 720, end: 780 }],
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PreferencesPanel.test.tsx`
Expected: FAIL — cannot resolve `./PreferencesPanel`.

- [ ] **Step 3: Write `src/components/PreferencesPanel.tsx`**

```tsx
import type { Catalog, Day, Meeting, ProfRating, RankCriterion, UserState } from "../lib/types";
import { formatTime } from "../lib/time";

const CRITERIA: { id: RankCriterion; label: string }[] = [
  { id: "compactDays", label: "Compact days (fewest gaps)" },
  { id: "fewestDays", label: "Fewest days on campus" },
  { id: "lateStart", label: "Later starts" },
  { id: "earlyEnd", label: "Earlier ends" },
  { id: "preferredProfs", label: "Preferred professors" },
];
const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT"];
const HOURS = Array.from({ length: 15 }, (_, i) => 420 + i * 60); // 7:00 AM – 9:00 PM

interface Props {
  catalog: Catalog;
  state: UserState;
  onChange: (s: UserState) => void;
}

export function PreferencesPanel({ catalog, state, onChange }: Props) {
  const prefs = state.preferences;
  const setPrefs = (p: Partial<UserState["preferences"]>) =>
    onChange({ ...state, preferences: { ...prefs, ...p } });

  const toggleCriterion = (id: RankCriterion) =>
    setPrefs({
      criteria: prefs.criteria.includes(id)
        ? prefs.criteria.filter((c) => c !== id)
        : [...prefs.criteria, id],
    });

  const setBlock = (i: number, block: Meeting) =>
    setPrefs({ protectedBlocks: prefs.protectedBlocks.map((b, j) => (j === i ? block : b)) });

  const instructors = [
    ...new Set(
      catalog.sections
        .filter((s) => state.chosenCourses.includes(s.courseCode) && s.instructor && s.instructor !== "TBA")
        .map((s) => s.instructor)
    ),
  ].sort();

  const setRating = (name: string, value: string) => {
    const others = state.personalRatings.filter((r) => r.name !== name);
    const rating = Number(value);
    onChange({
      ...state,
      personalRatings:
        rating >= 1 && rating <= 5
          ? [...others, { name, rating: rating as ProfRating["rating"] }]
          : others,
    });
  };

  const timeSelect = (value: number | undefined, set: (v: number | undefined) => void) => (
    <select
      value={value ?? ""}
      onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}
    >
      <option value="">any time</option>
      {HOURS.map((h) => (
        <option key={h} value={h}>{formatTime(h)}</option>
      ))}
    </select>
  );

  return (
    <section>
      <h2>Ranking criteria (priority = order checked)</h2>
      <ul>
        {CRITERIA.map(({ id, label }) => {
          const pos = prefs.criteria.indexOf(id);
          return (
            <li key={id}>
              <label>
                <input type="checkbox" checked={pos >= 0} onChange={() => toggleCriterion(id)} />{" "}
                {label}
                {pos >= 0 ? ` — priority ${pos + 1}` : ""}
              </label>
            </li>
          );
        })}
      </ul>

      <h2>Time limits</h2>
      <label>No classes before {timeSelect(prefs.earliestStart, (v) => setPrefs({ earliestStart: v }))}</label>{" "}
      <label>No classes after {timeSelect(prefs.latestEnd, (v) => setPrefs({ latestEnd: v }))}</label>

      <h2>Protected time blocks</h2>
      {prefs.protectedBlocks.map((block, i) => (
        <div key={i}>
          <select
            value={block.days[0]}
            onChange={(e) => setBlock(i, { ...block, days: [e.target.value as Day] })}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select value={block.start} onChange={(e) => setBlock(i, { ...block, start: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{formatTime(h)}</option>
            ))}
          </select>
          {" – "}
          <select value={block.end} onChange={(e) => setBlock(i, { ...block, end: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{formatTime(h)}</option>
            ))}
          </select>{" "}
          <button onClick={() => setPrefs({ protectedBlocks: prefs.protectedBlocks.filter((_, j) => j !== i) })}>
            Remove
          </button>
        </div>
      ))}
      <button onClick={() => setPrefs({ protectedBlocks: [...prefs.protectedBlocks, { days: ["M"], start: 720, end: 780 }] })}>
        Add protected block
      </button>

      <h2>My professor ratings</h2>
      {instructors.length === 0 && <p>Pick courses first to rate their professors.</p>}
      <ul>
        {instructors.map((name) => (
          <li key={name}>
            <label>
              {name}{" "}
              <select
                value={state.personalRatings.find((r) => r.name === name)?.rating ?? ""}
                onChange={(e) => setRating(name, e.target.value)}
              >
                <option value="">unrated</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Wire into `src/App.tsx`**

Add the import:

```tsx
import { PreferencesPanel } from "./components/PreferencesPanel";
```

Replace the stub line

```tsx
      {tab === "preferences" && <p>Preferences — added in Task 10.</p>}
```

with

```tsx
      {tab === "preferences" && <PreferencesPanel catalog={catalog} state={state} onChange={setState} />}
```

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run src/components/PreferencesPanel.test.tsx && npm run build`
Expected: PASS (5 tests); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/PreferencesPanel.tsx src/components/PreferencesPanel.test.tsx src/App.tsx
git commit -m "feat: preferences panel (criteria, time limits, blocks, prof ratings)"
```

---

### Task 11: Results screen with schedule grid

**Files:**
- Create: `src/components/ScheduleGrid.tsx`
- Create: `src/components/Results.tsx`
- Modify: `src/App.tsx` (wire in the component + merged ratings)
- Modify: `src/index.css` (grid styles)
- Test: `src/components/Results.test.tsx`

**Interfaces:**
- Consumes: `generate`/`GenerateResult` from `src/lib/generator.ts`; `rank`/`RankedSchedule` from `src/lib/ranker.ts`; `mergeRatings`, `getCommunityRatings`; `formatTime`; `sectionKey`; types.
- Produces:
  - `ScheduleGrid` component: `{ schedule: Schedule }` — positioned weekly grid, TBA sections listed below the grid.
  - `Results` component: `{ catalog: Catalog; state: UserState; ratings: Map<string, ProfRating>; onChange: (s: UserState) => void }` — regenerates + re-ranks via `useMemo` on every state change; per-section Lock / Mark full / Exclude buttons; zero-result diagnostics view; "Show more" paging (10 at a time).

- [ ] **Step 1: Write the failing test** — `src/components/Results.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Results } from "./Results";
import { mergeRatings } from "../lib/profs";
import type { Catalog, Meeting, Section, UserState } from "../lib/types";

const m = (days: Meeting["days"], start: number, end: number): Meeting => ({ days, start, end });
const sec = (courseCode: string, sectionCode: string, meetings: Meeting[]): Section => ({
  courseCode, sectionCode, meetings, title: courseCode, units: 3, instructor: "GARCIA, JUAN",
  room: "CTC 102", remarks: "", raw: "",
});
const catalog: Catalog = {
  semester: "2026-1", exportedAt: "2026-07-20T00:00:00.000Z", warnings: [],
  sections: [
    sec("PHILO 11", "A", [m(["M", "TH"], 480, 570)]),
    sec("PHILO 11", "B", [m(["T", "F"], 660, 750)]),
    sec("CSCI 30", "A", [m(["M", "TH"], 570, 660)]),
  ],
};
const baseState: UserState = {
  version: 1, semester: "2026-1", chosenCourses: ["PHILO 11", "CSCI 30"], lockedSections: [],
  fullSections: [], personalRatings: [],
  preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
};
const noRatings = mergeRatings([], []);

afterEach(cleanup);

describe("Results", () => {
  it("renders ranked schedules", () => {
    render(<Results catalog={catalog} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/2 valid schedule/)).toBeTruthy();
  });

  it("Mark full adds the section to fullSections", () => {
    const onChange = vi.fn();
    render(<Results catalog={catalog} state={baseState} ratings={noRatings} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Mark full" })[0]);
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.fullSections).toHaveLength(1);
  });

  it("Lock adds the section to lockedSections", () => {
    const onChange = vi.fn();
    render(<Results catalog={catalog} state={baseState} ratings={noRatings} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Lock" })[0]);
    const next = onChange.mock.calls[0][0] as UserState;
    expect(next.lockedSections).toHaveLength(1);
  });

  it("shows diagnostics when no schedule exists", () => {
    const impossible: Catalog = {
      ...catalog,
      sections: [
        sec("PHILO 11", "A", [m(["M"], 480, 570)]),
        sec("CSCI 30", "A", [m(["M"], 480, 570)]),
      ],
    };
    render(<Results catalog={impossible} state={baseState} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/No valid schedule found/)).toBeTruthy();
    expect(screen.getByText(/PHILO 11 and CSCI 30 always conflict/)).toBeTruthy();
  });

  it("prompts to pick courses when none are chosen", () => {
    render(<Results catalog={catalog} state={{ ...baseState, chosenCourses: [] }} ratings={noRatings} onChange={() => {}} />);
    expect(screen.getByText(/Pick courses first/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/Results.test.tsx`
Expected: FAIL — cannot resolve `./Results`.

- [ ] **Step 3: Write `src/components/ScheduleGrid.tsx`**

```tsx
import type { Day, Schedule } from "../lib/types";
import { sectionKey } from "../lib/types";
import { formatTime } from "../lib/time";

const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT"];
const DAY_START = 420; // 7:00 AM
const DAY_END = 1260;  // 9:00 PM
const PX_PER_MIN = 0.8;

export function ScheduleGrid({ schedule }: { schedule: Schedule }) {
  const tba = schedule.filter((s) => s.meetings.length === 0);
  return (
    <div>
      <div className="grid">
        {DAYS.map((day) => (
          <div key={day} className="day-col" style={{ height: (DAY_END - DAY_START) * PX_PER_MIN }}>
            <div className="day-label">{day}</div>
            {schedule.flatMap((s) =>
              s.meetings
                .filter((meeting) => meeting.days.includes(day))
                .map((meeting, i) => (
                  <div
                    key={`${sectionKey(s)}-${i}`}
                    className="block"
                    style={{
                      top: (meeting.start - DAY_START) * PX_PER_MIN,
                      height: (meeting.end - meeting.start) * PX_PER_MIN,
                    }}
                  >
                    <strong>{sectionKey(s)}</strong>
                    <br />
                    {formatTime(meeting.start)}–{formatTime(meeting.end)}
                    <br />
                    {s.room}
                  </div>
                ))
            )}
          </div>
        ))}
      </div>
      {tba.length > 0 && <p>No fixed schedule (TBA): {tba.map(sectionKey).join(", ")}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/Results.tsx`**

```tsx
import { useMemo, useState } from "react";
import { generate } from "../lib/generator";
import { rank } from "../lib/ranker";
import type { Catalog, ProfRating, UserState } from "../lib/types";
import { sectionKey } from "../lib/types";
import { ScheduleGrid } from "./ScheduleGrid";

const PAGE = 10;

interface Props {
  catalog: Catalog;
  state: UserState;
  ratings: Map<string, ProfRating>;
  onChange: (s: UserState) => void;
}

export function Results({ catalog, state, ratings, onChange }: Props) {
  const { schedules, diagnostics } = useMemo(
    () => generate(catalog.sections, state),
    [catalog, state]
  );
  const ranked = useMemo(
    () => rank(schedules, state.preferences, ratings),
    [schedules, state.preferences, ratings]
  );
  const [shown, setShown] = useState(PAGE);

  const toggle = (field: "lockedSections" | "fullSections", key: string) => {
    const list = state[field];
    onChange({
      ...state,
      [field]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
    });
  };
  const exclude = (key: string) =>
    onChange({
      ...state,
      preferences: {
        ...state.preferences,
        excludedSections: [...state.preferences.excludedSections, key],
      },
    });

  if (state.chosenCourses.length === 0) return <p>Pick courses first.</p>;

  if (ranked.length === 0) {
    return (
      <section>
        <h2>No valid schedule found</h2>
        {diagnostics && (
          <>
            <h3>Sections available per course (after your filters)</h3>
            <ul>
              {diagnostics.perCourse.map((c) => (
                <li key={c.courseCode}>
                  {c.courseCode}: {c.afterFilters} of {c.total} section(s) usable
                  {c.afterFilters === 0 ? " — all filtered out (full / excluded / time limits)" : ""}
                </li>
              ))}
            </ul>
            {diagnostics.conflictPairs.length > 0 && (
              <>
                <h3>Courses that cannot fit together</h3>
                <ul>
                  {diagnostics.conflictPairs.map((p) => (
                    <li key={`${p.a}|${p.b}`}>{p.a} and {p.b} always conflict</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section>
      <h2>{ranked.length} valid schedule(s), best first</h2>
      {ranked.slice(0, shown).map((r, i) => (
        <article key={r.schedule.map(sectionKey).join("|")} className="schedule-card">
          <h3>#{i + 1} · score {r.score.toFixed(2)}</h3>
          <ScheduleGrid schedule={r.schedule} />
          <ul>
            {r.schedule.map((s) => {
              const key = sectionKey(s);
              return (
                <li key={key}>
                  {key} — {s.instructor}{" "}
                  <button onClick={() => toggle("lockedSections", key)}>
                    {state.lockedSections.includes(key) ? "Unlock" : "Lock"}
                  </button>{" "}
                  <button onClick={() => toggle("fullSections", key)}>
                    {state.fullSections.includes(key) ? "Unmark full" : "Mark full"}
                  </button>{" "}
                  <button onClick={() => exclude(key)}>Exclude</button>
                </li>
              );
            })}
          </ul>
        </article>
      ))}
      {shown < ranked.length && <button onClick={() => setShown(shown + PAGE)}>Show more</button>}
    </section>
  );
}
```

- [ ] **Step 5: Wire into `src/App.tsx` and add styles**

In `src/App.tsx`, add imports:

```tsx
import { getCatalog, getCommunityRatings, isStale } from "./lib/catalog";
import { mergeRatings } from "./lib/profs";
import { Results } from "./components/Results";
```

(the first line replaces the existing `getCatalog, isStale` import). Inside `App`, after the `useEffect`, add:

```tsx
  const ratings = useMemo(
    () => mergeRatings(getCommunityRatings(), state.personalRatings),
    [state.personalRatings]
  );
```

Replace the stub line

```tsx
      {tab === "results" && <p>Results — added in Task 11.</p>}
```

with

```tsx
      {tab === "results" && <Results catalog={catalog} state={state} ratings={ratings} onChange={setState} />}
```

Append to `src/index.css`:

```css
.grid { display: flex; gap: 2px; }
.day-col { position: relative; flex: 1; background: rgba(128, 128, 128, 0.08); border-radius: 4px; }
.day-label { text-align: center; font-weight: bold; padding: 2px 0; }
.block { position: absolute; left: 2px; right: 2px; overflow: hidden; font-size: 0.7rem;
  background: #dbeafe; color: #1e3a5f; border-radius: 4px; padding: 2px 4px; box-sizing: border-box; }
.schedule-card { border: 1px solid rgba(128, 128, 128, 0.4); border-radius: 8px; padding: 0.75rem; margin: 1rem 0; }
```

- [ ] **Step 6: Run tests and build**

Run: `npx vitest run src/components/Results.test.tsx && npm run build`
Expected: PASS (5 tests); build clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/ScheduleGrid.tsx src/components/Results.tsx src/components/Results.test.tsx src/App.tsx src/index.css
git commit -m "feat: results screen with weekly grid, lock/full/exclude, diagnostics"
```

---

### Task 12: Import page

**Files:**
- Create: `src/components/ImportPage.tsx`
- Modify: `src/App.tsx` (wire in the component)
- Test: `src/components/ImportPage.test.tsx`

**Interfaces:**
- Consumes: `parseAisisTable` from `src/lib/parser.ts`; `Catalog`, `Section`, `sectionKey` from `src/lib/types.ts`.
- Produces: `ImportPage` component: `{ catalog: Catalog }`. Parses pasted text, shows section/warning counts and warning details, and downloads a merged catalog JSON (pasted sections replace existing ones with the same `sectionKey`; `exportedAt` stamped now). The maintainer commits the downloaded file over `src/data/catalog-<semester>.json`.

- [ ] **Step 1: Write the failing test** — `src/components/ImportPage.test.tsx`

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImportPage } from "./ImportPage";
import { AISIS_SAMPLE, AISIS_SAMPLE_WITH_BAD_ROWS } from "../lib/fixtures/aisis-sample";
import type { Catalog } from "../lib/types";

const catalog: Catalog = { semester: "2026-1", exportedAt: "2026-07-20T00:00:00.000Z", warnings: [], sections: [] };

afterEach(cleanup);

describe("ImportPage", () => {
  it("parses pasted AISIS text and reports counts", () => {
    render(<ImportPage catalog={catalog} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: AISIS_SAMPLE } });
    fireEvent.click(screen.getByText("Parse"));
    expect(screen.getByText(/7 section\(s\) parsed, 0 warning\(s\)/)).toBeTruthy();
  });

  it("surfaces warnings for bad rows", () => {
    render(<ImportPage catalog={catalog} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: AISIS_SAMPLE_WITH_BAD_ROWS } });
    fireEvent.click(screen.getByText("Parse"));
    expect(screen.getByText(/2 warning\(s\)/)).toBeTruthy();
    expect(screen.getByText(/Skipped row/)).toBeTruthy();
  });

  it("download button is disabled until something parses", () => {
    render(<ImportPage catalog={catalog} />);
    const download = screen.getByText("Download merged catalog JSON") as HTMLButtonElement;
    expect(download.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ImportPage.test.tsx`
Expected: FAIL — cannot resolve `./ImportPage`.

- [ ] **Step 3: Write `src/components/ImportPage.tsx`**

```tsx
import { useState } from "react";
import { parseAisisTable } from "../lib/parser";
import type { Catalog, Section } from "../lib/types";
import { sectionKey } from "../lib/types";

interface Props {
  catalog: Catalog;
}

export function ImportPage({ catalog }: Props) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ sections: Section[]; warnings: string[] } | null>(null);

  const parse = () => setResult(parseAisisTable(text));

  const download = () => {
    if (!result) return;
    const merged = new Map(catalog.sections.map((s) => [sectionKey(s), s]));
    for (const s of result.sections) merged.set(sectionKey(s), s);
    const next: Catalog = {
      semester: catalog.semester,
      exportedAt: new Date().toISOString(),
      sections: [...merged.values()],
      warnings: result.warnings,
    };
    const blob = new Blob([JSON.stringify(next, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `catalog-${catalog.semester}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section>
      <h2>Import AISIS schedule data</h2>
      <p>
        Paste an AISIS class-schedule table below (or the .txt downloaded by{" "}
        <code>tools/aisis-export.js</code>), then download the merged catalog JSON and commit it
        over <code>src/data/catalog-{catalog.semester}.json</code>.
      </p>
      <textarea rows={12} style={{ width: "100%" }} value={text} onChange={(e) => setText(e.target.value)} />
      <div>
        <button onClick={parse}>Parse</button>{" "}
        <button onClick={download} disabled={!result || result.sections.length === 0}>
          Download merged catalog JSON
        </button>
      </div>
      {result && (
        <>
          <p>
            {result.sections.length} section(s) parsed, {result.warnings.length} warning(s).
          </p>
          {result.warnings.length > 0 && (
            <ul>
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Wire into `src/App.tsx`**

Add the import:

```tsx
import { ImportPage } from "./components/ImportPage";
```

Replace the stub line

```tsx
      {tab === "import" && <p>Import — added in Task 12.</p>}
```

with

```tsx
      {tab === "import" && <ImportPage catalog={catalog} />}
```

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run src/components/ImportPage.test.tsx && npm run build`
Expected: PASS (3 tests); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/ImportPage.tsx src/components/ImportPage.test.tsx src/App.tsx
git commit -m "feat: paste-import page with warnings and catalog JSON download"
```

---

### Task 13: AISIS export snippet

**Files:**
- Create: `tools/aisis-export.js`

**Interfaces:**
- Consumes: nothing from the app (deliberately standalone — it runs in the AISIS browser tab, not in our bundle).
- Produces: a downloaded `aisis-raw-<date>.txt` of tab-separated rows, which the maintainer pastes into the Import page (Task 12). The parser (Task 3) is the single source of truth for interpreting rows — this snippet only collects raw table text.

**Note:** The AISIS URL and form-field names below are BEST-GUESS and marked as such in the code — they must be verified against live AISIS on first use (spec §12 / §4.1). This is an inherent external unknown, not a plan gap; the paste-import path (Task 12) is the working fallback either way.

- [ ] **Step 1: Write `tools/aisis-export.js`**

```js
/**
 * AISIS catalog export snippet.
 *
 * HOW TO USE (maintainer only, once per semester):
 *   1. Log into AISIS in your browser and open the Class Schedule page.
 *   2. Open DevTools (F12) → Console, paste this entire file, press Enter.
 *   3. Wait for the loop to finish; a .txt file downloads automatically.
 *   4. Open the app's Import tab, paste the .txt contents, download the
 *      merged catalog JSON, and commit it to src/data/.
 *
 * The snippet runs inside YOUR logged-in session. It stores no credentials,
 * sends nothing anywhere, and fetches each department once with a delay.
 *
 * !! CONFIG values are BEST-GUESS — verify against live AISIS before first
 * !! use and update them if the page structure differs (spec §12).
 */
(async () => {
  const CONFIG = {
    schedulePath: "/j_aisis/J_VCSC.do", // Class Schedule action — VERIFY on live AISIS
    deptSelectName: "deptCode",         // department <select> name — VERIFY on live AISIS
    delayMs: 1500,                      // politeness delay between department fetches
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const parseHTML = (html) => new DOMParser().parseFromString(html, "text/html");

  const firstPage = parseHTML(await (await fetch(CONFIG.schedulePath)).text());
  const select = firstPage.querySelector(`select[name="${CONFIG.deptSelectName}"]`);
  if (!select) {
    alert(
      "AISIS export: department dropdown not found.\n" +
        "AISIS layout may have changed — update CONFIG in tools/aisis-export.js,\n" +
        "or fall back to copy-pasting department tables into the Import tab."
    );
    return;
  }

  const depts = [...select.options].map((o) => o.value).filter(Boolean);
  const lines = [];
  for (const dept of depts) {
    const body = new URLSearchParams({ [CONFIG.deptSelectName]: dept });
    const page = parseHTML(
      await (await fetch(CONFIG.schedulePath, { method: "POST", body })).text()
    );
    for (const row of page.querySelectorAll("table tr")) {
      const cells = [...row.querySelectorAll("td")].map((c) => c.textContent.trim());
      if (cells.length >= 7) lines.push(cells.join("\t"));
    }
    console.log(`AISIS export: ${dept} done (${lines.length} rows total)`);
    await sleep(CONFIG.delayMs);
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aisis-raw-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  console.log(`AISIS export: finished — ${lines.length} rows downloaded.`);
})();
```

- [ ] **Step 2: Verify the snippet is valid JavaScript**

Run: `node --check tools/aisis-export.js`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add tools/aisis-export.js
git commit -m "feat: AISIS DevTools export snippet (raw TSV collector)"
```

---

### Task 14: End-to-end smoke test, README, deploy readiness

**Files:**
- Create: `src/App.smoke.test.tsx`
- Create: `README.md`

**Interfaces:**
- Consumes: the full app (`src/App.tsx`) with the bundled placeholder catalog (Task 8) — the smoke test exercises pick → generate → mark full → re-rank through the real UI.
- Produces: the spec §10 smoke test; contributor/maintainer documentation.

- [ ] **Step 1: Write the failing smoke test** — `src/App.smoke.test.tsx`

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("smoke: pick courses → generate → mark full → re-rank", () => {
  it("runs the whole flow on the bundled catalog", () => {
    render(<App />);

    // Pick two courses that have compatible sections in the placeholder catalog.
    fireEvent.click(screen.getByLabelText(/PHILO 11/));
    fireEvent.click(screen.getByLabelText(/CSCI 30/));

    // Generate: Results tab shows ranked schedules.
    fireEvent.click(screen.getByRole("button", { name: "Results" }));
    expect(screen.getByText(/valid schedule\(s\), best first/)).toBeTruthy();
    const before = screen.getByText(/valid schedule\(s\), best first/).textContent!;

    // Mark the first listed section full → instant re-rank with fewer schedules.
    fireEvent.click(screen.getAllByRole("button", { name: "Mark full" })[0]);
    const after = screen.getByText(/valid schedule\(s\), best first/).textContent!;
    expect(after).not.toBe(before);

    // State persisted to localStorage.
    const stored = JSON.parse(localStorage.getItem("aisis-scheduler-state")!);
    expect(stored.fullSections).toHaveLength(1);
    expect(stored.chosenCourses).toEqual(["PHILO 11", "CSCI 30"]);
  });
});
```

- [ ] **Step 2: Run test to verify current status**

Run: `npx vitest run src/App.smoke.test.tsx`
Expected: PASS if Tasks 9–12 were completed correctly — this test is the integration check. If it fails, the failure is a real integration bug: fix the app (not the test) until it passes.

- [ ] **Step 3: Write `README.md`**

```markdown
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
```

- [ ] **Step 4: Full verification**

Run: `npx vitest run && npm run build`
Expected: ALL tests pass (unit + component + smoke); build clean.

- [ ] **Step 5: Commit**

```bash
git add src/App.smoke.test.tsx README.md
git commit -m "test: end-to-end smoke test; docs: README with semester runbook"
```

---

## Plan Self-Review Notes

Checked against the spec (`2026-07-19-aisis-scheduler-design.md`):

- **§3 architecture** → Tasks 1, 8, 9 (pure modules, data-layer swap point, localStorage). ✔
- **§4 catalog acquisition** → Task 13 (snippet, primary), Task 12 (paste fallback), staleness banner in Task 9. ✔
- **§5 prof ratings** → Task 4 (normalization/merge/fuzzy), Task 8 (community JSON), Task 10 (personal overrides UI). ✔
- **§6 data model** → Task 2, verbatim types. ✔
- **§7 core logic** → Tasks 3 (parser never throws), 5 (generator + locks + filters + diagnostics), 6 (ranker, default compactDays), 11 (mark-full re-rank loop). ✔
- **§8 UI screens** → Tasks 9–12, one per screen. ✔
- **§9 error handling** → parser warnings (3), staleness (8/9), storage reset (7/9), snippet breakage fallback (13/12), zero-result diagnostics (5/11). ✔
- **§10 testing** → unit tests in every lib task; fixtures marked PLACEHOLDER (3, 8); smoke test (14). ✔
- **§11/§12** → out of scope by design; open items restated where relevant.

Known consistency points: `sectionKey` format, `GenerateResult`, `RankedSchedule`, storage key/version, and component prop shapes are stated identically in every task that uses them.
