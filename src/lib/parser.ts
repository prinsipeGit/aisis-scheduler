import type { Day, Meeting, Section } from "./types";
import { parseTimeRange } from "./time";

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

export function parseMeetings(cell: string): { meetings: Meeting[]; ok: boolean } {
  const text = cell.trim();
  if (!text || text.toUpperCase() === "TBA") return { meetings: [], ok: true };
  const meetings: Meeting[] = [];
  for (const chunk of text.split("/")) {
    const m = chunk.trim().match(/^(.+?)\s+(\S+)$/);
    if (!m) return { meetings: [], ok: false };
    const days = parseDays(m[1]);
    const range = parseTimeRange(m[2]);
    if (!days || !range) return { meetings: [], ok: false };
    meetings.push({ days, start: range.start, end: range.end });
  }
  return { meetings, ok: true };
}

const COL = { subjectCode: 0, section: 1, title: 2, units: 3, time: 4, room: 5, instructor: 6, remarks: 11 };
const MIN_COLUMNS = 7;

export function parseAisisTable(text: string): { sections: Section[]; warnings: string[] } {
  const sections: Section[] = [];
  const warnings: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    if (/subject\s*code/i.test(raw)) continue; // header row
    let cells = line.split("\t").map((c) => c.trim());
    if (cells.length < MIN_COLUMNS) cells = raw.split(/ {2,}/).map((c) => c.trim());
    if (cells.length < MIN_COLUMNS) {
      warnings.push(`Skipped row (unrecognized format): ${raw}`);
      continue;
    }
    const units = Number(cells[COL.units].replace(/[()]/g, ""));
    const { meetings, ok } = parseMeetings(cells[COL.time]);
    if (!ok) {
      warnings.push(`Unparseable time "${cells[COL.time]}" — imported without schedule (treated as TBA): ${raw}`);
    }
    sections.push({
      courseCode: cells[COL.subjectCode],
      sectionCode: cells[COL.section],
      title: cells[COL.title],
      units: Number.isFinite(units) ? units : 0,
      instructor: cells[COL.instructor] ?? "",
      meetings,
      room: cells[COL.room] ?? "",
      remarks: cells[COL.remarks] ?? "",
      raw,
    });
  }
  return { sections, warnings };
}
