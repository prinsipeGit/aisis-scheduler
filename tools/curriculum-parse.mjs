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
