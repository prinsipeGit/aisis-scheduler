export type Day = "M" | "T" | "W" | "TH" | "F" | "SAT" | "SUN";

export interface Meeting {
  days: Day[];
  start: number; // minutes from midnight
  end: number;
}

export interface Section {
  courseCode: string;    // "MATH 10"
  sectionCode: string;   // "A3"
  title: string;
  units: number;
  instructors: string[]; // as printed by AISIS, e.g. ["ABERIN, MARIA ALVA Q."]
  modality: string;      // "FULLY ONSITE" | "ONLINE" | "" when absent
  meetings: Meeting[];   // empty ⇒ TBA (excluded from conflict math)
  room: string;
  remarks: string;
  raw: string;           // original row cells joined by " | ", for debugging
}

export interface Catalog {
  term: string;          // "2026-2"
  exportedAt: string;    // ISO timestamp
  sections: Section[];
  warnings: string[];
}

export interface ProfRating {
  name: string;          // instructor as printed by AISIS
  rating: 0 | 1 | 2 | 3 | 4 | 5;
  courseCode?: string;   // scope to a class; omit = overall rating for the prof
  note?: string;
  asOf?: string;
}

// ---- Curriculum (official IPS) ----

export interface ProgramSummary {
  id: string;            // "BS-AMDSc-2024"
  code: string;          // "BS AMDSc-M DSc"
  name: string;          // "BACHELOR OF SCIENCE IN APPLIED MATHEMATICS"
  versionYear: number;   // 2024
}

export interface CurriculumEntry {
  catNo: string;         // "MATH 31.1"; placeholder text for elective slots
  title: string;
  units: number;         // may be 0
  prerequisites: string[];
  category: string;      // "M", "C", "IE1E", "RM1", …
  isElective: boolean;   // true for MATHEMATICS ELECTIVE / FREE ELECTIVE / IE 1 …
  electiveDept?: string; // IE slots → "**IE**"
  slotId: string;        // unique within the program, e.g. "First Year|First Semester#4"
}

export interface CurriculumBlock {
  year: string;          // "First Year" … as printed
  term: string;          // printed label; usually a semester, sometimes a quirk (see plan header)
  key: string;           // `${year}|${term}`
  totalUnits: number;
  entries: CurriculumEntry[];
}

export interface Program extends ProgramSummary {
  blocks: CurriculumBlock[];
}

// ---- Ranking / preferences ----

export type RankCriterion =
  | "compactDays"
  | "fewestDays"
  | "lateStart"
  | "earlyEnd"
  | "preferredProfs";

export interface Preferences {
  criteria: RankCriterion[];      // ordered by priority; default ["compactDays"]
  earliestStart?: number;
  latestEnd?: number;
  protectedBlocks: Meeting[];
  excludedSections: string[];     // sectionKeys
}

export interface UserState {
  version: number;                       // 2
  programId: string;                     // "" until chosen
  blockKey: string;                      // "" until chosen
  calendarTerm: string;                  // "2026-2"
  requiredCourses: string[];             // course codes; seeded from block, then edited
  electiveFills: Record<string, string>; // slotId → concrete course code
  lockedSections: string[];
  fullSections: string[];
  preferences: Preferences;
  personalRatings: ProfRating[];
}

export type Schedule = Section[];

export interface Diagnostics {
  perCourse: { courseCode: string; total: number; afterFilters: number }[];
  conflictPairs: { a: string; b: string }[];
  nWayConflict: boolean;
}

export function sectionKey(s: Section): string {
  return `${s.courseCode} ${s.sectionCode}`;
}
