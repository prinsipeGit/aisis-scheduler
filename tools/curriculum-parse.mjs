// Parsers for the AISIS Official Curriculum page (J_VOFC.do).
// Dependency-free by design, like tools/extract-rows.mjs.

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

// The option VALUE is authoritative: "{code}_{version}_{sem}", e.g. "AB LIT(ENG)_24TB_1".
// Splitting it from the right survives codes that contain parentheses, spaces and dashes,
// which the printed label "(CODE) NAME(Ver Sem N, Ver Year V)" does not.
const VALUE = /^(.*)_([^_]+)_([^_]+)$/;
// "Ver Year" is a 4-digit year, or a 2-digit year plus a track code ("24BE", "99TB").
const VERSION = /^(\d{2}|\d{4})([A-Za-z]*)$/;

export function parseVersion(version) {
  const m = VERSION.exec(version.trim());
  if (!m) return null;
  const digits = m[1];
  const versionYear = digits.length === 4
    ? Number(digits)
    : Number(digits) <= 50 ? 2000 + Number(digits) : 1900 + Number(digits);
  return { versionYear, track: m[2].toUpperCase() };
}

export const versionLabelOf = (versionYear, track) =>
  track ? `${versionYear} · ${track}` : `${versionYear}`;

export function programId(code, version) {
  const slug = code.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug}-${version}`;
}

export function parseProgramOptions(html) {
  const options = [];
  const skipped = [];
  for (const m of html.matchAll(/<option\b[^>]*value\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)) {
    const value = m[1].trim();
    if (!value) continue; // the "-- Select --" placeholder
    const parts = VALUE.exec(value);
    const parsed = parts ? parseVersion(parts[2]) : null;
    if (!parts || !parsed) {
      skipped.push(value);
      continue;
    }
    const [, code, version] = parts;
    // Name = printed label minus the leading "(CODE)" and the trailing "(Ver Sem …)".
    let name = textOf(m[2]);
    if (name.startsWith(`(${code})`)) name = name.slice(code.length + 2).trim();
    name = name.replace(/\(\s*Ver\s+Sem[^)]*\)\s*$/i, "").trim();
    options.push({
      value, code, version, name,
      versionYear: parsed.versionYear,
      track: parsed.track,
      versionLabel: versionLabelOf(parsed.versionYear, parsed.track),
    });
  }
  return { options, skipped };
}

// Latest per (code, track): grouping by code alone would drop whole programs whose
// only versions are track-suffixed (AB EU, AB LIT(ENG), AB LIT(ENG)-LCS).
export function latestPerTrack(options) {
  const best = new Map();
  for (const option of options) {
    const key = `${option.code}|${option.track}`;
    const current = best.get(key);
    if (!current || option.versionYear > current.versionYear) best.set(key, option);
  }
  return [...best.values()].sort(
    (a, b) => a.code.localeCompare(b.code) || a.track.localeCompare(b.track)
  );
}

const ELECTIVE = /ELECTIVE/i;
const IE_SLOT = /^IE\s*\d+$/i;

export function isElectiveEntry(catNo, title) {
  return ELECTIVE.test(catNo) || ELECTIVE.test(title) || IE_SLOT.test(catNo.trim());
}

export function electiveDeptFor(catNo) {
  return IE_SLOT.test(catNo.trim()) ? "**IE**" : undefined;
}

// Match the OPENING <td ...> only, then take its content up to whatever structural
// tag comes next. The page leaves some <td> elements unclosed, and pairing
// <td>…</td> makes those swallow the year/term headings that follow them.
const CELL = /<td\b([^>]*)>([\s\S]*?)(?=<\/?t[dhr]\b|<\/?table\b|$)/gi;
const classOf = (attrs) => /class\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
const TERM_UNITS = /^(.+?)\s*-\s*([\d.]+)\s*Units?$/i;

// One linear pass over three cell kinds in document order: year heading (text06),
// term+units heading (text04 matching "TERM - N Units"), and entry cells (text02,
// five per course). <tr>/<table> nesting is unreliable, so it is ignored entirely.
// Each printed block is transcribed as-is: AISIS sometimes prints a term as a year
// (a "Fourth Year" block under "Third Year") and that quirk is preserved.
export function parseCurriculumPage(html) {
  const blocks = [];
  const warnings = [];
  let year = "";
  let term = "";
  let totalUnits = 0;
  let pending = [];

  const flush = () => {
    const cells = pending;
    pending = [];
    if (cells.length === 0) return;
    if (!year || !term) {
      warnings.push(`${cells.length} entry cell(s) seen before any year/term heading — skipped`);
      return;
    }
    if (cells.length % 5 !== 0) {
      warnings.push(`${year}|${term}: ${cells.length} entry cell(s) is not a multiple of 5 — trailing cells ignored`);
    }
    const key = `${year}|${term}`;
    const entries = [];
    for (let i = 0; i + 4 < cells.length; i += 5) {
      const [catNo, title, unitsText, prereqText, category] = cells.slice(i, i + 5);
      const units = Number(unitsText.replace(/[()]/g, ""));
      const electiveDept = electiveDeptFor(catNo);
      entries.push({
        catNo,
        title,
        units: Number.isFinite(units) ? units : 0,
        prerequisites: prereqText.split(",").map((p) => p.trim()).filter(Boolean),
        category,
        isElective: isElectiveEntry(catNo, title),
        ...(electiveDept ? { electiveDept } : {}),
        slotId: `${key}#${entries.length}`,
      });
    }
    if (entries.length === 0) {
      warnings.push(`${key}: no entries parsed`);
      return;
    }
    blocks.push({ year, term, key, totalUnits, entries });
  };

  for (const cell of html.matchAll(CELL)) {
    const cls = classOf(cell[1]);
    if (cls !== "text06" && cls !== "text04" && cls !== "text02") continue;
    const text = textOf(cell[2]);
    if (cls === "text06") {
      flush();
      year = text;
      continue;
    }
    if (cls === "text04") {
      // Column headers ("Cat No", "Units", …) share this class and simply do not
      // match the "TERM - N Units" shape, so they need no special-casing.
      const match = TERM_UNITS.exec(text);
      if (match) {
        flush();
        term = match[1].trim();
        totalUnits = Number(match[2]);
      }
      continue;
    }
    pending.push(text);
  }
  flush();
  return { blocks, warnings };
}
