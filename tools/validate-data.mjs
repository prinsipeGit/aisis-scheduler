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
  }
}

// Every section must carry timeStatus. A catalog scraped before that field existed makes
// the generator's parse-error guard inert on production data.
for (const file of catalogFiles) {
  const catalog = await readJson(path.join(DATA, "catalogs", file));
  const missing = catalog.sections.filter((s) => !s.timeStatus).length;
  if (missing > 0) fail(`${file}: ${missing} section(s) have no timeStatus - re-run the scraper`);
}

// Every alias target must resolve to at least one section in the newest catalog, or the
// alias is dead weight hiding a real gap.
const aliasFile = await readJson(path.join(DATA, "course-aliases.json"));
const canon = (c) => c.trim().replace(/\s+/g, " ").toUpperCase();
const newestCodes = [...new Set((newest?.sections ?? []).map((s) => s.courseCode))];
const matchesPrefix = (code, base) => {
  const x = canon(code), y = canon(base);
  if (x === y) return true;
  if (!x.startsWith(y)) return false;
  const rest = x.slice(y.length);
  return rest.startsWith(".") || rest.startsWith("(");
};
for (const [key, prefixes] of Object.entries(aliasFile.aliases)) {
  for (const prefix of prefixes) {
    if (!newestCodes.some((c) => matchesPrefix(c, prefix))) {
      console.log(`note: alias ${key} -> ${prefix} matches nothing in ${newest.term}`);
    }
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
  const blockKeys = new Set(); const slotIds = new Set();
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
  }
}
console.log(`Validated ${catalogFiles.length} catalog(s) and ${programCount} curriculum program(s).`);

// Alias-aware requirement-resolution rate across every program (§5.3): a required course
// resolves if its literal catNo, or one of its alias targets, matches at least one section
// in the newest catalog. This is how the alias file gets maintained, so the numbers must be
// real - not adjusted to hit a target.
let unresolved = 0, requirements = 0;
const missingByCode = new Map();
for (const entry of index) {
  const program = await readJson(path.join(DATA, "curricula", `${entry.id}.json`));
  for (const block of program.blocks) {
    for (const e of block.entries) {
      if (e.isElective) continue;
      requirements += 1;
      const key = aliasFile.aliases[e.category] ? e.category : e.catNo;
      const targets = [e.catNo, ...(aliasFile.aliases[key] ?? [])];
      if (targets.some((t) => newestCodes.some((c) => matchesPrefix(c, t)))) continue;
      unresolved += 1;
      const label = `${e.catNo} [${e.category || "-"}]`;
      missingByCode.set(label, (missingByCode.get(label) ?? 0) + 1);
    }
  }
}
const resolvedPct = (100 * (requirements - unresolved) / requirements).toFixed(1);
console.log(`\nRequirement resolution against ${newest.term}: ${resolvedPct}% of ${requirements}`);
console.log("Top unresolved codes:");
for (const [label, n] of [...missingByCode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${String(n).padStart(4)} x ${label}`);
}

if (failed) process.exit(1);
