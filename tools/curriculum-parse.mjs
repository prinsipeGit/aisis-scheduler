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
