// Parsers for the public AISIS class-schedule table (classSkeds.do).
// Dependency-free by design, like tools/curriculum-parse.mjs and tools/extract-rows.mjs.
// This is scraper-only: the app reads already-parsed sections from Supabase.

// Column layout of the 10-column table, verified live 2026-07-21.
const COL = {
  subjectCode: 0, section: 1, title: 2, units: 3, time: 4,
  room: 5, instructor: 6, lang: 7, level: 8, remarks: 9,
};
const MIN_COLUMNS = 10;

// Longest tokens first so "TH" wins over "T" when scanning compact strings.
const DAY_TOKENS = ["SAT", "SUN", "TH", "M", "T", "W", "F"];

export function parseDays(token) {
  const cleaned = token.toUpperCase().trim();
  if (!cleaned) return null;
  // Intersession uses two compact aliases that regular-semester rows rarely expose:
  // `D` means the class meets daily on weekdays, while `S` means Saturday (regular
  // semester rows usually spell it `SAT`). Expand them before the normal token scan so
  // generation can detect conflicts instead of quarantining hundreds of valid sections.
  if (cleaned === "D") return ["M", "T", "W", "TH", "F"];
  const parts = cleaned.includes("-") ? cleaned.split("-") : [cleaned];
  const days = [];
  for (const part of parts) {
    let rest = part.trim();
    if (!rest) return null;
    while (rest.length > 0) {
      const match = rest === "S" ? "SAT" : DAY_TOKENS.find((d) => rest.startsWith(d));
      if (!match) return null;
      days.push(match);
      rest = rest === "S" ? "" : rest.slice(match.length);
    }
  }
  return days.length > 0 ? days : null;
}

export function parseTimeRange(text) {
  const m = text.trim().match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (start >= end || Number(m[2]) > 59 || Number(m[4]) > 59 || end > 24 * 60) return null;
  return { start, end };
}

export function parseTimeCell(cell) {
  // AISIS renders "M-TH 0800-0930" then "(FULLY ONSITE)" on a second line.
  const modalityMatch = cell.match(/\(([^)]*)\)\s*$/);
  const modality = modalityMatch ? modalityMatch[1].trim() : "";
  const text = cell.replace(/\([^)]*\)\s*$/, "").trim();
  if (!text || text.toUpperCase() === "TBA") {
    return { meetings: [], modality, status: "tba", ok: true };
  }
  // AISIS writes "TUTORIAL 0000-0000" for tutorials, thesis and special-topics sections
  // with no fixed meeting time. The 0000-0000 is a placeholder, not a time, so this is a
  // real section without a schedule — TBA, not bad data. Keying on the TUTORIAL keyword
  // (rather than on 0000-0000 alone) keeps a genuinely corrupt "M 0000-0000" an error.
  if (/^TUTORIAL(\s+0000-0000)?$/i.test(text)) {
    return { meetings: [], modality, status: "tba", ok: true };
  }

  const meetings = [];
  // AISIS separates a section's meetings with either "/" or ";" — both seen live
  // (e.g. "M-TH 1230-1400; W 1100-1300"). Splitting on "/" alone made every
  // semicolon form a parse error, which excluded real, fully-scheduled sections.
  for (const chunk of text.split(/[/;]/)) {
    const m = chunk.trim().match(/^(.+?)\s+(\S+)$/);
    if (!m) return { meetings: [], modality, status: "parse-error", ok: false };
    const days = parseDays(m[1]);
    const range = parseTimeRange(m[2]);
    if (!days || !range) return { meetings: [], modality, status: "parse-error", ok: false };
    meetings.push({ days, start: range.start, end: range.end });
  }
  return { meetings, modality, status: "scheduled", ok: true };
}

// Instructors are "LAST, FIRST" and multiple profs are joined by ", " — so the
// commas are ambiguous. Re-pair the fragments: every even fragment starts a name.
export function splitInstructors(cell) {
  const text = cell.trim();
  if (!text || text.toUpperCase() === "TBA") return [];
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const names = [];
  for (let i = 0; i < parts.length; i += 2) {
    names.push(parts[i + 1] === undefined ? parts[i] : `${parts[i]}, ${parts[i + 1]}`);
  }
  return names;
}

export function parseRow(cells) {
  const raw = cells.join(" | ");
  if (cells.length < MIN_COLUMNS) {
    return { section: null, warning: `Skipped row (unrecognized format): ${raw}` };
  }
  const units = Number(cells[COL.units].replace(/[()]/g, ""));
  const { meetings, modality, status: timeStatus, ok } = parseTimeCell(cells[COL.time]);
  // AISIS uses both "-" and "~" as empty-remark placeholders (both seen in real data).
  const rawRemarks = cells[COL.remarks].trim();
  const remarks = rawRemarks === "-" || rawRemarks === "~" ? "" : rawRemarks;
  const section = {
    courseCode: cells[COL.subjectCode].trim(),
    sectionCode: cells[COL.section].trim(),
    title: cells[COL.title].trim(),
    units: Number.isFinite(units) ? units : 0,
    instructors: splitInstructors(cells[COL.instructor]),
    modality,
    meetings,
    timeStatus,
    room: cells[COL.room].trim(),
    remarks,
    raw,
  };
  if (!ok) {
    return {
      section,
      warning: `Unparseable time "${cells[COL.time]}" — imported for display only, excluded from generated schedules: ${raw}`,
    };
  }
  return { section };
}

export function parseRows(rows) {
  const sections = [];
  const warnings = [];
  for (const cells of rows) {
    if (cells.length === 0) continue;
    if (/^subject\s*code$/i.test(cells[0].trim())) continue; // header row
    const { section, warning } = parseRow(cells);
    if (warning) warnings.push(warning);
    if (section) sections.push(section);
  }
  return { sections, warnings };
}
