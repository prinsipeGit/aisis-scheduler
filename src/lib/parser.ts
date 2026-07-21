import type { Day, Meeting, Section } from "./types";
import { parseTimeRange } from "./time";

// Column layout of the public AISIS class-schedule table (10 columns),
// verified live 2026-07-21. See spec §2.1.
const COL = {
  subjectCode: 0,
  section: 1,
  title: 2,
  units: 3,
  time: 4,
  room: 5,
  instructor: 6,
  lang: 7,
  level: 8,
  remarks: 9,
} as const;
const MIN_COLUMNS = 10;

// Longest tokens first so "TH" wins over "T" when scanning compact strings.
const DAY_TOKENS: Day[] = ["SAT", "SUN", "TH", "M", "T", "W", "F"];

export function parseDays(token: string): Day[] | null {
  const cleaned = token.toUpperCase().trim();
  if (!cleaned) return null;
  const parts = cleaned.includes("-") ? cleaned.split("-") : [cleaned];
  const days: Day[] = [];
  for (const part of parts) {
    let rest = part.trim();
    if (!rest) return null;
    while (rest.length > 0) {
      const match = DAY_TOKENS.find((d) => rest.startsWith(d));
      if (!match) return null;
      days.push(match);
      rest = rest.slice(match.length);
    }
  }
  return days.length > 0 ? days : null;
}

export function parseTimeCell(cell: string): { meetings: Meeting[]; modality: string; ok: boolean } {
  // AISIS renders "M-TH 0800-0930" then "(FULLY ONSITE)" on a second line.
  const modalityMatch = cell.match(/\(([^)]*)\)\s*$/);
  const modality = modalityMatch ? modalityMatch[1].trim() : "";
  const text = cell.replace(/\([^)]*\)\s*$/, "").trim();
  if (!text || text.toUpperCase() === "TBA") return { meetings: [], modality: "", ok: true };

  const meetings: Meeting[] = [];
  for (const chunk of text.split("/")) {
    const m = chunk.trim().match(/^(.+?)\s+(\S+)$/);
    if (!m) return { meetings: [], modality, ok: false };
    const days = parseDays(m[1]);
    const range = parseTimeRange(m[2]);
    if (!days || !range) return { meetings: [], modality, ok: false };
    meetings.push({ days, start: range.start, end: range.end });
  }
  return { meetings, modality, ok: true };
}

// Instructors are "LAST, FIRST" and multiple profs are joined by ", " — so the
// commas are ambiguous. Re-pair the fragments: every even fragment starts a name.
export function splitInstructors(cell: string): string[] {
  const text = cell.trim();
  if (!text || text.toUpperCase() === "TBA") return [];
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const names: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    names.push(parts[i + 1] === undefined ? parts[i] : `${parts[i]}, ${parts[i + 1]}`);
  }
  return names;
}

export function parseRow(cells: string[]): { section: Section | null; warning?: string } {
  const raw = cells.join(" | ");
  if (cells.length < MIN_COLUMNS) {
    return { section: null, warning: `Skipped row (unrecognized format): ${raw}` };
  }
  const units = Number(cells[COL.units].replace(/[()]/g, ""));
  const { meetings, modality, ok } = parseTimeCell(cells[COL.time]);
  // AISIS uses both "-" and "~" as empty-remark placeholders (both seen in real data).
  const rawRemarks = cells[COL.remarks].trim();
  const remarks = rawRemarks === "-" || rawRemarks === "~" ? "" : rawRemarks;
  const section: Section = {
    courseCode: cells[COL.subjectCode].trim(),
    sectionCode: cells[COL.section].trim(),
    title: cells[COL.title].trim(),
    units: Number.isFinite(units) ? units : 0,
    instructors: splitInstructors(cells[COL.instructor]),
    modality,
    meetings,
    room: cells[COL.room].trim(),
    remarks,
    raw,
  };
  if (!ok) {
    return {
      section,
      warning: `Unparseable time "${cells[COL.time]}" — imported without schedule (treated as TBA): ${raw}`,
    };
  }
  return { section };
}

export function parseRows(rows: string[][]): { sections: Section[]; warnings: string[] } {
  const sections: Section[] = [];
  const warnings: string[] = [];
  for (const cells of rows) {
    if (cells.length === 0) continue;
    if (/^subject\s*code$/i.test(cells[0].trim())) continue; // header row
    const { section, warning } = parseRow(cells);
    if (warning) warnings.push(warning);
    if (section) sections.push(section);
  }
  return { sections, warnings };
}
