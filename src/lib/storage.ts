import type { Preferences, UserState } from "./types";

export const STORAGE_VERSION = 2;
const KEY = "aisis-scheduler-state";

const VALID_RANK_CRITERIA = new Set([
  "compactDays",
  "fewestDays",
  "lateStart",
  "earlyEnd",
  "preferredProfs",
]);
const VALID_DAYS = new Set(["M", "T", "W", "TH", "F", "SAT", "SUN"]);
const isFiniteMinute = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 24 * 60;

const defaultPreferences = (): Preferences => ({
  criteria: ["compactDays"],
  protectedBlocks: [],
  excludedSections: [],
});

export function defaultState(calendarTerm: string): UserState {
  return {
    version: STORAGE_VERSION,
    programId: "",
    blockKey: "",
    calendarTerm,
    requiredCourses: [],
    electiveFills: {},
    lockedSections: [],
    fullSections: [],
    preferences: defaultPreferences(),
    personalRatings: [],
  };
}

const isStringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((e) => typeof e === "string");

function isValidPreferences(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  if (!Array.isArray(p.criteria) || !p.criteria.every((c) => typeof c === "string" && VALID_RANK_CRITERIA.has(c))) {
    return false;
  }
  if (new Set(p.criteria).size !== p.criteria.length) return false;
  if (!Array.isArray(p.protectedBlocks)) return false;
  if (!p.protectedBlocks.every((b) => {
    if (typeof b !== "object" || b === null) return false;
    const m = b as Record<string, unknown>;
    return Array.isArray(m.days) && m.days.length > 0 &&
      m.days.every((day) => typeof day === "string" && VALID_DAYS.has(day)) &&
      isFiniteMinute(m.start) && isFiniteMinute(m.end) && m.start < m.end;
  })) return false;
  if (p.earliestStart !== undefined && !isFiniteMinute(p.earliestStart)) return false;
  if (p.latestEnd !== undefined && !isFiniteMinute(p.latestEnd)) return false;
  if (isFiniteMinute(p.earliestStart) && isFiniteMinute(p.latestEnd) && p.earliestStart > p.latestEnd) return false;
  return isStringArray(p.excludedSections);
}

function isValidState(v: unknown): v is UserState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  if (typeof s.version !== "number") return false;
  if (typeof s.programId !== "string") return false;
  if (typeof s.blockKey !== "string") return false;
  if (typeof s.calendarTerm !== "string") return false;
  if (!isStringArray(s.requiredCourses)) return false;
  if (new Set(s.requiredCourses).size !== s.requiredCourses.length) return false;
  if (!isStringArray(s.lockedSections)) return false;
  if (!isStringArray(s.fullSections)) return false;
  if (typeof s.electiveFills !== "object" || s.electiveFills === null || Array.isArray(s.electiveFills)) {
    return false;
  }
  if (!Object.values(s.electiveFills as Record<string, unknown>).every((x) => typeof x === "string")) {
    return false;
  }
  if (!Array.isArray(s.personalRatings)) return false;
  if (!s.personalRatings.every((x) => {
    if (typeof x !== "object" || x === null) return false;
    const rt = x as Record<string, unknown>;
    return typeof rt.name === "string" && rt.name.trim() !== "" &&
      typeof rt.rating === "number" && Number.isFinite(rt.rating) && rt.rating >= 0 && rt.rating <= 5 &&
      (rt.courseCode === undefined || typeof rt.courseCode === "string");
  })) return false;
  return isValidPreferences(s.preferences);
}

export function loadState(calendarTerm: string): { state: UserState; wasReset: boolean } {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return { state: defaultState(calendarTerm), wasReset: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    // v1 state (version 1, `semester`/`chosenCourses`) has no migration path worth
    // keeping — the whole selection model changed — so it resets with a notice.
    if (!isValidState(parsed) || parsed.version !== STORAGE_VERSION) {
      return { state: defaultState(calendarTerm), wasReset: true };
    }
    return { state: parsed, wasReset: false };
  } catch {
    return { state: defaultState(calendarTerm), wasReset: true };
  }
}

export function saveState(state: UserState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Scheduling still works when storage is blocked or full; persistence is best-effort.
  }
}
