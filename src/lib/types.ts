export type Day = "M" | "T" | "W" | "TH" | "F" | "SAT" | "SUN";

export interface Meeting {
  days: Day[];
  start: number; // minutes from midnight
  end: number;
}

export interface Section {
  courseCode: string;   // "PHILO 11"
  sectionCode: string;  // "A", "B2"
  title: string;
  units: number;
  instructor: string;   // as printed by AISIS, e.g. "GARCIA, JUAN"
  meetings: Meeting[];  // empty ⇒ TBA (excluded from conflict math)
  room: string;
  remarks: string;
  raw: string;          // original row text for debugging/fixtures
}

export interface Catalog {
  semester: string;     // e.g. "2026-1"
  exportedAt: string;   // ISO timestamp
  sections: Section[];
  warnings: string[];
}

export interface ProfRating {
  name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  note?: string;
  asOf?: string;
}

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
  version: number;
  semester: string;
  chosenCourses: string[];        // course codes
  lockedSections: string[];       // sectionKeys
  fullSections: string[];         // sectionKeys
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
