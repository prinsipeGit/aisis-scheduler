import catalog from "../src/data/catalog-2026-1.json" with { type: "json" };
import curriculum from "../src/data/curriculum-BS-AMDSc-2024.json" with { type: "json" };
const canonicalCourseCode = (code) => code.trim().replace(/\s+/g, " ").toUpperCase();

const fail = (message) => {
  console.error(`Data validation failed: ${message}`);
  process.exitCode = 1;
};

if (catalog.term !== "2026-1") fail(`catalog term is ${catalog.term}, expected 2026-1`);
if (!Array.isArray(catalog.sections) || catalog.sections.length === 0) fail("catalog has no sections");
if (!Array.isArray(curriculum.blocks) || curriculum.blocks.length === 0) fail("curriculum has no blocks");

const sectionKeys = new Set();
const offeredCodes = new Set();
for (const section of catalog.sections) {
  const key = `${canonicalCourseCode(section.courseCode)} ${section.sectionCode.trim().toUpperCase()}`;
  if (sectionKeys.has(key)) fail(`duplicate section key: ${key}`);
  sectionKeys.add(key);
  offeredCodes.add(canonicalCourseCode(section.courseCode));
}

const missingByBlock = [];
for (const block of curriculum.blocks) {
  const missing = block.entries
    .filter((entry) => !entry.isElective)
    .map((entry) => entry.catNo)
    .filter((code) => !offeredCodes.has(canonicalCourseCode(code)));
  if (missing.length > 0) missingByBlock.push({ block: block.key, missing });
}

console.log(`Validated ${catalog.sections.length} sections and ${curriculum.blocks.length} curriculum blocks.`);
console.log(`${missingByBlock.length} block(s) contain required courses not offered in ${catalog.term}:`);
for (const item of missingByBlock) console.log(`- ${item.block}: ${item.missing.join(", ")}`);

if (process.exitCode) process.exit(process.exitCode);
