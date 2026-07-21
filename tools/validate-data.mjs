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
