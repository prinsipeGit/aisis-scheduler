# Supabase Serving Layer Implementation Plan (Plan A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve all shared data (curricula, catalogs, community ratings) from Supabase; repo JSON under `data/` stays the reviewable source of truth, published via `npm run push:data`.

**Architecture:** Repo data moves from `src/data/` to top-level `data/` (never bundled). A new Supabase project holds three RLS-protected tables mirroring the JSON. `src/lib/supabase.ts` exposes a minimal injectable `Db` interface; `catalog.ts`/`curriculum.ts` keep their public shapes but go async against it. Tests stub `Db` — no network ever.

**Tech Stack:** Vite 5 + React 18 + TypeScript 5.5, Vitest 2, `@supabase/supabase-js` v2, Supabase Postgres (project created via the Supabase MCP connector).

**Spec:** `docs/superpowers/specs/2026-07-21-multi-program-curricula-design.md` §3–§9 (this plan covers §9 phases 1–2). Plan B (cockpit UI) and Plan C (curricula scraper) follow separately.

## Global Constraints

- TDD for every code change; tests never hit the network (stub `Db`).
- Secrets: `SUPABASE_SERVICE_ROLE_KEY` env-var only — never a CLI arg, never stored, never logged (spec §2.1/§5). The anon key is public and IS committed in `supabase/project.json`.
- All tasks leave `npx vitest run` green and `npm run build` clean.
- Program id for the seeded curriculum changes `BS-AMDSc-2024` → `BS-AMDSc-M-DSc-2024` (spec §2.5 slug rule).
- Supabase org `kibvzntiobjhtqzhpvcx`, project name `aisis-scheduler`, region `ap-southeast-1`, cost $0/month (already user-approved).
- Error copy: `CatalogUnavailableError` message ends with `Run: npm run scrape:schedule -- <term> && npm run push:data`; `ProgramUnavailableError` with `Run: npm run scrape:curricula && npm run push:data`.

---

### Task 1: Supabase project, schema, and committed project descriptor

**Orchestrator task — uses the Supabase MCP connector, not Bash.** Subagents skip this; the session orchestrator performs it.

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `supabase/project.json`

**Interfaces:**
- Produces: live project with tables `programs`, `catalogs`, `community_ratings` (columns per SQL below); `supabase/project.json` with shape `{ "url": string, "anonKey": string }` — Task 4 imports this file.

- [ ] **Step 1: Create the project** via MCP: `get_cost(type=project, org=kibvzntiobjhtqzhpvcx)` → `confirm_cost` → `create_project(name="aisis-scheduler", organization_id="kibvzntiobjhtqzhpvcx", region="ap-southeast-1", confirm_cost_id=<id>)`. Poll `get_project` until `ACTIVE_HEALTHY`.

- [ ] **Step 2: Write `supabase/migrations/0001_init.sql`** (this exact content) and apply it via MCP `apply_migration(name="init")`:

```sql
create table public.programs (
  id text primary key,
  code text not null,
  name text not null,
  version_year int not null,
  blocks jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.catalogs (
  term text primary key,
  exported_at timestamptz not null,
  sections jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.community_ratings (
  id bigint generated always as identity primary key,
  name text not null,
  rating numeric not null check (rating >= 0 and rating <= 5),
  course_code text,
  note text,
  as_of date,
  unique nulls not distinct (name, course_code)
);
alter table public.programs enable row level security;
alter table public.catalogs enable row level security;
alter table public.community_ratings enable row level security;
create policy "public read" on public.programs for select to anon, authenticated using (true);
create policy "public read" on public.catalogs for select to anon, authenticated using (true);
create policy "public read" on public.community_ratings for select to anon, authenticated using (true);
```

- [ ] **Step 3: Verify** via MCP `list_tables(schemas=["public"], verbose=true)`: three tables, RLS enabled on all. Run `get_advisors(type="security")`; resolve anything it flags about these tables.

- [ ] **Step 4: Write `supabase/project.json`** from MCP `get_project_url` + `get_publishable_keys`:

```json
{ "url": "https://<ref>.supabase.co", "anonKey": "<publishable anon key>" }
```

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: create aisis-scheduler Supabase project with schema and RLS"
```

---

### Task 2: Relocate repo data to `data/`; keep app green via interim paths

**Files:**
- Move: `src/data/catalog-2026-1.json` → `data/catalogs/catalog-2026-1.json`
- Move: `src/data/prof-ratings.json` → `data/prof-ratings.json`
- Move+edit: `src/data/curriculum-BS-AMDSc-2024.json` → `data/curricula/BS-AMDSc-M-DSc-2024.json` (only the `"id"` field changes, to `"BS-AMDSc-M-DSc-2024"`)
- Create: `data/curricula/index.json`
- Modify: `src/lib/catalog.ts` (glob + ratings import paths), `src/lib/curriculum.ts` (import path), `tools/scrape-schedule.mjs:110-113` (output path), `tools/validate-data.mjs` (full rewrite below), `src/lib/curriculum.test.ts` + `src/App.smoke.test.tsx` (new program id)

**Interfaces:**
- Produces: `data/` layout per spec §3; `data/curricula/index.json` = `ProgramSummary[]`; program id `BS-AMDSc-M-DSc-2024` everywhere. App still bundles data (interim) — Task 7 removes that.

- [ ] **Step 1: Move files**

```bash
mkdir -p data/catalogs data/curricula
git mv src/data/catalog-2026-1.json data/catalogs/catalog-2026-1.json
git mv src/data/prof-ratings.json data/prof-ratings.json
git mv src/data/curriculum-BS-AMDSc-2024.json data/curricula/BS-AMDSc-M-DSc-2024.json
```

- [ ] **Step 2: Update the id** in `data/curricula/BS-AMDSc-M-DSc-2024.json`: `"id": "BS-AMDSc-2024"` → `"id": "BS-AMDSc-M-DSc-2024"`. Create `data/curricula/index.json`:

```json
[
  { "id": "BS-AMDSc-M-DSc-2024", "code": "BS AMDSc-M DSc",
    "name": "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS", "versionYear": 2024 }
]
```

- [ ] **Step 3: Update failing tests first** (RED): in `src/lib/curriculum.test.ts` replace every `"BS-AMDSc-2024"` with `"BS-AMDSc-M-DSc-2024"` (lines 9, 17, 27, 33, 40, 49, 57) and the `id:` expectation on line 9. In `src/App.smoke.test.tsx` replace `"BS-AMDSc-2024"` on lines 14 and 68. Run `npx vitest run src/lib/curriculum.test.ts src/App.smoke.test.tsx` — expect FAIL (modules still import old paths/id).

- [ ] **Step 4: Point the app at the new paths** (interim, still bundled):
  - `src/lib/catalog.ts` line 2: `import ratingsJson from "../../data/prof-ratings.json";`
  - line 40: `const CATALOG_MODULES = import.meta.glob<{ default: Catalog }>("../../data/catalogs/catalog-*.json");`
  - line 46 and 55: key becomes `` `../../data/catalogs/catalog-${term}.json` ``
  - `src/lib/curriculum.ts` line 2: `import amdsc2024 from "../../data/curricula/BS-AMDSc-M-DSc-2024.json";`

- [ ] **Step 5: Update `tools/scrape-schedule.mjs`** output path (lines 110-113): `"..", "data", "catalogs", `catalog-${term}.json``.

- [ ] **Step 6: Rewrite `tools/validate-data.mjs`** with this content (loops all curricula per spec §7):

```js
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const canonicalCourseCode = (code) => code.trim().replace(/\s+/g, " ").toUpperCase();
let failed = false;
const fail = (message) => { console.error(`Data validation failed: ${message}`); failed = true; };
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

// --- catalogs ---
const catalogFiles = (await readdir(path.join(DATA, "catalogs"))).filter((f) => /^catalog-.*\.json$/.test(f)).sort().reverse();
if (catalogFiles.length === 0) fail("no catalog files in data/catalogs");
const newest = catalogFiles.length ? await readJson(path.join(DATA, "catalogs", catalogFiles[0])) : null;
const offeredCodes = new Set();
for (const file of catalogFiles) {
  const catalog = await readJson(path.join(DATA, "catalogs", file));
  const expectedTerm = file.replace(/^catalog-|\.json$/g, "");
  if (catalog.term !== expectedTerm) fail(`${file}: term is ${catalog.term}, expected ${expectedTerm}`);
  if (!Array.isArray(catalog.sections) || catalog.sections.length === 0) fail(`${file}: no sections`);
  const keys = new Set();
  for (const s of catalog.sections) {
    const key = `${canonicalCourseCode(s.courseCode)} ${s.sectionCode.trim().toUpperCase()}`;
    if (keys.has(key)) fail(`${file}: duplicate section key ${key}`);
    keys.add(key);
    if (file === catalogFiles[0]) offeredCodes.add(canonicalCourseCode(s.courseCode));
  }
}

// --- curricula ---
const index = await readJson(path.join(DATA, "curricula", "index.json"));
const files = (await readdir(path.join(DATA, "curricula"))).filter((f) => f.endsWith(".json") && f !== "index.json");
const indexIds = new Set(index.map((p) => p.id));
if (indexIds.size !== index.length) fail("duplicate ids in curricula/index.json");
for (const f of files) if (!indexIds.has(f.replace(/\.json$/, ""))) fail(`file ${f} missing from index.json`);
for (const id of indexIds) if (!files.includes(`${id}.json`)) fail(`index entry ${id} has no file`);

let programCount = 0;
for (const entry of index) {
  const program = await readJson(path.join(DATA, "curricula", `${entry.id}.json`));
  programCount += 1;
  if (program.id !== entry.id) fail(`${entry.id}: file id is ${program.id}`);
  const blockKeys = new Set(); const slotIds = new Set(); const missingByBlock = [];
  for (const block of program.blocks) {
    if (blockKeys.has(block.key)) fail(`${entry.id}: duplicate block key ${block.key}`);
    blockKeys.add(block.key);
    const sum = block.entries.reduce((s, e) => s + e.units, 0);
    if (sum !== block.totalUnits) console.log(`note: ${entry.id} ${block.key}: entry units sum ${sum} != printed totalUnits ${block.totalUnits}`);
    for (const e of block.entries) {
      if (slotIds.has(e.slotId)) fail(`${entry.id}: duplicate slotId ${e.slotId}`);
      slotIds.add(e.slotId);
      if (!Number.isFinite(e.units) || e.units < 0) fail(`${entry.id}: bad units on ${e.slotId}`);
    }
    const missing = block.entries.filter((e) => !e.isElective && !offeredCodes.has(canonicalCourseCode(e.catNo))).map((e) => e.catNo);
    if (missing.length) missingByBlock.push({ block: block.key, missing });
  }
  if (missingByBlock.length && newest) {
    console.log(`${entry.id}: ${missingByBlock.length} block(s) with required courses not offered in ${newest.term}:`);
    for (const item of missingByBlock) console.log(`- ${item.block}: ${item.missing.join(", ")}`);
  }
}
console.log(`Validated ${catalogFiles.length} catalog(s) and ${programCount} curriculum program(s).`);
if (failed) process.exit(1);
```

- [ ] **Step 7: Verify everything is green**

Run: `npx vitest run && npm run build && npm run validate:data`
Expected: 146 tests pass; build clean; validator prints `Validated 1 catalog(s) and 1 curriculum program(s).`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move shared data to top-level data/ with new curricula layout"
```

---

### Task 3: `push:data` publisher

**Files:**
- Create: `tools/push-transforms.mjs`, `tools/push-transforms.test.ts`, `tools/push-data.mjs`
- Modify: `package.json` (script + dependency)

**Interfaces:**
- Consumes: `data/` layout from Task 2; `supabase/project.json` from Task 1.
- Produces: `npm run push:data`; pure functions `programToRow(program)`, `catalogToRow(catalog)`, `ratingsToRows(ratings)` in `push-transforms.mjs`.

- [ ] **Step 1: Install the client library** (runtime dep — the app uses it in Task 4 too):

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Write failing tests** in `tools/push-transforms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { programToRow, catalogToRow, ratingsToRows } from "./push-transforms.mjs";

describe("push transforms", () => {
  it("maps a program file to a programs row", () => {
    const program = { id: "X-2024", code: "X", name: "X PROG", versionYear: 2024, blocks: [{ key: "a" }] };
    expect(programToRow(program)).toEqual({
      id: "X-2024", code: "X", name: "X PROG", version_year: 2024, blocks: [{ key: "a" }],
    });
  });
  it("maps a catalog file to a catalogs row", () => {
    const catalog = { term: "2026-1", exportedAt: "2026-07-21T00:00:00.000Z", sections: [], warnings: ["w"] };
    expect(catalogToRow(catalog)).toEqual({
      term: "2026-1", exported_at: "2026-07-21T00:00:00.000Z", sections: [], warnings: ["w"],
    });
  });
  it("maps ratings, preserving optional fields and nulling absent ones", () => {
    expect(ratingsToRows([{ name: "A", rating: 4.5 }, { name: "B", rating: 3, courseCode: "MATH 10", note: "n", asOf: "2026-01-01" }])).toEqual([
      { name: "A", rating: 4.5, course_code: null, note: null, as_of: null },
      { name: "B", rating: 3, course_code: "MATH 10", note: "n", as_of: "2026-01-01" },
    ]);
  });
});
```

- [ ] **Step 3: Run to verify RED** — `npx vitest run tools/push-transforms.test.ts` — expect FAIL (module not found).

- [ ] **Step 4: Implement `tools/push-transforms.mjs`**:

```js
export const programToRow = (p) => ({
  id: p.id, code: p.code, name: p.name, version_year: p.versionYear, blocks: p.blocks,
});
export const catalogToRow = (c) => ({
  term: c.term, exported_at: c.exportedAt, sections: c.sections, warnings: c.warnings,
});
export const ratingsToRows = (ratings) => ratings.map((r) => ({
  name: r.name, rating: r.rating, course_code: r.courseCode ?? null,
  note: r.note ?? null, as_of: r.asOf ?? null,
}));
```

- [ ] **Step 5: Verify GREEN** — `npx vitest run tools/push-transforms.test.ts` — 3 pass.

- [ ] **Step 6: Write `tools/push-data.mjs`** (network loop, not unit-tested — same stance as the scrapers):

```js
#!/usr/bin/env node
/**
 * Publish repo data/ to Supabase.  SUPABASE_SERVICE_ROLE_KEY must be set in the
 * environment — never passed as an argument, never stored, never logged.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { programToRow, catalogToRow, ratingsToRows } from "./push-transforms.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = JSON.parse(await readFile(path.join(ROOT, "supabase", "project.json"), "utf8"));
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in the environment (Supabase dashboard → Project Settings → API).");
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL ?? project.url, serviceKey, { auth: { persistSession: false } });
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const die = (label, error) => { console.error(`${label}: ${error.message}`); process.exit(1); };

const curriculaDir = path.join(ROOT, "data", "curricula");
const programFiles = (await readdir(curriculaDir)).filter((f) => f.endsWith(".json") && f !== "index.json");
for (const file of programFiles) {
  const { error } = await db.from("programs").upsert(programToRow(await readJson(path.join(curriculaDir, file))));
  if (error) die(`programs ← ${file}`, error);
}
console.log(`programs: upserted ${programFiles.length}`);

const catalogsDir = path.join(ROOT, "data", "catalogs");
const catalogFiles = (await readdir(catalogsDir)).filter((f) => /^catalog-.*\.json$/.test(f));
for (const file of catalogFiles) {
  const { error } = await db.from("catalogs").upsert(catalogToRow(await readJson(path.join(catalogsDir, file))));
  if (error) die(`catalogs ← ${file}`, error);
}
console.log(`catalogs: upserted ${catalogFiles.length}`);

const rows = ratingsToRows(await readJson(path.join(ROOT, "data", "prof-ratings.json")));
{
  const { error } = await db.from("community_ratings").delete().gte("id", 0);
  if (error) die("community_ratings delete", error);
}
if (rows.length > 0) {
  const { error } = await db.from("community_ratings").insert(rows);
  if (error) die("community_ratings insert", error);
}
console.log(`community_ratings: replaced with ${rows.length} row(s)`);
```

- [ ] **Step 7: Add the script** to `package.json` `"scripts"`: `"push:data": "node tools/push-data.mjs"`. Run `node tools/push-data.mjs` WITHOUT the env var — expect the exact one-line error and exit 1 (that's the only executable check possible without the key).

- [ ] **Step 8: Commit**

```bash
git add tools/push-transforms.mjs tools/push-transforms.test.ts tools/push-data.mjs package.json package-lock.json
git commit -m "feat: add push:data publisher from repo data/ to Supabase"
```

---

### Task 4: `src/lib/supabase.ts` — injectable Db + row mappers

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/rows.ts`, `src/lib/rows.test.ts`

**Interfaces:**
- Consumes: `supabase/project.json` (Task 1).
- Produces (used by Tasks 5–7):

```ts
// supabase.ts
export interface Db {
  selectAll<T>(table: string, columns: string): Promise<T[]>;
  selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null>;
}
export const defaultDb: Db;
// rows.ts
export interface CatalogRow { term: string; exported_at: string; sections: Section[]; warnings: string[] }
export interface ProgramRow { id: string; code: string; name: string; version_year: number; blocks: CurriculumBlock[] }
export interface RatingRow { name: string; rating: number; course_code: string | null; note: string | null; as_of: string | null }
export function rowToCatalog(row: CatalogRow): Catalog;
export function rowToProgram(row: ProgramRow): Program;
export function rowToSummary(row: Omit<ProgramRow, "blocks">): ProgramSummary;
export function rowToRating(row: RatingRow): ProfRating;
```

- [ ] **Step 1: Write failing mapper tests** in `src/lib/rows.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rowToCatalog, rowToProgram, rowToSummary, rowToRating } from "./rows";

describe("row mappers", () => {
  it("maps a catalogs row to Catalog", () => {
    expect(rowToCatalog({ term: "2026-1", exported_at: "2026-07-21T00:00:00.000Z", sections: [], warnings: ["w"] }))
      .toEqual({ term: "2026-1", exportedAt: "2026-07-21T00:00:00.000Z", sections: [], warnings: ["w"] });
  });
  it("maps a programs row to Program and ProgramSummary", () => {
    const row = { id: "X-2024", code: "X", name: "N", version_year: 2024, blocks: [] };
    expect(rowToProgram(row)).toEqual({ id: "X-2024", code: "X", name: "N", versionYear: 2024, blocks: [] });
    expect(rowToSummary(row)).toEqual({ id: "X-2024", code: "X", name: "N", versionYear: 2024 });
  });
  it("maps a ratings row, dropping nulls", () => {
    expect(rowToRating({ name: "A", rating: 4.5, course_code: null, note: null, as_of: null }))
      .toEqual({ name: "A", rating: 4.5 });
    expect(rowToRating({ name: "B", rating: 3, course_code: "MATH 10", note: "n", as_of: "2026-01-01" }))
      .toEqual({ name: "B", rating: 3, courseCode: "MATH 10", note: "n", asOf: "2026-01-01" });
  });
});
```

- [ ] **Step 2: Verify RED** — `npx vitest run src/lib/rows.test.ts` — FAIL, module missing.

- [ ] **Step 3: Implement `src/lib/rows.ts`**:

```ts
import type { Catalog, CurriculumBlock, ProfRating, Program, ProgramSummary, Section } from "./types";

export interface CatalogRow { term: string; exported_at: string; sections: Section[]; warnings: string[] }
export interface ProgramRow { id: string; code: string; name: string; version_year: number; blocks: CurriculumBlock[] }
export interface RatingRow { name: string; rating: number; course_code: string | null; note: string | null; as_of: string | null }

export const rowToCatalog = (row: CatalogRow): Catalog => ({
  term: row.term, exportedAt: row.exported_at, sections: row.sections, warnings: row.warnings,
});
export const rowToProgram = (row: ProgramRow): Program => ({
  id: row.id, code: row.code, name: row.name, versionYear: row.version_year, blocks: row.blocks,
});
export const rowToSummary = (row: Omit<ProgramRow, "blocks">): ProgramSummary => ({
  id: row.id, code: row.code, name: row.name, versionYear: row.version_year,
});
export const rowToRating = (row: RatingRow): ProfRating => ({
  name: row.name,
  rating: row.rating,
  ...(row.course_code !== null ? { courseCode: row.course_code } : {}),
  ...(row.note !== null ? { note: row.note } : {}),
  ...(row.as_of !== null ? { asOf: row.as_of } : {}),
});
```

- [ ] **Step 4: Verify GREEN** — `npx vitest run src/lib/rows.test.ts` — 3 pass.

- [ ] **Step 5: Implement `src/lib/supabase.ts`** (thin wrapper; exercised through Tasks 5–6 stubs and by the live app — no unit test of its own):

```ts
import { createClient } from "@supabase/supabase-js";
import project from "../../supabase/project.json";

// The ONLY network boundary for shared data. Tests inject a stub Db instead.
export interface Db {
  selectAll<T>(table: string, columns: string): Promise<T[]>;
  selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null>;
}

const client = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? project.url,
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? project.anonKey,
  { auth: { persistSession: false } }
);

export const defaultDb: Db = {
  async selectAll<T>(table: string, columns: string): Promise<T[]> {
    const { data, error } = await client.from(table).select(columns);
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as T[];
  },
  async selectOne<T>(table: string, columns: string, keyColumn: string, key: string): Promise<T | null> {
    const { data, error } = await client.from(table).select(columns).eq(keyColumn, key).maybeSingle();
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data as T) ?? null;
  },
};
```

- [ ] **Step 6: Verify build** — `npm run build` — clean (`vite-env.d.ts` already provides `import.meta.env` types).

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase.ts src/lib/rows.ts src/lib/rows.test.ts
git commit -m "feat: injectable Db boundary and row mappers for Supabase reads"
```

---

### Task 5: Async catalog API (added alongside sync — removal happens in Task 7)

**Files:**
- Modify: `src/lib/catalog.ts`
- Create: `src/lib/catalog-async.test.ts`

**Interfaces:**
- Consumes: `Db` from Task 4; `rowToCatalog`, `rowToRating` from `rows.ts`.
- Produces (Task 7 wires these into the app):

```ts
export function getTermsAsync(db?: Db): Promise<TermOption[]>;
export function loadCatalogAsync(term: string, db?: Db): Promise<Catalog>;  // throws CatalogUnavailableError
export function loadCommunityRatings(db?: Db): Promise<ProfRating[]>;
```

- [ ] **Step 1: Write failing tests** in `src/lib/catalog-async.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getTermsAsync, loadCatalogAsync, loadCommunityRatings, CatalogUnavailableError } from "./catalog";
import type { Db } from "./supabase";

const stubDb = (tables: Record<string, unknown[]>): Db => ({
  async selectAll<T>(table: string) { return (tables[table] ?? []) as T[]; },
  async selectOne<T>(table: string, _c: string, keyColumn: string, key: string) {
    return ((tables[table] ?? []).find((r) => (r as Record<string, unknown>)[keyColumn] === key) as T) ?? null;
  },
});

describe("async catalog API", () => {
  const db = stubDb({
    catalogs: [{ term: "2026-1", exported_at: "2026-07-21T00:00:00.000Z", sections: [], warnings: [] }],
    community_ratings: [{ name: "GARCIA, JUAN", rating: 4, course_code: null, note: null, as_of: null }],
  });

  it("lists known AISIS terms newest first, available only when in the DB", async () => {
    const terms = await getTermsAsync(db);
    expect(terms.map((t) => t.term)).toEqual(["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"]);
    expect(terms.find((t) => t.term === "2026-1")?.available).toBe(true);
    expect(terms.find((t) => t.term === "2026-2")?.available).toBe(false);
    expect(terms[0].label).toBe("2026-2027 Second Semester");
  });

  it("includes a DB term missing from the known list, appended and available", async () => {
    const extra = stubDb({ catalogs: [{ term: "2027-1", exported_at: "x", sections: [], warnings: [] }] });
    const terms = await getTermsAsync(extra);
    expect(terms.at(-1)).toMatchObject({ term: "2027-1", available: true });
  });

  it("loads a catalog row as a Catalog", async () => {
    const catalog = await loadCatalogAsync("2026-1", db);
    expect(catalog).toEqual({ term: "2026-1", exportedAt: "2026-07-21T00:00:00.000Z", sections: [], warnings: [] });
  });

  it("throws CatalogUnavailableError for an absent term, naming both commands", async () => {
    const err = await loadCatalogAsync("2026-2", db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CatalogUnavailableError);
    expect((err as Error).message).toContain("npm run scrape:schedule -- 2026-2 && npm run push:data");
  });

  it("loads community ratings as ProfRating[]", async () => {
    expect(await loadCommunityRatings(db)).toEqual([{ name: "GARCIA, JUAN", rating: 4 }]);
  });
});
```

- [ ] **Step 2: Verify RED** — `npx vitest run src/lib/catalog-async.test.ts` — FAIL (exports missing).

- [ ] **Step 3: Implement** — add to `src/lib/catalog.ts` (keep every existing export untouched; update the `CatalogUnavailableError` message):

```ts
import { defaultDb, type Db } from "./supabase";
import { rowToCatalog, rowToRating, type CatalogRow, type RatingRow } from "./rows";

// In the CatalogUnavailableError constructor, the message becomes:
//   `No catalog data for term ${term}. Run: npm run scrape:schedule -- ${term} && npm run push:data`

const KNOWN_TERMS = ["2026-2", "2026-1", "2026-0", "2025-2", "2025-1", "2025-0"];

export async function getTermsAsync(db: Db = defaultDb): Promise<TermOption[]> {
  const rows = await db.selectAll<Pick<CatalogRow, "term">>("catalogs", "term");
  const inDb = new Set(rows.map((r) => r.term));
  const known = KNOWN_TERMS.map((term) => ({ term, label: termLabel(term), available: inDb.has(term) }));
  const extras = [...inDb].filter((t) => !KNOWN_TERMS.includes(t)).sort().reverse()
    .map((term) => ({ term, label: termLabel(term), available: true }));
  return [...known, ...extras];
}

export async function loadCatalogAsync(term: string, db: Db = defaultDb): Promise<Catalog> {
  const row = await db.selectOne<CatalogRow>("catalogs", "term, exported_at, sections, warnings", "term", term);
  if (row === null) throw new CatalogUnavailableError(term);
  return rowToCatalog(row);
}

export async function loadCommunityRatings(db: Db = defaultDb): Promise<ProfRating[]> {
  const rows = await db.selectAll<RatingRow>("community_ratings", "name, rating, course_code, note, as_of");
  return rows.map(rowToRating);
}
```

- [ ] **Step 4: Verify GREEN + suite** — `npx vitest run` — new tests pass; the old `catalog.test.ts` line 26 assertion still passes (same error class; message changed — update its expectation only if it asserts message text, which it does not).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog.ts src/lib/catalog-async.test.ts
git commit -m "feat: async Supabase-backed catalog API alongside bundled reads"
```

---

### Task 6: Async curriculum API (added alongside sync — removal in Task 7)

**Files:**
- Modify: `src/lib/curriculum.ts`
- Create: `src/lib/curriculum-async.test.ts`

**Interfaces:**
- Consumes: `Db`, `rowToProgram`, `rowToSummary`.
- Produces:

```ts
export class ProgramUnavailableError extends Error { id: string }
export function getProgramsAsync(db?: Db): Promise<ProgramSummary[]>;
export function loadProgram(id: string, db?: Db): Promise<Program>;  // throws ProgramUnavailableError
```

- [ ] **Step 1: Write failing tests** in `src/lib/curriculum-async.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getProgramsAsync, loadProgram, ProgramUnavailableError } from "./curriculum";
import type { Db } from "./supabase";

const row = { id: "X-2024", code: "X", name: "X PROGRAM", version_year: 2024, blocks: [] };
const db: Db = {
  async selectAll<T>() { return [row] as T[]; },
  async selectOne<T>(_t: string, _c: string, _k: string, key: string) { return (key === "X-2024" ? row : null) as T | null; },
};

describe("async curriculum API", () => {
  it("lists program summaries sorted by code", async () => {
    expect(await getProgramsAsync(db)).toEqual([{ id: "X-2024", code: "X", name: "X PROGRAM", versionYear: 2024 }]);
  });
  it("loads a full program", async () => {
    expect(await loadProgram("X-2024", db)).toEqual({ id: "X-2024", code: "X", name: "X PROGRAM", versionYear: 2024, blocks: [] });
  });
  it("throws ProgramUnavailableError for an unknown id, naming both commands", async () => {
    const err = await loadProgram("NOPE", db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProgramUnavailableError);
    expect((err as Error).message).toContain("npm run scrape:curricula && npm run push:data");
  });
});
```

- [ ] **Step 2: Verify RED** — `npx vitest run src/lib/curriculum-async.test.ts` — FAIL.

- [ ] **Step 3: Implement** — add to `src/lib/curriculum.ts`:

```ts
import { defaultDb, type Db } from "./supabase";
import { rowToProgram, rowToSummary, type ProgramRow } from "./rows";

export class ProgramUnavailableError extends Error {
  id: string;
  constructor(id: string) {
    super(`No curriculum for program ${id}. Run: npm run scrape:curricula && npm run push:data`);
    this.name = "ProgramUnavailableError";
    this.id = id;
  }
}

export async function getProgramsAsync(db: Db = defaultDb): Promise<ProgramSummary[]> {
  const rows = await db.selectAll<Omit<ProgramRow, "blocks">>("programs", "id, code, name, version_year");
  return rows.map(rowToSummary).sort((a, b) => a.code.localeCompare(b.code));
}

export async function loadProgram(id: string, db: Db = defaultDb): Promise<Program> {
  const row = await db.selectOne<ProgramRow>("programs", "id, code, name, version_year, blocks", "id", id);
  if (row === null) throw new ProgramUnavailableError(id);
  return rowToProgram(row);
}
```

- [ ] **Step 4: Verify GREEN + suite** — `npx vitest run` — all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/curriculum.ts src/lib/curriculum-async.test.ts
git commit -m "feat: async Supabase-backed curriculum API"
```

---

### Task 7: Switch the app to the async APIs; delete bundled reads

**Files:**
- Modify: `src/App.tsx`, `src/components/Results.tsx`, `src/lib/catalog.ts`, `src/lib/curriculum.ts`
- Modify: `src/lib/catalog.test.ts`, `src/lib/curriculum.test.ts` (rewrite against stubs), `src/components/Results.test.tsx` (block prop), `src/App.smoke.test.tsx` (vi.mock of the Db)
- Delete: `src/lib/catalog-async.test.ts`, `src/lib/curriculum-async.test.ts` (their content merges into the rewritten main test files — keep every case)

**Interfaces:**
- Consumes: everything from Tasks 5–6.
- Produces: `Results` props become `{ catalog, block, state, ratings, onChange }` (`block: CurriculumBlock | undefined` — Plan B relies on this). Final public API of the data modules: `getTerms(db?)`, `loadCatalog(term, db?)`, `loadCommunityRatings(db?)`, `isStale`, `CatalogUnavailableError`, `getPrograms(db?)`, `loadProgram(id, db?)`, `getBlock`, `ProgramUnavailableError` — the `*Async` names are renamed onto the plain names in this task.

- [ ] **Step 1: Rewrite the two data-module test files (RED first).** `src/lib/catalog.test.ts` becomes the five async cases from `catalog-async.test.ts` (renamed `getTermsAsync`→`getTerms`, `loadCatalogAsync`→`loadCatalog`) plus the existing `isStale` case verbatim; delete the "loads the real scraped 2026-1 catalog" and sync `getCommunityRatings` cases (bundled reads are gone). `src/lib/curriculum.test.ts` becomes the three async cases (renamed `getProgramsAsync`→`getPrograms`) plus a `getBlock` case using an inline program object:

```ts
it("getBlock finds a block by key", () => {
  const program = { id: "X", code: "X", name: "X", versionYear: 2024,
    blocks: [{ year: "First Year", term: "First Semester", key: "First Year|First Semester", totalUnits: 3,
      entries: [] }] };
  expect(getBlock(program, "First Year|First Semester")?.totalUnits).toBe(3);
  expect(getBlock(program, "nope")).toBeUndefined();
});
```

Run `npx vitest run src/lib/catalog.test.ts src/lib/curriculum.test.ts` — expect FAIL (plain names still sync).

- [ ] **Step 2: Rename in the modules.** In `catalog.ts`: delete `CATALOG_MODULES`, the `ratingsJson` import, sync `getTerms`, `loadCatalog`, `getCommunityRatings`, and the exported `TERMS` const; rename `getTermsAsync`→`getTerms`, `loadCatalogAsync`→`loadCatalog`. In `curriculum.ts`: delete the `amdsc2024` import, `PROGRAMS`, sync `getPrograms`, `getCurriculum`; rename `getProgramsAsync`→`getPrograms`. Delete the two `*-async.test.ts` files. Run the two test files again — expect PASS.

- [ ] **Step 3: Rewire `App.tsx`.** Replace the sync `programs`/`program` memos and `getTerms()` call with state + effects (all four follow the existing catalog-effect pattern with a `cancelled` flag):

```tsx
const [terms, setTerms] = useState<TermOption[]>([]);
const [programs, setPrograms] = useState<ProgramSummary[]>([]);
const [program, setProgram] = useState<Program | null>(null);
const [programError, setProgramError] = useState<string>("");
const [communityRatings, setCommunityRatings] = useState<ProfRating[]>([]);

useEffect(() => {
  let cancelled = false;
  getTerms().then((t) => { if (!cancelled) setTerms(t); }).catch(() => {});
  getPrograms().then((p) => { if (!cancelled) setPrograms(p); }).catch(() => {});
  loadCommunityRatings().then((r) => { if (!cancelled) setCommunityRatings(r); }).catch(() => {});
  return () => { cancelled = true; };
}, []);

useEffect(() => {
  let cancelled = false;
  setProgram(null);
  setProgramError("");
  if (!state.programId) return;
  loadProgram(state.programId)
    .then((p) => { if (!cancelled) setProgram(p); })
    .catch((err: unknown) => { if (!cancelled) setProgramError(String(err instanceof Error ? err.message : err)); });
  return () => { cancelled = true; };
}, [state.programId]);
```

`block` memo now derives from the `program` state (`program && state.blockKey ? getBlock(program, state.blockKey) : undefined`). `ratings` memo becomes `mergeRatings(communityRatings, state.personalRatings)` with `[communityRatings, state.personalRatings]` deps. Render `programError` in the notice stack alongside `catalogError`. While `state.programId && !program && !programError`, semester/courses/results tabs render `<p>Loading your program…</p>` instead of their content. Pass `program ?? undefined` to `SemesterPicker`, `terms` state instead of `getTerms()`, and `block={block}` to `Results`.

- [ ] **Step 4: `Results.tsx` takes `block` as a prop.** Add `block: CurriculumBlock | undefined` to `Props`; delete the `getCurriculum`/`getBlock` imports and the program/block derivation inside `resolvedCourses` (keep the no-block fallback branch keyed on the `block` prop); memo deps become `[catalog, state, block]`. Update `Results.test.tsx`: every `render` passes `block={undefined}` (the existing fixtures used fake program ids, so behavior is identical).

- [ ] **Step 5: Smoke test — stub the network at the Db boundary.** At the top of `src/App.smoke.test.tsx` (before other imports is fine — `vi.mock` hoists):

```tsx
import { vi } from "vitest";
vi.mock("./lib/supabase", async () => {
  const catalog = (await import("../data/catalogs/catalog-2026-1.json")).default;
  const program = (await import("../data/curricula/BS-AMDSc-M-DSc-2024.json")).default;
  const ratings = (await import("../data/prof-ratings.json")).default;
  const tables: Record<string, Record<string, unknown>[]> = {
    catalogs: [{ term: catalog.term, exported_at: catalog.exportedAt, sections: catalog.sections, warnings: catalog.warnings }],
    programs: [{ id: program.id, code: program.code, name: program.name, version_year: program.versionYear, blocks: program.blocks }],
    community_ratings: ratings.map((r: Record<string, unknown>) => ({
      name: r.name, rating: r.rating, course_code: r.courseCode ?? null, note: r.note ?? null, as_of: r.asOf ?? null,
    })),
  };
  return { defaultDb: {
    async selectAll(table: string) { return tables[table] ?? []; },
    async selectOne(table: string, _c: string, keyColumn: string, key: string) {
      return (tables[table] ?? []).find((row) => row[keyColumn] === key) ?? null;
    },
  } };
});
```

The flow steps need two async guards added: after choosing the program, `await waitFor(() => expect(screen.getByLabelText(/Curriculum block/i)).toBeTruthy())` isn't enough — wait for the block dropdown to be populated: `await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(1))` after clicking the Semester tab. Everything else in the smoke test is unchanged.

- [ ] **Step 5b: Old-saved-programId fallback test** (spec §6.2/§8) — add a second `it` in the same file, using the same mocked Db (which only knows the new id):

```tsx
it("treats a saved pre-migration programId as no program chosen, with an explanatory banner", async () => {
  localStorage.setItem("aisis-scheduler-state", JSON.stringify({
    version: 2, programId: "BS-AMDSc-2024", blockKey: "", calendarTerm: "2026-1",
    requiredCourses: [], electiveFills: {}, lockedSections: [], fullSections: [],
    personalRatings: [], preferences: { criteria: ["compactDays"], protectedBlocks: [], excludedSections: [] },
  }));
  render(<App />);
  await waitFor(() => expect(screen.getByText(/No curriculum for program BS-AMDSc-2024/)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Semester" }));
  expect(screen.getByText(/Choose a program first/)).toBeTruthy();
});
```

- [ ] **Step 6: Full verification**

Run: `npx vitest run && npm run build`
Expected: all tests pass; build output contains NO `catalog-2026-1-*.js` chunk (the 929 KB chunk is gone — verify with `ls dist/assets | grep -c catalog` → `0`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: app reads shared data from Supabase; bundled data reads removed"
```

---

### Task 8: README + seed + live verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything prior. Partly a user-run task (service key).

- [ ] **Step 1: Update `README.md`:** rewrite "Refreshing the class schedule" to end with `npm run push:data` instead of "commit and redeploy"; replace the "Scaling to Supabase" section with "Data hosting" describing: `data/` as source of truth, the three tables, `push:data`, and the token rule (credentials never; `AISIS_COOKIE` / `SUPABASE_SERVICE_ROLE_KEY` env-var-only, in memory only). Document `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` overrides and that `supabase/project.json` holds the public defaults.

- [ ] **Step 2 (USER): Seed the database.** User runs, with the service key from Supabase dashboard → Project Settings → API:

```bash
SUPABASE_SERVICE_ROLE_KEY=<key> npm run push:data
```

Expected output: `programs: upserted 1`, `catalogs: upserted 1`, `community_ratings: replaced with N row(s)`.

- [ ] **Step 3 (orchestrator): Verify rows** via MCP `execute_sql`: `select id from programs; select term, jsonb_array_length(sections) as sections from catalogs;` — expect `BS-AMDSc-M-DSc-2024` and `2026-1 | 3743`.

- [ ] **Step 4 (orchestrator): Live check** — start the dev server and click through program → semester → courses → results against the real project.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document Supabase data hosting and push workflow"
```
