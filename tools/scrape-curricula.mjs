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
  parseProgramOptions, latestPerTrack, parseCurriculumPage,
  looksLikeLoginPage, buildProgram, buildIndex, isUndergraduate,
} from "./curriculum-parse.mjs";

const ENDPOINT = "https://aisis.ateneo.edu/j_aisis/J_VOFC.do";
const DELAY_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const force = process.argv.includes("--force");
// Graduate curricula have no year/term block structure, so they parse to zero blocks and
// only add noise and ~4 minutes to the run. The app is undergraduate-only by design.
// --all opts back in so they stay reachable if that ever changes.
const includeGraduate = process.argv.includes("--all");

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
const { options, skipped } = parseProgramOptions(landing);
for (const value of skipped) console.warn(`  ! unparseable option value, skipped: ${value}`);
const everyProgram = latestPerTrack(options);
const discovered = includeGraduate ? everyProgram : everyProgram.filter(isUndergraduate);
if (discovered.length === 0) {
  console.error("No programs found in the page's dropdown — the page layout may have changed.");
  process.exit(1);
}
const scope = includeGraduate
  ? "every level (--all)"
  : `undergraduate only, skipping ${everyProgram.length - discovered.length} graduate/non-degree`;
console.log(
  `Discovered ${discovered.length} programs — ${scope} — from ${options.length} options ` +
  `(latest version per code+track); ${skipped.length} unparseable.`
);

// The form field names are read from the live page so a rename upstream is visible
// immediately rather than silently producing empty results.
const selectName = /<select\b[^>]*\bname\s*=\s*"([^"]+)"/i.exec(landing)?.[1];
if (!selectName) {
  console.error("Could not find the program <select> field name — the page layout may have changed.");
  process.exit(1);
}
// Hidden inputs carry any command/state fields the form ships. Today's page has none
// (the <select> submits itself), so this yields {} — it exists so that a field added
// upstream is replayed rather than silently dropped.
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
      warnings.push(`${option.code} (${option.versionLabel}): no blocks parsed — skipped`);
      console.warn(`  ! ${option.code}: no blocks parsed`);
    } else {
      programs.push(buildProgram({ ...option, blocks }));
      console.log(`  ${option.code} (${option.versionLabel}): ${blocks.length} blocks`);
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
