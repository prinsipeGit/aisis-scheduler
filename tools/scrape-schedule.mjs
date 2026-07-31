#!/usr/bin/env node
/**
 * Scrape one term's class schedule from the PUBLIC AISIS endpoint.
 *
 *   node tools/scrape-schedule.mjs 2026-2
 *
 * Writes data/catalogs/catalog-<term>.json.
 *
 * This endpoint requires NO login. This script never sends, prompts for, or
 * stores credentials — do not add auth to it.
 *
 * A term with no published schedule (e.g. 2026-2 as of 2026-07-21) returns a
 * page containing "There are no results for your search criteria" and zero
 * data rows. That is normal, not an error — the run simply yields 0 sections.
 */
import { rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEPARTMENTS, TERMS } from "./departments.mjs";
import { extractRows } from "./extract-rows.mjs";
import { parseRows } from "./schedule-parse.mjs";

const ENDPOINT = "https://aisis.ateneo.edu/j_aisis/classSkeds.do";
const DELAY_MS = 1500; // politeness between department requests
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const term = process.argv[2];
const force = process.argv.includes("--force");
if (!TERMS.includes(term)) {
  console.error(`Usage: node tools/scrape-schedule.mjs <term>\nKnown terms: ${TERMS.join(", ")}`);
  process.exit(1);
}

// AISIS will NOT serve results without an established session. GET the page first to
// pick up its cookies, then send them on every POST. Verified 2026-07-21: without this,
// every department returns ZERO rows while the browser (which has a cookie) returns 201.
const boot = await fetch(ENDPOINT);
// Use getSetCookie() rather than the "set-cookie" header: when a response sends multiple
// Set-Cookie headers, fetch's single-header getter joins them with commas, and a cookie
// carrying an Expires=Wed, 21 Oct 2026 ... attribute has its own comma — a plain split(",")
// corrupts the value. getSetCookie() returns each Set-Cookie entry intact.
const rawCookies = boot.headers.getSetCookie?.() || [];
const COOKIE = rawCookies.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
if (!COOKIE) console.warn("! No session cookie received — results are likely to be empty.");

const allRows = [];
const warnings = [];
let successfulDepartments = 0;
for (const dept of DEPARTMENTS) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: COOKIE },
      // Field names verified live 2026-07-21 by reading the classScheduleForm.
      body: new URLSearchParams({
        command: "displayResults",
        subjCode: "ALL",
        applicablePeriod: term,
        deptCode: dept,
      }),
    });
    if (!res.ok) {
      warnings.push(`${dept}: HTTP ${res.status} — skipped`);
      console.warn(`  ! ${dept}: HTTP ${res.status}`);
      continue;
    }
    const rows = extractRows(await res.text());
    allRows.push(...rows);
    if (rows.length === 0) {
      warnings.push(`${dept}: 0 rows extracted from a 200 OK response — may be a genuinely empty department or a failed fetch (e.g. expired session/error page)`);
      console.warn(`  ! ${dept}: 0 rows extracted from a 200 OK response — may be a genuinely empty department or a failed fetch`);
    } else {
      successfulDepartments += 1;
      console.log(`  ${dept}: ${rows.length} rows`);
    }
  } catch (err) {
    warnings.push(`${dept}: ${err.message} — skipped`);
    console.warn(`  ! ${dept}: ${err.message}`);
  }
  await sleep(DELAY_MS);
}

const { sections, warnings: parseWarnings } = parseRows(allRows);

// De-duplicate by section key: a course can appear under more than one department filter.
const byKey = new Map();
for (const s of sections) byKey.set(`${s.courseCode} ${s.sectionCode}`, s);

// `raw` is a parse-time debugging aid (joined row cells) — not persisted to catalogs.
const sectionsForCatalog = [...byKey.values()].map((s) => ({ ...s, raw: "" }));

const catalog = {
  term,
  exportedAt: new Date().toISOString(),
  sections: sectionsForCatalog,
  warnings: [...warnings, ...parseWarnings],
};

const minimumSuccessfulDepartments = Math.max(3, Math.ceil(DEPARTMENTS.length * 0.2));
const suspicious = catalog.sections.length === 0 || successfulDepartments < minimumSuccessfulDepartments;
if (suspicious && !force) {
  console.error(
    `Refusing to overwrite a catalog with ${catalog.sections.length} sections from ` +
    `${successfulDepartments}/${DEPARTMENTS.length} successful departments. ` +
    "Investigate the AISIS response, or rerun with --force after confirming the result."
  );
  process.exit(1);
}

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "data", "catalogs", `catalog-${term}.json`
);
const temporaryOut = `${out}.tmp`;
try {
  await writeFile(temporaryOut, JSON.stringify(catalog, null, 2));
  await rename(temporaryOut, out);
} catch (error) {
  await unlink(temporaryOut).catch(() => {});
  throw error;
}
console.log(`\nWrote ${out}: ${catalog.sections.length} sections, ${catalog.warnings.length} warnings.`);
