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
  instructors: string[]; // as printed by AISIS
  modality: string;      // "FULLY ONSITE" | "ONLINE" | "" when absent
  meetings: Meeting[];   // empty ⇒ TBA (excluded from conflict math)
  timeStatus?: "scheduled" | "tba" | "parse-error";
  room: string;
  remarks: string;
  raw: string;
}

export interface Catalog {
  term: string;
  exportedAt: string;
  sections: Section[];
  warnings: string[];
}

export interface ProfRating {
  name: string;
  rating: number;        // 0-5
  courseCode?: string;
  note?: string;
  asOf?: string;
}

// ---- Curriculum (official IPS) ----

export interface ProgramSummary {
  id: string;
  code: string;
  name: string;
  version: string;
  versionYear: number;
  versionLabel: string;
}

export interface CurriculumEntry {
  catNo: string;
  title: string;
  units: number;
  prerequisites: string[];
  category: string;      // "M", "C", "PFT2", "NS1A", …
  isElective: boolean;
  electiveDept?: string;
  slotId: string;        // "First Year|First Semester#4"
}

export interface CurriculumBlock {
  year: string;
  term: string;
  key: string;           // `${year}|${term}`
  totalUnits: number;
  entries: CurriculumEntry[];
}

export interface Program extends ProgramSummary {
  blocks: CurriculumBlock[];
}

// ---- Selection model (§4) ----

export interface Slot {
  id: string;                 // "ips:First Year|First Semester#4" | "added:3"
  origin: "ips" | "added";    // ips = a curriculum requirement, from any block
  label: string;              // "PHILO 11" | "MATHEMATICS ELECTIVE"
  requirement: string | null; // curriculum catNo; null when added from catalog
  category: string | null;    // AISIS requirement category; null when from catalog
  sourceBlock: string | null; // block key it came from; null when from catalog
  chosen: string | null;      // course code the student picked; null = unnarrowed
  pairedWith: string | null;  // id of a slot this must share a subject prefix with
  included: boolean;          // counts toward generation
}

// ---- Ranking / preferences ----

export type RankCriterion =
  | "compactDays" | "fewestDays" | "lateStart" | "earlyEnd" | "preferredProfs";

export interface Preferences {
  criteria: RankCriterion[];
  earliestStart?: number;
  latestEnd?: number;
  protectedBlocks: Meeting[];
  excludedSections: string[];
}

export interface UserState {
  version: number;                // 3
  programId: string;
  blockKey: string;               // the primary block (§11.5)
  calendarTerm: string;
  slots: Slot[];
  lockedSections: string[];
  fullSections: string[];
  completedCourses: string[];     // reserved (§9); [] for now
  preferences: Preferences;
  personalRatings: ProfRating[];
}

export type Schedule = Section[];

export interface Diagnostics {
  perSlot: { id: string; label: string; total: number; afterFilters: number }[];
  conflictPairs: { a: string; b: string }[];
  nWayConflict: boolean;
}

export interface SearchSummary {
  limit: number;
  truncated: boolean;
}

export function sectionKey(s: Section): string {
  return `${s.courseCode} ${s.sectionCode}`;
}
